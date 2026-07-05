from fastapi import APIRouter
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/mutations", tags=["mutations"])


@router.get("")
def list_mutations(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    rows = db.query_all(db_path, "SELECT * FROM request_mutations ORDER BY key")
    return {"mutations": rows}


class AddMutationBody(BaseModel):
    key: str
    value: str
    type: str = "header"


@router.post("")
def add_mutation(project_id: str, body: AddMutationBody):
    results = cli.run_scoped(project_id, ["mutation", "add", body.type, body.key, body.value])
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{mutation_id}")
def delete_mutation(project_id: str, mutation_id: str):
    results = cli.run_scoped(project_id, ["mutation", "delete", mutation_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{mutation_id}/enable")
def enable_mutation(project_id: str, mutation_id: str):
    results = cli.run_scoped(project_id, ["mutation", "enable", mutation_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{mutation_id}/disable")
def disable_mutation(project_id: str, mutation_id: str):
    results = cli.run_scoped(project_id, ["mutation", "disable", mutation_id])
    return {"steps": [r.to_dict() for r in results]}


class EditMutationBody(BaseModel):
    key: str | None = None
    value: str | None = None


@router.post("/{mutation_id}/edit")
def edit_mutation(project_id: str, mutation_id: str, body: EditMutationBody):
    args = ["mutation", "edit", mutation_id]
    if body.key is not None:
        args += ["--key", body.key]
    if body.value is not None:
        args += ["--value", body.value]
    results = cli.run_scoped(project_id, args)
    return {"steps": [r.to_dict() for r in results]}
