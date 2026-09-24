import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, Check, ChevronDown, Circle, CloudRain, Globe2, Menu, Moon, Radio, ShieldCheck, Sun, Waves, Wind, X } from 'lucide-react'
import { CountUp, EntryFade, MotionLink, Reveal, ScrollProgressBar, StaggerGroup, StaggerItem } from './motion'

const fragments = [
  { label: 'AQI', value: '42', className: 'fragment-aqi' },
  { label: 'QUAKE', value: '2.1', className: 'fragment-quake' },
  { label: 'TRAFFIC', value: '68%', className: 'fragment-traffic' },
  { label: 'CROWD', value: 'LOW', className: 'fragment-crowd' },
  { label: 'WIND', value: '14 km/h', className: 'fragment-wind' },
]

function Logo() {
  const maskId = useId()
  return (
    <a href="#top" className="logo" aria-label="CitySync home">
      <svg className="logo-mark" viewBox="0 0 44 30" aria-hidden="true">
        <mask id={maskId}>
          <rect x="0" y="0" width="44" height="30" fill="#fff" />
          <rect x="24" y="9" width="10" height="10" rx="4" fill="#000" />
        </mask>
        <rect x="18" y="3" width="22" height="22" rx="8" fill="#1cb98a" mask={`url(#${maskId})`} />
        <circle cx="14" cy="15" r="14" fill="currentColor" />
      </svg>
      <span>CitySync</span>
    </a>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => { setDark(document.documentElement.classList.contains('dark')) }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }
  return <button className="icon-button" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun /> : <Moon />}</button>
}

function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <EntryFade as="header" className="site-nav" y={0} blur={0} duration={0.7} delay={0.5}>
      <div className="container nav-inner">
        <Logo />
        <nav className={open ? 'nav-links is-open' : 'nav-links'} aria-label="Main navigation">
          <a href="#how-it-works" onClick={() => setOpen(false)}>How it works</a>
          <a href="#features" onClick={() => setOpen(false)}>Features</a>
          <a href="#about" onClick={() => setOpen(false)}>About</a>
          <Link className="nav-cta" to="/app" onClick={() => setOpen(false)}>Enter the live app <ArrowRight /></Link>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          <button className="menu-button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
      </div>
    </EntryFade>
  )
}

function Hero() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const section = document.getElementById('hero-scrolly')
      if (!section) return
      const range = section.offsetHeight - window.innerHeight
      setProgress(Math.max(0, Math.min(1, -section.getBoundingClientRect().top / range)))
    }
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const assembled = progress > 0.68
  return (
    <section id="hero-scrolly" className="hero-scrolly">
      <div className="hero-sticky">
        <div className="container hero-content">
          <div className="hero-copy" style={{ opacity: 1 - Math.max(0, progress - .1) * 1.6, transform: `translateY(${progress * -40}px)` }}>
            <EntryFade as="p" className="eyebrow" delay={0.1} y={14} blur={8}><span className="live-dot" /> Live civic intelligence</EntryFade>
            <EntryFade as="h1" delay={0.18} y={18} blur={10}>Know your city.<br /><em>In a heartbeat.</em></EntryFade>
            <EntryFade as="p" className="hero-sub" delay={0.26} y={14} blur={8}>CitySync turns the noise of a living city into one clear, human pulse.</EntryFade>
            <EntryFade as={MotionLink} to="/app" className="button button-primary" delay={0.34} y={14} blur={6} whileTap={{ scale: 0.97, transition: { duration: 0.15 } }}>See the pulse <ArrowRight /></EntryFade>
          </div>
          <EntryFade
            as="div"
            className={`pulse-stage ${assembled ? 'is-assembled' : ''}`}
            style={{ '--progress': progress }}
            y={0}
            blur={14}
            duration={1.1}
          >
            <div className="stage-grid" />
            {fragments.map((fragment, index) => (
              <div key={fragment.label} className={`data-fragment ${fragment.className}`} style={{ '--i': index, '--tx': `${(index % 2 ? 1 : -1) * (1 - progress) * 90}px`, '--ty': `${(index % 3 - 1) * (1 - progress) * 70}px` }}>
                <span>{fragment.label}</span><strong>{fragment.value}</strong>
              </div>
            ))}
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="pulse-core"><div className="pulse-ring ring-one" /><div className="pulse-ring ring-two" /><Globe2 /></div>
            <div className="hero-resolve">One glance. The whole neighbourhood.<Link to="/app" className="text-link">Enter the live app <ArrowRight /></Link></div>
          </EntryFade>
        </div>
        <div className="scroll-cue"><span>Scroll to assemble</span><ChevronDown /></div>
      </div>
    </section>
  )
}

function Problem() { return <section className="section problem-section"><div className="container problem-grid"><Reveal><p className="eyebrow">The problem</p><h2>A city is speaking.<br /><em>It&apos;s just speaking everywhere.</em></h2></Reveal><Reveal className="problem-copy" delay={0.1}><p>Weather in one tab. Traffic in another. A neighbourhood alert buried in a feed you don&apos;t follow. Civic data lives in a dozen silos — and residents learn about the flooded underpass after they&apos;re already stuck in it.</p><div className="contrast"><div className="scatter"><span>WEATHER</span><span>TRAFFIC</span><span>ALERTS</span><span>AIR</span><span>EVENTS</span></div><ArrowRight /><div className="unified"><span className="mini-pulse" /> One clear pulse</div></div></Reveal></div></section> }

const steps = [{ n: '01', title: 'Ingest', text: 'We gather the signals that shape daily life — continuously and quietly.', icon: Radio }, { n: '02', title: 'Fuse', text: 'We normalize and connect them, so the important patterns can surface.', icon: Waves }, { n: '03', title: 'Understand', text: 'We translate complexity into a plain-language read of what is happening now.', icon: ShieldCheck }]
function HowItWorks() {
  return (
    <section id="how-it-works" className="section steps-section">
      <div className="container">
        <Reveal><p className="eyebrow">How it works</p><h2>From signal to <em>shared sense.</em></h2></Reveal>
        <StaggerGroup className="steps-grid">
          {steps.map((step) => (
            <StaggerItem key={step.n} as="article" className="step-card" whileHover={{ y: -6, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } }}>
              <div className="step-top"><span>{step.n}</span><step.icon /></div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <div className="step-line" />
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

function ProductVisual({ type }) { if (type === 'globe') return <div className="product-visual globe-visual"><div className="globe-lines" /><div className="globe-dot dot-one" /><div className="globe-dot dot-two" /><span className="visual-label">GLOBAL / LIVE</span></div>; if (type === 'local') return <div className="product-visual local-visual"><div className="dashboard-top"><span>AMER, JAIPUR</span><b>ACTIVE</b></div><div className="dashboard-verdict">A little more movement<br /><em>than usual.</em></div><div className="tile-row"><span>28°<small>WEATHER</small></span><span>42<small>AIR QUALITY</small></span><span>14<small>INCIDENTS</small></span></div><div className="map-lines" /></div>; return <div className="product-visual pulse-visual"><span className="visual-label">CITY PULSE / NOW</span><div className="big-verdict">Calm<span>.</span></div><div className="heartbeat"><span /><span /><span /><span /><span /></div><p>Conditions are steady across the area.</p></div> }

const features = [{ type: 'globe', kicker: '01 / See the whole picture', title: 'A global view, without the global noise.', text: 'Track events as they unfold around the world. Severity is visible at a glance, so you know where to look closer.' }, { type: 'local', kicker: '02 / Go one level deeper', title: 'The detail you need, where you need it.', text: 'Open any area for a focused read: live tiles, local context, and a map that makes the situation legible.' }, { type: 'pulse', kicker: '03 / Start with the verdict', title: 'A calm answer to a complicated question.', text: 'Calm, Active, or Alert. The Pulse gives you a useful starting point — then shows its work.' }]

// Below 760px, feature-row stacks to full width (see globals.css) — a horizontal
// slide-in there would push the copy/visual past the viewport edge, so this drops
// back to the same vertical rise every other section uses once space is tight.
function useNarrowViewport() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const onChange = (e) => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

function Features() {
  const narrow = useNarrowViewport()
  return (
    <section id="features" className="section features-section">
      <div className="container">
        {features.map((feature, index) => {
          const fromSide = index % 2 ? 40 : -40
          return (
            <StaggerGroup key={feature.type} className={`feature-row ${index % 2 ? 'reverse' : ''}`} stagger={0.12}>
              <StaggerItem as="div" x={narrow ? 0 : fromSide} y={narrow ? 24 : 0}><ProductVisual type={feature.type} /></StaggerItem>
              <StaggerItem as="div" className="feature-copy" x={narrow ? 0 : -fromSide} y={narrow ? 24 : 0}>
                <p className="eyebrow">{feature.kicker}</p>
                <h2>{feature.title}</h2>
                <p>{feature.text}</p>
                <Link to={feature.type === 'local' ? '/app/local' : '/app'} className="text-link">Explore the live view <ArrowRight /></Link>
              </StaggerItem>
            </StaggerGroup>
          )
        })}
      </div>
    </section>
  )
}

function TrustSection() {
  return (
    <section id="about" className="section trust-section">
      <div className="container trust-grid">
        <Reveal><p className="eyebrow">Built to be believed</p><h2>Useful context.<br /><em>Honest signals.</em></h2></Reveal>
        <StaggerGroup className="trust-cards">
          <StaggerItem as="article" whileHover={{ y: -4, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } }}>
            <Check /><div><h3>Honest by design</h3><p>Live and simulated data are always labelled. You should never have to guess what you&apos;re looking at.</p></div>
          </StaggerItem>
          <StaggerItem as="article" whileHover={{ y: -4, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } }}>
            <BarChart3 /><div><h3>Correlations, not conclusions</h3><p>We surface possible links across feeds — and frame them as possibilities, not facts.</p></div>
          </StaggerItem>
        </StaggerGroup>
      </div>
    </section>
  )
}

const stats = [{ value: 24, decimals: 0, suffix: '+', label: 'live feeds fused' }, { value: 2.4, decimals: 1, suffix: 'M', label: 'events processed daily' }, { value: 10, decimals: 0, suffix: 's', label: 'to understand an area' }]
function Stats() {
  return (
    <section className="stats-section">
      <StaggerGroup className="container stats-grid" stagger={0.12}>
        {stats.map((stat) => (
          <StaggerItem key={stat.label} as="div">
            <strong><CountUp value={stat.value} decimals={stat.decimals} /><span>{stat.suffix}</span></strong>
            <p>{stat.label}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  )
}

function Closing() { return <section id="enter" className="closing-section"><div className="container closing-inner"><Reveal as="p" className="eyebrow">The city, made legible</Reveal><Reveal as="h2" delay={0.08}>Take a better pulse<br /><em>on where you live.</em></Reveal><Reveal as={MotionLink} to="/app" className="button button-primary" delay={0.16} whileTap={{ scale: 0.97, transition: { duration: 0.15 } }}>Enter the live app <ArrowRight /></Reveal></div></section> }
function Footer() { return <footer className="site-footer"><div className="container footer-inner"><Logo /><p>Clarity for living cities.</p><div><a href="#about">About</a><a href="#features">Features</a><a href="#top">Back to top ↑</a></div><small>© 2026 CitySync</small></div></footer> }

export default function LandingPage() {
  return (
    <>
      <ScrollProgressBar />
      <Nav />
      <main id="top"><Hero /><Problem /><HowItWorks /><Features /><TrustSection /><Stats /><Closing /></main>
      <Footer />
    </>
  )
}
