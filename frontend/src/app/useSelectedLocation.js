import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_LOCATION } from '../config/locations.config.js'

const STORAGE_KEY = 'cp.location'

function isLocation(value) {
  return (
    value && typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Number.isFinite(value.lat) && Number.isFinite(value.lng)
  )
}

function readStored() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return isLocation(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** [location, setLocation] — the LOCAL view's chosen point, persisted across reloads. */
export function useSelectedLocation() {
  const [location, setLocationState] = useState(() => readStored() ?? DEFAULT_LOCATION)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
    } catch {
      /* private mode: selection just won't survive a reload */
    }
  }, [location])

  const setLocation = useCallback((next) => setLocationState(next), [])
  return [location, setLocation]
}
