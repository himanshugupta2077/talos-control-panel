from fastapi import APIRouter
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/auth-config", tags=["auth-config"])


@router.get("/{role_id}/state")
def role_auth_state(project_id: str, role_id: str):
    """Read-only snapshot: provider, current artifacts, session config, health."""
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    provider = db.query_one(
        db_path, "SELECT provider, updated_at FROM role_auth_provider WHERE role_id=?", (role_id,)
    )
    artifacts = db.query_all(
        db_path, "SELECT key, value, collected_at FROM role_auth_state WHERE role_id=?", (role_id,)
    )
    manual_session = db.query_one(
        db_path,
        "SELECT headers_json, cookies_json, expires_at, ttl_seconds, updated_at "
        "FROM manual_session_config WHERE role_id=?",
        (role_id,),
    )
    flows = db.query_all(
        db_path,
        "SELECT id, flow_id, extractor_code IS NOT NULL AS has_extractor, sort_order "
        "FROM auth_flow_config WHERE role_id=? ORDER BY sort_order",
        (role_id,),
    )
    health = db.query_one(
        db_path,
        "SELECT ttl_seconds, refresh_before_seconds, expiry_body_signals, expiry_status_codes, "
        "validation_endpoint_url, validation_expected_status FROM session_health_config WHERE role_id=?",
        (role_id,),
    )
    control_flows = db.query_all(
        db_path, "SELECT flow_id FROM session_health_control_flows WHERE role_id=?", (role_id,)
    )
    suspicion = db.query_one(
        db_path,
        "SELECT suspicion_count, last_checked_at FROM session_suspicion_state WHERE role_id=?",
        (role_id,),
    )
    return {
        "provider": provider,
        "artifacts": artifacts,
        "manual_session": manual_session,
        "flows": flows,
        "health": health,
        "control_flows": control_flows,
        "suspicion": suspicion,
    }


class ProviderBody(BaseModel):
    provider: str  # auto | manual


@router.post("/{role_id}/provider")
def set_provider(project_id: str, role_id: str, body: ProviderBody):
    results = cli.run_scoped(project_id, ["auth-config", "set-provider", role_id, body.provider])
    return {"steps": [r.to_dict() for r in results]}


class ManualSessionFileBody(BaseModel):
    content: str


def _session_file_path(project_id: str, record: dict | None, role_id: str):
    """
    Mirrors talos.projects.model.Project.auth_session_path — the persistent
    per-role manual session file lives at <data_dir>/auth_sessions/<role_id>.txt.
    Kept in sync with that method; if it ever changes, update both places.
    """
    return config.project_data_dir(project_id, record) / "auth_sessions" / f"{role_id}.txt"


@router.get("/{role_id}/session/file")
def get_session_file(project_id: str, role_id: str):
    """
    Ensure the persistent manual-session file exists (creating it from a
    template via `talos auth-config set-session <role_id> path` if needed),
    then return its path and current contents so the UI can present an
    in-browser editor instead of requiring an external text editor.
    """
    path_result = cli.run_scoped(project_id, ["auth-config", "set-session", role_id, "path"])
    record = db.get_project_record(project_id)
    file_path = _session_file_path(project_id, record, role_id)
    content = file_path.read_text(encoding="utf-8") if file_path.exists() else ""
    return {
        "path": str(file_path),
        "content": content,
        "steps": [r.to_dict() for r in path_result],
    }


@router.post("/{role_id}/session/file")
def save_session_file(project_id: str, role_id: str, body: ManualSessionFileBody):
    """
    Write the operator-edited session file content directly to the same
    persistent path `talos auth-config set-session <role_id> path` created —
    functionally identical to editing it by hand in an external editor.
    """
    path_result = cli.run_scoped(project_id, ["auth-config", "set-session", role_id, "path"])
    record = db.get_project_record(project_id)
    file_path = _session_file_path(project_id, record, role_id)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(body.content, encoding="utf-8")
    return {"path": str(file_path), "steps": [r.to_dict() for r in path_result]}


@router.post("/{role_id}/session/apply")
def apply_session_file(project_id: str, role_id: str):
    """
    Parse the (already-edited) session file and apply it: checks provider is
    MANUAL and project-wide auth artifacts exist, then validates + refreshes.
    Mirrors `talos auth-config set-session <role_id>` (no path arg).
    """
    results = cli.run_scoped(project_id, ["auth-config", "set-session", role_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{role_id}/flows/{flow_id}")
def add_flow(project_id: str, role_id: str, flow_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "add-flow", role_id, flow_id])
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{role_id}/flows/{flow_id}")
def remove_flow(project_id: str, role_id: str, flow_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "remove-flow", role_id, flow_id])
    return {"steps": [r.to_dict() for r in results]}


class ExtractorBody(BaseModel):
    code: str


@router.post("/{role_id}/flows/{flow_id}/extractor")
def set_extractor(project_id: str, role_id: str, flow_id: str, body: ExtractorBody):
    results = cli.run_scoped_with_temp_file(
        project_id, ["auth-config", "set-extractor", role_id, flow_id], body.code, suffix=".py"
    )
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{role_id}/flows/{flow_id}/extractor/edit")
def edit_extractor(project_id: str, role_id: str, flow_id: str, body: ExtractorBody):
    results = cli.run_scoped_with_editor_content(
        project_id, ["auth-config", "edit-extractor", role_id, flow_id], body.code
    )
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{role_id}/flows/{flow_id}/extractor")
def remove_extractor(project_id: str, role_id: str, flow_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "remove-extractor", role_id, flow_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{role_id}/test/{flow_id}")
def test_flow(project_id: str, role_id: str, flow_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "test", role_id, flow_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{role_id}/validate")
def validate(project_id: str, role_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "validate", role_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{role_id}/refresh")
def refresh(project_id: str, role_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "refresh", role_id])
    return {"steps": [r.to_dict() for r in results]}


class TtlBody(BaseModel):
    ttl: int
    refresh_before: int | None = None


@router.post("/{role_id}/ttl")
def set_ttl(project_id: str, role_id: str, body: TtlBody):
    args = ["auth-config", "set-ttl", role_id, "--ttl", str(body.ttl)]
    if body.refresh_before is not None:
        args += ["--refresh-before", str(body.refresh_before)]
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


class ExpirySignalBody(BaseModel):
    body_signals: list[str] = []
    status_codes: list[int] = []


@router.post("/{role_id}/expiry-signals")
def add_expiry_signal(project_id: str, role_id: str, body: ExpirySignalBody):
    args = ["auth-config", "add-expiry-signal", role_id]
    for b in body.body_signals:
        args += ["--body", b]
    for s in body.status_codes:
        args += ["--status", str(s)]
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{role_id}/expiry-signals")
def clear_expiry_signals(project_id: str, role_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "clear-expiry-signals", role_id])
    return {"steps": [r.to_dict() for r in results]}


class ValidationEndpointBody(BaseModel):
    url: str
    expected_status: int = 200
    body_contains: list[str] = []
    body_not_contains: list[str] = []


@router.post("/{role_id}/validation-endpoint")
def set_validation(project_id: str, role_id: str, body: ValidationEndpointBody):
    args = [
        "auth-config", "set-validation", role_id, body.url,
        "--expected-status", str(body.expected_status),
    ]
    for b in body.body_contains:
        args += ["--body-contains", b]
    for b in body.body_not_contains:
        args += ["--body-not-contains", b]
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{role_id}/validation-endpoint")
def clear_validation(project_id: str, role_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "clear-validation", role_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{role_id}/control-flows/{flow_id}")
def add_control_flow(project_id: str, role_id: str, flow_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "add-control-flow", role_id, flow_id])
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{role_id}/control-flows/{flow_id}")
def remove_control_flow(project_id: str, role_id: str, flow_id: str):
    results = cli.run_scoped(project_id, ["auth-config", "remove-control-flow", role_id, flow_id])
    return {"steps": [r.to_dict() for r in results]}
