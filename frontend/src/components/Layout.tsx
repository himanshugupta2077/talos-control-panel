import { NavLink, Outlet, Link } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import CommandDrawer from "./CommandDrawer";
import ToastStack from "./ToastStack";
import { useProject } from "../state/ProjectContext";
import { useStatus } from "../state/StatusContext";

const NAV_GROUPS: { label: string; items: { to: string; label: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/projects", label: "Projects" },
      { to: "/proxy", label: "Proxy" },
    ],
  },
  {
    label: "Model",
    items: [
      { to: "/roles-modules", label: "Roles & Modules" },
      { to: "/access", label: "Access Model" },
      { to: "/auth", label: "Auth" },
    ],
  },
  {
    label: "Capture",
    items: [
      { to: "/endpoints", label: "Endpoints" },
      { to: "/flows", label: "Flows" },
      { to: "/mutations", label: "Mutations" },
    ],
  },
  {
    label: "Testing",
    items: [
      { to: "/scheduler", label: "Scheduler" },
      { to: "/attack", label: "Attack" },
      { to: "/input-validation", label: "Input Validation" },
    ],
  },
  {
    label: "Results",
    items: [
      { to: "/findings", label: "Findings" },
      { to: "/console", label: "Console" },
    ],
  },
];

export default function Layout() {
  const { selected } = useProject();
  const { proxyRunning, activeRole, activeModule } = useStatus();

  return (
    <div className="flex h-screen overflow-hidden bg-base-100">
      <aside className="w-56 shrink-0 border-r border-base-300 bg-base-200 flex flex-col">
        <div className="px-4 py-4 border-b border-base-300">
          <div className="font-bold text-lg tracking-tight">Talos</div>
          <div className="text-xs text-base-content/50">Control Panel</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-4 py-1 text-[11px] uppercase tracking-wider text-base-content/40">
                {group.label}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `block px-4 py-1.5 text-sm ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                        : "text-base-content/80 hover:bg-base-300/50"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 border-b border-base-300 flex items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/projects"
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-base-300/50 min-w-0"
              title="Switch project"
            >
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  selected?.active ? "bg-success" : "bg-base-content/30"
                }`}
              />
              <span className="text-sm font-medium truncate max-w-[12rem]">
                {selected ? selected.name : "No project"}
              </span>
              {selected && !selected.active && (
                <span className="badge badge-ghost badge-xs shrink-0">inactive</span>
              )}
            </Link>

            {activeRole && (
              <Link
                to="/roles-modules"
                className="badge badge-outline badge-sm gap-1 hover:bg-base-300/50"
                title="Active role"
              >
                role: {activeRole.name}
              </Link>
            )}
            {activeModule && (
              <Link
                to="/roles-modules"
                className="badge badge-outline badge-sm gap-1 hover:bg-base-300/50"
                title="Active module"
              >
                module: {activeModule.name}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/proxy"
              className={`btn btn-xs gap-1.5 ${proxyRunning ? "btn-success" : "btn-ghost"}`}
              title="Proxy status"
            >
              <span className={`inline-block w-2 h-2 rounded-full ${proxyRunning ? "bg-success-content" : "bg-error"}`} />
              Proxy {proxyRunning ? "on" : "off"}
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <CommandDrawer />
      <ToastStack />
    </div>
  );
}
