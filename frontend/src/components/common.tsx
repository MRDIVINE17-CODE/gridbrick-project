import { CircleAlert, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Gate, GateId } from '../types'

export function Loading({ label = 'Loading data' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <LoaderCircle size={18} className="spin" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="state state--error" role="alert">
      <CircleAlert size={18} aria-hidden />
      {message}. Check that the API is running, then reload the page.
    </div>
  )
}

export function Sheet({
  title,
  note,
  aside,
  children,
}: {
  title: string
  note?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="sheet">
      <div className="sheet__head">
        <div>
          <h2 className="sheet__title">{title}</h2>
          {note && <p className="sheet__note">{note}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Figure({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string
  value: string
  unit?: string
  note?: ReactNode
  tone?: 'hazard' | 'held'
}) {
  return (
    <figure className={`figure${tone ? ` figure--${tone}` : ''}`}>
      <div className="figure__label">{label}</div>
      <div className="figure__value">
        {value}
        {unit && <span className="figure__unit">{unit}</span>}
      </div>
      {note && <div className="figure__note">{note}</div>}
    </figure>
  )
}

export type LegendKind = 'line' | 'dash' | 'band'

export function Legend({ items }: { items: { label: string; color: string; kind?: LegendKind }[] }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label} className="legend__item">
          <span
            className={`legend__swatch${item.kind === 'band' ? ' legend__swatch--band' : ''}${item.kind === 'dash' ? ' legend__swatch--dash' : ''}`}
            style={item.kind === 'dash' ? { color: item.color } : { background: item.color }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

export function GatePicker({ gates, value, onChange }: { gates: Gate[]; value: GateId; onChange: (id: GateId) => void }) {
  return (
    <div className="control">
      <span className="control__label" id="gate-label">
        Auction
      </span>
      <div className="segmented" role="group" aria-labelledby="gate-label">
        {gates.map((gate) => (
          <button
            key={gate.id}
            type="button"
            className="segmented__item"
            aria-pressed={gate.id === value}
            onClick={() => onChange(gate.id)}
          >
            <span className="segmented__main">
              {gate.venue} {gate.id === 'epex-30' ? '30-min' : ''}
            </span>
            <span className="segmented__sub">Bids close {gate.closes}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ConfidencePicker({
  levels,
  value,
  onChange,
}: {
  levels: number[]
  value: number
  onChange: (level: number) => void
}) {
  return (
    <div className="control">
      <span className="control__label" id="conf-label">
        Firm wind confidence
      </span>
      <div className="segmented" role="group" aria-labelledby="conf-label">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            className="segmented__item"
            aria-pressed={level === value}
            onClick={() => onChange(level)}
          >
            <span className="segmented__main">{Math.round(level * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
