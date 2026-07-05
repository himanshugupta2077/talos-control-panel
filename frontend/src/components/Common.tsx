import { ReactNode, useState } from "react";

export function ConfirmButton({
  onConfirm, children, className = "btn btn-sm btn-error", confirmText = "Are you sure?",
}: {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  confirmText?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs text-base-content/60">{confirmText}</span>
        <button
          className="btn btn-xs btn-error"
          onClick={async (e) => {
            e.stopPropagation();
            setConfirming(false);
            await onConfirm();
          }}
        >
          Yes
        </button>
        <button className="btn btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); setConfirming(false); }}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button className={className} onClick={(e) => { e.stopPropagation(); setConfirming(true); }}>
      {children}
    </button>
  );
}

export function UuidChip({ value }: { value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-base-content/40">—</span>;
  return (
    <button
      className="uuid-chip hover:bg-base-content/10"
      title="Click to copy"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "copied!" : value.slice(0, 8)}
    </button>
  );
}

export function NoProjectNotice() {
  return (
    <div className="panel p-8 text-center text-base-content/60">
      Select a project from the dropdown above to get started — or{" "}
      <a href="/projects" className="link link-primary">
        create a new one
      </a>
      .
    </div>
  );
}

export function Modal({
  open, onClose, title, children, wide = false,
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal modal-open">
      <div className={`modal-box ${wide ? "max-w-3xl" : ""}`}>
        <h3 className="font-bold text-lg mb-4">{title}</h3>
        {children}
        <div className="modal-action">
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-base">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
