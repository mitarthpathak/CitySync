import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

/**
 * Provides { theme: "light" | "dark", setTheme, toggle } and keeps the `dark` class on
 * <html> in sync (every themed stylesheet in this app, including the landing page, keys
 * off that class). Deliberately not persisted anywhere (no localStorage, no
 * prefers-color-scheme) - every fresh load's first impression is light; dark only
 * happens for as long as someone has actually clicked the toggle this session. The
 * initial state just reads the live class back, so navigating between routes within
 * one session (e.g. landing -> /app) keeps whatever was already showing.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const setTheme = useCallback((next) => setThemeState(next === 'dark' ? 'dark' : 'light'), [])
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo(() => ({ theme, dark: theme === 'dark', setTheme, toggle }), [theme, setTheme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** { theme, dark, setTheme, toggle }. Must be used under <ThemeProvider>. */
export function useThemeContext() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeContext must be used within <ThemeProvider>')
  return ctx
}
