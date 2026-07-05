from fastapi import APIRouter
from pydantic import BaseModel

from .. import cli

router = APIRouter(prefix="/api/proxy", tags=["proxy"])


class ProxyStartBody(BaseModel):
    listen_host: str | None = None
    port: int | None = None


def _resolve_host_port(body: ProxyStartBody) -> tuple[str, int]:
    """
    Fall back to the host/port the proxy was last started with (read from the
    running/last-known process argv) when the caller doesn't specify one —
    this lets "restart" calls triggered automatically by other pages (project
    switch, role/module changes, mutation edits) reuse whatever the operator
    configured on the Proxy page instead of silently resetting to defaults.
    """
    host, port = body.listen_host, body.port
    current = cli.process_manager.status("proxy")
    argv = (current or {}).get("argv") or []
    if host is None and "--listen-host" in argv:
        host = argv[argv.index("--listen-host") + 1]
    if port is None and "--port" in argv:
        port = int(argv[argv.index("--port") + 1])
    return host or "127.0.0.1", port or 8080


@router.get("/status")
def proxy_status():
    status = cli.process_manager.status("proxy")
    return status or {"running": False}


@router.get("/logs")
def proxy_logs(tail: int = 300):
    return {"lines": cli.process_manager.logs("proxy", tail=tail)}


@router.post("/start")
def proxy_start(body: ProxyStartBody):
    host, port = _resolve_host_port(body)
    return cli.process_manager.start(
        "proxy",
        ["proxy", "start", "--listen-host", host, "--port", str(port)],
    )


@router.post("/stop")
def proxy_stop(force: bool = False):
    return cli.process_manager.stop("proxy", force=force)


@router.post("/restart")
def proxy_restart(body: ProxyStartBody, force: bool = False):
    host, port = _resolve_host_port(body)
    cli.process_manager.stop("proxy", force=force)
    return cli.process_manager.start(
        "proxy",
        ["proxy", "start", "--listen-host", host, "--port", str(port)],
    )


@router.post("/restart-if-running")
def proxy_restart_if_running(force: bool = False):
    """
    Used by other pages to auto-restart the proxy after an action that
    changes project state the addon depends on (project switch, role/module
    create or activate, mutation add/enable/disable/edit, auth artifact
    changes). No-ops if the proxy wasn't running — nothing to restart, and we
    don't want to surprise-start the proxy for an operator who hasn't opened
    the Proxy page yet.
    """
    current = cli.process_manager.status("proxy")
    if not current or not current.get("running"):
        return {"running": False, "restarted": False}
    host, port = _resolve_host_port(ProxyStartBody())
    cli.process_manager.stop("proxy", force=force)
    started = cli.process_manager.start(
        "proxy",
        ["proxy", "start", "--listen-host", host, "--port", str(port)],
    )
    return {"restarted": True, **started}

