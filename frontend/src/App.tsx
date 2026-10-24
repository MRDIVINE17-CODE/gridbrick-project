import { BookOpen, CalendarClock, Gauge, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApi } from './api'
import { ConfidencePicker, ErrorNote, GatePicker, Loading } from './components/common'
import type { GateId, Meta } from './types'
import { AccuracyView } from './views/AccuracyView'
import { DeskView } from './views/DeskView'
import { HorizonView } from './views/HorizonView'
import { MethodView } from './views/MethodView'

const TABS = [
  { id: 'desk', label: 'Day-ahead desk', icon: CalendarClock },
  { id: 'accuracy', label: 'Forecast accuracy', icon: Gauge },
  { id: 'horizon', label: 'Forecast horizon', icon: Timer },
  { id: 'method', label: 'Method and data', icon: BookOpen },
] as const
type TabId = (typeof TABS)[number]['id']

// View state lives in the query string so any screen can be linked to directly.
function readParams() {
  const p = new URLSearchParams(window.location.search)
  return {
    tab: (TABS.some((t) => t.id === p.get('view')) ? p.get('view') : 'desk') as TabId,
    gate: p.get('gate') as GateId | null,
    confidence: p.get('confidence') ? Number(p.get('confidence')) : null,
    date: p.get('date'),
  }
}

export default function App() {
  const meta = useApi<Meta>('/api/meta')
  const initial = readParams()
  const [tab, setTab] = useState<TabId>(initial.tab)
  const [gate, setGate] = useState<GateId | null>(initial.gate)
  const [confidence, setConfidence] = useState<number | null>(initial.confidence)
  const [date, setDate] = useState<string | null>(initial.date)

  const m = meta.data
  const gateId = gate && m?.gates.some((g) => g.id === gate) ? gate : (m?.defaultGate ?? 'epex-60')
  const level = confidence && m?.confidenceLevels.includes(confidence) ? confidence : (m?.defaultConfidence ?? 0.9)
  const day = date && m?.deliveryDays.includes(date) ? date : (m?.deliveryDays[13] ?? '2026-01-15')

  useEffect(() => {
    const p = new URLSearchParams({ view: tab, gate: gateId, confidence: String(level), date: day })
    window.history.replaceState(null, '', `?${p}`)
  }, [tab, gateId, level, day])

  const openDay = (d: string) => {
    setDate(d)
    setTab('desk')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <header className="masthead">
        <div className="masthead__row">
          <div className="wordmark">
            <svg width="44" height="44" viewBox="0 0 32 32" aria-hidden>
              <path d="M5 12c4-3 8 3 12 0s6-3 9-1" fill="none" stroke="#DCEBF1" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M5 19c4-3 8 3 12 0s6-3 9-1" fill="none" stroke="#DCEBF1" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
              <circle cx="23" cy="25" r="2.6" fill="#E04BA6" />
            </svg>
            <div>
              <p className="wordmark__name">Leeway</p>
              <p className="wordmark__tag">Wind you can count on, for every day-ahead bid</p>
            </div>
          </div>
          <div className="masthead__source">
            <strong>GB national wind, pilot for January 2026.</strong> Elexon outturn and forecasts, judged at the moment bids
            close.
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Views">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              <Icon size={17} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="page">
        {meta.state === 'error' && <ErrorNote message={meta.error} />}
        {!m && meta.state === 'loading' && <Loading label="Loading the January data" />}
        {m && (
          <>
            {(tab === 'desk' || tab === 'accuracy') && (
              <div className="controls">
                <GatePicker gates={m.gates} value={gateId} onChange={setGate} />
                <ConfidencePicker levels={m.confidenceLevels} value={level} onChange={setConfidence} />
              </div>
            )}
            {tab === 'desk' && <DeskView meta={m} gate={gateId} confidence={level} date={day} onDate={setDate} />}
            {tab === 'accuracy' && <AccuracyView gate={gateId} confidence={level} onPickDay={openDay} />}
            {tab === 'horizon' && <HorizonView meta={m} gate={gateId} />}
            {tab === 'method' && <MethodView meta={m} />}
          </>
        )}
      </main>
    </>
  )
}
