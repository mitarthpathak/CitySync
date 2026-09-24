import { useState } from 'react'
import LocalView from './local/LocalView'
import { GlobeView } from './globe/GlobeView'

/**
 * Lead-owned demo harness for docs/CONTRACT.md's pipeline (routed at
 * /contract-demo). Exercises the new /api/local + /api/globe envelopes without
 * touching the real dashboard in src/app/AppShell.jsx. Not linked from the
 * landing page or the app - open the URL directly.
 */
export default function ContractDemo() {
  const [tab, setTab] = useState('globe')
  return (
    <div style={{ padding: 32, fontFamily: 'Arial, Helvetica, sans-serif', maxWidth: 640, margin: '0 auto' }}>
      <h1>Contract demo</h1>
      <p style={{ color: '#6c706b' }}>Toggles between feat/local's and feat/globe's stub integration points. See docs/CONTRACT.md.</p>
      <div role="tablist" style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <button role="tab" aria-selected={tab === 'globe'} onClick={() => setTab('globe')}>Globe</button>
        <button role="tab" aria-selected={tab === 'local'} onClick={() => setTab('local')}>Local</button>
      </div>
      {tab === 'globe' ? <GlobeView onOpenLocal={() => setTab('local')} /> : <LocalView />}
    </div>
  )
}
