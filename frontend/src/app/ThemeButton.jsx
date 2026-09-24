import { Moon, Sun } from 'lucide-react'
import { useTheme } from './useTheme.js'

export default function ThemeButton({ className = '' }) {
  const { dark, toggle } = useTheme()
  return (
    <button
      type="button"
      className={`cp-iconbtn ${className}`}
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  )
}
