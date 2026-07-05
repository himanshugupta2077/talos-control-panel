from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import cli, config, db

router = APIRouter(prefix="/api/endpoints", tags=["endpoints"])


@router.get("")
def list_endpoints(
    project_id: str, offset: int = 0, limit: int = 200, search: str = "",
    method: str = "", role: str = "", module: str = "", priority: str = "",
    qualified: str = "", excluded: str = "", dangerous: str = "", logout: str = "",
):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    conditions: list[str] = []
    params: list = []
    if search:
        conditions.append("(e.host LIKE ? OR e.normalized_path LIKE ? OR e.method LIKE ?)")
        like = f"%{search}%"
        params += [like, like, like]
    if method:
        conditions.append("e.method = ?"); params.append(method)
    if role:
        conditions.append("r.name = ?"); params.append(role)
    if module:
        conditions.append("m.name = ?"); params.append(module)
    if priority:
        conditions.append("COALESCE(ep.manual_priority, ep.auto_priority) = ?"); params.append(priority)
    if qualified in ("0", "1"):
        conditions.append("ep.qualified = ?"); params.append(int(qualified))
    if excluded in ("0", "1"):
        conditions.append("COALESCE(ep.excluded, 0) = ?"); params.append(int(excluded))
    if dangerous in ("0", "1"):
        conditions.append("COALESCE(ep.dangerous, 0) = ?"); params.append(int(dangerous))
    if logout in ("0", "1"):
        conditions.append("COALESCE(ep.logout, 0) = ?"); params.append(int(logout))
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = db.query_all(
        db_path,
        f"""
        SELECT
            e.id, e.method, e.host, e.normalized_path, e.auth_required,
            e.first_seen, e.last_seen,
            COUNT(DISTINCT f.id) AS hit_count,
            GROUP_CONCAT(DISTINCT r.name) AS roles,
            GROUP_CONCAT(DISTINCT m.name) AS modules,
            ep.auto_priority, ep.manual_priority, ep.excluded, ep.dangerous,
            ep.logout, ep.qualified, ep.qualification_reason
        FROM endpoints e
        LEFT JOIN flows f ON f.endpoint_id = e.id
        LEFT JOIN modules m ON m.id = f.module_id
        LEFT JOIN endpoint_roles er ON er.endpoint_id = e.id
        LEFT JOIN roles r ON r.id = er.role_id
        LEFT JOIN endpoint_policy ep ON ep.endpoint_id = e.id
        {where}
        GROUP BY e.id
        ORDER BY hit_count DESC, e.normalized_path
        LIMIT ? OFFSET ?
        """,
        (*params, limit, offset),
    )
    total = db.scalar(db_path, "SELECT COUNT(*) FROM endpoints")
    return {"endpoints": rows, "total": total}


@router.get("/filters")
def endpoint_filters(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    if not db.db_exists(db_path):
        return {"methods": [], "roles": [], "modules": [], "priorities": []}
    return {
        "methods": [r["method"] for r in db.query_all(
            db_path, "SELECT DISTINCT method FROM endpoints ORDER BY method")],
        "roles": [r["name"] for r in db.query_all(db_path, "SELECT name FROM roles ORDER BY name")],
        "modules": [r["name"] for r in db.query_all(db_path, "SELECT name FROM modules ORDER BY name")],
        "priorities": [r["p"] for r in db.query_all(
            db_path,
            "SELECT DISTINCT COALESCE(manual_priority, auto_priority) AS p FROM endpoint_policy "
            "WHERE COALESCE(manual_priority, auto_priority) IS NOT NULL ORDER BY p",
        )],
    }


@router.get("/{endpoint_id}")
def endpoint_detail(project_id: str, endpoint_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    endpoint = db.query_one(db_path, "SELECT * FROM endpoints WHERE id=?", (endpoint_id,))
    if endpoint is None:
        raise HTTPException(404, "endpoint not found")
    policy = db.query_one(db_path, "SELECT * FROM endpoint_policy WHERE endpoint_id=?", (endpoint_id,))
    annotations = db.query_all(
        db_path, "SELECT tag, created_at FROM endpoint_annotations WHERE endpoint_id=?", (endpoint_id,)
    )
    parameters = db.query_all(
        db_path, "SELECT * FROM parameters WHERE endpoint_id=? ORDER BY location, name", (endpoint_id,)
    )
    roles = db.query_all(
        db_path,
        "SELECT r.id, r.name, er.first_seen, er.last_seen FROM endpoint_roles er "
        "JOIN roles r ON r.id = er.role_id WHERE er.endpoint_id=?",
        (endpoint_id,),
    )
    flows = db.query_all(
        db_path,
        """
        SELECT f.id, f.method, f.path, f.status_code, f.captured_at, f.source,
               COALESCE(r.name,'—') AS role_name, COALESCE(m.name,'—') AS module_name
        FROM flows f
        LEFT JOIN roles r ON r.id = f.role_id
        LEFT JOIN modules m ON m.id = f.module_id
        WHERE f.endpoint_id=?
        ORDER BY f.captured_at DESC LIMIT 50
        """,
        (endpoint_id,),
    )
    for p in parameters:
        p["example_values"] = db.safe_json(p.get("example_values"), [])
        p["appears_in_roles"] = db.safe_json(p.get("appears_in_roles"), [])
        p["appears_in_modules"] = db.safe_json(p.get("appears_in_modules"), [])
        p["reflection_locations"] = db.safe_json(p.get("reflection_locations"), [])
    return {
        "endpoint": endpoint, "policy": policy, "annotations": annotations,
        "parameters": parameters, "roles": roles, "flows": flows,
    }


@router.get("/{endpoint_id}/adjacent")
def adjacent(project_id: str, endpoint_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    rows = db.query_all(
        db_path,
        """
        SELECT e.id, COUNT(f.id) AS hit_count
        FROM endpoints e LEFT JOIN flows f ON f.endpoint_id = e.id
        GROUP BY e.id ORDER BY hit_count DESC, e.normalized_path ASC
        """,
    )
    ids = [r["id"] for r in rows]
    if endpoint_id not in ids:
        return {"prev_id": None, "next_id": None}
    idx = ids.index(endpoint_id)
    return {
        "prev_id": ids[idx - 1] if idx > 0 else None,
        "next_id": ids[idx + 1] if idx < len(ids) - 1 else None,
    }


class MarkBody(BaseModel):
    tag: str  # --logout | --dangerous | --safe


@router.post("/{endpoint_id}/mark")
def mark(project_id: str, endpoint_id: str, body: MarkBody):
    results = cli.run_scoped(project_id, ["endpoint", "mark", endpoint_id, body.tag])
    return {"steps": [r.to_dict() for r in results]}


class UnmarkBody(BaseModel):
    tag: str  # --logout | --dangerous


@router.post("/{endpoint_id}/unmark")
def unmark(project_id: str, endpoint_id: str, body: UnmarkBody):
    results = cli.run_scoped(project_id, ["endpoint", "unmark", endpoint_id, body.tag])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{endpoint_id}/export")
def export_endpoint(project_id: str, endpoint_id: str):
    results = cli.run_scoped(project_id, ["endpoint", "export", endpoint_id])
    return {"steps": [r.to_dict() for r in results]}


class PriorityBody(BaseModel):
    priority: str  # LOW | NORMAL | HIGH | CRITICAL


@router.post("/{endpoint_id}/priority")
def set_priority(project_id: str, endpoint_id: str, body: PriorityBody):
    results = cli.run_scoped(
        project_id, ["endpoint", "priority", "set", "endpoint", endpoint_id, body.priority]
    )
    return {"steps": [r.to_dict() for r in results]}


@router.delete("/{endpoint_id}/priority")
def clear_priority(project_id: str, endpoint_id: str):
    results = cli.run_scoped(project_id, ["endpoint", "priority", "clear", "endpoint", endpoint_id])
    return {"steps": [r.to_dict() for r in results]}


@router.get("/parameters/search")
def search_parameters(project_id: str, search: str = "", limit: int = 200):
    """
    Project-wide parameter lookup (name + owning endpoint) for the
    searchable parameter picker used by Input Validation scoping and
    characterization — avoids operators having to paste raw UUIDs.
    """
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    where = ""
    params: tuple = (limit,)
    if search:
        where = "WHERE p.name LIKE ? OR e.normalized_path LIKE ? OR e.host LIKE ?"
        like = f"%{search}%"
        params = (like, like, like, limit)
    rows = db.query_all(
        db_path,
        f"""
        SELECT p.id, p.name, p.location, p.param_type, p.endpoint_id,
               e.method, e.host, e.normalized_path
        FROM parameters p
        JOIN endpoints e ON e.id = p.endpoint_id
        {where}
        ORDER BY p.name
        LIMIT ?
        """,
        params,
    )
    return {"parameters": rows}


@router.post("/{endpoint_id}/exclude")
def exclude(project_id: str, endpoint_id: str):
    results = cli.run_scoped(project_id, ["endpoint", "exclude", "endpoint", endpoint_id])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/{endpoint_id}/include")
def include(project_id: str, endpoint_id: str):
    results = cli.run_scoped(project_id, ["endpoint", "include", "endpoint", endpoint_id])
    return {"steps": [r.to_dict() for r in results]}


@router.get("/policy/rules")
def rules_list(project_id: str):
    record = db.get_project_record(project_id)
    db_path = config.project_db_path(project_id, record)
    rows = db.query_all(
        db_path,
        "SELECT id, pattern, priority, excluded, created_at FROM policy_rules "
        "WHERE project_id=? ORDER BY created_at DESC",
        (project_id,),
    )
    return {"rules": rows}


class PathPriorityBody(BaseModel):
    pattern: str
    priority: str


@router.post("/policy/path-priority")
def set_path_priority(project_id: str, body: PathPriorityBody):
    results = cli.run_scoped(
        project_id, ["endpoint", "priority", "set", "path", body.pattern, body.priority]
    )
    return {"steps": [r.to_dict() for r in results]}


class PathPatternBody(BaseModel):
    pattern: str


@router.post("/policy/path-exclude")
def exclude_path(project_id: str, body: PathPatternBody):
    results = cli.run_scoped(project_id, ["endpoint", "exclude", "path", body.pattern])
    return {"steps": [r.to_dict() for r in results]}


@router.post("/policy/path-include")
def include_path(project_id: str, body: PathPatternBody):
    results = cli.run_scoped(project_id, ["endpoint", "include", "path", body.pattern])
    return {"steps": [r.to_dict() for r in results]}
