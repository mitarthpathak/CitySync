import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, Check, ChevronDown, Circle, CloudRain, Globe2, Menu, Moon, Radio, ShieldCheck, Sun, Waves, Wind, X } from 'lucide-react'

const fragments = [
  { label: 'AQI', value: '42', className: 'fragment-aqi' },
  { label: 'QUAKE', value: '2.1', className: 'fragment-quake' },
  { label: 'TRAFFIC', value: '68%', className: 'fragment-traffic' },
  { label: 'CROWD', value: 'LOW', className: 'fragment-crowd' },
  { label: 'WIND', value: '14 km/h', className: 'fragment-wind' },
]

function Logo() {
  return <a href="#top" className="logo" aria-label="CitySync home"><span className="logo-mark"><span /><span /><span /></span><span>CitySync</span></a>
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
  return <header className="site-nav"><div className="container nav-inner"><Logo /><nav className={open ? 'nav-links is-open' : 'nav-links'} aria-label="Main navigation"><a href="#how-it-works" onClick={() => setOpen(false)}>How it works</a><a href="#features" onClick={() => setOpen(false)}>Features</a><a href="#about" onClick={() => setOpen(false)}>About</a><Link className="nav-cta" to="/app" onClick={() => setOpen(false)}>Enter the live app <ArrowRight /></Link></nav><div className="nav-actions"><ThemeToggle /><button className="menu-button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div></div></header>
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
  return <section id="hero-scrolly" className="hero-scrolly"><div className="hero-sticky"><div className="container hero-content"><div className="hero-copy" style={{ opacity: 1 - Math.max(0, progress - .1) * 1.6, transform: `translateY(${progress * -40}px)` }}><p className="eyebrow"><span className="live-dot" /> Live civic intelligence</p><h1>Know your city.<br /><em>In a heartbeat.</em></h1><p className="hero-sub">CitySync turns the noise of a living city into one clear, human pulse.</p><Link to="/app" className="button button-primary">See the pulse <ArrowRight /></Link></div><div className={`pulse-stage ${assembled ? 'is-assembled' : ''}`} style={{ '--progress': progress }}><div className="stage-grid" />{fragments.map((fragment, index) => <div key={fragment.label} className={`data-fragment ${fragment.className}`} style={{ '--i': index, '--tx': `${(index % 2 ? 1 : -1) * (1 - progress) * 90}px`, '--ty': `${(index % 3 - 1) * (1 - progress) * 70}px` }}><span>{fragment.label}</span><strong>{fragment.value}</strong></div>)}<div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="pulse-core"><div className="pulse-ring ring-one" /><div className="pulse-ring ring-two" /><Globe2 /></div><div className="hero-resolve">One glance. The whole neighbourhood.<Link to="/app" className="text-link">Enter the live app <ArrowRight /></Link></div></div></div><div className="scroll-cue"><span>Scroll to assemble</span><ChevronDown /></div></div></section>
}

function Reveal({ children, className = '' }) { const [visible, setVisible] = useState(false); const ref = useRef(null); useEffect(() => { if (!ref.current) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } }, { threshold: .14 }); observer.observe(ref.current); return () => observer.disconnect() }, []); return <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`}>{children}</div> }

function Problem() { return <section className="section problem-section"><div className="container problem-grid"><Reveal><p className="eyebrow">The problem</p><h2>A city is speaking.<br /><em>It&apos;s just speaking everywhere.</em></h2></Reveal><Reveal className="problem-copy"><p>Weather in one tab. Traffic in another. A neighbourhood alert buried in a feed you don&apos;t follow. Civic data lives in a dozen silos — and residents learn about the flooded underpass after they&apos;re already stuck in it.</p><div className="contrast"><div className="scatter"><span>WEATHER</span><span>TRAFFIC</span><span>ALERTS</span><span>AIR</span><span>EVENTS</span></div><ArrowRight /><div className="unified"><span className="mini-pulse" /> One clear pulse</div></div></Reveal></div></section> }

const steps = [{ n: '01', title: 'Ingest', text: 'We gather the signals that shape daily life — continuously and quietly.', icon: Radio }, { n: '02', title: 'Fuse', text: 'We normalize and connect them, so the important patterns can surface.', icon: Waves }, { n: '03', title: 'Understand', text: 'We translate complexity into a plain-language read of what is happening now.', icon: ShieldCheck }]
function HowItWorks() { return <section id="how-it-works" className="section steps-section"><div className="container"><Reveal><p className="eyebrow">How it works</p><h2>From signal to <em>shared sense.</em></h2></Reveal><div className="steps-grid">{steps.map((step) => <Reveal key={step.n}><article className="step-card"><div className="step-top"><span>{step.n}</span><step.icon /></div><h3>{step.title}</h3><p>{step.text}</p><div className="step-line" /></article></Reveal>)}</div></div></section> }

function ProductVisual({ type }) { if (type === 'globe') return <div className="product-visual globe-visual"><div className="globe-lines" /><div className="globe-dot dot-one" /><div className="globe-dot dot-two" /><span className="visual-label">GLOBAL / LIVE</span></div>; if (type === 'local') return <div className="product-visual local-visual"><div className="dashboard-top"><span>AMER, JAIPUR</span><b>ACTIVE</b></div><div className="dashboard-verdict">A little more movement<br /><em>than usual.</em></div><div className="tile-row"><span>28°<small>WEATHER</small></span><span>42<small>AIR QUALITY</small></span><span>14<small>INCIDENTS</small></span></div><div className="map-lines" /></div>; return <div className="product-visual pulse-visual"><span className="visual-label">CITY PULSE / NOW</span><div className="big-verdict">Calm<span>.</span></div><div className="heartbeat"><span /><span /><span /><span /><span /></div><p>Conditions are steady across the area.</p></div> }

const features = [{ type: 'globe', kicker: '01 / See the whole picture', title: 'A global view, without the global noise.', text: 'Track events as they unfold around the world. Severity is visible at a glance, so you know where to look closer.' }, { type: 'local', kicker: '02 / Go one level deeper', title: 'The detail you need, where you need it.', text: 'Open any area for a focused read: live tiles, local context, and a map that makes the situation legible.' }, { type: 'pulse', kicker: '03 / Start with the verdict', title: 'A calm answer to a complicated question.', text: 'Calm, Active, or Alert. The Pulse gives you a useful starting point — then shows its work.' }]
function Features() { return <section id="features" className="section features-section"><div className="container">{features.map((feature, index) => <Reveal key={feature.type} className={`feature-row ${index % 2 ? 'reverse' : ''}`}><ProductVisual type={feature.type} /><div className="feature-copy"><p className="eyebrow">{feature.kicker}</p><h2>{feature.title}</h2><p>{feature.text}</p><Link to={feature.type === 'local' ? '/app/local' : '/app'} className="text-link">Explore the live view <ArrowRight /></Link></div></Reveal>)}</div></section> }

function TrustSection() { return <section id="about" className="section trust-section"><div className="container trust-grid"><Reveal><p className="eyebrow">Built to be believed</p><h2>Useful context.<br /><em>Honest signals.</em></h2></Reveal><div className="trust-cards"><Reveal><article><Check /><div><h3>Honest by design</h3><p>Live and simulated data are always labelled. You should never have to guess what you&apos;re looking at.</p></div></article></Reveal><Reveal><article><BarChart3 /><div><h3>Correlations, not conclusions</h3><p>We surface possible links across feeds — and frame them as possibilities, not facts.</p></div></article></Reveal></div></div></section> }

function Stats() { return <section className="stats-section"><div className="container stats-grid"><div><strong>24<span>+</span></strong><p>live feeds fused</p></div><div><strong>2.4<span>M</span></strong><p>events processed daily</p></div><div><strong>10<span>s</span></strong><p>to understand an area</p></div></div></section> }

function Closing() { return <section id="enter" className="closing-section"><div className="container closing-inner"><p className="eyebrow">The city, made legible</p><h2>Take a better pulse<br /><em>on where you live.</em></h2><Link to="/app" className="button button-primary">Enter the live app <ArrowRight /></Link></div></section> }
function Footer() { return <footer className="site-footer"><div className="container footer-inner"><Logo /><p>Clarity for living cities.</p><div><a href="#about">About</a><a href="#features">Features</a><a href="#top">Back to top ↑</a></div><small>© 2026 CitySync</small></div></footer> }

export default function LandingPage() { return <><Nav /><main id="top"><Hero /><Problem /><HowItWorks /><Features /><TrustSection /><Stats /><Closing /></main><Footer /></> }
