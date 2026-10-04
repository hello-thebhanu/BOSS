import { useEffect, useState } from 'react';
import { routeValues, routes } from './routes';
import { navigationHistory } from './navigationHistory';
import { AppShell } from '../../components/layout/AppShell';
import { WelcomePage, TrailerPage, AuthPage } from '../../pages/welcome/FirstLaunchPages';
import {
  HomePage,
  ChatPage,
  ProjectsPage,
  CodingPage,
  TerminalPage,
  GitPage,
  ToolsPage,
  HistoryPage,
} from '../../pages/workspace/WorkspacePages';
import { SettingsPage } from '../../pages/settings/SettingsPages';

function path(): string {
  return window.location.pathname === '/' ? routes.welcome : window.location.pathname;
}

function navigate(to: string) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Small dependency-free router with smooth page-to-page transition support */
export function AppRouter() {
  const [current, setCurrent] = useState(path);

  useEffect(() => {
    navigationHistory.push(current);
  }, [current]);

  useEffect(() => {
    const listener = () => {
      const newPath = path();
      setCurrent(newPath);
      navigationHistory.push(newPath);
    };

    const links = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const to = link.getAttribute('href');
      if (to && to.startsWith('/') && routeValues.has(to)) {
        event.preventDefault();
        navigate(to);
      }
    };

    addEventListener('popstate', listener);
    document.addEventListener('click', links);
    return () => {
      removeEventListener('popstate', listener);
      document.removeEventListener('click', links);
    };
  }, []);

  if (!routeValues.has(current)) {
    return (
      <main className="page">
        <h1>Route Not Found</h1>
        <p className="muted">This BOSS location does not exist.</p>
        <a className="button" href={routes.welcome}>
          Return To Welcome
        </a>
      </main>
    );
  }

  if (current === routes.welcome) return <WelcomePage />;
  if (current === routes.trailer) return <TrailerPage />;
  if (current === routes.auth) return <AuthPage />;

  const content =
    current === routes.home ? (
      <HomePage />
    ) : current === routes.chat ? (
      <ChatPage />
    ) : current === routes.projects ? (
      <ProjectsPage />
    ) : current === routes.coding ? (
      <CodingPage />
    ) : current === routes.terminal ? (
      <TerminalPage />
    ) : current === routes.git ? (
      <GitPage />
    ) : current === routes.tools ? (
      <ToolsPage />
    ) : current === routes.history ? (
      <HistoryPage />
    ) : (
      <SettingsPage path={current} />
    );

  return (
    <AppShell currentPath={current}>
      <div key={current} className="page-transition-wrapper">
        {content}
      </div>
    </AppShell>
  );
}

