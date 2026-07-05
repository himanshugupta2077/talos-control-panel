"""
CLI execution layer.

This is the *only* place in the backend that mutates Talos state. Every write
action in the control panel is expressed as a `talos ...` argv list and run
here via subprocess — never as a direct SQL write. This keeps the CLI as the
single source of truth, per the project's architectural rule.

Two execution modes:
  run()              — short-lived command, waits for completion, captures
                        stdout/stderr/exit code.
  ProcessManager      — long-running background processes (proxy, ui), started
                        with Popen and tracked in memory so the frontend can
                        show live status + a rolling log buffer.
"""

from __future__ import annotations

import shlex
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import os
from . import config

def _talos_env() -> dict[str, str]:
    env = os.environ.copy()

    venv_bin = str(Path(config.TALOS_PYTHON).parent)
    env["PATH"] = venv_bin + os.pathsep + env.get("PATH", "")

    return env

@dataclass
class CommandResult:
    cmd: list[str]
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    ok: bool
    timed_out: bool = False

    def to_dict(self) -> dict:
        return {
            "cmd": self.cmd,
            "cmd_str": " ".join(shlex.quote(c) for c in self.cmd),
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "duration_ms": self.duration_ms,
            "ok": self.ok,
            "timed_out": self.timed_out,
        }


def _talos_argv(args: list[str]) -> list[str]:
    return [
        config.TALOS_PYTHON,
        "-m",
        "talos",
        *args,
    ]

def run(args: list[str], timeout: Optional[int] = None) -> CommandResult:
    """Run a single talos CLI invocation and capture its result."""
    argv = _talos_argv(args)
    start = time.monotonic()
    try:
        proc = subprocess.run(
            argv,
            cwd=config.TALOS_ROOT,
            env=_talos_env(),
            capture_output=True,
            text=True,
            timeout=timeout or config.CLI_TIMEOUT,
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        return CommandResult(
            cmd=argv,
            stdout=proc.stdout,
            stderr=proc.stderr,
            exit_code=proc.returncode,
            duration_ms=duration_ms,
            ok=proc.returncode == 0,
        )
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return CommandResult(
            cmd=argv,
            stdout=(exc.stdout or ""),
            stderr=(exc.stderr or "") + "\n[control panel] command timed out",
            exit_code=-1,
            duration_ms=duration_ms,
            ok=False,
            timed_out=True,
        )
    except FileNotFoundError:
        return CommandResult(
            cmd=argv,
            stdout="",
            stderr=(
                f"[control panel] could not find executable '{config.TALOS_BIN}'. "
                "Set TALOS_BIN to the full path to your talos CLI, or make sure "
                "it is on PATH."
            ),
            exit_code=-1,
            duration_ms=0,
            ok=False,
        )


def run_sequence(steps: list[list[str]], timeout: Optional[int] = None) -> list[CommandResult]:
    """Run several commands in order, stopping early if one fails."""
    results: list[CommandResult] = []
    for step in steps:
        result = run(step, timeout=timeout)
        results.append(result)
        if not result.ok:
            break
    return results


def run_with_editor_content(
    args: list[str], content: str, timeout: Optional[int] = None
) -> CommandResult:
    """
    Run a command that normally opens $EDITOR for the operator to paste content
    (e.g. `talos auth-config set-session <role>`), without a human at a
    terminal. We point EDITOR/VISUAL at a tiny shim script that ignores its
    argument and simply writes our pre-supplied content into whatever file the
    CLI asked the editor to open. This is a standard technique for driving
    editor-invoking CLIs non-interactively and does not require any special
    support from Talos itself.
    """
    import os
    import stat
    import tempfile

    start = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="talos-cp-editor-") as tmp:
        content_path = Path(tmp) / "content.txt"
        content_path.write_text(content, encoding="utf-8")

        shim_path = Path(tmp) / "editor-shim.sh"
        shim_path.write_text(
            "#!/bin/sh\n"
            f'cat "{content_path}" > "$1"\n',
            encoding="utf-8",
        )
        shim_path.chmod(shim_path.stat().st_mode | stat.S_IEXEC)

        env = {**os.environ, "EDITOR": str(shim_path), "VISUAL": str(shim_path)}
        argv = _talos_argv(args)
        try:
            proc = subprocess.run(
                argv,
                cwd=config.TALOS_ROOT,
                capture_output=True,
                text=True,
                timeout=timeout or config.CLI_TIMEOUT,
                env={**_talos_env(), **env},
            )
            duration_ms = int((time.monotonic() - start) * 1000)
            return CommandResult(
                cmd=argv, stdout=proc.stdout, stderr=proc.stderr,
                exit_code=proc.returncode, duration_ms=duration_ms,
                ok=proc.returncode == 0,
            )
        except subprocess.TimeoutExpired as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            return CommandResult(
                cmd=argv, stdout=(exc.stdout or ""),
                stderr=(exc.stderr or "") + "\n[control panel] command timed out",
                exit_code=-1, duration_ms=duration_ms, ok=False, timed_out=True,
            )


def run_scoped(project_id: str, args: list[str], timeout: Optional[int] = None) -> list[CommandResult]:
    """
    Run a project-scoped command, first ensuring that project is the active one.
    Talos's CLI keeps "active project" as persistent state (see `talos project
    open <id>`), so every scoped action opens the right project immediately
    beforehand. Both steps are returned so the UI can show exactly what ran.
    """
    return run_sequence([["project", "open", project_id], args], timeout=timeout)


def run_scoped_with_editor_content(
    project_id: str, args: list[str], content: str, timeout: Optional[int] = None
) -> list[CommandResult]:
    open_result = run(["project", "open", project_id], timeout=timeout)
    if not open_result.ok:
        return [open_result]
    return [open_result, run_with_editor_content(args, content, timeout=timeout)]


def run_scoped_with_temp_file(
    project_id: str,
    args_before_file: list[str],
    content: str,
    suffix: str = ".py",
    timeout: Optional[int] = None,
) -> list[CommandResult]:
    """
    For commands that take a literal filename argument (e.g.
    `talos auth-config set-extractor <role> <flow_id> extractor.py`), write
    the operator-supplied content to a temp file and pass its path.
    """
    import tempfile

    open_result = run(["project", "open", project_id], timeout=timeout)
    if not open_result.ok:
        return [open_result]
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=suffix, prefix="talos-cp-", delete=False, encoding="utf-8"
    ) as fh:
        fh.write(content)
        tmp_path = fh.name
    try:
        result = run([*args_before_file, tmp_path], timeout=timeout)
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except OSError:
            pass
    return [open_result, result]


# ------------------------------------------------------------------ #
# Background processes (proxy, ui)                                    #
# ------------------------------------------------------------------ #

@dataclass
class ManagedProcess:
    name: str
    argv: list[str]
    proc: subprocess.Popen
    started_at: float
    log: deque = field(default_factory=lambda: deque(maxlen=2000))
    _thread: Optional[threading.Thread] = None

    def _pump(self):
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            self.log.append(line.rstrip("\n"))

    def start_pump(self):
        self._thread = threading.Thread(target=self._pump, daemon=True)
        self._thread.start()

    def is_running(self) -> bool:
        return self.proc.poll() is None

    def status(self) -> dict:
        return {
            "name": self.name,
            "argv": self.argv,
            "cmd_str": " ".join(shlex.quote(c) for c in self.argv),
            "running": self.is_running(),
            "pid": self.proc.pid,
            "started_at": self.started_at,
            "exit_code": self.proc.poll(),
        }


class ProcessManager:
    """In-memory registry of long-running Talos processes (proxy, ui)."""

    def __init__(self):
        self._procs: dict[str, ManagedProcess] = {}
        self._lock = threading.Lock()

    def start(self, name: str, args: list[str]) -> dict:
        with self._lock:
            existing = self._procs.get(name)
            if existing and existing.is_running():
                return {"already_running": True, **existing.status()}
            argv = _talos_argv(args)
            try:
                proc = subprocess.Popen(
                    argv,
                    cwd=config.TALOS_ROOT,
                    env=_talos_env(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
            except FileNotFoundError:
                return {
                    "already_running": False,
                    "error": (
                        f"could not find executable '{config.TALOS_BIN}'. "
                        "Set TALOS_BIN or ensure it is on PATH."
                    ),
                }
            managed = ManagedProcess(name=name, argv=argv, proc=proc, started_at=time.time())
            managed.start_pump()
            self._procs[name] = managed
            return {"already_running": False, **managed.status()}

    def stop(self, name: str, force: bool = False) -> dict:
        with self._lock:
            managed = self._procs.get(name)
            if not managed or not managed.is_running():
                return {"was_running": False}
            if force:
                managed.proc.kill()
            else:
                managed.proc.terminate()
            try:
                managed.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                managed.proc.kill()
            return {"was_running": True, **managed.status()}

    def status(self, name: str) -> Optional[dict]:
        managed = self._procs.get(name)
        return managed.status() if managed else None

    def logs(self, name: str, tail: int = 300) -> list[str]:
        managed = self._procs.get(name)
        if not managed:
            return []
        return list(managed.log)[-tail:]


process_manager = ProcessManager()
