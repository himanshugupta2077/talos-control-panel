import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../state/ProjectContext";
import { api } from "../api/client";
import { NoProjectNotice } from "../components/Common";
import DataTable, { Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { EndpointRow } from "../types";

interface Filters {
  methods: string[]; roles: string[]; modules: string[]; priorities: string[];
}

export default function Endpoints() {
  const { selected } = useProject();
  const [rows, setRows] = useState<EndpointRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({ methods: [], roles: [], modules: [], priorities: [] });
  const [method, setMethod] = useState(""); const [role, setRole] = useState("");
  const [module, setModule] = useState(""); const [priority, setPriority] = useState("");
  const [qualified, setQualified] = useState(""); const [excluded, setExcluded] = useState("");
  const [dangerous, setDangerous] = useState(""); const [logout, setLogout] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!selected) return;
    api.get<Filters>("/api/endpoints/filters", { project_id: selected.id }).then(setFilters);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api
      .get<{ endpoints: EndpointRow[]; total: number }>("/api/endpoints", {
        project_id: selected.id, limit: 300, search, method, role, module, priority,
        qualified, excluded, dangerous, logout,
      })
      .then((r) => { setRows(r.endpoints); setTotal(r.total); })
      .finally(() => setLoading(false));
  }, [selected, search, method, role, module, priority, qualified, excluded, dangerous, logout]);

  if (!selected) return <NoProjectNotice />;

  const columns: Column<EndpointRow>[] = [
    { key: "method", header: "Method", render: (r) => <span className="badge badge-sm badge-outline mono">{r.method}</span> },
    { key: "host", header: "Host", className: "mono text-xs" },
    { key: "normalized_path", header: "Path", className: "mono text-xs" },
    { key: "hit_count", header: "Hits" },
    { key: "roles", header: "Roles", className: "text-xs" },
    { key: "modules", header: "Modules", className: "text-xs" },
    { key: "auto_priority", header: "Priority", sortValue: (r) => r.manual_priority || r.auto_priority || "", render: (r) => <StatusBadge value={r.manual_priority || r.auto_priority} /> },
    { key: "qualified", header: "Qualified", render: (r) => (r.qualified ? <span className="badge badge-success badge-xs">yes</span> : <span className="badge badge-ghost badge-xs">{r.qualification_reason}</span>) },
    { key: "flags", header: "Flags", sortable: false, render: (r) => (
      <div className="flex gap-1">
        {!!r.excluded && <span className="badge badge-ghost badge-xs">excluded</span>}
        {!!r.dangerous && <span className="badge badge-warning badge-xs">dangerous</span>}
        {!!r.logout && <span className="badge badge-error badge-xs">logout</span>}
      </div>
    ) },
  ];

  const selectClass = "select select-xs select-bordered";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Endpoints ({total})</h1>
        <input
          className="input input-sm input-bordered w-64"
          placeholder="Search host / path / method…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">method: any</option>
          {filters.methods.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">role: any</option>
          {filters.roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={selectClass} value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">module: any</option>
          {filters.modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">priority: any</option>
          {filters.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={selectClass} value={qualified} onChange={(e) => setQualified(e.target.value)}>
          <option value="">qualified: any</option>
          <option value="1">yes</option>
          <option value="0">no</option>
        </select>
        <select className={selectClass} value={excluded} onChange={(e) => setExcluded(e.target.value)}>
          <option value="">excluded: any</option>
          <option value="1">yes</option>
          <option value="0">no</option>
        </select>
        <select className={selectClass} value={dangerous} onChange={(e) => setDangerous(e.target.value)}>
          <option value="">dangerous: any</option>
          <option value="1">yes</option>
          <option value="0">no</option>
        </select>
        <select className={selectClass} value={logout} onChange={(e) => setLogout(e.target.value)}>
          <option value="">logout: any</option>
          <option value="1">yes</option>
          <option value="0">no</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        storageKey="endpoints"
        onRowClick={(r) => navigate(`/endpoints/${r.id}`)}
        emptyLabel="No endpoints captured yet. Start the proxy and browse the target with traffic routed through it."
      />
    </div>
  );
}
