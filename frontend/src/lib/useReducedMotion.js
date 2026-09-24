import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** Live-updating `prefers-reduced-motion: reduce`. Shared by every animated piece of the app. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(QUERY).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return undefined
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
