// Same gentle upward wobble on every tile; only the colour changes.
const POINTS = [
  [0, 10.3], [6, 9.3], [11, 11], [16.7, 10.3], [22.3, 7.7], [27.7, 5], [33.3, 3],
  [38.3, 2.7], [42.3, 4.3], [47.7, 3.7], [53.3, 2.3], [58.3, 2.7], [64, 1.7], [70.7, 0],
]

// Catmull-Rom -> cubic bezier so the line reads as one smooth curve.
function smoothPath(points, offsetX = 0.5, offsetY = 1) {
  const p = points.map(([x, y]) => [x + offsetX, y + offsetY])
  let d = `M${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = p[i - 1] || p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0]} ${p2[1]}`
  }
  return d
}

const PATH = smoothPath(POINTS)

export default function Sparkline({ tone }) {
  return (
    <svg className={`cp-spark cp-spark--${tone}`} width="72" height="14" viewBox="0 0 72 14" aria-hidden="true">
      <path d={PATH} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
