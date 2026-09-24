import { useEffect, useRef, useState } from 'react'
import { animate, motion, useInView, useScroll, useSpring } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useReducedMotion } from '../lib/useReducedMotion'

/** Calm, "expo-out" ease used across the landing page's motion — never bouncy. */
export const EASE = [0.16, 1, 0.3, 1]

/** react-router's <Link>, motion-wrapped, so CTAs can get whileHover/whileTap. */
export const MotionLink = motion.create(Link)

function resolveTag(as) {
  return typeof as === 'string' ? motion[as] : as
}

// Only the properties actually requested end up in the animated `initial`/`animate`
// targets. This matters because Framer Motion manages the whole `transform` (or
// `filter`) inline style once a key like `y` or `blur` is present at all — even at 0 —
// which would otherwise silently clobber an element's own CSS-driven transform (e.g.
// the hero's scroll-scrubbed positioning, or `.pulse-stage`'s `translateY(-50%)`
// centering). Omitting unused keys entirely keeps those elements untouched.
function fadeTargets(y, blur) {
  const from = { opacity: 0 }
  const to = { opacity: 1 }
  if (y) { from.y = y; to.y = 0 }
  if (blur) { from.filter = `blur(${blur}px)`; to.filter = 'blur(0px)' }
  return [from, to]
}

/**
 * One-time, mount-triggered entrance (blur + rise + fade). Used only for what's
 * already on screen at first paint (hero, nav) — never scroll-triggered, so it
 * naturally never replays when the user scrolls back up. `as` picks the rendered
 * element/component (default "div"), so it can replace an existing tag in place
 * instead of adding a wrapper.
 */
export function EntryFade({ children, delay = 0, duration = 0.9, y = 16, blur = 10, className, as = 'div', ...rest }) {
  const reduced = useReducedMotion()
  const Tag = resolveTag(as)
  const [from, to] = fadeTargets(y, blur)
  return (
    <Tag
      className={className}
      initial={reduced ? false : from}
      animate={to}
      transition={{ duration: reduced ? 0 : duration, delay: reduced ? 0 : delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/**
 * Drop-in replacement for the old bare IntersectionObserver `Reveal` — same call
 * sites (`<Reveal>`, `<Reveal className="...">`), now Framer Motion powered and
 * blur-aware. Fires once, ~20-25% into the viewport, and never re-hides.
 */
export function Reveal({ children, className = '', y = 28, blur = 6, delay = 0, amount = 0.25, as = 'div', ...rest }) {
  const reduced = useReducedMotion()
  const Tag = resolveTag(as)
  const [from, to] = fadeTargets(y, blur)
  return (
    <Tag
      className={className}
      initial={reduced ? false : from}
      whileInView={to}
      viewport={{ once: true, amount }}
      transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

const staggerContainer = (stagger, delay) => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
})

/** Wraps a group (card grid, alternating row) whose children are `<StaggerItem>`s. */
export function StaggerGroup({ children, className, stagger = 0.1, delay = 0, amount = 0.25, ...rest }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={reduced ? undefined : staggerContainer(stagger, delay)}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** A single staggered child of `<StaggerGroup>`. `x` lets a side-by-side visual slide in from its own side. */
export function StaggerItem({ children, className, y = 24, x = 0, blur = 0, as = 'div', ...rest }) {
  const reduced = useReducedMotion()
  const Tag = resolveTag(as)
  const hidden = {}
  const visible = { opacity: 1, transition: { duration: reduced ? 0 : 0.55, ease: EASE } }
  if (!reduced) {
    hidden.opacity = 0
    if (y) { hidden.y = y; visible.y = 0 }
    if (x) { hidden.x = x; visible.x = 0 }
    if (blur) { hidden.filter = `blur(${blur}px)`; visible.filter = 'blur(0px)' }
  } else {
    hidden.opacity = 1
  }
  return (
    <Tag className={className} variants={{ hidden, visible }} {...rest}>
      {children}
    </Tag>
  )
}

/** Slim fixed bar at the very top of the page tracking overall scroll progress. */
export function ScrollProgressBar() {
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 })
  if (reduced) return null
  return (
    <motion.div
      aria-hidden="true"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 60,
        background: 'var(--accent)', transformOrigin: '0% 50%', scaleX,
      }}
    />
  )
}

/** Counts up to `value` once it scrolls into view. Reduced motion: jumps straight to the final number. */
export function CountUp({ value, decimals = 0, className, duration = 1.2 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduced = useReducedMotion()
  const [text, setText] = useState((reduced ? value : 0).toFixed(decimals))
  useEffect(() => {
    if (!inView) return
    if (reduced) { setText(value.toFixed(decimals)); return }
    const controls = animate(0, value, { duration, ease: EASE, onUpdate: (v) => setText(v.toFixed(decimals)) })
    return () => controls.stop()
  }, [inView, reduced, value, decimals, duration])
  return <span ref={ref} className={className}>{text}</span>
}
