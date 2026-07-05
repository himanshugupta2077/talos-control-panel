import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { api, restartProxyIfRunning } from "../api/client";
import { useAction } from "../hooks/useAction";
import { NoProjectNotice, ConfirmButton } from "../components/Common";

interface Mutation {
  id: string; type: string; key: string; value: string; enabled: number;
}

export default function Mutations() {
  const { selected } = useProject();
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<Mutation | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");

  const load = () =>
    selected && api.get<{ mutations: Mutation[] }>("/api/mutations", { project_id: selected.id }).then((r) => setMutations(r.mutations));

  useEffect(() => {
    load();
  }, [selected]);

  const add = useAction("Add mutation", () =>
    api.post("/api/mutations", { key, value, type: "header" }, { project_id: selected!.id })
  );
  const remove = useAction("Delete mutation", (id: string) =>
    api.del(`/api/mutations/${id}`, { project_id: selected!.id }).then((r) => ({ steps: [r] }))
  );
  const enable = useAction("Enable mutation", (id: string) =>
    api.post(`/api/mutations/${id}/enable`, {}, { project_id: selected!.id })
  );
  const disable = useAction("Disable mutation", (id: string) =>
    api.post(`/api/mutations/${id}/disable`, {}, { project_id: selected!.id })
  );
  const edit = useAction("Edit mutation", (id: string, k: string, v: string) =>
    api.post(`/api/mutations/${id}/edit`, { key: k || null, value: v || null }, { project_id: selected!.id })
  );

  if (!selected) return <NoProjectNotice />;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Request Mutations</h1>
      <p className="text-sm text-base-content/60 mb-4">
        Static header injections applied to every outgoing request before it leaves the proxy.
      </p>

      <div className="flex gap-2 mb-4 items-end">
        <label className="form-control">
          <span className="label-text text-xs">Header name</span>
          <input className="input input-sm input-bordered mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="X-HackerOne-Research" />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Value</span>
          <input className="input input-sm input-bordered mono" value={value} onChange={(e) => setValue(e.target.value)} placeholder="himanshu_2077" />
        </label>
        <button
          className="btn btn-sm btn-primary"
          disabled={!key || !value || add.running}
          onClick={async () => {
            await add.run();
            setKey(""); setValue("");
            await load();
            await restartProxyIfRunning();
          }}
        >
          Add
        </button>
      </div>

      <div className="panel divide-y divide-base-300">
        {mutations.length === 0 && <div className="p-4 text-sm text-base-content/50">No mutations configured.</div>}
        {mutations.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3">
            {editing?.id === m.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input className="input input-xs input-bordered mono flex-1" value={editKey} onChange={(e) => setEditKey(e.target.value)} />
                <span>=</span>
                <input className="input input-xs input-bordered mono flex-1" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                <button
                  className="btn btn-xs btn-primary"
                  onClick={async () => {
                    await edit.run(m.id, editKey, editValue);
                    setEditing(null);
                    await load();
                    await restartProxyIfRunning();
                  }}
                >
                  Save
                </button>
                <button className="btn btn-xs btn-ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={`mono text-sm ${!m.enabled ? "opacity-50" : ""}`}>
                {m.type}: <span className="font-medium">{m.key}</span> = {m.value}
              </div>
            )}
            {editing?.id !== m.id && (
              <div className="flex items-center gap-2">
                <span className={`badge badge-xs ${m.enabled ? "badge-success" : "badge-ghost"}`}>
                  {m.enabled ? "enabled" : "disabled"}
                </span>
                <button
                  className="btn btn-xs"
                  onClick={async () => {
                    if (m.enabled) await disable.run(m.id);
                    else await enable.run(m.id);
                    await load();
                    await restartProxyIfRunning();
                  }}
                >
                  {m.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  className="btn btn-xs"
                  onClick={() => {
                    setEditing(m);
                    setEditKey(m.key);
                    setEditValue(m.value);
                  }}
                >
                  Edit
                </button>
                <ConfirmButton
                  className="btn btn-xs btn-error"
                  onConfirm={async () => {
                    await remove.run(m.id);
                    await load();
                    await restartProxyIfRunning();
                  }}
                >
                  Delete
                </ConfirmButton>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
