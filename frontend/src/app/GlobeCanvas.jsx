import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createGlobeScene } from './globe/createGlobeScene.js'

/**
 * Full-bleed three.js canvas for the globe area. Sizes itself to its parent, handles
 * device pixel ratio, pauses when the tab is hidden and cleans up on unmount.
 * Build the actual globe in ./globe/createGlobeScene.js.
 */
export default function GlobeCanvas({ layers, events = [], dark = false }) {
  const hostRef = useRef(null)
  const apiRef = useRef({})
  const stateRef = useRef({ dark, layers, events })

  // Keep the scene informed about theme / layer / event changes.
  useEffect(() => {
    stateRef.current = { dark, layers, events }
    apiRef.current.update?.(stateRef.current)
  }, [dark, layers, events])

  useEffect(() => {
    const host = hostRef.current
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return undefined // no WebGL: leave the area empty rather than crash the page
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.className = 'cp-globe-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    const api = createGlobeScene({ THREE, scene, camera, renderer, state: stateRef.current }) || {}
    apiRef.current = api

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      api.resize?.(w, h)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const clock = new THREE.Clock()
    let raf = 0
    const tick = () => {
      api.frame?.(clock.getDelta())
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        clock.getDelta() // drop the time spent hidden
        raf = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
      api.dispose?.()
      apiRef.current = {}
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div ref={hostRef} className="cp-globe" role="img" aria-label="Interactive globe">
      {import.meta.env.DEV && (
        <p className="cp-globe-slot">three.js canvas · build the globe in src/app/globe/createGlobeScene.js</p>
      )}
    </div>
  )
}
