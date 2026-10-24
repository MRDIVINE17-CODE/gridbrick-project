import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS, C, UNIT_LABEL, gwTick, gwTicks } from '../theme'
import { fmtTime, gw, signedGw, toMs } from '../format'
import type { DayView } from '../types'

type Row = {
  t: number
  actual?: number
  forecast?: number
  band?: [number, number]
  firm?: number
  [revision: `r${number}`]: number | undefined
}

export function DayChart({ day, showRevisions }: { day: DayView; showRevisions: boolean }) {
  const later = useMemo(() => day.revisions.filter((r) => !r.availableAtGate), [day])

  const rows = useMemo(() => {
    const byTime = new Map<number, Row>()
    for (const p of day.points) {
      byTime.set(toMs(p.time), {
        t: toMs(p.time),
        actual: p.actual ?? undefined,
        forecast: p.forecast,
        band: p.low !== undefined && p.high !== undefined ? [p.low, p.high] : undefined,
        firm: p.firm,
      })
    }
    later.forEach((run, i) => {
      for (const point of run.points) {
        const row = byTime.get(toMs(point.time))
        if (row) row[`r${i}`] = point.value
      }
    })
    return [...byTime.values()]
  }, [day, later])

  const start = rows[0]?.t ?? 0
  const end = start + rows.length * 30 * 60_000
  const ticks = rows.filter((_, i) => i % 6 === 0).map((r) => r.t)
  ticks.push(end)
  const values = rows.flatMap((r) =>
    Object.entries(r).flatMap(([k, v]) => (k === 't' ? [] : Array.isArray(v) ? v : typeof v === 'number' ? [v] : [])),
  )
  const yTicks = gwTicks(0, Math.max(...values))

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={rows} margin={{ top: 24, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.rule} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[start, end]}
          ticks={ticks}
          tickFormatter={(t) => fmtTime(t)}
          {...AXIS}
        />
        <YAxis
          ticks={yTicks}
          domain={[0, yTicks.at(-1)!]}
          tickFormatter={gwTick}
          width={48}
          {...AXIS}
          label={UNIT_LABEL('GW')}
        />
        <Tooltip content={<DayTooltip />} cursor={{ stroke: C.ink3, strokeDasharray: '3 3' }} />
        <Area
          dataKey="band"
          stroke="none"
          fill={C.shallows}
          fillOpacity={1}
          connectNulls
          isAnimationActive={false}
          type="monotone"
        />
        {showRevisions &&
          later.map((run, i) => (
            <Line
              key={run.publishTime}
              dataKey={`r${i}`}
              stroke={C.ink3}
              strokeOpacity={0.45}
              strokeWidth={1}
              dot={false}
              connectNulls
              isAnimationActive={false}
              type="monotone"
            />
          ))}
        <Line dataKey="firm" stroke={C.held} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls type="monotone" isAnimationActive={false} />
        <Line dataKey="forecast" stroke={C.forecast} strokeWidth={2.5} dot={false} connectNulls type="monotone" isAnimationActive={false} />
        <Line dataKey="actual" stroke={C.ink} strokeWidth={2.5} dot={false} connectNulls type="monotone" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="tooltip">
      <div className="tooltip__time">{fmtTime(row.t)} UK time</div>
      {row.actual !== undefined && (
        <div className="tooltip__row">
          <span>Actual</span>
          <span>{gw(row.actual, 2)} GW</span>
        </div>
      )}
      {row.forecast !== undefined && (
        <>
          <div className="tooltip__row">
            <span>Forecast at bid time</span>
            <span>{gw(row.forecast, 2)} GW</span>
          </div>
          {row.firm !== undefined && (
            <div className="tooltip__row">
              <span>Firm wind</span>
              <span>{gw(row.firm, 2)} GW</span>
            </div>
          )}
          {row.actual !== undefined && (
            <div className="tooltip__row">
              <span>Forecast minus actual</span>
              <span>{signedGw(row.forecast - row.actual, 2)} GW</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
