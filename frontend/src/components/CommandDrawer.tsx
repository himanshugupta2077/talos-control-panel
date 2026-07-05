import { useCommandLog } from "../state/CommandLogContext";

/**
 * Right-docked collapsible console panel (shows the exact CLI invocation +
 * output behind every action). Collapsed state shows only an icon strip so
 * it doesn't eat horizontal space while not in use.
 */
export default function CommandDrawer() {
  const { entries, open, setOpen, clear, lastFailed } = useCommandLog();

  if (!open) {
    return (
      <button
        className={`fixed top-1/2 right-0 -translate-y-1/2 z-40 flex flex-col items-center gap-1 px-1.5 py-3 rounded-l-lg border border-r-0 border-base-300 shadow-md ${
          lastFailed ? "bg-error text-error-content" : "bg-base-200 text-base-content/70"
        }`}
        title="Open console"
        onClick={() => setOpen(true)}
      >
        <span className="mono text-sm">$_</span>
        {entries.length > 0 && <span className="badge badge-xs">{entries.length}</span>}
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[26rem] max-w-[90vw] border-l border-base-300 bg-base-200 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 shrink-0">
        <span className="font-semibold text-sm">
          <span className="mono mr-2">$_</span>Console
        </span>
        <div className="flex gap-2">
          <button className="btn btn-xs btn-ghost" onClick={clear}>
            Clear
          </button>
          <button className="btn btn-xs btn-ghost" onClick={() => setOpen(false)} title="Collapse to icon">
            »
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 mono text-xs">
        {entries.length === 0 && (
          <div className="text-base-content/50 py-6 text-center">
            No commands run yet. Actions you take will show their exact CLI invocation and output here.
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="panel p-3">
            <div className="flex items-center justify-between mb-1 font-sans">
              <span className="font-medium text-sm">{entry.label}</span>
              <span className="text-base-content/40">
                {new Date(entry.at).toLocaleTimeString()}
              </span>
            </div>
            {entry.steps.map((step, i) => (
              <div key={i} className="mb-2 last:mb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={step.ok ? "text-success" : "text-error"}>
                    {step.ok ? "✓" : "✗"}
                  </span>
                  <span className="text-base-content/70 break-all">$ {step.cmd_str}</span>
                  <span className="text-base-content/40 ml-auto whitespace-nowrap">
                    {step.duration_ms}ms · exit {step.exit_code}
                  </span>
                </div>
                {step.stdout && (
                  <pre className="whitespace-pre-wrap break-words text-base-content/90 mt-1">{step.stdout}</pre>
                )}
                {step.stderr && (
                  <pre className="whitespace-pre-wrap break-words text-error/90 mt-1">{step.stderr}</pre>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
