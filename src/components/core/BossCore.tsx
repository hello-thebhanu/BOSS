import { useAppStore } from '../../app/store/appStore';

/**
 * Living state-driven BOSS orbital core with multi-frequency neural bars,
 * tilted 3D orbital rings, and glowing state indicators.
 */
export function BossCore({ size = 'compact' }: { size?: 'compact' | 'hero' }) {
  const core = useAppStore((state) => state.core);
  return (
    <div className={`boss-core boss-core--${size}`} data-state={core.status} aria-label={`BOSS Core: ${core.status}`}>
      <span className="boss-core__orbit boss-core__orbit--one" />
      <span className="boss-core__orbit boss-core__orbit--two" />
      <span className="boss-core__orbit boss-core__orbit--three" />
      <span className="boss-core__node boss-core__node--one" />
      <span className="boss-core__node boss-core__node--two" />
      <span className="boss-core__sphere">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="boss-core__label">
        <b />
        {core.status}
      </span>
    </div>
  );
}

