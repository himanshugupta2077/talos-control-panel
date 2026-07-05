from fastapi import APIRouter
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.get("/status")
def status(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    counts = db.query_all(
        db_path, "SELECT status, COUNT(*) AS n FROM scheduler_jobs GROUP BY status"
    )
    cfg = db.query_one(db_path, "SELECT * FROM scheduler_config")
    state = db.query_one(db_path, "SELECT * FROM scheduler_state")
    return {
        "counts": {row["status"]: row["n"] for row in counts},
        "config": cfg,
        "state": state,
    }


@router.get("/filters")
def job_filters(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    if not db.db_exists(db_path):
        return {"job_types": [], "statuses": [], "roles": [], "modules": []}
    return {
        "job_types": [r["job_type"] for r in db.query_all(
            db_path, "SELECT DISTINCT job_type FROM scheduler_jobs ORDER BY job_type")],
        "statuses": [r["status"] for r in db.query_all(
            db_path, "SELECT DISTINCT status FROM scheduler_jobs ORDER BY status")],
        "roles": [r["name"] for r in db.query_all(db_path, "SELECT name FROM roles ORDER BY name")],
        "modules": [r["name"] for r in db.query_all(db_path, "SELECT name FROM modules ORDER BY name")],
    }


_JOB_SELECT = """
    SELECT sj.*,
        COALESCE(sj.endpoint_id, f.endpoint_id) AS resolved_endpoint_id,
        COALESCE(r.name, rf.name) AS role_name,
        COALESCE(m.name, mf.name) AS module_name
    FROM scheduler_jobs sj
    LEFT JOIN flows f ON f.id = sj.flow_id
    LEFT JOIN roles r ON r.id = json_extract(sj.meta, '$.attacker_role_id')
    LEFT JOIN roles rf ON rf.id = f.role_id
    LEFT JOIN modules m ON m.id = json_extract(sj.meta, '$.module_id')
    LEFT JOIN modules mf ON mf.id = f.module_id
"""


@router.get("/jobs")
def list_jobs(
    project_id: str, status: str | None = None, job_type: str | None = None,
    role: str | None = None, module: str | None = None, limit: int = 200,
):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    conditions: list[str] = []
    params: list = []
    if status:
        conditions.append("sj.status = ?"); params.append(status)
    if job_type:
        conditions.append("sj.job_type = ?"); params.append(job_type)
    if role:
        conditions.append("COALESCE(r.name, rf.name) = ?"); params.append(role)
    if module:
        conditions.append("COALESCE(m.name, mf.name) = ?"); params.append(module)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = db.query_all(
        db_path,
        f"{_JOB_SELECT} {where} ORDER BY "
        "CASE sj.status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, "
        "sj.priority DESC, sj.created_at DESC LIMIT ?",
        (*params, limit),
    )
    for r in rows:
        r["meta"] = db.safe_json(r.get("meta"), {})
    return {"jobs": rows}


class ConfigBody(BaseModel):
    min_delay: float | None = None
    max_delay: float | None = None
    max_queue_size: int | None = None


@router.post("/config")
def set_config(project_id: str, body: ConfigBody):
    args = ["scheduler", "config"]
    if body.min_delay is not None:
        args += ["--min-delay", str(body.min_delay)]
    if body.max_delay is not None:
        args += ["--max-delay", str(body.max_delay)]
    if body.max_queue_size is not None:
        args += ["--max-queue-size", str(body.max_queue_size)]
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


class EnqueueFlowBody(BaseModel):
    flow_id: str
    priority: int | None = None
    force: bool = False


@router.post("/enqueue/flow")
def enqueue_flow(project_id: str, body: EnqueueFlowBody):
    args = ["scheduler", "enqueue", "flow", body.flow_id]
    if body.priority is not None:
        args += ["--priority", str(body.priority)]
    if body.force:
        args.append("--force")
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


class EnqueueEndpointBody(BaseModel):
    endpoint_id: str
    type: str | None = None  # replay | auth-test
    priority: int | None = None
    force: bool = False


@router.post("/enqueue/endpoint")
def enqueue_endpoint(project_id: str, body: EnqueueEndpointBody):
    args = ["scheduler", "enqueue", "endpoint", body.endpoint_id]
    if body.type:
        args += ["--type", body.type]
    if body.priority is not None:
        args += ["--priority", str(body.priority)]
    if body.force:
        args.append("--force")
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.post("/clear")
def clear(project_id: str, force: bool = False):
    args = ["scheduler", "clear"]
    if force:
        args.append("--force")
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


@router.post("/pause")
def pause(project_id: str):
    results = cli.run_scoped(project_id, ["scheduler", "pause"])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/resume")
def resume(project_id: str):
    results = cli.run_scoped(project_id, ["scheduler", "resume"])
    return {"steps": [r.to_dict() for r in results]}
