import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { api, restartProxyIfRunning } from "../api/client";
import { useAction } from "../hooks/useAction";
import { NoProjectNotice, Section } from "../components/Common";
import { Role } from "../types";

interface AuthArtifact {
  type: string;
  name: string;
}

interface RoleAuthState {
  provider: { provider: string; updated_at: string } | null;
  artifacts: { key: string; value: string; collected_at: string }[];
  manual_session: {
    headers_json: string; cookies_json: string; expires_at: string | null; ttl_seconds: number | null; updated_at: string;
  } | null;
  flows: { id: string; flow_id: string; has_extractor: number; sort_order: number }[];
  health: any;
  control_flows: { flow_id: string }[];
  suspicion: { suspicion_count: number; last_checked_at: string | null } | null;
}

function Step({
  n, title, done, children,
}: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
            done ? "bg-success text-success-content" : "bg-base-300 text-base-content/70"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <h3 className="font-medium text-sm">{title}</h3>
      </div>
      <div className="pl-8">{children}</div>
    </div>
  );
}

export default function Auth() {
  const { selected } = useProject();
  const [artifacts, setArtifacts] = useState<AuthArtifact[]>([]);
  const [cookieInput, setCookieInput] = useState("");
  const [headerInput, setHeaderInput] = useState("");

  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState<string>("");
  const [roleState, setRoleState] = useState<RoleAuthState | null>(null);

  // AUTO provider step state
  const [flowId, setFlowId] = useState("");
  const [extractorFlowId, setExtractorFlowId] = useState("");
  const [extractorCode, setExtractorCode] = useState("");

  // MANUAL provider step state
  const [sessionPath, setSessionPath] = useState("");
  const [sessionContent, setSessionContent] = useState("");
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const [testFlowId, setTestFlowId] = useState("");

  const loadArtifacts = () =>
    selected && api.get<{ artifacts: AuthArtifact[] }>("/api/auth", { project_id: selected.id }).then((r) => setArtifacts(r.artifacts));
  const loadRoles = () =>
    selected && api.get<{ roles: Role[] }>("/api/roles", { project_id: selected.id }).then((r) => {
      setRoles(r.roles);
      if (!roleId && r.roles.length) setRoleId(r.roles[0].id);
    });
  const loadRoleState = () => {
    if (!selected || !roleId) return;
    api.get<RoleAuthState>(`/api/auth-config/${roleId}/state`, { project_id: selected.id }).then(setRoleState);
  };

  useEffect(() => { loadArtifacts(); loadRoles(); }, [selected]);
  useEffect(() => {
    loadRoleState();
    setSessionLoaded(false);
  }, [selected, roleId]);

  const setAuth = useAction("Set auth artifacts", () =>
    api.post(
      "/api/auth/set",
      { cookies: cookieInput ? [cookieInput] : [], headers: headerInput ? [headerInput] : [] },
      { project_id: selected!.id }
    )
  );
  const clearAuth = useAction("Clear auth artifacts", () =>
    api.post("/api/auth/clear", {}, { project_id: selected!.id })
  );

  const role = roles.find((r) => r.id === roleId);
  const provider = roleState?.provider?.provider || null;

  const setProvider = useAction("Set auth provider", (p: string) =>
    api.post(`/api/auth-config/${roleId}/provider`, { provider: p }, { project_id: selected!.id })
  );
  const addFlow = useAction("Attach login flow", () =>
    api.post(`/api/auth-config/${roleId}/flows/${flowId}`, {}, { project_id: selected!.id })
  );
  const saveExtractor = useAction("Set extractor", (fid: string, code: string) =>
    api.post(`/api/auth-config/${roleId}/flows/${fid}/extractor`, { code }, { project_id: selected!.id })
  );
  const refreshAuth = useAction("Refresh auth state", () =>
    api.post(`/api/auth-config/${roleId}/refresh`, {}, { project_id: selected!.id })
  );
  const validateAuth = useAction("Validate auth state", () =>
    api.post(`/api/auth-config/${roleId}/validate`, {}, { project_id: selected!.id })
  );
  const testFlow = useAction("Test extractor on flow", (fid: string) =>
    api.post(`/api/auth-config/${roleId}/test/${fid}`, {}, { project_id: selected!.id })
  );

  const loadSessionFile = useAction("Load session file", () =>
    api.get<{ path: string; content: string; steps: any[] }>(
      `/api/auth-config/${roleId}/session/file`, { project_id: selected!.id }
    ).then((r) => {
      setSessionPath(r.path);
      setSessionContent(r.content);
      setSessionLoaded(true);
      return { steps: r.steps };
    })
  );
  const saveSessionFile = useAction("Save session file", (content: string) =>
    api.post(`/api/auth-config/${roleId}/session/file`, { content }, { project_id: selected!.id })
  );
  const applySession = useAction("Apply manual session", () =>
    api.post(`/api/auth-config/${roleId}/session/apply`, {}, { project_id: selected!.id })
  );

  if (!selected) return <NoProjectNotice />;

  // Chains: after the primary "save" action of a step, automatically run
  // validate -> test -> refresh in sequence, per the requested flow.
  async function runValidateTestRefresh(testTargetFlowId?: string) {
    await validateAuth.run();
    if (testTargetFlowId) await testFlow.run(testTargetFlowId);
    await refreshAuth.run();
    loadRoleState();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Auth</h1>

      <Section title="Auth artifact names (project-wide)">
        <p className="text-xs text-base-content/50 mb-2">
          Declare which cookie/header names carry authentication. Only names are stored, never values.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {artifacts.map((a) => (
            <span key={`${a.type}-${a.name}`} className="badge badge-outline mono">
              {a.type}: {a.name}
            </span>
          ))}
          {artifacts.length === 0 && <span className="text-sm text-base-content/40">None set.</span>}
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <label className="form-control">
            <span className="label-text text-xs">Add cookie name</span>
            <input className="input input-sm input-bordered" value={cookieInput} onChange={(e) => setCookieInput(e.target.value)} placeholder="sessionid" />
          </label>
          <label className="form-control">
            <span className="label-text text-xs">Add header name</span>
            <input className="input input-sm input-bordered" value={headerInput} onChange={(e) => setHeaderInput(e.target.value)} placeholder="Authorization" />
          </label>
          <button
            className="btn btn-sm btn-primary"
            onClick={async () => {
              await setAuth.run();
              setCookieInput(""); setHeaderInput("");
              await loadArtifacts();
              await restartProxyIfRunning();
            }}
          >
            Add
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              await clearAuth.run();
              await loadArtifacts();
              await restartProxyIfRunning();
            }}
          >
            Clear all
          </button>
        </div>
      </Section>

      <div className="divider" />

      <h2 className="font-semibold text-base mb-3">Per-role auth setup</h2>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
        <div className="flex flex-col gap-4">
          {/* Step 1: role */}
          <Step n={1} title="Choose a role" done={!!role}>
            {roles.length === 0 ? (
              <div className="text-sm text-base-content/50">
                Create a role first on the Roles &amp; Modules page.
              </div>
            ) : (
              <select
                className="select select-sm select-bordered w-56"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </Step>

          {/* Step 2: provider */}
          {role && (
            <Step n={2} title="Set the auth provider" done={!!provider}>
              <p className="text-xs text-base-content/50 mb-2">
                <span className="font-medium">auto</span> — Talos replays a login flow and extracts
                credentials itself. <span className="font-medium">manual</span> — you supply the
                session artifacts directly (any auth technology, incl. MFA/OAuth/SSO).
              </p>
              <div className="flex items-center gap-2">
                <button
                  className={`btn btn-sm ${provider === "auto" ? "btn-primary" : ""}`}
                  onClick={async () => { await setProvider.run("auto"); loadRoleState(); }}
                >
                  auto
                </button>
                <button
                  className={`btn btn-sm ${provider === "manual" ? "btn-primary" : ""}`}
                  onClick={async () => { await setProvider.run("manual"); loadRoleState(); }}
                >
                  manual
                </button>
              </div>
            </Step>
          )}

          {/* AUTO steps */}
          {role && provider === "auto" && (
            <>
              <Step n={3} title="Add a login flow" done={(roleState?.flows?.length || 0) > 0}>
                <p className="text-xs text-base-content/50 mb-2">
                  Paste the UUID of a captured flow (from the Flows page) that performs the login
                  request for this role.
                </p>
                <div className="flex gap-2">
                  <input
                    className="input input-sm input-bordered flex-1 mono"
                    placeholder="flow uuid"
                    value={flowId}
                    onChange={(e) => setFlowId(e.target.value)}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={!flowId}
                    onClick={async () => { await addFlow.run(); setFlowId(""); loadRoleState(); }}
                  >
                    Attach
                  </button>
                </div>
                {!!roleState?.flows?.length && (
                  <ul className="text-xs mono space-y-1 mt-2">
                    {roleState.flows.map((f) => (
                      <li key={f.id} className="flex justify-between">
                        <span>{f.flow_id}</span>
                        <span>{f.has_extractor ? "has extractor" : "no extractor"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Step>

              <Step n={4} title="Set extractor" done={!!roleState?.flows?.some((f) => f.has_extractor)}>
                <p className="text-xs text-base-content/50 mb-2">
                  Pick the attached flow, then paste the Python extractor code. It receives the
                  login flow's <span className="mono">response</span> and must return a dict of
                  artifact name → value (e.g. cookies/tokens). Saving runs validate → test → refresh
                  automatically.
                </p>
                <select
                  className="select select-sm select-bordered w-full mb-2 mono"
                  value={extractorFlowId}
                  onChange={(e) => setExtractorFlowId(e.target.value)}
                >
                  <option value="">Select attached flow…</option>
                  {roleState?.flows?.map((f) => (
                    <option key={f.id} value={f.flow_id}>{f.flow_id}</option>
                  ))}
                </select>
                <textarea
                  className="textarea textarea-sm textarea-bordered w-full mono"
                  rows={8}
                  placeholder={"def extract(response):\n    return {\"session\": response.cookies[\"session\"]}"}
                  value={extractorCode}
                  onChange={(e) => setExtractorCode(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary mt-2"
                  disabled={!extractorFlowId || !extractorCode}
                  onClick={async () => {
                    await saveExtractor.run(extractorFlowId, extractorCode);
                    await runValidateTestRefresh(extractorFlowId);
                  }}
                >
                  Save &amp; run validate → test → refresh
                </button>
              </Step>

              <Step n={5} title="Validate / Test / Refresh">
                <div className="flex gap-2 flex-wrap items-center">
                  <button className="btn btn-xs" onClick={async () => { await validateAuth.run(); loadRoleState(); }}>Validate</button>
                  <select
                    className="select select-xs select-bordered mono"
                    value={testFlowId}
                    onChange={(e) => setTestFlowId(e.target.value)}
                  >
                    <option value="">flow to test…</option>
                    {roleState?.flows?.map((f) => (
                      <option key={f.id} value={f.flow_id}>{f.flow_id}</option>
                    ))}
                  </select>
                  <button className="btn btn-xs" disabled={!testFlowId} onClick={async () => { await testFlow.run(testFlowId); loadRoleState(); }}>Test</button>
                  <button className="btn btn-xs" onClick={async () => { await refreshAuth.run(); loadRoleState(); }}>Refresh</button>
                </div>
              </Step>
            </>
          )}

          {/* MANUAL steps */}
          {role && provider === "manual" && (
            <>
              <Step n={3} title="Manual session" done={!!roleState?.manual_session}>
                <p className="text-xs text-base-content/50 mb-2">
                  Talos stores a persistent session file at{" "}
                  <span className="mono">{sessionPath || "<project>/auth_sessions/<role>.txt"}</span>.
                  Load it, edit the headers/cookies/expiry below (or edit the same file with any
                  external editor — they're the same file), then save. Saving runs
                  validate → refresh automatically.
                </p>
                {!sessionLoaded ? (
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      await loadSessionFile.run();
                    }}
                  >
                    Load session file
                  </button>
                ) : (
                  <>
                    <div className="text-xs mono text-base-content/50 mb-1">{sessionPath}</div>
                    <textarea
                      className="textarea textarea-sm textarea-bordered w-full mono"
                      rows={10}
                      value={sessionContent}
                      onChange={(e) => setSessionContent(e.target.value)}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={async () => {
                          await saveSessionFile.run(sessionContent);
                          await applySession.run();
                          await runValidateTestRefresh();
                        }}
                      >
                        Save &amp; run validate → refresh
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => loadSessionFile.run()}>
                        Reload from disk
                      </button>
                    </div>
                  </>
                )}
              </Step>

              <Step n={4} title="Validate / Refresh">
                <div className="flex gap-2 flex-wrap items-center">
                  <button className="btn btn-xs" onClick={async () => { await validateAuth.run(); loadRoleState(); }}>Validate</button>
                  <button className="btn btn-xs" onClick={async () => { await refreshAuth.run(); loadRoleState(); }}>Refresh</button>
                </div>
                <p className="text-xs text-base-content/40 mt-2">
                  Manual sessions are validated against the role's configured control flows /
                  validation endpoint (see Session Health below) rather than a per-flow test.
                </p>
              </Step>
            </>
          )}
        </div>

        {/* Right column: live state */}
        <div className="panel p-4 sticky top-0">
          <div className="text-xs uppercase text-base-content/50 mb-2">Current state</div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-base-content/50">provider</span>
            <span className="badge badge-sm">{provider || "unset"}</span>
          </div>
          <div className="text-xs uppercase text-base-content/50 mb-1">Collected artifacts</div>
          {roleState?.artifacts?.length ? (
            <table className="table table-tight table-xs mb-3">
              <tbody>
                {roleState.artifacts.map((a) => (
                  <tr key={a.key}><td className="mono">{a.key}</td><td className="mono truncate max-w-[8rem]">{a.value}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-base-content/40 mb-3">None collected yet.</div>
          )}
          {roleState?.suspicion && (
            <div className="text-xs text-base-content/50">
              Suspicion count: {roleState.suspicion.suspicion_count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
