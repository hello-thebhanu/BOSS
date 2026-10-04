import type { ReactNode } from 'react';
export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function OfflineState({
  title = 'Local service not connected',
  badge = 'LOCAL SERVICE STATUS',
  children,
}: {
  title?: string;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <section className="panel empty">
      <div className="status">{badge}</div>
      <h2>{title}</h2>
      <p>{children ?? 'This interface is ready, but its underlying local service has not been connected yet.'}</p>
    </section>
  );
}

export function StatusBadge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'cyan' | 'green' | 'violet' | 'amber' | 'red';
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <i />
      {children}
    </span>
  );
}
