import { useThemeContext } from './ThemeProvider.jsx'

/**
 * { dark, toggle }. Thin wrapper kept for existing consumers (ThemeButton, GlobeView);
 * the real state lives in ThemeProvider so it is shared, persisted and flash-free.
 */
export function useTheme() {
  const { dark, toggle } = useThemeContext()
  return { dark, toggle }
}
