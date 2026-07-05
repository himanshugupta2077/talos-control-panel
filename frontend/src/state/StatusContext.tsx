import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api, restartProxyIfRunning } from "../api/client";
import { useProject } from "./ProjectContext";
import { Role, Module } from "../types";

interface ProxyStatus {
  running: boolean;
  pid?: number;
}

interface StatusContextValue {
  proxyRunning: boolean;
  activeRole: Role | null;
  activeModule: Module | null;
  refreshStatus: () => Promise<void>;
  restartProxy: () => Promise<void>;
}

const StatusContext = createContext<StatusContextValue | null>(null);

/**
 * Single shared poller for the header's proxy status pill + active
 * role/module chips, so we don't stack up a duplicate 2s poll per page.
 * Individual pages (e.g. Proxy) may still poll their own richer status/logs.
 */
export function StatusProvider({ children }: { children: ReactNode }) {
  const { selected } = useProject();
  const [proxyRunning, setProxyRunning] = useState(false);
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [activeModule, setActiveModule] = useState<Module | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.get<ProxyStatus>("/api/proxy/status");
      setProxyRunning(!!s.running);
    } catch {
      setProxyRunning(false);
    }
    if (selected) {
      try {
        const [{ roles }, { modules }] = await Promise.all([
          api.get<{ roles: Role[] }>("/api/roles", { project_id: selected.id }),
          api.get<{ modules: Module[] }>("/api/modules", { project_id: selected.id }),
        ]);
        setActiveRole(roles.find((r) => !!r.is_active) || null);
        setActiveModule(modules.find((m) => !!m.is_active) || null);
      } catch {
        setActiveRole(null);
        setActiveModule(null);
      }
    } else {
      setActiveRole(null);
      setActiveModule(null);
    }
  }, [selected]);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 3000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const restartProxy = useCallback(async () => {
    await restartProxyIfRunning();
    await refreshStatus();
  }, [refreshStatus]);

  return (
    <StatusContext.Provider value={{ proxyRunning, activeRole, activeModule, refreshStatus, restartProxy }}>
      {children}
    </StatusContext.Provider>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatus must be used within StatusProvider");
  return ctx;
}
