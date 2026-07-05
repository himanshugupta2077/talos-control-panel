import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useProject } from "../state/ProjectContext";
import { api } from "../api/client";
import { useAction } from "../hooks/useAction";
import { UuidChip, Section } from "../components/Common";
import StatusBadge from "../components/StatusBadge";
import { Parameter } from "../types";

interface EndpointDetailResponse {
  endpoint: any;
  policy: any;
  annotations: { tag: string; created_at: string }[];
  parameters: Parameter[];
  roles: { id: string; name: string; first_seen: string; last_seen: string }[];
  flows: any[];
}

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"];

export default function EndpointDetail() {
  const { endpointId } = useParams();
  const { selected } = useProject();
  const [data, setData] = useState<EndpointDetailResponse | null>(null);
  const [adjacent, setAdjacent] = useState<{ prev_id: string | null; next_id: string | null }>({ prev_id: null, next_id: null });
  const navigate = useNavigate();

  const load = () => {
    if (!selected || !endpointId) return;
    api.get<EndpointDetailResponse>(`/api/endpoints/${endpointId}`, { project_id: selected.id }).then(setData);
    api.get(`/api/endpoints/${endpointId}/adjacent`, { project_id: selected.id }).then(setAdjacent as any);
  };

  useEffect(load, [selected, endpointId]);

  const mark = useAction("Mark endpoint", (tag: string) =>
    api.post(`/api/endpoints/${endpointId}/mark`, { tag }, { project_id: selected!.id })
  );
  const unmark = useAction("Unmark endpoint", (tag: string) =>
    api.post(`/api/endpoints/${endpointId}/unmark`, { tag }, { project_id: selected!.id })
  );
  const setPriority = useAction("Set priority", (priority: string) =>
    api.post(`/api/endpoints/${endpointId}/priority`, { priority }, { project_id: selected!.id })
  );
  const exclude = useAction("Exclude endpoint", () =>
    api.post(`/api/endpoints/${endpointId}/exclude`, {}, { project_id: selected!.id })
  );
  const include = useAction("Include endpoint", () =>
    api.post(`/api/endpoints/${endpointId}/include`, {}, { project_id: selected!.id })
  );
  const replayNow = useAction("Replay endpoint now", () =>
    api.post(`/api/replay/endpoint/${endpointId}`, { right_now: true }, { project_id: selected!.id })
  );
  const enqueueReplay = useAction("Enqueue endpoint replay", () =>
    api.post("/api/scheduler/enqueue/endpoint", { endpoint_id: endpointId }, { project_id: selected!.id })
  );
  const authTest = useAction("Enqueue auth test", () =>
    api.post("/api/scheduler/enqueue/endpoint", { endpoint_id: endpointId, type: "auth-test" }, { project_id: selected!.id })
  );

  if (!data) return <div className="loading loading-spinner" />;
  const { endpoint, policy, annotations, parameters, roles, flows } = data;
  const tags = annotations.map((a) => a.tag);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button className="btn btn-xs" disabled={!adjacent.prev_id} onClick={() => navigate(`/endpoints/${adjacent.prev_id}`)}>← prev</button>
          <button className="btn btn-xs" disabled={!adjacent.next_id} onClick={() => navigate(`/endpoints/${adjacent.next_id}`)}>next →</button>
        </div>
        <Link to="/endpoints" className="link link-sm">back to list</Link>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="badge badge-outline mono">{endpoint.method}</span>
          <span className="font-mono text-lg">{endpoint.normalized_path}</span>
        </div>
        <div className="text-sm text-base-content/60 mono">{endpoint.host}</div>
        <div className="flex gap-2 mt-2">
          {tags.map((t) => <span key={t} className="badge badge-warning badge-sm">{t}</span>)}
          {policy?.excluded ? <span className="badge badge-ghost badge-sm">excluded</span> : null}
          <StatusBadge value={policy?.manual_priority || policy?.auto_priority} />
          {policy?.qualified ? <span className="badge badge-success badge-sm">qualified</span> : <span className="badge badge-ghost badge-sm">{policy?.qualification_reason}</span>}
        </div>
      </div>

      <Section title="Actions">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-xs" onClick={async () => { await replayNow.run(); load(); }}>Replay now</button>
          <button className="btn btn-xs" onClick={async () => { await enqueueReplay.run(); load(); }}>Enqueue replay</button>
          <button className="btn btn-xs" onClick={async () => { await authTest.run(); load(); }}>Enqueue auth test</button>
          <div className="divider divider-horizontal m-0" />
          {!tags.includes("logout") ? (
            <button className="btn btn-xs" onClick={async () => { await mark.run("--logout"); load(); }}>Mark logout</button>
          ) : (
            <button className="btn btn-xs" onClick={async () => { await unmark.run("--logout"); load(); }}>Unmark logout</button>
          )}
          {!tags.includes("dangerous") ? (
            <button className="btn btn-xs" onClick={async () => { await mark.run("--dangerous"); load(); }}>Mark dangerous</button>
          ) : (
            <button className="btn btn-xs" onClick={async () => { await unmark.run("--dangerous"); load(); }}>Unmark dangerous</button>
          )}
          <button className="btn btn-xs" onClick={async () => { await mark.run("--safe"); load(); }}>Clear annotations</button>
          <div className="divider divider-horizontal m-0" />
          {!policy?.excluded ? (
            <button className="btn btn-xs btn-ghost" onClick={async () => { await exclude.run(); load(); }}>Exclude from testing</button>
          ) : (
            <button className="btn btn-xs btn-ghost" onClick={async () => { await include.run(); load(); }}>Include in testing</button>
          )}
          <select
            className="select select-xs select-bordered"
            value=""
            onChange={async (e) => { if (e.target.value) { await setPriority.run(e.target.value); load(); e.target.value = ""; } }}
          >
            <option value="">Set priority…</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </Section>

      <Section title={`Parameters (${parameters.length})`}>
        <div className="overflow-x-auto panel">
          <table className="table table-tight table-xs">
            <thead>
              <tr>
                <th>Name</th><th>Location</th><th>Type</th><th>Semantic</th><th>Seen</th><th>Reflected</th><th>Examples</th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.name}</td>
                  <td><span className="badge badge-ghost badge-xs">{p.location}</span></td>
                  <td>{p.param_type}</td>
                  <td>{p.semantic_type}</td>
                  <td>{p.seen_count}</td>
                  <td>{p.is_reflected ? <span className="badge badge-warning badge-xs">yes ({p.reflection_count})</span> : "—"}</td>
                  <td className="mono max-w-xs truncate">{p.example_values.join(", ")}</td>
                </tr>
              ))}
              {parameters.length === 0 && (
                <tr><td colSpan={7} className="text-center text-base-content/40 py-4">No parameters observed.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Roles observed (${roles.length})`}>
        <div className="flex gap-2 flex-wrap">
          {roles.map((r) => <span key={r.id} className="badge badge-outline">{r.name}</span>)}
          {roles.length === 0 && <span className="text-sm text-base-content/40">None yet.</span>}
        </div>
      </Section>

      <Section title="Recent flows">
        <div className="overflow-x-auto panel">
          <table className="table table-tight table-xs">
            <thead><tr><th>Time</th><th>Method</th><th>Status</th><th>Role</th><th>Module</th><th>Source</th><th>Flow</th></tr></thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.id} className="hover cursor-pointer" onClick={() => navigate(`/flows/${f.id}`)}>
                  <td className="text-xs">{f.captured_at}</td>
                  <td className="mono">{f.method}</td>
                  <td><StatusBadge value={f.status_code} /></td>
                  <td>{f.role_name}</td>
                  <td>{f.module_name}</td>
                  <td>{f.source}</td>
                  <td><UuidChip value={f.id} /></td>
                </tr>
              ))}
              {flows.length === 0 && (
                <tr><td colSpan={7} className="text-center text-base-content/40 py-4">No flows yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
