import { useEffect, useState } from 'react'

const format = (date) => `${date.toISOString().slice(11, 19)} UTC`

/** "HH:MM:SS UTC", ticking every second. */
export function useUtcClock() {
  const [time, setTime] = useState(() => format(new Date()))
  useEffect(() => {
    const id = setInterval(() => setTime(format(new Date())), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}
