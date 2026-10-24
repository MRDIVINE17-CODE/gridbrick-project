import { C } from '../theme'
import { fmtDayShort, fmtTime, toMs } from '../format'
import type { Revision } from '../types'

const W = 1000
const H = 128
const AXIS_Y = 62

/**
 * The two days around a decision on one line: every forecast run published on
 * the day before delivery, the moment bids close, and the delivery day itself.
 * Makes "which forecast could we actually have used?" visible at a glance.
 */
export function RunTimeline({
  deliveryStart,
  deliveryEnd,
  closesAt,
  revisions,
}: {
  deliveryStart: string
  deliveryEnd: string
  closesAt: string
  revisions: Revision[]
}) {
  const end = toMs(deliveryEnd)
  const dayMs = end - toMs(deliveryStart)
  const start = toMs(deliveryStart) - dayMs
  const x = (iso: string | number) => ((toMs(String(iso)) - start) / (end - start)) * W
  const xMs = (ms: number) => ((ms - start) / (end - start)) * W
  const gateX = x(closesAt)
  const deliveryX = xMs(toMs(deliveryStart))
  const runs = revisions.filter((r) => toMs(r.publishTime) >= start)
  const decision = runs.find((r) => r.isDecision)

  const hourTicks: number[] = []
  for (let t = start; t <= end; t += 6 * 3600_000) hourTicks.push(t)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Forecast runs published before and after bids closed">
      {/* decision day and delivery day bands */}
      <rect x={0} y={AXIS_Y - 6} width={deliveryX} height={12} rx={6} fill="#fff" />
      <rect x={deliveryX} y={AXIS_Y - 6} width={W - deliveryX} height={12} rx={6} fill={C.ink} />
      <text x={2} y={AXIS_Y + 54} fontSize={13} fontWeight={600} fill={C.ink2}>
        {fmtDayShort(start)}: decide and bid
      </text>
      <text x={deliveryX + 2} y={AXIS_Y + 54} fontSize={13} fontWeight={600} fill={C.ink}>
        {fmtDayShort(deliveryStart)}: delivery
      </text>

      {hourTicks.map((t) => (
        <g key={t}>
          <line x1={xMs(t)} x2={xMs(t)} y1={AXIS_Y + 7} y2={AXIS_Y + 12} stroke={C.ink3} />
          {t !== start && t !== end && (
            <text x={xMs(t)} y={AXIS_Y + 28} fontSize={12} fill={C.ink3} textAnchor="middle">
              {fmtTime(t)}
            </text>
          )}
        </g>
      ))}

      {/* gate closure */}
      <line x1={gateX} x2={gateX} y1={8} y2={AXIS_Y + 12} stroke={C.hazard} strokeWidth={2} />
      <text x={gateX + 6} y={18} fontSize={13} fontWeight={600} fill={C.hazard}>
        Bids close {fmtTime(closesAt)}
      </text>

      {/* forecast runs */}
      {runs.map((run) => {
        const cx = x(run.publishTime)
        const late = !run.availableAtGate
        return (
          <g key={run.publishTime}>
            <title>
              {`${fmtDayShort(run.publishTime)} ${fmtTime(run.publishTime)} run${late ? ', published after bids closed' : run.isDecision ? ', used for the decision' : ''}`}
            </title>
            <circle
              cx={cx}
              cy={AXIS_Y}
              r={run.isDecision ? 9 : 6}
              fill={run.isDecision ? C.forecast : late ? '#fff' : C.ink2}
              stroke={late ? C.ink3 : '#fff'}
              strokeWidth={2}
            />
          </g>
        )
      })}
      {decision && (
        <g>
          <line x1={x(decision.publishTime)} x2={x(decision.publishTime)} y1={AXIS_Y - 10} y2={34} stroke={C.forecast} />
          <text x={x(decision.publishTime) - 6} y={30} fontSize={13} fontWeight={600} fill={C.forecast} textAnchor="end">
            Forecast used: {fmtTime(decision.publishTime)} run
          </text>
        </g>
      )}
    </svg>
  )
}
