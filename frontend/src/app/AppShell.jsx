import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'
import ThemeButton from './ThemeButton.jsx'

export default function AppShell() {
  const { pathname } = useLocation()
  const view = pathname.replace(/\/+$/, '').endsWith('/local') ? 'local' : 'global'

  // The app has its own palette; scope it to <body> while this screen is mounted.
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'CityPulse: Live overview'
    document.body.classList.add('cp-body')
    return () => {
      document.title = previousTitle
      document.body.classList.remove('cp-body')
    }
  }, [])

  return (
    <div className="cp-app">
      <Header view={view} />
      <main className="cp-main">
        <Outlet />
      </main>
      <ThemeButton className="cp-float-theme" />
    </div>
  )
}
