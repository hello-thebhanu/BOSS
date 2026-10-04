import { useState, useEffect, type PropsWithChildren } from 'react';
import { Sidebar } from '../navigation/Sidebar';
import { useAppStore } from '../../app/store/appStore';
import { localData } from '../../services/storage/localData';
import { useStoredResource } from '../../services/storage/useStoredResource';
import { navigationHistory } from '../../app/router/navigationHistory';
import { aiProviderService } from '../../services/ai/aiProviderService';
import type { AIProviderId, AIProviderStatusResult } from '../../services/ai/aiProviderTypes';

interface AppShellProps extends PropsWithChildren {
  currentPath?: string;
}

export function AppShell({ children }: AppShellProps) {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const projectsResource = useStoredResource(() => localData.projects.listProjects());
  const activeProject = projectsResource.data.find((p) => p.id === activeProjectId);

  const [canGoBack, setCanGoBack] = useState(navigationHistory.canGoBack());
  const [canGoForward, setCanGoForward] = useState(navigationHistory.canGoForward());
  const [providerStatus, setProviderStatus] = useState<AIProviderStatusResult | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<AIProviderId>('ollama');

  useEffect(() => {
    const unsub = navigationHistory.subscribe(() => {
      setCanGoBack(navigationHistory.canGoBack());
      setCanGoForward(navigationHistory.canGoForward());
    });
    return unsub;
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const id = await aiProviderService.getActiveProviderId();
        const st = await aiProviderService.getActiveStatus();
        if (active) {
          setActiveProviderId(id);
          setProviderStatus(st);
        }
      } catch {
        if (active) {
          setProviderStatus({
            providerId: 'ollama',
            status: 'unavailable',
            reason: 'Provider unavailable',
            models: [],
            activeModel: '',
          });
        }
      }
    };

    refresh();
    const unsub = aiProviderService.subscribe(refresh);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const isAiOnline = providerStatus?.status === 'connected' || providerStatus?.status === 'configured';

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {}
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch {}
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {}
  };

  const getTelemetryPrimary = () => {
    if (activeProviderId === 'ollama') {
      return isAiOnline ? 'ONLINE · LOCAL ONLY' : 'OFFLINE · LOCAL ONLY';
    }
    if (activeProviderId === 'openai') {
      return isAiOnline ? 'ONLINE · OPENAI (BYOK)' : 'OFFLINE · OPENAI (BYOK)';
    }
    return isAiOnline ? 'ONLINE · GEMINI (BYOK)' : 'OFFLINE · GEMINI (BYOK)';
  };

  const getTelemetrySub = () => {
    if (activeProviderId === 'ollama') {
      return isAiOnline ? 'SECURE · AIR-GAPPED · PRIVATE' : 'LOCAL AI DISCONNECTED · PRIVATE';
    }
    if (activeProviderId === 'openai') {
      return isAiOnline ? 'CLOUD AI · ENCRYPTED VAULT KEY' : 'OPENAI DISCONNECTED · CHECK KEY';
    }
    return isAiOnline ? 'CLOUD AI · ENCRYPTED VAULT KEY' : 'GEMINI DISCONNECTED · CHECK KEY';
  };

  return (
    <div className="shell">
      <Sidebar />
      <div className="content">
        <header className="window-frame">
          {/* Left: Back / Forward Navigation Controls */}
          <div className="nav-history-controls" aria-label="History Navigation">
            <button
              type="button"
              className="nav-arrow-btn"
              onClick={() => navigationHistory.back()}
              disabled={!canGoBack}
              title="Navigate Back"
              aria-label="Back"
            >
              ←
            </button>
            <button
              type="button"
              className="nav-arrow-btn"
              onClick={() => navigationHistory.forward()}
              disabled={!canGoForward}
              title="Navigate Forward"
              aria-label="Forward"
            >
              →
            </button>
          </div>

          {/* Living Animated Connection Indicator & Telemetry */}
          <div className="connection-status-container">
            <div className={`connection-wifi ${isAiOnline ? 'online' : 'offline'}`} aria-label="Connection Status">
              <span className="wifi-dot" />
              <span className="wifi-arc wifi-arc--1" />
              <span className="wifi-arc wifi-arc--2" />
              <span className="wifi-arc wifi-arc--3" />
            </div>
            <div className="connection-telemetry">
              <div className="telemetry-primary">
                <span className={`telemetry-status-text ${isAiOnline ? 'online' : 'offline'}`}>
                  {getTelemetryPrimary()}
                </span>
              </div>
              <div className="telemetry-sub">
                {getTelemetrySub()}
              </div>
            </div>

            {/* Glowing Acoustic Wave Line */}
            <div className="acoustic-wave-preview" aria-hidden="true">
              <svg width="68" height="16" viewBox="0 0 68 16" fill="none">
                <path
                  d="M1 8C6 8 8 2 13 2C18 2 20 14 25 14C30 14 32 5 37 5C42 5 44 11 49 11C54 11 56 8 61 8C64 8 66 8 67 8"
                  stroke="url(#bossWaveGrad)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="bossWaveGrad" x1="0" y1="0" x2="68" y2="0" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00d9ff" />
                    <stop offset="0.6" stopColor="#8b5cff" />
                    <stop offset="1" stopColor="#c7b5ff" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Enclave Badges */}
          <div className="header-enclave-group">
            {activeProviderId === 'ollama' ? (
              <>
                <span className="enclave-pill">
                  <i className="enclave-dot" />
                  ENCLAVE: <b>LOCAL ONLY</b>
                </span>
                <span className="header-divider">|</span>
                <span className="badge-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  NO CLOUD
                </span>
                <span className="badge-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  PRIVATE
                </span>
              </>
            ) : (
              <>
                <span className="enclave-pill" style={{ borderColor: 'rgba(168, 85, 247, 0.4)', background: 'rgba(168, 85, 247, 0.1)' }}>
                  <i className="enclave-dot" style={{ background: '#c084fc' }} />
                  PROVIDER: <b>{activeProviderId.toUpperCase()}</b>
                </span>
                <span className="header-divider">|</span>
                <span className="badge-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                  </svg>
                  CLOUD (BYOK)
                </span>
                <span className="badge-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  VAULT KEY
                </span>
              </>
            )}
          </div>

          {/* Minimal Monochrome Native Window Controls (Replaces Traffic Lights) */}
          <div className="boss-window-controls" aria-label="Window Controls">
            <button
              type="button"
              className="boss-window-btn minimize"
              onClick={handleMinimize}
              title="Minimize"
              aria-label="Minimize"
            >
              <svg width="10" height="1" viewBox="0 0 10 1">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className="boss-window-btn maximize"
              onClick={handleMaximize}
              title="Maximize"
              aria-label="Maximize"
            >
              <svg width="9" height="9" viewBox="0 0 9 9">
                <rect x="0.6" y="0.6" width="7.8" height="7.8" stroke="currentColor" fill="none" strokeWidth="1.2" />
              </svg>
            </button>
            <button
              type="button"
              className="boss-window-btn close"
              onClick={handleClose}
              title="Close"
              aria-label="Close"
            >
              <svg width="9" height="9" viewBox="0 0 9 9">
                <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" />
                <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </header>

        {children}

        <footer className="statusbar">
          <span>
            <i className="offline-dot" style={activeProject ? { background: 'var(--cyan)' } : undefined} />
            {activeProject ? `Project: ${activeProject.name} [${activeProject.stack || 'LOCAL'}]` : 'BOSS / Local-First Desktop AI'}
          </span>
          <span>
            {activeProviderId === 'ollama'
              ? 'LOCAL FIRST　•　PRIVATE　•　BUILT FOR DEVELOPERS'
              : `CLOUD AI (${activeProviderId.toUpperCase()})　•　BYOK　•　ENCRYPTED VAULT`}
          </span>
        </footer>
      </div>
    </div>
  );
}

