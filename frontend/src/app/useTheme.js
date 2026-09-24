import { useCallback, useSyncExternalStore } from 'react'

// The theme lives on <html class="dark"> (same switch the landing page uses), so every
// toggle on every screen stays in sync by observing that class.
function subscribe(callback) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const getSnapshot = () => document.documentElement.classList.contains('dark')
const getServerSnapshot = () => false

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const toggle = useCallback(() => {
    document.documentElement.classList.toggle('dark')
  }, [])
  return { dark, toggle }
}
