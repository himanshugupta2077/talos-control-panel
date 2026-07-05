"""
Declarative description of the Talos CLI surface.

This powers the "Console" page: a full-coverage fallback for any command that
doesn't have a dedicated, human-friendly page yet. Each leaf command declares
its base argv tokens plus a list of typed arguments; the frontend renders a
form from this and posts the filled-in values back to /api/console/run, which
rebuilds a safe argv list (no shell involved — subprocess is always called
with a list, never shell=True).

Field kinds:
  "text"     — single string, rendered as positional or `--flag value`
  "number"   — numeric string
  "boolean"  — rendered as a bare flag when true, omitted when false
  "select"   — one of `options`
  "multi"    — repeated value; flag repeated once per entry, or repeated
               positionals when `flag` is None
"""

from __future__ import annotations

from typing import Any


def arg(
    name: str,
    label: str | None = None,
    flag: str | None = None,
    kind: str = "text",
    required: bool = False,
    help: str = "",
    options: list[str] | None = None,
    default: Any = None,
):
    return {
        "name": name,
        "label": label or name.replace("_", " "),
        "flag": flag,
        "kind": kind,
        "required": required,
        "help": help,
        "options": options or [],
        "default": default,
    }


def cmd(cmd_id: str, path: list[str], summary: str, args: list[dict] | None = None, background: bool = False):
    return {
        "id": cmd_id,
        "path": path,
        "summary": summary,
        "args": args or [],
        "background": background,
    }


PRIORITY_OPTIONS = ["LOW", "NORMAL", "HIGH", "CRITICAL"]
ACCESS_VALUES = ["ALLOW", "DENY", "UNKNOWN"]
IV_PHASES = [
    "baseline", "identifier", "characters", "length",
    "types", "transformations", "reflection", "validation",
]

COMMAND_TREE: list[dict] = [
    {
        "group": "project",
        "label": "Project",
        "commands": [
            cmd("project.create", ["project", "create"], "Create a new project", [
                arg("name", required=True, help="Project id/name"),
                arg("description", flag="--description", help="Short description"),
                arg("scope", flag="--scope", kind="multi", help="Scope host patterns, e.g. *.example.com"),
            ]),
            cmd("project.open", ["project", "open"], "Open (activate) a project", [
                arg("id", required=True),
            ]),
            cmd("project.close", ["project", "close"], "Close the active project"),
            cmd("project.delete", ["project", "delete"], "Delete a project", [
                arg("id", required=True),
                arg("force", flag="--force", kind="boolean"),
            ]),
            cmd("project.list", ["project", "list"], "List all projects"),
            cmd("project.scope", ["project", "scope"], "Set scope patterns for a project", [
                arg("id", required=True),
                arg("patterns", kind="multi", help="Host patterns, e.g. *.example.com api.example.com"),
            ]),
            cmd("project.constraints", ["project", "constraints"], "Set capture constraints", [
                arg("id", required=True),
                arg("store_bodies", flag="--store-bodies", kind="select", options=["true", "false"]),
                arg("max_body_size", flag="--max-body-size", kind="number", help="Bytes"),
            ]),
            cmd("project.status", ["project", "status"], "Show active project status"),
            cmd("project.outscope.add", ["project", "outscope", "add", "domain"], "Add out-of-scope domain", [
                arg("domain", required=True),
            ]),
            cmd("project.outscope.list", ["project", "outscope", "list"], "List out-of-scope domains"),
            cmd("project.outscope.remove", ["project", "outscope", "remove", "domain"], "Remove out-of-scope domain", [
                arg("domain", required=True),
            ]),
        ],
    },
    {
        "group": "proxy",
        "label": "Proxy",
        "commands": [
            cmd("proxy.start", ["proxy", "start"], "Start the intercepting proxy", [
                arg("listen_host", flag="--listen-host", default="127.0.0.1"),
                arg("port", flag="--port", kind="number", default="8080"),
            ], background=True),
        ],
    },
    {
        "group": "ui",
        "label": "Inspection UI",
        "commands": [
            cmd("ui.start", ["ui"], "Start Talos's built-in read-only inspection UI", [
                arg("host", flag="--host", default="127.0.0.1"),
                arg("port", flag="--port", kind="number", default="8010"),
            ], background=True),
        ],
    },
    {
        "group": "role",
        "label": "Roles",
        "commands": [
            cmd("role.create", ["role", "create"], "Create a role", [arg("name", required=True)]),
            cmd("role.list", ["role", "list"], "List roles"),
            cmd("role.set", ["role", "set"], "Set the active role", [arg("name", required=True)]),
            cmd("role.unset", ["role", "unset"], "Unset the active role"),
        ],
    },
    {
        "group": "module",
        "label": "Modules",
        "commands": [
            cmd("module.create", ["module", "create"], "Create a module", [
                arg("name", required=True),
                arg("description", flag="--description"),
            ]),
            cmd("module.list", ["module", "list"], "List modules"),
            cmd("module.set", ["module", "set"], "Set the active module", [arg("name", required=True)]),
            cmd("module.unset", ["module", "unset"], "Unset the active module"),
        ],
    },
    {
        "group": "access",
        "label": "Access Model",
        "commands": [
            cmd("access.client.set", ["access", "client", "set"], "Set client-allowed access", [
                arg("role", required=True), arg("module", required=True),
                arg("value", kind="select", options=ACCESS_VALUES, required=True),
            ]),
            cmd("access.client.unset", ["access", "client", "unset"], "Unset client-allowed access", [
                arg("role", required=True), arg("module", required=True),
            ]),
            cmd("access.server.set", ["access", "server", "set"], "Set server-expected access", [
                arg("role", required=True), arg("module", required=True),
                arg("value", kind="select", options=ACCESS_VALUES, required=True),
            ]),
            cmd("access.server.unset", ["access", "server", "unset"], "Unset server-expected access", [
                arg("role", required=True), arg("module", required=True),
            ]),
            cmd("access.delete", ["access", "delete"], "Delete an access mapping", [
                arg("role", required=True), arg("module", required=True),
            ]),
            cmd("access.show", ["access", "show"], "Show the access matrix"),
            cmd("access.coverage", ["access", "coverage"], "Expected vs observed coverage"),
            cmd("access.signals", ["access", "signals"], "BAC/IDOR signal report"),
        ],
    },
    {
        "group": "auth",
        "label": "Auth (artifacts)",
        "commands": [
            cmd("auth.set", ["auth", "set"], "Declare auth artifact names", [
                arg("cookie", flag="--cookie", kind="multi"),
                arg("header", flag="--header", kind="multi"),
            ]),
            cmd("auth.unset", ["auth", "unset"], "Remove auth artifact names", [
                arg("cookie", flag="--cookie", kind="multi"),
                arg("header", flag="--header", kind="multi"),
            ]),
            cmd("auth.show", ["auth", "show"], "Show configured auth artifacts"),
            cmd("auth.clear", ["auth", "clear"], "Clear all auth artifacts"),
            cmd("auth.test", ["auth", "test"], "Run an auth-bypass test", [
                arg("endpoint_id", required=True),
                arg("right_now", flag="--right-now", kind="boolean"),
            ]),
        ],
    },
    {
        "group": "auth-config",
        "label": "Auth Config (per-role)",
        "commands": [
            cmd("auth_config.set_provider", ["auth-config", "set-provider"], "Set role auth provider", [
                arg("role_id", required=True),
                arg("provider", kind="select", options=["auto", "manual"], required=True),
            ]),
            cmd("auth_config.show_provider", ["auth-config", "show-provider"], "Show role auth provider", [
                arg("role_id", required=True),
            ]),
            cmd("auth_config.add_flow", ["auth-config", "add-flow"], "Attach a login flow", [
                arg("role", required=True), arg("flow_id", required=True),
            ]),
            cmd("auth_config.remove_flow", ["auth-config", "remove-flow"], "Detach a login flow", [
                arg("role", required=True), arg("flow_id", required=True),
            ]),
            cmd("auth_config.list_flows", ["auth-config", "list-flows"], "List login flows for a role", [
                arg("role", required=True),
            ]),
            cmd("auth_config.show_extractor", ["auth-config", "show-extractor"], "Show extractor source", [
                arg("role", required=True), arg("flow_id", required=True),
            ]),
            cmd("auth_config.remove_extractor", ["auth-config", "remove-extractor"], "Remove extractor", [
                arg("role", required=True), arg("flow_id", required=True),
            ]),
            cmd("auth_config.test", ["auth-config", "test"], "Test one flow+extractor (no state stored)", [
                arg("role", required=True), arg("flow_id", required=True),
            ]),
            cmd("auth_config.validate", ["auth-config", "validate"], "Validate a role's session", [
                arg("role", required=True),
            ]),
            cmd("auth_config.refresh", ["auth-config", "refresh"], "Force a full auth refresh", [
                arg("role", required=True),
            ]),
            cmd("auth_config.status", ["auth-config", "status"], "Show role auth status", [
                arg("role", required=True),
            ]),
            cmd("auth_config.show", ["auth-config", "show"], "Show full role auth config", [
                arg("role", required=True),
            ]),
            cmd("auth_config.set_ttl", ["auth-config", "set-ttl"], "Set session TTL", [
                arg("role", required=True),
                arg("ttl", flag="--ttl", kind="number", required=True),
                arg("refresh_before", flag="--refresh-before", kind="number"),
            ]),
            cmd("auth_config.add_expiry_signal", ["auth-config", "add-expiry-signal"], "Add expiry signal", [
                arg("role", required=True),
                arg("body", flag="--body", kind="multi"),
                arg("status", flag="--status", kind="multi"),
            ]),
            cmd("auth_config.clear_expiry_signals", ["auth-config", "clear-expiry-signals"], "Clear expiry signals", [
                arg("role", required=True),
            ]),
            cmd("auth_config.clear_validation", ["auth-config", "clear-validation"], "Clear validation endpoint", [
                arg("role", required=True),
            ]),
            cmd("auth_config.add_control_flow", ["auth-config", "add-control-flow"], "Add a control (validation) flow", [
                arg("role", required=True), arg("flow_id", required=True),
            ]),
            cmd("auth_config.remove_control_flow", ["auth-config", "remove-control-flow"], "Remove a control flow", [
                arg("role", required=True), arg("flow_id", required=True),
            ]),
            cmd("auth_config.list_control_flows", ["auth-config", "list-control-flows"], "List control flows", [
                arg("role", required=True),
            ]),
        ],
    },
    {
        "group": "endpoint",
        "label": "Endpoints",
        "commands": [
            cmd("endpoint.mark", ["endpoint", "mark"], "Apply a safety annotation", [
                arg("endpoint_id", required=True),
                arg("tag", kind="select", options=["--logout", "--dangerous", "--safe"], required=True),
            ]),
            cmd("endpoint.unmark", ["endpoint", "unmark"], "Remove a safety annotation", [
                arg("endpoint_id", required=True),
                arg("tag", kind="select", options=["--logout", "--dangerous"], required=True),
            ]),
            cmd("endpoint.show", ["endpoint", "show"], "Show endpoint detail", [arg("endpoint_id", required=True)]),
            cmd("endpoint.export", ["endpoint", "export"], "Export complete endpoint dossier", [arg("endpoint_id", required=True)]),
            cmd("endpoint.priority.set_endpoint", ["endpoint", "priority", "set", "endpoint"], "Set priority for one endpoint", [
                arg("endpoint_id", required=True),
                arg("priority", kind="select", options=PRIORITY_OPTIONS, required=True),
            ]),
            cmd("endpoint.priority.set_path", ["endpoint", "priority", "set", "path"], "Set priority for a path pattern", [
                arg("pattern", required=True),
                arg("priority", kind="select", options=PRIORITY_OPTIONS, required=True),
            ]),
            cmd("endpoint.priority.clear_endpoint", ["endpoint", "priority", "clear", "endpoint"], "Clear priority override", [
                arg("endpoint_id", required=True),
            ]),
            cmd("endpoint.priority.clear_path", ["endpoint", "priority", "clear", "path"], "Clear path priority rule", [
                arg("pattern", required=True),
            ]),
            cmd("endpoint.exclude.endpoint", ["endpoint", "exclude", "endpoint"], "Exclude one endpoint", [arg("endpoint_id", required=True)]),
            cmd("endpoint.exclude.path", ["endpoint", "exclude", "path"], "Exclude a path pattern", [arg("pattern", required=True)]),
            cmd("endpoint.include.endpoint", ["endpoint", "include", "endpoint"], "Include one endpoint", [arg("endpoint_id", required=True)]),
            cmd("endpoint.include.path", ["endpoint", "include", "path"], "Include a path pattern", [arg("pattern", required=True)]),
            cmd("endpoint.rules.list", ["endpoint", "rules", "list"], "List policy rules"),
        ],
    },
    {
        "group": "replay",
        "label": "Replay",
        "commands": [
            cmd("replay.flow", ["replay", "flow"], "Replay a specific flow", [
                arg("flow_id", required=True), arg("right_now", flag="--right-now", kind="boolean"),
            ]),
            cmd("replay.endpoint", ["replay", "endpoint"], "Replay an endpoint's best flow", [
                arg("endpoint_id", required=True), arg("right_now", flag="--right-now", kind="boolean"),
            ]),
        ],
    },
    {
        "group": "flow",
        "label": "Flows",
        "commands": [
            cmd("flow.show", ["flow", "show"], "Show a flow", [arg("flow_id", required=True)]),
            cmd("flow.export", ["flow", "export"], "Export flow(s)", [
                arg("flow_id", help="Single flow id (optional if using a filter below)"),
                arg("module", flag="--module", kind="select", options=["input_validation", "bac"]),
                arg("parameter", flag="--parameter"),
                arg("endpoint", flag="--endpoint"),
                arg("flows", flag="--flows", kind="multi"),
            ]),
        ],
    },
    {
        "group": "scheduler",
        "label": "Scheduler",
        "commands": [
            cmd("scheduler.status", ["scheduler", "status"], "Show scheduler status"),
            cmd("scheduler.config", ["scheduler", "config"], "View/set scheduler rate limits", [
                arg("min_delay", flag="--min-delay", kind="number"),
                arg("max_delay", flag="--max-delay", kind="number"),
                arg("max_queue_size", flag="--max-queue-size", kind="number"),
            ]),
            cmd("scheduler.enqueue.flow", ["scheduler", "enqueue", "flow"], "Enqueue a flow replay job", [
                arg("flow_id", required=True),
                arg("priority", flag="--priority", kind="number"),
                arg("force", flag="--force", kind="boolean"),
            ]),
            cmd("scheduler.enqueue.endpoint", ["scheduler", "enqueue", "endpoint"], "Enqueue an endpoint job", [
                arg("endpoint_id", required=True),
                arg("type", flag="--type", kind="select", options=["replay", "auth-test"]),
                arg("priority", flag="--priority", kind="number"),
                arg("force", flag="--force", kind="boolean"),
            ]),
            cmd("scheduler.clear", ["scheduler", "clear"], "Clear pending jobs", [
                arg("force", flag="--force", kind="boolean"),
            ]),
            cmd("scheduler.pause", ["scheduler", "pause"], "Pause the scheduler"),
            cmd("scheduler.resume", ["scheduler", "resume"], "Resume the scheduler"),
        ],
    },
    {
        "group": "mutation",
        "label": "Request Mutations",
        "commands": [
            cmd("mutation.add", ["mutation", "add"], "Add a header mutation", [
                arg("type", kind="select", options=["header"], required=True, default="header"),
                arg("key", required=True),
                arg("value", required=True),
            ]),
            cmd("mutation.list", ["mutation", "list"], "List mutations"),
            cmd("mutation.delete", ["mutation", "delete"], "Delete a mutation", [arg("mutation_id", required=True)]),
        ],
    },
    {
        "group": "attack.unauth",
        "label": "Attack — Unauth",
        "commands": [
            cmd("attack.unauth.run", ["attack", "unauth", "run"], "Run unauth attack recipes", [
                arg("max_priority", flag="--max-priority", kind="number"),
                arg("auth_mutation", flag="--auth-mutation"),
            ]),
            cmd("attack.unauth.filter.init", ["attack", "unauth", "filter", "init"], "Create decision filter template"),
            cmd("attack.unauth.filter.show", ["attack", "unauth", "filter", "show"], "Show decision filter"),
            cmd("attack.unauth.filter.validate", ["attack", "unauth", "filter", "validate"], "Validate decision filter"),
        ],
    },
    {
        "group": "attack.bac",
        "label": "Attack — BAC",
        "commands": [
            cmd(f"attack.bac.{tech}", ["attack", "bac", tech], f"Run BAC {tech.replace('-', ' ')}", [
                arg("role", flag="--role"),
                arg("auto_generate", flag="--auto-generate", kind="boolean"),
            ])
            for tech in [
                "session-swap", "method-fuzz", "content-type", "url-fuzz",
                "header-inject", "host-fuzz", "role-inject", "parser-confuse",
            ]
        ] + [
            cmd("attack.bac.filter.init", ["attack", "bac", "filter", "init"], "Create BAC decision filter template"),
            cmd("attack.bac.filter.show", ["attack", "bac", "filter", "show"], "Show BAC decision filter"),
            cmd("attack.bac.filter.validate", ["attack", "bac", "filter", "validate"], "Validate BAC decision filter"),
        ],
    },
    {
        "group": "input-validation",
        "label": "Input Validation Engine",
        "commands": [
            cmd("iv.config", ["input-validation", "config"], "View/set IV engine config", [
                arg("enable", flag="--enable", kind="boolean"),
                arg("disable", flag="--disable", kind="boolean"),
                arg("workers", flag="--workers", kind="number"),
                arg("analysis_off", flag="--analysis-off", kind="select", options=IV_PHASES),
                arg("analysis_on", flag="--analysis-on", kind="select", options=IV_PHASES),
            ]),
            cmd("iv.run", ["input-validation", "run"], "Schedule IV jobs", [
                arg("host", flag="--host"), arg("endpoint", flag="--endpoint"), arg("parameter", flag="--parameter"),
                arg("ignore_cache", flag="--ignore-cache", kind="boolean"),
            ]),
            cmd("iv.status", ["input-validation", "status"], "Show IV progress"),
            cmd("iv.resume", ["input-validation", "resume"], "Resume unfinished IV analyses", [
                arg("host", flag="--host"), arg("endpoint", flag="--endpoint"), arg("parameter", flag="--parameter"),
            ]),
            cmd("iv.clear_cache", ["input-validation", "clear-cache"], "Clear IV cache", [
                arg("host", flag="--host"), arg("endpoint", flag="--endpoint"), arg("parameter", flag="--parameter"),
            ]),
            cmd("iv.exclude.endpoint", ["input-validation", "exclude", "endpoint"], "Exclude endpoint from IV", [arg("endpoint_id", required=True)]),
            cmd("iv.exclude.host", ["input-validation", "exclude", "host"], "Exclude host from IV", [arg("host", required=True)]),
            cmd("iv.include.endpoint", ["input-validation", "include", "endpoint"], "Include endpoint in IV", [arg("endpoint_id", required=True)]),
            cmd("iv.include.host", ["input-validation", "include", "host"], "Include host in IV", [arg("host", required=True)]),
            cmd("iv.show", ["input-validation", "show"], "Show full parameter characterization", [arg("parameter_uuid", required=True)]),
            cmd("iv.export.parameter", ["input-validation", "export", "parameter"], "Export one parameter", [arg("parameter_uuid", required=True)]),
            cmd("iv.export.host", ["input-validation", "export", "host"], "Export host-level IV", [arg("host", required=True)]),
            cmd("iv.export.csv", ["input-validation", "export", "csv"], "Export all probe results as CSV"),
        ] + [
            cmd(f"iv.phase.{phase}", ["input-validation", phase], f"Run IV phase: {phase}", [
                arg("host", flag="--host"), arg("endpoint", flag="--endpoint"), arg("parameter", flag="--parameter"),
                arg("force", flag="--force", kind="boolean"),
            ])
            for phase in IV_PHASES
        ],
    },
    {
        "group": "finding",
        "label": "Findings",
        "commands": [
            cmd("finding.list", ["finding", "list"], "List findings", [
                arg("status", flag="--status", kind="select", options=["TRIAGING", "CONFIRMED", "REJECTED", "DUPLICATE"]),
            ]),
            cmd("finding.show", ["finding", "show"], "Show finding detail", [arg("uuid", required=True)]),
            cmd("finding.confirm", ["finding", "confirm"], "Confirm a finding", [arg("uuid", required=True)]),
            cmd("finding.reject", ["finding", "reject"], "Reject a finding", [arg("uuid", required=True)]),
            cmd("finding.reopen", ["finding", "reopen"], "Reopen a finding", [arg("uuid", required=True)]),
            cmd("finding.duplicate", ["finding", "duplicate"], "Mark as duplicate", [
                arg("uuid", required=True), arg("of", flag="--of", required=True),
            ]),
            cmd("finding.group.create", ["finding", "group", "create"], "Create a finding group", [arg("name", required=True)]),
            cmd("finding.group.add", ["finding", "group", "add"], "Add finding to group", [
                arg("group", required=True), arg("finding", required=True),
            ]),
            cmd("finding.group.remove_member", ["finding", "group", "remove"], "Remove finding from group", [
                arg("group", required=True), arg("finding", required=True),
            ]),
            cmd("finding.group.delete", ["finding", "group", "remove"], "Delete a group", [
                arg("group", required=True),
                arg("remove_findings", flag="--remove-findings", kind="boolean"),
            ]),
            cmd("finding.group.list", ["finding", "group", "list"], "List groups"),
            cmd("finding.report", ["finding", "report"], "Generate a report", [
                arg("uuid", help="Finding UUID (omit if using --group)"),
                arg("group", flag="--group"),
            ]),
        ],
    },
]


def find_command(cmd_id: str) -> dict | None:
    for group in COMMAND_TREE:
        for c in group["commands"]:
            if c["id"] == cmd_id:
                return c
    return None


def build_argv(command: dict, values: dict[str, Any]) -> list[str]:
    """Turn a command spec + submitted values into a safe argv list (no shell)."""
    argv = list(command["path"])
    positionals: list[str] = []
    flagged: list[str] = []

    for spec in command["args"]:
        val = values.get(spec["name"])
        if val is None or val == "" or val == []:
            continue
        flag = spec["flag"]
        if spec["kind"] == "boolean":
            if flag and (val is True or str(val).lower() == "true"):
                flagged.append(flag)
            continue
        if spec["kind"] == "multi":
            items = val if isinstance(val, list) else [val]
            for item in items:
                item = str(item)
                if not item:
                    continue
                if flag:
                    flagged.append(flag)
                    flagged.append(item)
                else:
                    positionals.append(item)
            continue
        # text / number / select
        value_str = str(val)
        if flag:
            flagged.append(flag)
            flagged.append(value_str)
        else:
            positionals.append(value_str)

    return argv + positionals + flagged
