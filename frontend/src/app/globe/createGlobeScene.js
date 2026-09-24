/**
 * >>> YOUR THREE.JS GLOBE GOES HERE <<<
 *
 * GlobeCanvas.jsx owns the plumbing (WebGLRenderer, resize handling, render loop,
 * cleanup). This file is the single place to build the actual globe.
 *
 * Called once when the canvas mounts. Add your meshes / lights to `scene`, position the
 * `camera`, and return any of the hooks below (all optional).
 *
 * @param {object} ctx
 * @param {import('three')} ctx.THREE      the three.js module
 * @param {import('three').Scene} ctx.scene
 * @param {import('three').PerspectiveCamera} ctx.camera
 * @param {import('three').WebGLRenderer} ctx.renderer
 * @param {{ dark: boolean, layers: Record<string, boolean>, events: object[] }} ctx.state
 *        initial UI state; later changes arrive through `update(state)`
 * @returns {{
 *   frame?: (deltaSeconds: number) => void,   // called every animation frame
 *   update?: (state: object) => void,         // theme / layer toggles / new events
 *   resize?: (width: number, height: number) => void,
 *   dispose?: () => void,                     // free your own geometries / textures
 * }}
 */
// eslint-disable-next-line no-unused-vars
export function createGlobeScene({ THREE, scene, camera, renderer, state }) {
  camera.position.set(0, 0, 6)

  // Example:
  //   const globe = new THREE.Mesh(new THREE.SphereGeometry(1.6, 64, 64), material)
  //   scene.add(globe)
  //   return { frame: (dt) => { globe.rotation.y += dt * 0.1 }, dispose: () => { ... } }

  return {}
}
