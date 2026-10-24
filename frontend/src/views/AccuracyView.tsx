import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { useApi } from '../api'
import { ErrorNote, Legend, Loading, Sheet } from '../components/common'
import { dateOf, fmtDateTime, fmtDayNum, fmtDayShort, fmtTime, gw, gwh, pct, signedGw } from '../format'
import { AXIS, C, UNIT_LABEL, gwTick, gwTicks } from '../theme'
import type { Accuracy, GateId } from '../types'

export function AccuracyView({
  gate,
  confidence,
  onPickDay,
}: {
  gate: GateId
  confidence: number
  onPickDay: (date: string) => void
}) {
  const report = useApi<Accuracy>(`/api/accuracy?gate=${gate}`)
  if (report.state === 'error') return <ErrorNote message={report.error} />
  if (!report.data) return <Loading />
  return (
    <div className={report.state === 'loading' ? 'is-stale' : undefined}>
      <AccuracyBody a={report.data} confidence={confidence} onPickDay={onPickDay} />
    </div>
  )
}

function AccuracyBody({ a, confidence, onPickDay }: { a: Accuracy; confidence: number; onPickDay: (date: string) => void }) {
  const s = a.summary
  const overShare = useMemo(() => a.scatter.filter(([f, act]) => f > act).length / a.scatter.length, [a])
  const chosen = a.margins.find((m) => m.confidence === confidence) ?? a.margins[0]
  const level = Math.round(chosen.confidence * 100)

  return (
    <>
      <p className="lede">
        Every hour delivered from {fmtDayShort(dateOf(a.deliveryDays[0]))} to {fmtDayShort(dateOf(a.deliveryDays.at(-1)!))}, judged
        on the forecast that was available when bids closed at <strong>{a.gate.closes}</strong> the day before:{' '}
        {s.count} hours, forecasts {Math.round(a.horizonHours.min)} to {Math.round(a.horizonHours.max)} hours ahead.
      </p>

      <div className="findings">
        <div className="finding">
          <div className="finding__value">{gw(s.mae, 2)} GW</div>
          <p className="finding__text">
            <strong>Typical miss in any hour.</strong> That is {pct(s.nmae ?? 0)} of average wind output (mean absolute error). Half
            of all hours missed by less than {gw(s.medianAbsError, 1)} GW.
          </p>
        </div>
        <div className="finding">
          <div className="finding__value finding__value--hazard">{signedGw(s.bias, 2)} GW</div>
          <p className="finding__text">
            <strong>The forecast ran high.</strong> Wind came in below the forecast in {pct(overShare)} of hours, so the headline
            number overstates what will turn up. That is the gap a buyer ends up covering late.
          </p>
        </div>
        <div className="finding">
          <div className="finding__value finding__value--held">{gw(chosen.marginMW, 1)} GW</div>
          <p className="finding__text">
            <strong>Margin for {level}% confidence.</strong> Plan on the forecast minus this. Re-estimated without each day and
            tested on it, the margin held in {pct(chosen.backtestHeld, 1)} of hours.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <Sheet
          title="How big the misses were"
          note="Forecast minus actual, every January delivery hour. Right of zero, wind fell short of the forecast."
        >
          <ErrorHistogram a={a} />
        </Sheet>
        <Sheet
          title="Margin to hold back"
          note="Subtract the margin from the forecast to get wind you can count on. The test column re-estimates the margin without each day, then checks that day."
        >
          <MarginTable a={a} confidence={confidence} />
        </Sheet>
      </div>

      <div className="grid-2">
        <Sheet
          title="Misses grow with the wind"
          note="Grouped by the forecast level. On very windy hours the forecast overshoots most, a pattern consistent with wind farms being turned down when the grid is congested (not verifiable from these two datasets alone)."
        >
          <LevelChart a={a} />
        </Sheet>
        <Sheet title="Forecast against what happened" note="Each dot is one hour. Dots below the diagonal are hours when wind fell short.">
          <ScatterPlot a={a} />
        </Sheet>
      </div>

      <div className="grid-2">
        <Sheet
          title="Wind energy, forecast and actual, per delivery day"
          note="Click a bar to open that day on the desk."
          aside={
            <Legend
              items={[
                { label: 'Forecast at bid time', color: C.forecast },
                { label: 'Actual', color: C.ink },
              ]}
            />
          }
        >
          <DailyChart a={a} onPickDay={onPickDay} />
        </Sheet>
        <Sheet
          title="Miss by hour of the day"
          note="Mean absolute error and average bias for each UK clock hour."
          aside={
            <Legend
              items={[
                { label: 'Typical miss', color: C.forecast },
                { label: 'Bias', color: C.hazard },
              ]}
            />
          }
        >
          <HourChart a={a} />
        </Sheet>
      </div>

      <div className="grid-2">
        <Sheet title="Does bidding later help?" note="The same January hours, judged on the forecast available at each auction's gate closure.">
          <GateTable a={a} />
        </Sheet>
        <Sheet title="Largest misses" note="The hours that would have hurt most.">
          <WorstTable a={a} onPickDay={onPickDay} />
        </Sheet>
      </div>
    </>
  )
}

function ErrorHistogram({ a }: { a: Accuracy }) {
  const q = a.summary.errorQuantiles
  const data = a.histogram.map((b) => ({ mid: (b.from + b.to) / 2, count: b.count, from: b.from, to: b.to }))
  const xTicks = gwTicks(a.histogram[0].from, a.histogram.at(-1)!.to, 8)
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -20 }} barCategoryGap={1}>
        <CartesianGrid stroke={C.rule} vertical={false} />
        <XAxis dataKey="mid" type="number" domain={[xTicks[0], xTicks.at(-1)!]} ticks={xTicks} tickFormatter={gwTick} {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip
          cursor={{ fill: C.shallows }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="tooltip">
                <div className="tooltip__time">
                  {signedGw(payload[0].payload.from, 1)} to {signedGw(payload[0].payload.to, 1)} GW
                </div>
                <div className="tooltip__row">
                  <span>Hours</span>
                  <span>{payload[0].payload.count}</span>
                </div>
              </div>
            ) : null
          }
        />
        <Bar dataKey="count" isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.mid} fill={d.mid > 0 ? C.hazard : C.held} fillOpacity={0.85} />
          ))}
        </Bar>
        <ReferenceLine x={0} stroke={C.ink} />
        <ReferenceLine x={q.p10} stroke={C.ink2} strokeDasharray="4 3" label={{ value: 'P10', position: 'top', fill: C.ink2, fontSize: 12 }} />
        <ReferenceLine x={q.p50} stroke={C.ink2} strokeDasharray="4 3" label={{ value: 'Median', position: 'top', fill: C.ink2, fontSize: 12 }} />
        <ReferenceLine x={q.p90} stroke={C.ink2} strokeDasharray="4 3" label={{ value: 'P90', position: 'top', fill: C.ink2, fontSize: 12 }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function MarginTable({ a, confidence }: { a: Accuracy; confidence: number }) {
  const max = Math.max(...a.margins.map((m) => m.marginMW))
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Confidence</th>
          <th className="num">Margin</th>
          <th className="num">Held in test</th>
        </tr>
      </thead>
      <tbody>
        {a.margins.map((m) => (
          <tr key={m.confidence} data-active={m.confidence === confidence}>
            <td>{Math.round(m.confidence * 100)}% of hours</td>
            <td className="num">
              <span className="bar-cell">
                <span className="bar-cell__bar" style={{ width: `${(Math.max(0, m.marginMW) / max) * 90}px` }} />
                {gw(m.marginMW, 2)} GW
              </span>
            </td>
            <td className="num">{pct(m.backtestHeld, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function LevelChart({ a }: { a: Accuracy }) {
  const data = a.byLevel.map((b) => ({
    label: b.to === null ? `${b.from / 1000}+ GW` : `${b.from / 1000}–${b.to / 1000} GW`,
    mae: b.mae,
    bias: b.bias,
    count: b.count,
  }))
  const yTicks = gwTicks(Math.min(0, ...data.map((d) => d.bias)), Math.max(...data.map((d) => Math.max(d.mae, d.bias))), 5)
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={C.rule} vertical={false} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis ticks={yTicks} domain={[yTicks[0], yTicks.at(-1)!]} tickFormatter={gwTick} {...AXIS} label={UNIT_LABEL('GW')} />
          <Tooltip
            cursor={{ fill: C.shallows }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="tooltip">
                  <div className="tooltip__time">Forecast {payload[0].payload.label}</div>
                  <div className="tooltip__row">
                    <span>Typical miss</span>
                    <span>{gw(payload[0].payload.mae, 2)} GW</span>
                  </div>
                  <div className="tooltip__row">
                    <span>Bias</span>
                    <span>{signedGw(payload[0].payload.bias, 2)} GW</span>
                  </div>
                  <div className="tooltip__row">
                    <span>Hours</span>
                    <span>{payload[0].payload.count}</span>
                  </div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="mae" fill={C.forecast} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="bias" fill={C.hazard} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: 'Typical miss (MAE)', color: C.forecast },
          { label: 'Bias (forecast minus actual)', color: C.hazard },
        ]}
      />
    </>
  )
}

function ScatterPlot({ a }: { a: Accuracy }) {
  const data = a.scatter.map(([f, act]) => ({ f, a: act }))
  const ticks = gwTicks(0, Math.max(...a.scatter.flat()))
  const max = ticks.at(-1)!
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 24, right: 12, bottom: 14, left: -8 }}>
        <CartesianGrid stroke={C.rule} />
        <XAxis
          dataKey="f"
          type="number"
          domain={[0, max]}
          ticks={ticks}
          tickFormatter={gwTick}
          {...AXIS}
          label={{ value: 'Forecast, GW', position: 'insideBottom', offset: -10, fill: C.ink3, fontSize: 12 }}
        />
        <YAxis
          dataKey="a"
          type="number"
          domain={[0, max]}
          ticks={ticks}
          tickFormatter={gwTick}
          width={48}
          {...AXIS}
          label={{ ...UNIT_LABEL('Actual, GW'), dx: 18 }}
        />
        <ZAxis range={[14, 14]} />
        <ReferenceLine
          segment={[
            { x: 0, y: 0 },
            { x: max, y: max },
          ]}
          stroke={C.ink}
          strokeDasharray="4 3"
        />
        <Scatter data={data} fill={C.forecast} fillOpacity={0.35} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function DailyChart({ a, onPickDay }: { a: Accuracy; onPickDay: (date: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={a.daily}
        margin={{ top: 24, right: 8, bottom: 0, left: -12 }}
        barGap={0}
        barCategoryGap="18%"
        onClick={(state) => {
          const label = state?.activeLabel
          if (typeof label === 'string') onPickDay(label)
        }}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid stroke={C.rule} vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => fmtDayNum(dateOf(d))} interval={1} {...AXIS} />
        <YAxis {...AXIS} label={UNIT_LABEL('GWh')} />
        <Tooltip
          cursor={{ fill: C.shallows }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="tooltip">
                <div className="tooltip__time">{fmtDayShort(dateOf(payload[0].payload.date))}</div>
                <div className="tooltip__row">
                  <span>Forecast</span>
                  <span>{gwh(payload[0].payload.forecastGWh)} GWh</span>
                </div>
                <div className="tooltip__row">
                  <span>Actual</span>
                  <span>{gwh(payload[0].payload.actualGWh)} GWh</span>
                </div>
                <div className="tooltip__row">
                  <span>Typical miss</span>
                  <span>{gw(payload[0].payload.mae, 2)} GW</span>
                </div>
              </div>
            ) : null
          }
        />
        <Bar dataKey="forecastGWh" fill={C.forecast} isAnimationActive={false} />
        <Bar dataKey="actualGWh" fill={C.ink} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function HourChart({ a }: { a: Accuracy }) {
  const hourTicks = gwTicks(
    Math.min(0, ...a.byHour.map((h) => h.bias)),
    Math.max(...a.byHour.map((h) => Math.max(h.mae, h.bias))),
    5,
  )
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={a.byHour} margin={{ top: 24, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={C.rule} vertical={false} />
        <XAxis dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`} interval={3} {...AXIS} />
        <YAxis ticks={hourTicks} domain={[hourTicks[0], hourTicks.at(-1)!]} tickFormatter={gwTick} {...AXIS} label={UNIT_LABEL('GW')} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="tooltip">
                <div className="tooltip__time">{String(payload[0].payload.hour).padStart(2, '0')}:00 UK time</div>
                <div className="tooltip__row">
                  <span>Typical miss</span>
                  <span>{gw(payload[0].payload.mae, 2)} GW</span>
                </div>
                <div className="tooltip__row">
                  <span>Bias</span>
                  <span>{signedGw(payload[0].payload.bias, 2)} GW</span>
                </div>
              </div>
            ) : null
          }
        />
        <ReferenceLine y={0} stroke={C.ink3} />
        <Bar dataKey="mae" fill={C.forecast} fillOpacity={0.85} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line dataKey="bias" stroke={C.hazard} strokeWidth={2.5} dot={false} type="monotone" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function GateTable({ a }: { a: Accuracy }) {
  const best = Math.min(...a.gateComparison.map((g) => g.mae))
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Auction</th>
          <th className="num">Bids close</th>
          <th className="num">Typical miss</th>
          <th className="num">90% margin</th>
        </tr>
      </thead>
      <tbody>
        {a.gateComparison.map((g) => (
          <tr key={g.id} data-active={g.id === a.gate.id}>
            <td>
              {g.venue}
              <div style={{ fontSize: 12.5, color: C.ink3 }}>{g.product}</div>
            </td>
            <td className="num">{g.closes}</td>
            <td className="num">
              {gw(g.mae, 2)} GW
              {g.mae > best && <div style={{ fontSize: 12.5, color: C.ink3 }}>+{pct(g.mae / best - 1, 1)}</div>}
            </td>
            <td className="num">{gw(g.p90Error, 2)} GW</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WorstTable({ a, onPickDay }: { a: Accuracy; onPickDay: (date: string) => void }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Hour</th>
          <th className="num">Forecast</th>
          <th className="num">Actual</th>
          <th className="num">Miss</th>
        </tr>
      </thead>
      <tbody>
        {a.worst.map((w) => (
          <tr key={w.time}>
            <td>
              <button
                type="button"
                onClick={() => onPickDay(ukDate(w.time))}
                style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: C.shoal, textUnderlineOffset: 3 }}
              >
                {fmtDateTime(w.time)}
              </button>
              <div style={{ fontSize: 12.5, color: C.ink3 }}>
                {fmtTime(w.publishTime)} run, {Math.round(w.horizonHours)} h ahead
              </div>
            </td>
            <td className="num">{gw(w.forecast, 1)} GW</td>
            <td className="num">{gw(w.actual, 1)} GW</td>
            <td className="num" style={{ color: w.error > 0 ? C.hazard : C.held, fontWeight: 600 }}>
              {signedGw(w.error, 1)} GW
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ukDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
const ukDate = (iso: string) => ukDateFmt.format(new Date(iso))
