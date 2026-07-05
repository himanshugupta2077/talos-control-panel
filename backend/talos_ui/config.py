"""
Talos Control Panel — backend configuration.

All paths are resolved from environment variables so the panel can point at
any Talos installation without code changes.

  TALOS_HOME   — root of Talos's local state. Default: ~/.talos
  TALOS_BIN    — the `talos` executable to invoke. Default: "talos" (PATH lookup)
  CP_HOST/PORT — where this control panel's API listens.
"""

import os
from pathlib import Path

TALOS_HOME: Path = Path(os.environ.get("TALOS_HOME", str(Path.home() / ".talos"))).expanduser()
PROJECTS_ROOT: Path = TALOS_HOME / "projects"
REGISTRY_PATH: Path = PROJECTS_ROOT / "registry.json"

TALOS_ROOT: Path = Path(
    os.environ.get(
        "TALOS_ROOT",
        str(Path.home() / "project-tool-scripts-whatnot" / "talos"),
    )
).expanduser()

TALOS_PYTHON: str = os.environ.get(
    "TALOS_PYTHON",
    str(TALOS_ROOT / ".venv" / "bin" / "python"),
)

# Command timeout for normal (non-long-running) CLI calls, in seconds.
CLI_TIMEOUT: int = int(os.environ.get("TALOS_CP_CLI_TIMEOUT", "60"))

CP_HOST: str = os.environ.get("CP_HOST", "127.0.0.1")
CP_PORT: int = int(os.environ.get("CP_PORT", "8420"))

# Allowed origins for the Vite dev server / built frontend.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


def project_data_dir(project_id: str, record: dict | None = None) -> Path:
    """
    Resolve the on-disk data directory for a project.
    Prefers an explicit 'data_dir' key in the registry record; falls back to
    the conventional <PROJECTS_ROOT>/<project_id>/ layout used throughout the
    Talos docs (see BAC-decision-filter.md path examples).
    """
    if record and record.get("data_dir"):
        return Path(record["data_dir"]).expanduser()
    return PROJECTS_ROOT / project_id


def project_db_path(project_id: str, record: dict | None = None) -> Path:
    return project_data_dir(project_id, record) / "talos.db"


def project_archive_dir(project_id: str, record: dict | None = None) -> Path:
    return project_data_dir(project_id, record) / "archive"
