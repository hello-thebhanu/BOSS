import { routes } from '../../app/router/routes';
import { useAppStore } from '../../app/store/appStore';
import { localData } from '../../services/storage/localData';
import { useStoredResource } from '../../services/storage/useStoredResource';
import { formatShortcut } from '../../services/platform/platformService';
import { LiquidGlassGroup, LiquidGlassButton } from '../liquid-glass';

interface NavItemDef {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly icon: (active: boolean) => React.ReactNode;
}

const workspaceItems: readonly NavItemDef[] = [
  {
    id: 'home',
    label: 'Workspace Home',
    path: routes.home,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Neural Chat',
    path: routes.chat,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    path: routes.projects,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'coding',
    label: 'Coding Studio',
    path: routes.coding,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 'terminal',
    label: 'Terminal Session',
    path: routes.terminal,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    id: 'git',
    label: 'Version Control',
    path: routes.git,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
        <line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
  },
  {
    id: 'tools',
    label: 'Tools & Plugins',
    path: routes.tools,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    path: routes.history,
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const current = window.location.pathname;
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const projectsResource = useStoredResource(() => localData.projects.listProjects());
  const activeProject = projectsResource.data.find((p) => p.id === activeProjectId);

  const navigateTo = (path: string) => {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <a className="brand" href={routes.home}>
        <div className="brand-mark-box">
          <span>B</span>
        </div>
        <span className="brand-title">BOSS</span>
        <span className="brand-core-badge">CORE</span>
      </a>

      {/* Quick Search */}
      <label className="sidebar-search">
        <span className="search-icon">🔍</span>
        <input aria-label="Search BOSS" placeholder="Quick Search..." disabled />
        <kbd className="search-kbd">{formatShortcut('Ctrl K')}</kbd>
      </label>

      {/* Workspace Section */}
      <p className="nav-section-title">WORKSPACE</p>
      <LiquidGlassGroup
        orientation="vertical"
        withField={true}
        className="sidebar-liquid-group"
        role="navigation"
        aria-label="Workspace Navigation"
      >
        {workspaceItems.map((item) => {
          const active = current === item.path;
          return (
            <LiquidGlassButton
              key={item.path}
              as="a"
              href={item.path}
              active={active}
              icon={item.icon(active)}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(item.path);
              }}
            >
              <span className="nav-label-text">{item.label}</span>
            </LiquidGlassButton>
          );
        })}
      </LiquidGlassGroup>

      <div className="nav-spacer" />

      {/* System Control Section */}
      <p className="nav-section-title">SYSTEM CONTROL</p>
      <LiquidGlassGroup
        orientation="vertical"
        withField={false}
        className="sidebar-settings-group"
        role="navigation"
        aria-label="System Control Navigation"
      >
        <LiquidGlassButton
          as="a"
          href={routes.general}
          active={current.startsWith(routes.settings)}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={current.startsWith(routes.settings) ? 2.2 : 1.8}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          }
          onClick={(e) => {
            e.preventDefault();
            navigateTo(routes.general);
          }}
        >
          <span className="nav-label-text">Settings</span>
        </LiquidGlassButton>
      </LiquidGlassGroup>

      {/* Project Identity Card (matching reference design) */}
      <div
        className="project-identity-card"
        onClick={() => navigateTo(routes.projects)}
        title="Active Workspace Project"
        role="button"
        tabIndex={0}
      >
        <div className="identity-orb">
          <div className="identity-orb-core" />
        </div>
        <div className="identity-info">
          <b className="identity-name">{activeProject ? activeProject.name : 'Workspace Core'}</b>
          <span className="identity-sub">Developer Workspace</span>
        </div>
        <span className="identity-arrow">›</span>
      </div>
    </aside>
  );
}

