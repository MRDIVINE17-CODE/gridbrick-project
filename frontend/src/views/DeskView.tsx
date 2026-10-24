import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '../api'
import { DayChart } from '../components/DayChart'
import { RunTimeline } from '../components/RunTimeline'
import { ErrorNote, Figure, Legend, Loading, Sheet } from '../components/common'
import { dateOf, fmtDayLong, fmtDayNum, fmtDayShort, fmtDuration, fmtTime, fmtWeekday, gw, gwh, pct, shiftDate } from '../format'
import { C } from '../theme'
import type { Accuracy, DayView, GateId, Meta } from '../types'

export function DeskView({
  meta,
  gate,
  confidence,
  date,
  onDate,
}: {
  meta: Meta
  gate: GateId
  confidence: number
  date: string
  onDate: (date: string) => void
}) {
  const day = useApi<DayView>(`/api/day/${date}?gate=${gate}&confidence=${confidence}`)
  const accuracy = useApi<Accuracy>(`/api/accuracy?gate=${gate}`)
  const [showRevisions, setShowRevisions] = useState(true)
  const first = meta.deliveryDays[0]
  const last = meta.deliveryDays[meta.deliveryDays.length - 1]

  return (
    <>
      <DayStrip days={meta.deliveryDays} selected={date} onSelect={onDate} accuracy={accuracy.data} />

      <div className="dayhead">
        <button
          type="button"
          className="iconbtn"
          aria-label="Previous delivery day"
          disabled={date <= first}
          onClick={() => onDate(shiftDate(date, -1))}
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="dayhead__title">{fmtDayLong(dateOf(date))}</h1>
        <button
          type="button"
          className="iconbtn"
          aria-label="Next delivery day"
          disabled={date >= last}
          onClick={() => onDate(shiftDate(date, 1))}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {day.state === 'error' && <ErrorNote message={day.error} />}
      {!day.data && day.state === 'loading' && <Loading />}
      {day.data && (
        <div className={day.state === 'loading' ? 'is-stale' : undefined}>
          <DayBody day={day.data} showRevisions={showRevisions} onToggle={setShowRevisions} />
        </div>
      )}
    </>
  )
}

function DayBody({
  day,
  showRevisions,
  onToggle,
}: {
  day: DayView
  showRevisions: boolean
  onToggle: (value: boolean) => void
}) {
  const s = day.summary
  const used = day.decisionRun.publishTimes.at(-1)
  const closesAt = day.gate.closesAt!
  const level = Math.round(day.confidence * 100)
  const margin = day.margins[String(day.confidence)]
  const deliveryStart = day.points[0].time
  const deliveryEnd = new Date(new Date(day.points.at(-1)!.time).getTime() + 30 * 60_000).toISOString()
  const energyGap = s.forecastEnergyGWh - s.actualEnergyGWh

  return (
    <>
      <p className="lede">
        Bids for this day closed on <strong>{fmtDayShort(closesAt)} at {fmtTime(closesAt)}</strong> ({day.gate.venue}).
        {used && (
          <>
            {' '}
            The newest wind forecast at that moment was the <strong>{fmtTime(used)} run</strong>, already{' '}
            {fmtDuration(day.decisionRun.ageAtGateMinutes ?? 0)} old, looking {Math.round(day.decisionRun.horizonHours![0])} to{' '}
            {Math.round(day.decisionRun.horizonHours![1])} hours ahead.
          </>
        )}
      </p>

      <div className="runline">
        <div className="runline__title">
          <span>Wind forecast runs from Elexon, eight a day</span>
          <Legend
            items={[
              { label: 'Used for the bid', color: C.forecast },
              { label: 'Available, older', color: C.ink2 },
              { label: 'Published after bids closed', color: C.ink3 },
            ]}
          />
        </div>
        <RunTimeline deliveryStart={deliveryStart} deliveryEnd={deliveryEnd} closesAt={closesAt} revisions={day.revisions} />
      </div>

      <Sheet
        title="Wind generation across the delivery day"
        note={
          <>
            The firm line is the forecast minus a {gw(margin, 1)} GW margin: on {level}% of January hours, wind came in at or
            above it. The shaded band is the 10th to 90th percentile range of outcomes.
          </>
        }
        aside={
          <div style={{ display: 'grid', gap: 10, justifyItems: 'end' }}>
            <Legend
              items={[
                { label: 'Actual', color: C.ink },
                { label: 'Forecast at bid time', color: C.forecast },
                { label: `Firm wind (${level}%)`, color: C.held, kind: 'dash' },
                { label: 'Likely range', color: C.shallows, kind: 'band' },
              ]}
            />
            <label className="toggle">
              <input type="checkbox" checked={showRevisions} onChange={(e) => onToggle(e.target.checked)} />
              Show forecasts published after bids closed
            </label>
          </div>
        }
      >
        <DayChart day={day} showRevisions={showRevisions} />
      </Sheet>

      <div className="figures">
        <Figure label="Forecast at bid time" value={gwh(s.forecastEnergyGWh)} unit="GWh" note="Wind energy expected for the day" />
        <Figure
          label="Actual wind"
          value={gwh(s.actualEnergyGWh)}
          unit="GWh"
          tone={energyGap > 0 ? 'hazard' : 'held'}
          note={`${energyGap > 0 ? 'Short' : 'Long'} by ${gwh(Math.abs(energyGap))} GWh against the forecast`}
        />
        <Figure
          label={`Firm wind at ${level}%`}
          value={gwh(s.firmEnergyGWh)}
          unit="GWh"
          tone="held"
          note="Plan on this much wind; buy the rest"
        />
        <Figure label="Typical hourly miss" value={gw(s.mae, 2)} unit="GW" note={`Mean absolute error, ${pct(s.nmae ?? 0)} of output`} />
        <Figure
          label="Hours below the firm line"
          value={`${s.hoursBelowFirm}`}
          unit={`of ${s.count}`}
          tone={s.hoursBelowFirm > 0 ? 'hazard' : undefined}
          note={s.hoursBelowFirm > 0 ? 'Wind fell short of the plan' : 'The plan held all day'}
        />
      </div>
    </>
  )
}

function DayStrip({
  days,
  selected,
  onSelect,
  accuracy,
}: {
  days: string[]
  selected: string
  onSelect: (date: string) => void
  accuracy?: Accuracy
}) {
  const mae = new Map(accuracy?.daily.map((d) => [d.date, d.mae]))
  const maxMae = Math.max(1, ...(accuracy?.daily.map((d) => d.mae) ?? [1]))
  return (
    <div>
      <div className="calendar" role="group" aria-label="Delivery day">
        {days.map((d) => {
          const value = mae.get(d)
          return (
            <button
              key={d}
              type="button"
              className="calendar__day"
              aria-pressed={d === selected}
              aria-label={`${fmtDayLong(dateOf(d))}${value !== undefined ? `, typical miss ${gw(value)} GW` : ''}`}
              onClick={() => onSelect(d)}
            >
              <span className="calendar__wd">{fmtWeekday(dateOf(d))}</span>
              <span className="calendar__num">{fmtDayNum(dateOf(d))}</span>
              <span className="calendar__heat" style={{ background: value === undefined ? C.rule : heat(value / maxMae) }} />
            </button>
          )
        })}
      </div>
      <div className="calendar__legend">
        Typical forecast miss per delivery day
        <span className="calendar__ramp" style={{ background: `linear-gradient(90deg, ${heat(0)}, ${heat(0.5)}, ${heat(1)})` }} />
        small to large
      </div>
    </div>
  )
}

/** 0..1 -> shallows blue through to chart magenta. */
function heat(v: number) {
  const stops = [
    [220, 235, 241],
    [123, 160, 196],
    [176, 23, 124],
  ]
  const x = Math.min(1, Math.max(0, v)) * 2
  const [a, b] = x <= 1 ? [stops[0], stops[1]] : [stops[1], stops[2]]
  const f = x <= 1 ? x : x - 1
  const c = a.map((ch, i) => Math.round(ch + (b[i] - ch) * f))
  return `rgb(${c.join(',')})`
}
