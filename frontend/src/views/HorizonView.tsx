import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApi } from '../api'
import { ErrorNote, Figure, Legend, Loading, Sheet } from '../components/common'
import { fmtDateTime, fmtTime, gw, pct, signedGw, toMs } from '../format'
import { AXIS, C, UNIT_LABEL, gwTick, gwTicks } from '../theme'
import type { Accuracy, Explorer, GateId, HorizonRow, Meta } from '../types'

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function HorizonView({ meta, gate }: { meta: Meta; gate: GateId }) {
  const horizons = useApi<{ horizons: HorizonRow[] }>('/api/horizons')
  const accuracy = useApi<Accuracy>(`/api/accuracy?gate=${gate}`)
  const [horizon, setHorizon] = useState(4)
  const [start, setStart] = useState('2026-01-10')
  const [end, setEnd] = useState('2026-01-16')
  const query = useDebounced(`/api/explorer?start=${start}&end=${end}&horizon=${horizon}`, 200)
  const series = useApi<Explorer>(start <= end ? query : null)
  const { first, last } = meta.explorerDays

  return (
    <>
      <p className="lede">
        How far ahead a forecast is made matters. Here each target hour is matched with the newest forecast published at least{' '}
        <strong>N hours</strong> before it, for every hour delivered in the January window.
      </p>

      {horizons.state === 'error' && <ErrorNote message={horizons.error} />}
      {horizons.data && (
        <Sheet
          title="Forecasts sharpen as delivery approaches"
          note={
            accuracy.data ? (
              <>
                The shaded span is where day-ahead bids sit with this auction: {Math.round(accuracy.data.horizonHours.min)} to{' '}
                {Math.round(accuracy.data.horizonHours.max)} hours ahead. Click the chart to explore a horizon below.
              </>
            ) : (
              'Click the chart to explore a horizon below.'
            )
          }
          aside={
            <Legend
              items={[
                { label: 'Typical miss (MAE)', color: C.forecast },
                { label: 'Bias', color: C.hazard },
                { label: 'P90 over-forecast', color: C.ink3, kind: 'dash' },
              ]}
            />
          }
        >
          <HorizonChart rows={horizons.data.horizons} accuracy={accuracy.data} horizon={horizon} onPick={setHorizon} />
        </Sheet>
      )}

      <div style={{ height: 20 }} />

      <Sheet
        title="Actual against the forecast made N hours ahead"
        note="Pick a date range and a horizon. Forecast points are hourly; actual outturn is half-hourly."
        aside={
          <Legend
            items={[
              { label: 'Actual', color: C.ink },
              { label: `Forecast ${horizon} h ahead`, color: C.forecast },
            ]}
          />
        }
      >
        <div className="range" style={{ marginBottom: 16 }}>
          <label className="control">
            <span className="control__label">From</span>
            <input type="date" min={first} max={last} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
          <label className="control">
            <span className="control__label">To</span>
            <input type="date" min={first} max={last} value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />
          </label>
          <label className="slider">
            <span className="control__label">Horizon</span>
            <input
              type="range"
              min={0}
              max={meta.maxHorizonHours}
              step={1}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
            <span className="slider__value">{horizon} h</span>
          </label>
        </div>
        {start > end && <ErrorNote message="The start date is after the end date" />}
        {series.state === 'error' && <ErrorNote message={series.error} />}
        {!series.data && series.state === 'loading' && <Loading />}
        {series.data && (
          <div className={series.state === 'loading' ? 'is-stale' : undefined}>
            <ExplorerChart data={series.data} />
            {series.data.summary.count > 0 && 'mae' in series.data.summary && (
              <div className="figures">
                <Figure label="Typical miss" value={gw(series.data.summary.mae, 2)} unit="GW" note={`${pct(series.data.summary.nmae ?? 0)} of output`} />
                <Figure label="Bias" value={signedGw(series.data.summary.bias, 2)} unit="GW" tone={series.data.summary.bias > 0 ? 'hazard' : 'held'} note="Forecast minus actual, on average" />
                <Figure label="P90 miss" value={gw(series.data.summary.p90AbsError, 2)} unit="GW" note="9 hours in 10 missed by less" />
                <Figure label="Hours compared" value={`${series.data.summary.count}`} note="Hourly forecast points with outturn" />
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}

function HorizonChart({
  rows,
  accuracy,
  horizon,
  onPick,
}: {
  rows: HorizonRow[]
  accuracy?: Accuracy
  horizon: number
  onPick: (h: number) => void
}) {
  const yTicks = gwTicks(Math.min(0, ...rows.map((r) => r.bias)), Math.max(...rows.map((r) => r.p90Error)), 6)
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={rows}
        margin={{ top: 24, right: 12, bottom: 14, left: -12 }}
        onClick={(state) => {
          const label = Number(state?.activeLabel)
          if (Number.isFinite(label)) onPick(label)
        }}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid stroke={C.rule} vertical={false} />
        {accuracy && (
          <ReferenceArea x1={Math.round(accuracy.horizonHours.min)} x2={Math.round(accuracy.horizonHours.max)} fill={C.shallows} fillOpacity={0.9} />
        )}
        <XAxis
          dataKey="hours"
          type="number"
          domain={[0, 48]}
          ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
          {...AXIS}
          label={{ value: 'Hours ahead', position: 'insideBottom', offset: -10, fill: C.ink3, fontSize: 12 }}
        />
        <YAxis ticks={yTicks} domain={[yTicks[0], yTicks.at(-1)!]} tickFormatter={gwTick} {...AXIS} label={UNIT_LABEL('GW')} />
        <ReferenceLine x={horizon} stroke={C.ink} strokeDasharray="3 3" />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="tooltip">
                <div className="tooltip__time">{payload[0].payload.hours} hours ahead or more</div>
                <div className="tooltip__row">
                  <span>Typical miss</span>
                  <span>{gw(payload[0].payload.mae, 2)} GW</span>
                </div>
                <div className="tooltip__row">
                  <span>Bias</span>
                  <span>{signedGw(payload[0].payload.bias, 2)} GW</span>
                </div>
                <div className="tooltip__row">
                  <span>P90 over-forecast</span>
                  <span>{gw(payload[0].payload.p90Error, 2)} GW</span>
                </div>
                <div className="tooltip__row">
                  <span>Hours compared</span>
                  <span>{payload[0].payload.count}</span>
                </div>
              </div>
            ) : null
          }
        />
        <Line dataKey="p90Error" stroke={C.ink3} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line dataKey="bias" stroke={C.hazard} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        <Line dataKey="mae" stroke={C.forecast} strokeWidth={3} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ExplorerChart({ data }: { data: Explorer }) {
  const rows = useMemo(() => data.points.map((p) => ({ ...p, t: toMs(p.time) })), [data])
  const days = rows.length / 48
  // 3-hourly ticks for a day or two, then one per day, then thinned to about ten.
  const step = days <= 2 ? 6 : days <= 12 ? 48 : 48 * Math.ceil(days / 10)
  const ticks = rows.filter((_, i) => i % step === 0).map((r) => r.t)
  const yTicks = gwTicks(0, Math.max(...rows.map((r) => Math.max(r.actual, r.forecast ?? 0))))
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={rows} margin={{ top: 24, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.rule} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={ticks}
          tickFormatter={(t) => (step < 24 ? fmtTime(t) : fmtDateTime(t).split(',')[0])}
          {...AXIS}
        />
        <YAxis ticks={yTicks} domain={[0, yTicks.at(-1)!]} tickFormatter={gwTick} width={48} {...AXIS} label={UNIT_LABEL('GW')} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as (typeof rows)[number]
            return (
              <div className="tooltip">
                <div className="tooltip__time">{fmtDateTime(p.t)}</div>
                <div className="tooltip__row">
                  <span>Actual</span>
                  <span>{gw(p.actual, 2)} GW</span>
                </div>
                {p.forecast !== undefined && (
                  <>
                    <div className="tooltip__row">
                      <span>Forecast</span>
                      <span>{gw(p.forecast, 2)} GW</span>
                    </div>
                    <div className="tooltip__row">
                      <span>Published</span>
                      <span>{fmtDateTime(p.publishTime!)}</span>
                    </div>
                  </>
                )}
              </div>
            )
          }}
        />
        <Line dataKey="forecast" stroke={C.forecast} strokeWidth={2.2} dot={false} connectNulls type="monotone" isAnimationActive={false} />
        <Line dataKey="actual" stroke={C.ink} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
