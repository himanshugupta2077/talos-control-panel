import { useState } from "react";
import { useProject } from "../state/ProjectContext";
import { useAction } from "../hooks/useAction";
import { api, restartProxyIfRunning } from "../api/client";
import { ConfirmButton, Modal } from "../components/Common";
import DataTable, { Column } from "../components/DataTable";
import { Project } from "../types";

export default function Projects() {
  const { projects, refresh, selectedId, setSelectedId } = useProject();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("");

  const create = useAction("Create project", () =>
    api
      .post("/api/projects", {
        name,
        description,
        scope: scope.split(/\s+/).filter(Boolean),
      })
      .then((r) => ({ steps: [r] }))
  );
  const openProject = useAction("Open project", (id: string) =>
    api.post(`/api/projects/${id}/open`).then((r) => ({ steps: [r] }))
  );
  const closeProject = useAction("Close project", () =>
    api.post(`/api/projects/close`).then((r) => ({ steps: [r] }))
  );
  const deleteProject = useAction("Delete project", (id: string) =>
    api.del(`/api/projects/${id}`, { force: true }).then((r) => ({ steps: [r] }))
  );

  const columns: Column<Project>[] = [
    { key: "name", header: "Name", render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "description", header: "Description" },
    {
      key: "scope",
      header: "Scope",
      render: (p) => (
        <div className="flex gap-1 flex-wrap">
          {p.scope.map((s) => (
            <span key={s} className="badge badge-outline badge-xs mono">
              {s}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "active",
      header: "Active",
      render: (p) =>
        p.active ? (
          <span className="badge badge-success badge-sm gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-content" />
            active
          </span>
        ) : (
          <span className="text-base-content/30">—</span>
        ),
    },
    { key: "db_exists", header: "DB", render: (p) => (p.db_exists ? "✓" : "—") },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <div className="flex gap-2 justify-end">
          {!p.active && (
            <button
              className="btn btn-xs btn-primary"
              onClick={async (e) => {
                e.stopPropagation();
                await openProject.run(p.id);
                setSelectedId(p.id);
                await restartProxyIfRunning();
                await refresh();
              }}
            >
              Open
            </button>
          )}
          {p.active && (
            <button
              className="btn btn-xs"
              onClick={async (e) => {
                e.stopPropagation();
                await closeProject.run();
                await refresh();
              }}
            >
              Close
            </button>
          )}
          <ConfirmButton
            className="btn btn-xs btn-error"
            onConfirm={async () => {
              await deleteProject.run(p.id);
              await refresh();
            }}
          >
            Delete
          </ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Projects</h1>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
          New project
        </button>
      </div>

      <p className="text-xs text-base-content/50 mb-2">
        Click a row to view its data in the rest of the control panel. "Open" activates it in Talos
        (the CLI's single active project) and restarts the proxy if it's running.
      </p>
      <DataTable
        columns={columns}
        rows={projects}
        rowKey={(p) => p.id}
        onRowClick={(p) => setSelectedId(p.id)}
        rowClassName={(p) => (p.active ? "bg-success/10" : selectedId === p.id ? "bg-base-300/40" : "")}
        emptyLabel="No projects yet."
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create project">
        <div className="flex flex-col gap-3">
          <label className="form-control">
            <span className="label-text text-xs">Name</span>
            <input
              className="input input-sm input-bordered"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="qa-smoke"
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">Description</span>
            <input
              className="input input-sm input-bordered"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="QA smoke run"
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">Scope patterns (space-separated)</span>
            <input
              className="input input-sm input-bordered mono"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="*.example.com api.example.com"
            />
          </label>
          <button
            className="btn btn-primary btn-sm mt-2"
            disabled={!name || create.running}
            onClick={async () => {
              await create.run();
              setShowCreate(false);
              const createdName = name;
              setName("");
              setDescription("");
              setScope("");
              // New projects are activated automatically and the proxy is
              // restarted so capture starts against the new project right away.
              const list = await api.get<{ projects: Project[] }>("/api/projects");
              const created = list.projects.find((p) => p.name === createdName);
              if (created) {
                await openProject.run(created.id);
                setSelectedId(created.id);
                await restartProxyIfRunning();
              }
              await refresh();
            }}
          >
            {create.running ? <span className="loading loading-spinner loading-xs" /> : "Create"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
