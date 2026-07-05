from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _augment(project_id: str, record: dict) -> dict:
    data_dir = config.project_data_dir(project_id, record)
    db_path = config.project_db_path(project_id, record)
    return {
        "id": project_id,
        "name": record.get("name", project_id),
        "description": record.get("description", ""),
        "scope": record.get("scope", []),
        "created_at": record.get("created_at"),
        "data_dir": str(data_dir),
        "db_exists": db.db_exists(db_path),
        "active": record.get("status") == "active" or bool(record.get("active") or record.get("is_active")),
    }


@router.get("")
def list_projects():
    registry = db.load_registry()
    active_id = db.get_active_project_id()
    out = []
    for project_id, record in registry.items():
        if project_id.startswith("_") or not isinstance(record, dict):
            continue
        item = _augment(project_id, record)
        item["active"] = item["active"] or (project_id == active_id)
        out.append(item)
    out.sort(key=lambda p: p.get("created_at") or "", reverse=True)
    return {"projects": out, "active_project_id": active_id}


@router.get("/active")
def active_project():
    active_id = db.get_active_project_id()
    if not active_id:
        return {"active_project_id": None, "project": None}
    record = db.get_project_record(active_id) or {}
    return {"active_project_id": active_id, "project": _augment(active_id, record)}


@router.get("/{project_id}/summary")
def project_summary(project_id: str):
    record = db.get_project_record(project_id)
    if record is None:
        raise HTTPException(404, "unknown project")
    db_path = config.project_db_path(project_id, record)
    if not db.db_exists(db_path):
        return {
            "flows": 0, "endpoints": 0, "findings_triaging": 0,
            "findings_confirmed": 0, "scheduler_pending": 0, "roles": 0, "modules": 0,
        }
    return {
        "flows": db.scalar(db_path, "SELECT COUNT(*) FROM flows"),
        "endpoints": db.scalar(db_path, "SELECT COUNT(*) FROM endpoints"),
        "findings_triaging": db.scalar(
            db_path, "SELECT COUNT(*) FROM findings WHERE status='TRIAGING'"
        ),
        "findings_confirmed": db.scalar(
            db_path, "SELECT COUNT(*) FROM findings WHERE status='CONFIRMED'"
        ),
        "scheduler_pending": db.scalar(
            db_path, "SELECT COUNT(*) FROM scheduler_jobs WHERE status='pending'"
        ),
        "roles": db.scalar(db_path, "SELECT COUNT(*) FROM roles"),
        "modules": db.scalar(db_path, "SELECT COUNT(*) FROM modules"),
    }


class CreateProjectBody(BaseModel):
    name: str
    description: str = ""
    scope: list[str] = []


@router.post("")
def create_project(body: CreateProjectBody):
    args = ["project", "create", body.name]
    if body.description:
        args += ["--description", body.description]
    for pattern in body.scope:
        args += ["--scope", pattern]
    result = cli.run(args)
    return result.to_dict()


@router.post("/{project_id}/open")
def open_project(project_id: str):
    result = cli.run(["project", "open", project_id])
    return result.to_dict()


@router.post("/close")
def close_project():
    result = cli.run(["project", "close"])
    return result.to_dict()


@router.delete("/{project_id}")
def delete_project(project_id: str, force: bool = Query(False)):
    args = ["project", "delete", project_id]
    if force:
        args.append("--force")
    result = cli.run(args)
    return result.to_dict()


class ScopeBody(BaseModel):
    patterns: list[str]


@router.post("/{project_id}/scope")
def set_scope(project_id: str, body: ScopeBody):
    results = cli.run_scoped(project_id, ["project", "scope", project_id, *body.patterns])
    return {"steps": [r.to_dict() for r in results]}


class ConstraintsBody(BaseModel):
    store_bodies: bool | None = None
    max_body_size: int | None = None


@router.post("/{project_id}/constraints")
def set_constraints(project_id: str, body: ConstraintsBody):
    args = ["project", "constraints", project_id]
    if body.store_bodies is not None:
        args += ["--store-bodies", "true" if body.store_bodies else "false"]
    if body.max_body_size is not None:
        args += ["--max-body-size", str(body.max_body_size)]
    result = cli.run(args)
    return result.to_dict()


@router.get("/status")
def project_status():
    result = cli.run(["project", "status"])
    return result.to_dict()


@router.get("/{project_id}/outscope")
def list_outscope(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    rows = db.query_all(
        db_path,
        "SELECT id, domain, created_at FROM out_of_scope_domains WHERE project_id=? ORDER BY domain",
        (project_id,),
    )
    return {"domains": rows}


class DomainBody(BaseModel):
    domain: str


@router.post("/{project_id}/outscope")
def add_outscope(project_id: str, body: DomainBody):
    results = cli.run_scoped(project_id, ["project", "outscope", "add", "domain", body.domain])
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{project_id}/outscope/{domain}")
def remove_outscope(project_id: str, domain: str):
    results = cli.run_scoped(project_id, ["project", "outscope", "remove", "domain", domain])
    return {"steps": [r.to_dict() for r in results]}
