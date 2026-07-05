from fastapi import APIRouter
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/modules", tags=["modules"])


@router.get("")
def list_modules(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    rows = db.query_all(
        db_path, "SELECT id, name, description, is_active FROM modules ORDER BY name"
    )
    return {"modules": rows}


class CreateModuleBody(BaseModel):
    name: str
    description: str = ""


@router.post("")
def create_module(project_id: str, body: CreateModuleBody):
    args = ["module", "create", body.name]
    if body.description:
        args += ["--description", body.description]
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}


class SetModuleBody(BaseModel):
    name: str


@router.post("/set")
def set_module(project_id: str, body: SetModuleBody):
    results = cli.run_scoped(project_id, ["module", "set", body.name])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/unset")
def unset_module(project_id: str):
    results = cli.run_scoped(project_id, ["module", "unset"])
    return {"steps": [r.to_dict() for r in results]}
