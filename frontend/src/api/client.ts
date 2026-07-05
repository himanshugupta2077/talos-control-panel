const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8420";

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: string,
  path: string,
  { params, body }: { params?: Record<string, any>; body?: any } = {}
): Promise<T> {
  const url = new URL(API_BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T = any>(path: string, params?: Record<string, any>) =>
    request<T>("GET", path, { params }),
  post: <T = any>(path: string, body?: any, params?: Record<string, any>) =>
    request<T>("POST", path, { params, body: body ?? {} }),
  del: <T = any>(path: string, params?: Record<string, any>) =>
    request<T>("DELETE", path, { params }),
};

export { API_BASE };

/**
 * Auto-restart the proxy after actions that change state the mitmproxy addon
 * depends on (project switch, role/module create/activate, mutation edits,
 * auth artifact changes). No-ops server-side if the proxy isn't running.
 * Errors are swallowed — this is a best-effort convenience, never something
 * that should surface as a failure of the action that triggered it.
 */
export async function restartProxyIfRunning(): Promise<void> {
  try {
    await api.post("/api/proxy/restart-if-running");
  } catch {
    /* best-effort */
  }
}
