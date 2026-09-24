import { useEffect, useState } from 'react'

const QUERY = '(max-width: 640px)'

/** Below this width EventPanel becomes a bottom sheet instead of a right-hand drawer. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(QUERY).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return undefined
    const onChange = (e) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
