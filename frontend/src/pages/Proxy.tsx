import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAction } from "../hooks/useAction";
import { useProject } from "../state/ProjectContext";

interface ProxyStatus {
  running: boolean;
  argv?: string[];
  cmd_str?: string;
  pid?: number;
  started_at?: number;
  exit_code?: number | null;
}

export default function Proxy() {
  const { selected } = useProject();
  const [status, setStatus] = useState<ProxyStatus>({ running: false });
  const [logs, setLogs] = useState<string[]>([]);
  const [listenHost, setListenHost] = useState("127.0.0.1");
  const [port, setPort] = useState(8080);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const start = useAction("Start proxy", () =>
    api
      .post("/api/proxy/start", { listen_host: listenHost, port })
      .then((r) => ({ steps: [{ cmd: [], cmd_str: "proxy start", stdout: JSON.stringify(r, null, 2), stderr: "", exit_code: 0, duration_ms: 0, ok: true }] }))
  );
  const stop = useAction("Stop proxy", () =>
    api
      .post("/api/proxy/stop")
      .then((r) => ({ steps: [{ cmd: [], cmd_str: "proxy stop", stdout: JSON.stringify(r, null, 2), stderr: "", exit_code: 0, duration_ms: 0, ok: true }] }))
  );

  useEffect(() => {
    const poll = async () => {
      const s = await api.get<ProxyStatus>("/api/proxy/status");
      setStatus(s);
      const l = await api.get<{ lines: string[] }>("/api/proxy/logs", { tail: 500 });
      setLogs(l.lines);
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Proxy</h1>

      {selected && !selected.active && (
        <div className="alert alert-warning mb-4 text-sm">
          <span>
            This project isn't the active one in Talos. Open it from the Projects page (or the
            header's project pill) before starting the proxy.
          </span>
        </div>
      )}

      <div className="panel p-4 mb-4 flex items-end gap-4 flex-wrap">
        <label className="form-control">
          <span className="label-text text-xs">Listen host</span>
          <input
            className="input input-sm input-bordered mono"
            value={listenHost}
            onChange={(e) => setListenHost(e.target.value)}
            disabled={status.running}
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Port</span>
          <input
            type="number"
            className="input input-sm input-bordered mono w-28"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            disabled={status.running}
          />
        </label>

        {!status.running ? (
          <button className="btn btn-sm btn-primary" disabled={start.running} onClick={() => start.run()}>
            {start.running ? <span className="loading loading-spinner loading-xs" /> : "Start proxy"}
          </button>
        ) : (
          <button className="btn btn-sm btn-error" disabled={stop.running} onClick={() => stop.run()}>
            {stop.running ? <span className="loading loading-spinner loading-xs" /> : "Stop proxy"}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className={`badge ${status.running ? "badge-success" : "badge-ghost"}`}>
            {status.running ? "running" : "stopped"}
          </span>
          {status.pid && <span className="text-xs text-base-content/50 mono">pid {status.pid}</span>}
        </div>
      </div>

      {status.cmd_str && (
        <div className="text-xs text-base-content/50 mono mb-2">$ {status.cmd_str}</div>
      )}

      <div className="panel p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-base-content/50">Live log</div>
          <button
            className="btn btn-xs"
            disabled={logs.length === 0}
            onClick={() => {
              navigator.clipboard.writeText(logs.join("\n"));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied!" : "Copy log"}
          </button>
        </div>
        <div ref={logRef} className="mono text-xs h-96 overflow-y-auto whitespace-pre-wrap bg-base-300/40 rounded p-3">
          {logs.length === 0 ? (
            <span className="text-base-content/40">No output yet.</span>
          ) : (
            logs.join("\n")
          )}
        </div>
      </div>
    </div>
  );
}
