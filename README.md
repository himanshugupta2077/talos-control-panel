# Talos Control Panel — v1

A standalone local web app that gives Talos operators a graphical control
panel: browse project data, resolve UUIDs by clicking instead of copy-paste,
and run any Talos CLI command from a form instead of a terminal.

Per the project's core rule, **this app never touches Talos's business logic
directly.** Reads go straight to SQLite (read-only connections). Every write
or state change is executed as a real `talos ...` subprocess call — the CLI
remains the single source of truth.

```
talos-control-panel/
├── backend/            FastAPI app (reads SQLite, shells out to the talos CLI)
│   └── talos_ui/
│       ├── main.py         FastAPI app + router wiring
│       ├── config.py       env-driven paths (TALOS_HOME, TALOS_BIN, ports)
│       ├── db.py           read-only SQLite helpers
│       ├── cli.py          subprocess execution layer (the only place that mutates Talos)
│       ├── command_tree.py declarative model of the full CLI surface (powers Console)
│       └── routers/        one router per domain (projects, proxy, roles, ...)
└── frontend/           React + TypeScript + Vite + Tailwind + DaisyUI
    └── src/
        ├── pages/           one page per nav item
        ├── components/      Layout, DataTable, StatusBadge, CommandDrawer, ...
        ├── state/           ProjectContext (active project), CommandLogContext
        ├── api/client.ts    tiny fetch wrapper
        └── hooks/useAction.ts   runs an action, logs its CLI steps to the drawer
```

## Running it

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Point it at your real Talos install if it's not the default ~/.talos,
# and make sure the `talos` executable is on PATH (or set TALOS_BIN to its
# full path). See .env.example.
export TALOS_HOME=~/.talos
export TALOS_BIN=talos

uvicorn talos_ui.main:app --reload --port 8420
```

**Frontend** (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Open the printed Vite URL (default `http://localhost:5173`). The frontend
talks to the backend at `http://127.0.0.1:8420` by default — override with
`VITE_API_BASE` if needed (see `.env.example`).

Both `npm run build` (frontend) and importing `talos_ui.main:app` (backend)
have been verified to complete cleanly with no type or import errors.

## What this pass finished

The previous session had built out all 16 domain pages, all 16 backend
routers, the CLI execution layer, and a full declarative command-tree model
of the CLI — but a few pieces referenced by that work were never written:

- **`Console.tsx`** — the page itself. `Layout.tsx` already linked to
  `/console` and `types.ts` already had the `CommandSpec`/`CommandGroup`
  types for it, but the page didn't exist yet. It's a full-coverage fallback:
  pick any of the 17 command groups from `command_tree.py`, fill in a
  generated form, see the exact `talos ...` argv before running it, plus a
  raw-argv escape hatch for anything not yet modeled.
- **`index.css`** — `main.tsx` imported it, but it didn't exist. Added the
  Tailwind directives plus the small utility classes (`.panel`, `.mono`,
  `.table-tight`, `.uuid-chip`) that every page and component already
  assumed were defined.
- **Backend `__init__.py`** files for the `talos_ui` package and its
  `routers` subpackage.
- **All frontend build tooling** — `package.json`, `vite.config.ts`,
  `tsconfig.json` / `tsconfig.node.json`, `postcss.config.js`,
  `vite-env.d.ts`. None of these existed yet, so the app couldn't actually
  be installed or built.
- **A real bug fix**: `Mutations.tsx` passed an async-returning function
  directly as a `useEffect` callback (`useEffect(load, [selected])` where
  `load` can return a `Promise`), which fails type-checking and is a latent
  React footgun. Fixed to `useEffect(() => { load(); }, [selected])`,
  matching the safe pattern already used elsewhere in the codebase.
- `.env.example` / `.gitignore` for both halves, and this README.

Everything above was verified, not just written: `tsc -b` and `vite build`
both run clean; the FastAPI app was booted against a stub `talos` binary and
every one of its 27 read endpoints, plus `/api/console/run` (both a normal
command and a `background: true` one like `proxy start`), `/api/console/raw`,
and a project-scoped write (which correctly runs `talos project open <id>`
before the real command), returned correct 200 responses.

## Notes for going further

- The CORS origins in `config.py` are hardcoded to the Vite dev ports
  (5173/4173). Add your production origin there if you ever serve the built
  frontend from somewhere else.
- `command_tree.py` covers the CLI surface the previous session mapped out;
  if your Talos build has commands beyond what's modeled there, the
  Console's **Raw** tab runs any argv list without needing a tree entry.
- No auth, no multi-user support, everything bound to `127.0.0.1` — this is
  intentional per the project brief (single local operator).

## QoL / bugfix pass (2026-07-05)

A batch of usability fixes and small features, driven by real operator
feedback. One real Talos-core bug was fixed alongside the control panel
work; everything else is control-panel-only.

**Talos core**
- `talos/projects/access_cli.py`: `talos access -h`/`--help` (top-level and
  `client`/`server` sub-level) now prints usage and exits 0 instead of
  erroring with "Unknown access subcommand: '-h'". The `state` argument to
  `access client/server set` is now accepted case-insensitively (`UNKNOWN`,
  `Allow`, etc. all work) — argparse's `choices` previously required exact
  lowercase, which is what the control panel (and any script) naturally
  sends when mirroring a human-readable label.

**Root cause found + fixed: "active project" was never detected**
- `backend/talos_ui/db.py::get_active_project_id` and
  `routers/projects.py::_augment` checked for `record["active"]` /
  `record["is_active"]` booleans that don't exist — Talos's real registry
  format is `record["status"] == "active"` (see
  `talos.projects.model.ProjectStatus`). This silently broke every
  "is this project active" signal in the UI (Projects page Active column,
  the Open/Close button, the Proxy page warning). Fixed to check `status`
  first, with the old boolean shapes kept as a fallback for safety.

**Global layout**
- Removed the big project dropdown + Activate button from the header. The
  header now shows a compact project pill (name + a dot for
  active/inactive, click → Projects page), a **Proxy on/off** pill (click →
  Proxy page), and — when set — the active role/module as small badges
  (click → Roles & Modules). Selecting which project's data you're viewing
  now happens only on the Projects page (click a row, or Open).
- The console/command-log drawer moved from a bottom-docked panel to a
  right-docked, collapsible sidebar (`CommandDrawer.tsx`) — collapsed state
  shows just a small `$_` icon tab on the right edge.
- Every action run through `useAction` now also raises a small auto-dismiss
  toast (bottom-right, `ToastStack.tsx`) showing success/failure — a
  lightweight, universal confirmation for every add/remove/update action,
  without touching every page individually (wired once into
  `CommandLogContext`).
- New `/api/proxy/restart-if-running` endpoint + `restartProxyIfRunning()`
  client helper: restarts the proxy (reusing its last host/port) only if it
  was already running. Wired in after: project create/open, role/module
  create or activate, mutation add/enable/disable/edit/delete, and auth
  artifact add/clear — so the addon always reflects current project state
  without the operator needing to remember to restart it manually.

**Projects page**
- Active project row is now highlighted, and the **Open** button correctly
  hides for it (was blocked entirely by the `status` bug above).
- Creating a project now opens (activates) it and restarts the proxy
  automatically.

**Proxy page**
- The "no active project" warning now only shows when the viewed project
  really isn't active (again, unblocked by the `status` fix).
- Added a **Copy log** button next to the live log panel.

**Roles & Modules**
- Roles and Modules now render as two visually distinct panels (colored top
  border + badge label) instead of one plain two-column grid, and both
  auto-restart the proxy on create/activate/deactivate.

**Auth page — rebuilt as a step wizard**
- Step 1: pick a role. Step 2: set provider (auto/manual). Steps then branch:
  - **auto**: add a login flow → **set extractor** (paste Python, previously
    completely missing from the UI — the backend endpoint already existed)
    → save runs validate → test → refresh automatically → manual
    validate/test/refresh buttons below.
  - **manual**: matches Talos's new persistent-file `set-session` flow
    (`talos auth-config set-session <role> path` only prints/creates a file
    path now — no more spawning notepad/sublime). The page fetches that
    file's content into a textarea, lets you edit it directly in the
    browser (functionally identical to editing it externally — same file),
    and Save writes the file + applies + validates/refreshes in one click.
  - Adding/clearing project-wide auth artifacts now restarts the proxy.

**Flows / Endpoints**
- `DataTable` gained optional per-column **sort** (click header), **column
  show/hide** (⚙ picker), and **drag-to-reorder**, persisted per table in
  localStorage (`storageKey` prop). Wired into Endpoints, Flows, Scheduler,
  and Findings.
- Flows: added free-text search (host/path/query) and a row action menu
  (Replay now / Enqueue replay / Export / **Set as login or control
  ("validation") flow for a role**, via a small role-picker modal reusing
  the existing auth-config endpoints).
- Endpoints: added structured filters (method, role, module, priority,
  qualified, excluded, dangerous, logout) backed by a new
  `/api/endpoints/filters` + extended `/api/endpoints` query params.

**Flow detail — Burp-style request/response viewer**
- New `HttpView.tsx` replaces the old labeled Headers/Cookies/Body blocks
  with a **Raw** mode (byte-for-byte, word-wrap toggle) and a **Pretty** mode
  (headers with inline JWT decoding when a value looks like one, cookies
  broken out per pair, JSON bodies indented) — no more giant unwrapped JWTs
  blowing out the layout.
- Finding evidence rows for `original_flow`/`replay_flow`/`diff` now link
  through to that flow's detail page (using the above viewer) instead of
  just showing a bare UUID chip.

**Findings**
- Finding list/detail now show **Role** and **Module** columns (a single
  correlated-subquery join against `finding_evidence`, not N+1).
- Added filter dropdowns (status/type/verdict/role/module) and a **group
  report** viewer button (surfaces the CLI's new "## Index" table for
  multi-finding group reports).

**Mutations**
- Added **Enable/Disable/Edit** to match the new
  `talos mutation enable|disable|edit` commands (previously only
  add/list/delete were exposed).

**Scheduler — overhaul**
- Single **▶/⏸** play-pause button instead of two buttons.
- **⚙ Settings** (rate-limit config) and **+ Manual** (enqueue by flow or
  endpoint) moved into modals next to the heading.
- Clicking a row opens the linked flow (or endpoint, if it's an
  endpoint-only job) in a new tab.
- Added **Role**, **Module**, and **Reason** (failure_reason) columns, and
  fixed **Endpoint** not showing for flow-only jobs (job rows only get an
  `endpoint_id` once finished — the query now falls back to the linked
  flow's endpoint via a JOIN so it's visible immediately). Role/Module are
  resolved from the job's `meta` JSON (BAC attacker role/module) falling
  back to the linked flow's role/module.
- Added job type/status/role/module filter dropdowns.
- All timestamps across Scheduler, Flows, Findings, FlowDetail, and
  FindingDetail now render in IST (`lib/time.ts::formatIST`), regardless of
  the operator's OS timezone.

**Attack / Input Validation**
- Attack page: added verdict (both tabs) and module (BAC tab) filter
  dropdowns on the results tables.
- Input Validation: new `ParameterPicker.tsx` — a searchable dropdown (backed
  by `/api/endpoints/parameters/search`) replaces raw-UUID text inputs for
  both **Scope → parameter** and **Parameter characterization**, plus
  analysis/status filters on the probe results table.

All frontend changes verified with a clean `tsc --noEmit`; all backend
changes verified by importing `talos_ui.main:app` (no import/route errors)
and, for the `access_cli.py` fix, an end-to-end smoke test against a real
disposable project (`-h` exits 0; `UNKNOWN`/`DENY` uppercase values are
accepted and stored correctly). The existing 50 pytest tests still pass
unmodified.

