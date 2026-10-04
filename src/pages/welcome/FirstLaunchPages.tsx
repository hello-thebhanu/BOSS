import { routes } from '../../app/router/routes';
import { BossCore } from '../../components/core/BossCore';
import { MotionEnginePreview, CinematicTrailer } from '../../motion';

export function WelcomePage() { return <main className="page first-launch"><div className="launch-telemetry">SYS.LOC: [0X42.9902_ALPHA]<br />CORE: READY / LOCAL-FIRST</div><div className="launch-center"><p className="launch-wordmark">BOSS</p><p className="eyebrow">THINK　&gt;　BUILD　&gt;　SOLVE　&gt;　TOGETHER</p><BossCore size="hero" /><h1>Welcome to BOSS.</h1><p className="muted">Your local AI coding companion.</p><a className="button primary" href={routes.trailer}>Experience BOSS　→</a><a className="launch-skip" href={routes.auth}>Skip introduction　→</a></div><footer className="launch-footer">LOCAL-FIRST　•　PRIVATE　•　BUILT FOR DEVELOPERS</footer></main>; }
export function TrailerPage() {
  const isDev = typeof window !== 'undefined' && window.location.search.includes('dev=true');
  if (isDev) {
    return (
      <main className="page first-launch" style={{ padding: '24px 20px' }}>
        <MotionEnginePreview autoPlay={true} />
      </main>
    );
  }
  return <CinematicTrailer />;
}
export function AuthPage() { return <main className="page first-launch auth-page"><section className="auth-identity"><BossCore size="hero" /><p className="launch-wordmark">B O S S</p><p className="eyebrow">THINK　&gt;　BUILD　&gt;　SOLVE　&gt;　TOGETHER</p><p className="muted">The local-first coding system for uncompromising engineers.</p></section><section className="panel auth-card"><div className="auth-tabs"><button className="button">Sign in</button><span>Local Enclave</span></div><h1>Welcome back.</h1><p className="muted">Online sign-in providers are not connected.</p><label>DEVELOPER EMAIL<input disabled placeholder="Not connected" /></label><label>MASTER PASSWORD<input disabled type="password" placeholder="Not connected" /></label><button className="button primary" disabled>Sign in　→</button><a className="auth-local" href={routes.home}><b>CONTINUE LOCALLY</b><span>No account required for local offline development.　→</span></a></section></main>; }
