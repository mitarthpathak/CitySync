import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Also read by the inline script in index.html (must match exactly).
export const THEME_KEY = 'cp.theme'

const ThemeContext = createContext(null)

/**
 * Provides { theme: "light" | "dark", setTheme, toggle } and keeps the `dark` class on
 * <html> in sync (every themed stylesheet in this app, including the landing page, keys
 * off that class). The class is already set correctly before React ever runs by the
 * inline script in index.html, so there is no flash of the wrong theme on load; this
 * provider's initial state just reads that same class back.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* private mode: theme just won't survive a reload */
    }
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
