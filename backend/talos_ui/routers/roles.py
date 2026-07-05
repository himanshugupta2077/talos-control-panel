from fastapi import APIRouter
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("")
def list_roles(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    rows = db.query_all(db_path, "SELECT id, name, is_active FROM roles ORDER BY name")
    return {"roles": rows}


class CreateRoleBody(BaseModel):
    name: str


@router.post("")
def create_role(project_id: str, body: CreateRoleBody):
    results = cli.run_scoped(project_id, ["role", "create", body.name])
    return {"steps": [r.to_dict() for r in results]}


class SetRoleBody(BaseModel):
    name: str


@router.post("/set")
def set_role(project_id: str, body: SetRoleBody):
    results = cli.run_scoped(project_id, ["role", "set", body.name])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/unset")
def unset_role(project_id: str):
    results = cli.run_scoped(project_id, ["role", "unset"])
    return {"steps": [r.to_dict() for r in results]}
