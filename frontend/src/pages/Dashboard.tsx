import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProject } from "../state/ProjectContext";
import { api } from "../api/client";
import { NoProjectNotice } from "../components/Common";

interface Summary {
  flows: number;
  endpoints: number;
  findings_triaging: number;
  findings_confirmed: number;
  scheduler_pending: number;
  roles: number;
  modules: number;
}

const CARDS: { key: keyof Summary; label: string; to: string }[] = [
  { key: "flows", label: "Captured flows", to: "/flows" },
  { key: "endpoints", label: "Endpoints", to: "/endpoints" },
  { key: "findings_triaging", label: "Findings triaging", to: "/findings" },
  { key: "findings_confirmed", label: "Findings confirmed", to: "/findings" },
  { key: "scheduler_pending", label: "Jobs pending", to: "/scheduler" },
  { key: "roles", label: "Roles", to: "/roles-modules" },
  { key: "modules", label: "Modules", to: "/roles-modules" },
];

export default function Dashboard() {
  const { selected } = useProject();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!selected) return;
    api.get<Summary>(`/api/projects/${selected.id}/summary`).then(setSummary);
  }, [selected]);

  if (!selected) return <NoProjectNotice />;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{selected.name}</h1>
          {selected.active ? (
            <span className="badge badge-success gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-content" />
              Activated
            </span>
          ) : (
            <span className="badge badge-ghost gap-1">Not activated</span>
          )}
        </div>
        <p className="text-sm text-base-content/60">{selected.description || "No description"}</p>
        {!selected.active && (
          <p className="text-xs text-warning mt-1">
            This project isn't the active one in Talos — open it from the{" "}
            <Link to="/projects" className="link">
              Projects page
            </Link>{" "}
            to capture traffic against it.
          </p>
        )}
        {selected.scope.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {selected.scope.map((s) => (
              <span key={s} className="badge badge-outline badge-sm mono">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CARDS.map((c) => (
          <Link key={c.key} to={c.to} className="panel p-4 hover:border-primary transition-colors">
            <div className="text-2xl font-semibold">{summary ? summary[c.key] : "—"}</div>
            <div className="text-xs text-base-content/60 mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      {!selected.db_exists && (
        <div className="alert mt-6">
          <span>
            No talos.db found yet at <span className="mono">{selected.data_dir}</span>. Open this
            project and start the proxy to begin capturing traffic.
          </span>
        </div>
      )}
    </div>
  );
}
