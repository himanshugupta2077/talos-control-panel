import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { api } from "../api/client";
import { useAction } from "../hooks/useAction";
import { NoProjectNotice, Section } from "../components/Common";
import ParameterPicker from "../components/ParameterPicker";

const PHASES = ["baseline", "identifier", "characters", "length", "types", "transformations", "reflection", "validation"];

interface IvConfig {
  enabled: number; workers: number;
  analyses_baseline: number; analyses_identifier: number; analyses_characters: number;
  analyses_length: number; analyses_types: number; analyses_transformations: number;
  analyses_reflection: number; analyses_validation: number;
  excluded_hosts: string[]; excluded_endpoints: string[];
}

export default function InputValidation() {
  const { selected } = useProject();
  const [config, setConfig] = useState<IvConfig | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [scopeType, setScopeType] = useState<"none" | "host" | "endpoint" | "parameter">("none");
  const [scopeValue, setScopeValue] = useState("");
  const [workers, setWorkers] = useState("2");
  const [parameterUuid, setParameterUuid] = useState("");
  const [probes, setProbes] = useState<any[]>([]);
  const [probeAnalysis, setProbeAnalysis] = useState("");
  const [probeStatus, setProbeStatus] = useState("");

  const load = () => {
    if (!selected) return;
    api.get<{ config: IvConfig }>("/api/input-validation/config", { project_id: selected.id }).then((r) => {
      setConfig(r.config);
      if (r.config) setWorkers(String(r.config.workers));
    });
    api.get("/api/input-validation/status", { project_id: selected.id }).then(setStatus);
  };
  useEffect(load, [selected]);

  const scopeBody = () => ({
    host: scopeType === "host" ? scopeValue : undefined,
    endpoint: scopeType === "endpoint" ? scopeValue : undefined,
    parameter: scopeType === "parameter" ? scopeValue : undefined,
  });

  const enable = useAction("Enable IV engine", () => api.post("/api/input-validation/config", { enable: true }, { project_id: selected!.id }));
  const disable = useAction("Disable IV engine", () => api.post("/api/input-validation/config", { disable: true }, { project_id: selected!.id }));
  const setWorkersAction = useAction("Set IV workers", () => api.post("/api/input-validation/config", { workers: Number(workers) }, { project_id: selected!.id }));
  const run = useAction("Run IV", () => api.post("/api/input-validation/run", { ...scopeBody(), ignore_cache: false }, { project_id: selected!.id }));
  const resume = useAction("Resume IV", () => api.post("/api/input-validation/resume", scopeBody(), { project_id: selected!.id }));
  const clearCache = useAction("Clear IV cache", () => api.post("/api/input-validation/clear-cache", scopeBody(), { project_id: selected!.id }));
  const runPhase = useAction("Run IV phase", (phase: string) => api.post(`/api/input-validation/phase/${phase}`, { ...scopeBody(), force: false }, { project_id: selected!.id }));
  const showParam = useAction("Show parameter (CLI)", () => api.post(`/api/input-validation/show/${parameterUuid}/cli`, {}, { project_id: selected!.id }));
  const exportCsv = useAction("Export IV CSV", () => api.post("/api/input-validation/export/csv", {}, { project_id: selected!.id }));

  const loadProbes = () => {
    if (!selected || !parameterUuid) return;
    api.get<{ probes: any[] }>(`/api/input-validation/show/${parameterUuid}`, { project_id: selected.id }).then((r) => setProbes(r.probes));
  };

  if (!selected) return <NoProjectNotice />;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Input Validation Engine</h1>

      <Section title="Engine status">
        <div className="flex items-center gap-3 mb-3">
          <span className={`badge ${config?.enabled ? "badge-success" : "badge-ghost"}`}>
            {config?.enabled ? "enabled" : "disabled"}
          </span>
          {!config?.enabled ? (
            <button className="btn btn-xs btn-primary" onClick={async () => { await enable.run(); load(); }}>Enable</button>
          ) : (
            <button className="btn btn-xs" onClick={async () => { await disable.run(); load(); }}>Disable</button>
          )}
          <input className="input input-xs input-bordered w-20" value={workers} onChange={(e) => setWorkers(e.target.value)} />
          <button className="btn btn-xs" onClick={async () => { await setWorkersAction.run(); load(); }}>Set workers</button>
        </div>
        {status && (
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="panel p-2">
              <div className="font-medium mb-1">Param cache</div>
              {Object.entries(status.param_cache || {}).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
            </div>
            <div className="panel p-2">
              <div className="font-medium mb-1">Reflection cache</div>
              {Object.entries(status.reflection_cache || {}).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
            </div>
            <div className="panel p-2">
              <div className="font-medium mb-1">Probe results</div>
              {Object.entries(status.probe_results || {}).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
            </div>
          </div>
        )}
      </Section>

      <Section title="Scope">
        <div className="flex gap-2 items-end flex-wrap">
          <select className="select select-xs select-bordered" value={scopeType} onChange={(e) => setScopeType(e.target.value as any)}>
            <option value="none">whole project</option>
            <option value="host">host</option>
            <option value="endpoint">endpoint</option>
            <option value="parameter">parameter</option>
          </select>
          {scopeType !== "none" && scopeType !== "parameter" && (
            <input className="input input-xs input-bordered mono w-64" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder={scopeType} />
          )}
          {scopeType === "parameter" && (
            <ParameterPicker projectId={selected.id} value={scopeValue} onChange={setScopeValue} />
          )}
        </div>
      </Section>

      <Section title="Run">
        <div className="flex flex-wrap gap-2 mb-3">
          <button className="btn btn-xs btn-primary" disabled={run.running} onClick={async () => { await run.run(); load(); }}>Run (schedule jobs)</button>
          <button className="btn btn-xs" onClick={async () => { await resume.run(); load(); }}>Resume</button>
          <button className="btn btn-xs btn-ghost" onClick={async () => { await clearCache.run(); load(); }}>Clear cache</button>
          <button className="btn btn-xs" onClick={() => exportCsv.run()}>Export CSV</button>
        </div>
        <div className="text-xs uppercase text-base-content/50 mb-2">Run individual phase</div>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <button key={p} className="btn btn-xs" onClick={async () => { await runPhase.run(p); load(); }}>{p}</button>
          ))}
        </div>
      </Section>

      <Section title="Parameter characterization">
        <div className="flex gap-2 mb-3 items-center">
          <ParameterPicker projectId={selected.id} value={parameterUuid} onChange={setParameterUuid} placeholder="Search parameter to characterize…" />
          <button className="btn btn-sm" onClick={loadProbes}>Load probes</button>
          <button className="btn btn-sm" onClick={() => showParam.run()}>Full CLI dossier</button>
        </div>
        <div className="flex gap-2 mb-3">
          <select className="select select-xs select-bordered" value={probeAnalysis} onChange={(e) => setProbeAnalysis(e.target.value)}>
            <option value="">analysis: any</option>
            {[...new Set(probes.map((p) => p.analysis))].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="select select-xs select-bordered" value={probeStatus} onChange={(e) => setProbeStatus(e.target.value)}>
            <option value="">status: any</option>
            {[...new Set(probes.map((p) => p.status))].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto panel">
          <table className="table table-tight table-xs">
            <thead><tr><th>Analysis</th><th>Payload type</th><th>Payload</th><th>Status</th><th>Flow</th></tr></thead>
            <tbody>
              {probes
                .filter((p) => (!probeAnalysis || p.analysis === probeAnalysis) && (!probeStatus || p.status === probeStatus))
                .map((p) => (
                <tr key={p.id}>
                  <td>{p.analysis}</td>
                  <td>{p.payload_type}</td>
                  <td className="mono max-w-xs truncate">{p.payload}</td>
                  <td>{p.status}</td>
                  <td className="mono text-xs">{p.flow_id?.slice(0, 8)}</td>
                </tr>
              ))}
              {probes.length === 0 && <tr><td colSpan={5} className="text-center text-base-content/40 py-4">No probes loaded.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
