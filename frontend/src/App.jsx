import { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import LandingPage from './landing/LandingPage.jsx'

// AppShell pulls in framer-motion, leaflet and the globe; load it on demand so the
// landing page's bundle stays free of all three.
const AppShell = lazy(() => import('./app/AppShell.jsx'))

// docs/CONTRACT.md's demo harness - not linked from the app, load on demand too.
const ContractDemo = lazy(() => import('./ContractDemo.jsx'))

// Land at the top of the page after a real page change (/ -> /app). Switching between the
// global and local views is an in-page crossfade, not a navigation, so it must NOT reset
// scroll — that would defeat the whole "smooth morph, not a hard cut" point of it.
function ScrollToTop() {
  const { pathname } = useLocation()
  const previousTop = useRef(null)
  useEffect(() => {
    const top = pathname.split('/')[1] ?? ''
    if (top !== previousTop.current) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    previousTop.current = top
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          {/* Both views live inside one AppShell (state, not a route swap) so the globe never
              unmounts when switching to Local; AppShell reads the pathname itself to know which
              view is active, which keeps both URLs deep-linkable and back/forward-able. */}
          <Route path="/app" element={<AppShell />} />
          <Route path="/app/local" element={<AppShell />} />
          <Route path="/app/*" element={<Navigate to="/app" replace />} />
          <Route path="/contract-demo" element={<ContractDemo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
