import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { api, restartProxyIfRunning } from "../api/client";
import { useAction } from "../hooks/useAction";
import { NoProjectNotice } from "../components/Common";
import { Role, Module } from "../types";

export default function RolesModules() {
  const { selected } = useProject();
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [roleName, setRoleName] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [moduleDesc, setModuleDesc] = useState("");

  const loadRoles = () =>
    selected && api.get<{ roles: Role[] }>("/api/roles", { project_id: selected.id }).then((r) => setRoles(r.roles));
  const loadModules = () =>
    selected && api.get<{ modules: Module[] }>("/api/modules", { project_id: selected.id }).then((r) => setModules(r.modules));

  useEffect(() => {
    loadRoles();
    loadModules();
  }, [selected]);

  const createRole = useAction("Create role", () =>
    api.post("/api/roles", { name: roleName }, { project_id: selected!.id })
  );
  const setRole = useAction("Set active role", (name: string) =>
    api.post("/api/roles/set", { name }, { project_id: selected!.id })
  );
  const unsetRole = useAction("Unset active role", () =>
    api.post("/api/roles/unset", {}, { project_id: selected!.id })
  );
  const createModule = useAction("Create module", () =>
    api.post("/api/modules", { name: moduleName, description: moduleDesc }, { project_id: selected!.id })
  );
  const setModule = useAction("Set active module", (name: string) =>
    api.post("/api/modules/set", { name }, { project_id: selected!.id })
  );
  const unsetModule = useAction("Unset active module", () =>
    api.post("/api/modules/unset", {}, { project_id: selected!.id })
  );

  if (!selected) return <NoProjectNotice />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="panel p-4 border-t-2 border-t-primary">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <span className="badge badge-primary badge-sm">Roles</span>
          <span className="text-xs font-normal text-base-content/50">Identity types (who is testing)</span>
        </h2>
        <div className="flex gap-2 mb-3">
          <input
            className="input input-sm input-bordered flex-1"
            placeholder="admin"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={!roleName || createRole.running}
            onClick={async () => {
              await createRole.run();
              setRoleName("");
              await loadRoles();
              await restartProxyIfRunning();
            }}
          >
            Create
          </button>
        </div>
        <div className="divide-y divide-base-300 rounded border border-base-300">
          {roles.length === 0 && <div className="p-4 text-sm text-base-content/50">No roles yet.</div>}
          {roles.map((r) => (
            <div key={r.id} className={`flex items-center justify-between p-3 ${r.is_active ? "bg-success/10" : ""}`}>
              <div>
                <div className="font-medium text-sm">{r.name}</div>
                {!!r.is_active && <span className="badge badge-success badge-xs">active</span>}
              </div>
              <div className="flex gap-2">
                {!r.is_active ? (
                  <button
                    className="btn btn-xs"
                    onClick={async () => {
                      await setRole.run(r.name);
                      await loadRoles();
                      await restartProxyIfRunning();
                    }}
                  >
                    Set active
                  </button>
                ) : (
                  <button
                    className="btn btn-xs"
                    onClick={async () => {
                      await unsetRole.run();
                      await loadRoles();
                      await restartProxyIfRunning();
                    }}
                  >
                    Unset
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-4 border-t-2 border-t-secondary">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <span className="badge badge-secondary badge-sm">Modules</span>
          <span className="text-xs font-normal text-base-content/50">Feature areas (what is being tested)</span>
        </h2>
        <div className="flex gap-2 mb-3">
          <input
            className="input input-sm input-bordered flex-1"
            placeholder="orders"
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
          />
          <input
            className="input input-sm input-bordered flex-1"
            placeholder="Description"
            value={moduleDesc}
            onChange={(e) => setModuleDesc(e.target.value)}
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={!moduleName || createModule.running}
            onClick={async () => {
              await createModule.run();
              setModuleName("");
              setModuleDesc("");
              await loadModules();
              await restartProxyIfRunning();
            }}
          >
            Create
          </button>
        </div>
        <div className="divide-y divide-base-300 rounded border border-base-300">
          {modules.length === 0 && <div className="p-4 text-sm text-base-content/50">No modules yet.</div>}
          {modules.map((m) => (
            <div key={m.id} className={`flex items-center justify-between p-3 ${m.is_active ? "bg-success/10" : ""}`}>
              <div>
                <div className="font-medium text-sm">{m.name}</div>
                <div className="text-xs text-base-content/50">{m.description}</div>
                {!!m.is_active && <span className="badge badge-success badge-xs">active</span>}
              </div>
              <div className="flex gap-2">
                {!m.is_active ? (
                  <button
                    className="btn btn-xs"
                    onClick={async () => {
                      await setModule.run(m.name);
                      await loadModules();
                      await restartProxyIfRunning();
                    }}
                  >
                    Set active
                  </button>
                ) : (
                  <button
                    className="btn btn-xs"
                    onClick={async () => {
                      await unsetModule.run();
                      await loadModules();
                      await restartProxyIfRunning();
                    }}
                  >
                    Unset
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
