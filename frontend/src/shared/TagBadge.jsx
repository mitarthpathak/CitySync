import { TAGS } from '../lib/contract'

// Colors are intentionally loud for SIMULATED - it must never read as real data.
const STYLE = {
  [TAGS.REAL_LIVE]: { label: 'Live', background: '#1cb98a', color: '#04140f' },
  [TAGS.REAL_STATIC]: { label: 'Static', background: '#6c706b', color: '#f5f5f2' },
  [TAGS.MEDIA_REPORTED]: { label: 'Reported', background: '#3b82f6', color: '#0a1330' },
  [TAGS.ESTIMATED]: { label: 'Estimated', background: '#eab308', color: '#241a02' },
  [TAGS.SIMULATED]: { label: 'Simulated', background: '#f5f5f2', color: '#b3261e', border: '1.5px dashed #b3261e' },
}

/** Renders one of the five honesty tags. Never hides SIMULATED. */
export default function TagBadge({ tag, className }) {
  const style = STYLE[tag]
  if (!style) throw new Error(`TagBadge: unknown tag "${tag}"`)
  return (
    <span
      className={className}
      title={tag}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999,
        fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
        background: style.background, color: style.color, border: style.border || 'none',
      }}
    >
      {style.label}
    </span>
  )
}
