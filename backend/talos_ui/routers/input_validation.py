from fastapi import APIRouter
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/input-validation", tags=["input-validation"])

PHASES = [
    "baseline", "identifier", "characters", "length",
    "types", "transformations", "reflection", "validation",
]


@router.get("/config")
def get_config(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    row = db.query_one(db_path, "SELECT * FROM input_validation_config WHERE id='default'")
    if row:
        row["excluded_hosts"] = db.safe_json(row.get("excluded_hosts"), [])
        row["excluded_endpoints"] = db.safe_json(row.get("excluded_endpoints"), [])
    return {"config": row}


@router.get("/status")
def get_status(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    param_counts = db.query_all(
        db_path, "SELECT status, COUNT(*) AS n FROM iv_param_cache GROUP BY status"
    )
    reflection_counts = db.query_all(
        db_path, "SELECT status, COUNT(*) AS n FROM iv_reflection_cache GROUP BY status"
    )
    probe_counts = db.query_all(
        db_path, "SELECT status, COUNT(*) AS n FROM iv_probe_results GROUP BY status"
    )
    return {
        "param_cache": {r["status"]: r["n"] for r in param_counts},
        "reflection_cache": {r["status"]: r["n"] for r in reflection_counts},
        "probe_results": {r["status"]: r["n"] for r in probe_counts},
    }


class IvConfigBody(BaseModel):
    enable: bool | None = None
    disable: bool | None = None
    workers: int | None = None
    analysis_off: str | None = None
    analysis_on: str | None = None


@router.post("/config")
def set_config(project_id: str, body: IvConfigBody):
    args = ["input-validation", "config"]
    if body.enable:
        args.append("--enable")
    if body.disable:
        args.append("--disable")
    if body.workers is not None:
        args += ["--workers", str(body.workers)]
    if body.analysis_off:
        args += ["--analysis-off", body.analysis_off]
    if body.analysis_on:
        args += ["--analysis-on", body.analysis_on]
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


class ScopeBody(BaseModel):
    host: str | None = None
    endpoint: str | None = None
    parameter: str | None = None
    ignore_cache: bool = False
    force: bool = False


def _scope_args(body: ScopeBody, include_ignore_cache=False, include_force=False) -> list[str]:
    args = []
    if body.host:
        args += ["--host", body.host]
    elif body.endpoint:
        args += ["--endpoint", body.endpoint]
    elif body.parameter:
        args += ["--parameter", body.parameter]
    if include_ignore_cache and body.ignore_cache:
        args.append("--ignore-cache")
    if include_force and body.force:
        args.append("--force")
    return args


@router.post("/run")
def run_iv(project_id: str, body: ScopeBody):
    args = ["input-validation", "run"] + _scope_args(body, include_ignore_cache=True)
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.post("/resume")
def resume_iv(project_id: str, body: ScopeBody):
    args = ["input-validation", "resume"] + _scope_args(body)
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.post("/clear-cache")
def clear_cache(project_id: str, body: ScopeBody):
    args = ["input-validation", "clear-cache"] + _scope_args(body)
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.post("/phase/{phase}")
def run_phase(project_id: str, phase: str, body: ScopeBody):
    if phase not in PHASES:
        return {"error": f"unknown phase '{phase}'"}
    args = ["input-validation", phase] + _scope_args(body, include_force=True)
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.post("/exclude/endpoint/{endpoint_id}")
def exclude_endpoint(project_id: str, endpoint_id: str):
    results = cli.run_scoped(project_id, ["input-validation", "exclude", "endpoint", endpoint_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/exclude/host/{host}")
def exclude_host(project_id: str, host: str):
    results = cli.run_scoped(project_id, ["input-validation", "exclude", "host", host])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/include/endpoint/{endpoint_id}")
def include_endpoint(project_id: str, endpoint_id: str):
    results = cli.run_scoped(project_id, ["input-validation", "include", "endpoint", endpoint_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/include/host/{host}")
def include_host(project_id: str, host: str):
    results = cli.run_scoped(project_id, ["input-validation", "include", "host", host])
    return {"steps": [r.to_dict() for r in results]}


@router.get("/parameters")
def list_iv_parameters(project_id: str, host: str | None = None, limit: int = 300):
    """Parameter-level cache rows, one per (host, location, param_name, phase)."""
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    where = "WHERE host = ?" if host else ""
    params = (host, limit) if host else (limit,)
    rows = db.query_all(
        db_path,
        f"SELECT * FROM iv_param_cache {where} ORDER BY host, param_name, phase LIMIT ?",
        params,
    )
    return {"rows": rows}


@router.get("/show/{parameter_uuid}")
def show_parameter(project_id: str, parameter_uuid: str):
    """
    Best-effort read-side view of a parameter's characterization: param cache
    phases plus its probe evidence. `talos input-validation show <uuid>` in
    the CLI is the authoritative, complete version of this (including raw
    request/response bytes); this view is for at-a-glance triage.
    """
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    probes = db.query_all(
        db_path,
        "SELECT * FROM iv_probe_results WHERE param_uuid=? ORDER BY analysis, payload_index",
        (parameter_uuid,),
    )
    return {"probes": probes}


@router.post("/show/{parameter_uuid}/cli")
def show_parameter_cli(project_id: str, parameter_uuid: str):
    results = cli.run_scoped(project_id, ["input-validation", "show", parameter_uuid])
    return {"steps": [r.to_dict() for r in results]}


class ExportBody(BaseModel):
    parameter_uuid: str | None = None
    host: str | None = None


@router.post("/export/parameter")
def export_parameter(project_id: str, body: ExportBody):
    results = cli.run_scoped(project_id, ["input-validation", "export", "parameter", body.parameter_uuid or ""])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/export/host")
def export_host(project_id: str, body: ExportBody):
    results = cli.run_scoped(project_id, ["input-validation", "export", "host", body.host or ""])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/export/csv")
def export_csv(project_id: str):
    results = cli.run_scoped(project_id, ["input-validation", "export", "csv"])
    return {"steps": [r.to_dict() for r in results]}
