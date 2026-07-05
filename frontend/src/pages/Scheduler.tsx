import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { api } from "../api/client";
import { useAction } from "../hooks/useAction";
import { NoProjectNotice, ConfirmButton, UuidChip, Modal } from "../components/Common";
import DataTable, { Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { formatIST } from "../lib/time";
import { SchedulerJob } from "../types";

interface Status {
  counts: Record<string, number>;
  config: { min_delay: number; max_delay: number; max_queue_size: number } | null;
  state: { state: string; reason: string | null } | null;
}

interface Filters {
  job_types: string[]; statuses: string[]; roles: string[]; modules: string[];
}

export default function Scheduler() {
  const { selected } = useProject();
  const [status, setStatus] = useState<Status | null>(null);
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [filters, setFilters] = useState<Filters>({ job_types: [], statuses: [], roles: [], modules: [] });
  const [jobType, setJobType] = useState(""); const [jobStatus, setJobStatus] = useState("");
  const [role, setRole] = useState(""); const [module, setModule] = useState("");

  const [minDelay, setMinDelay] = useState("");
  const [maxDelay, setMaxDelay] = useState("");
  const [maxQueue, setMaxQueue] = useState("");
  const [flowId, setFlowId] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const load = () => {
    if (!selected) return;
    api.get<Status>("/api/scheduler/status", { project_id: selected.id }).then((s) => {
      setStatus(s);
      if (s.config) {
        setMinDelay(String(s.config.min_delay));
        setMaxDelay(String(s.config.max_delay));
        setMaxQueue(String(s.config.max_queue_size));
      }
    });
    api
      .get<{ jobs: SchedulerJob[] }>("/api/scheduler/jobs", {
        project_id: selected.id, job_type: jobType, status: jobStatus, role, module,
      })
      .then((r) => setJobs(r.jobs));
  };

  useEffect(() => {
    if (!selected) return;
    api.get<Filters>("/api/scheduler/filters", { project_id: selected.id }).then(setFilters);
  }, [selected]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [selected, jobType, jobStatus, role, module]);

  const setConfig = useAction("Set scheduler config", () =>
    api.post("/api/scheduler/config", {
      min_delay: minDelay ? Number(minDelay) : undefined,
      max_delay: maxDelay ? Number(maxDelay) : undefined,
      max_queue_size: maxQueue ? Number(maxQueue) : undefined,
    }, { project_id: selected!.id })
  );
  const enqueueFlow = useAction("Enqueue flow", () =>
    api.post("/api/scheduler/enqueue/flow", { flow_id: flowId }, { project_id: selected!.id })
  );
  const enqueueEndpoint = useAction("Enqueue endpoint", () =>
    api.post("/api/scheduler/enqueue/endpoint", { endpoint_id: endpointId }, { project_id: selected!.id })
  );
  const clear = useAction("Clear pending jobs", () =>
    api.post("/api/scheduler/clear", {}, { project_id: selected!.id, force: true })
  );
  const pause = useAction("Pause scheduler", () =>
    api.post("/api/scheduler/pause", {}, { project_id: selected!.id })
  );
  const resume = useAction("Resume scheduler", () =>
    api.post("/api/scheduler/resume", {}, { project_id: selected!.id })
  );

  if (!selected) return <NoProjectNotice />;

  const running = status?.state?.state === "running";
  const selectClass = "select select-sm select-bordered";

  const columns: Column<SchedulerJob>[] = [
    { key: "job_type", header: "Type" },
    { key: "status", header: "Status", render: (j) => <StatusBadge value={j.status} /> },
    { key: "priority", header: "Priority" },
    { key: "role_name", header: "Role", render: (j) => j.role_name || <span className="text-base-content/30">—</span> },
    { key: "module_name", header: "Module", render: (j) => j.module_name || <span className="text-base-content/30">—</span> },
    { key: "flow_id", header: "Flow", render: (j) => <UuidChip value={j.flow_id} /> },
    { key: "endpoint_id", header: "Endpoint", render: (j) => <UuidChip value={j.resolved_endpoint_id ?? j.endpoint_id} /> },
    { key: "created_at", header: "Created", className: "text-xs whitespace-nowrap", sortValue: (j) => j.created_at, render: (j) => formatIST(j.created_at) },
    { key: "verdict", header: "Verdict", render: (j) => <StatusBadge value={j.verdict} /> },
    { key: "failure_reason", header: "Reason", className: "text-xs max-w-xs truncate", render: (j) => j.failure_reason || <span className="text-base-content/30">—</span> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Scheduler</h1>
        <div className="flex items-center gap-2">
          <StatusBadge value={status?.state?.state} />
          <button
            className={`btn btn-sm ${running ? "btn-warning" : "btn-success"}`}
            onClick={async () => { if (running) await pause.run(); else await resume.run(); load(); }}
            title={running ? "Pause" : "Resume"}
          >
            {running ? "⏸ Pause" : "▶ Resume"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowSettings(true)} title="Rate limit settings">
            ⚙ Settings
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setShowManual(true)}>
            + Manual
          </button>
          <ConfirmButton className="btn btn-sm btn-error" onConfirm={async () => { await clear.run(); load(); }}>
            Clear pending
          </ConfirmButton>
        </div>
      </div>

      {status?.state?.reason && (
        <div className="alert alert-warning mb-4 text-sm">
          <span>{status.state.reason}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {["pending", "running", "done", "failed", "skipped"].map((s) => (
          <div key={s} className="panel p-3 text-center">
            <div className="text-xl font-semibold">{status?.counts?.[s] ?? 0}</div>
            <div className="text-xs text-base-content/50">{s}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select className={selectClass} value={jobType} onChange={(e) => setJobType(e.target.value)}>
          <option value="">type: any</option>
          {filters.job_types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectClass} value={jobStatus} onChange={(e) => setJobStatus(e.target.value)}>
          <option value="">status: any</option>
          {filters.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">role: any</option>
          {filters.roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={selectClass} value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">module: any</option>
          {filters.modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={jobs}
        rowKey={(j) => j.job_id}
        storageKey="scheduler-jobs"
        onRowClick={(j) => {
          if (j.flow_id) window.open(`/flows/${j.flow_id}`, "_blank");
          else if (j.resolved_endpoint_id) window.open(`/endpoints/${j.resolved_endpoint_id}`, "_blank");
        }}
        emptyLabel="No jobs yet."
      />

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Rate limit settings">
        <div className="flex gap-2 items-end flex-wrap">
          <label className="form-control">
            <span className="label-text text-xs">Min delay (s)</span>
            <input className="input input-sm input-bordered w-24" value={minDelay} onChange={(e) => setMinDelay(e.target.value)} />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">Max delay (s)</span>
            <input className="input input-sm input-bordered w-24" value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">Max queue size</span>
            <input className="input input-sm input-bordered w-28" value={maxQueue} onChange={(e) => setMaxQueue(e.target.value)} />
          </label>
          <button
            className="btn btn-sm btn-primary"
            onClick={async () => { await setConfig.run(); await load(); setShowSettings(false); }}
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal open={showManual} onClose={() => setShowManual(false)} title="Manual enqueue">
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-xs uppercase text-base-content/50 mb-1">By flow</div>
            <div className="flex gap-2">
              <input className="input input-sm input-bordered flex-1 mono" placeholder="flow uuid" value={flowId} onChange={(e) => setFlowId(e.target.value)} />
              <button
                className="btn btn-sm"
                disabled={!flowId}
                onClick={async () => { await enqueueFlow.run(); setFlowId(""); await load(); setShowManual(false); }}
              >
                Enqueue
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-base-content/50 mb-1">By endpoint</div>
            <div className="flex gap-2">
              <input className="input input-sm input-bordered flex-1 mono" placeholder="endpoint uuid" value={endpointId} onChange={(e) => setEndpointId(e.target.value)} />
              <button
                className="btn btn-sm"
                disabled={!endpointId}
                onClick={async () => { await enqueueEndpoint.run(); setEndpointId(""); await load(); setShowManual(false); }}
              >
                Enqueue
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
