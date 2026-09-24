/**
 * Status pill. `tone` picks the colour; `dot` adds a leading indicator.
 *
 * tone: neutral | success | warning | danger | info | purple | accent
 */
export default function Pill({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span className={`nx-pill nx-pill--${tone} ${className}`.trim()}>
      {dot && <span className="nx-pill__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
