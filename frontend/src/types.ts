// Shapes returned by the FastAPI backend (backend/app/analysis.py).
// Power values are MW, energies GWh, times ISO-8601 UTC strings.

export type GateId = 'epex-60' | 'n2ex' | 'epex-30'

export interface Gate {
  id: GateId
  venue: string
  product: string
  closes: string // "09:20", UK local time on the day before delivery
  closesAt?: string // UTC instant, when tied to a delivery day
}

export interface Meta {
  decisionDays: { first: string; last: string }
  deliveryDays: string[]
  explorerDays: { first: string; last: string }
  gates: Gate[]
  defaultGate: GateId
  confidenceLevels: number[]
  defaultConfidence: number
  maxHorizonHours: number
  publishScheduleUtc: string[]
  snapshot: {
    source: string
    generatedAt: string
    actualRows: number
    forecastRuns: number
    forecastRows: number
  }
}

export interface Summary {
  count: number
  mae: number
  rmse: number
  bias: number
  nmae: number | null
  medianAbsError: number
  p90AbsError: number
  maxOverForecast: number
  maxUnderForecast: number
  correlation: number | null
  errorQuantiles: Record<'p5' | 'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'p95', number>
  forecastEnergyGWh: number
  actualEnergyGWh: number
}

export interface DayPoint {
  time: string
  actual: number | null
  forecast?: number
  low?: number
  high?: number
  firm?: number
}

export interface Revision {
  publishTime: string
  availableAtGate: boolean
  isDecision: boolean
  points: { time: string; value: number }[]
}

export interface DayView {
  date: string
  gate: Gate
  confidence: number
  decisionRun: {
    publishTimes: string[]
    ageAtGateMinutes: number | null
    horizonHours: [number, number] | null
  }
  margins: Record<string, number>
  band: { low: number; high: number }
  points: DayPoint[]
  revisions: Revision[]
  summary: Summary & {
    firmEnergyGWh: number
    hoursBelowFirm: number
    hoursInBand: number
    shortfallEnergyGWh: number
  }
}

export interface MarginRow {
  confidence: number
  marginMW: number
  backtestHeld: number
}

export interface Accuracy {
  gate: Gate
  deliveryDays: string[]
  horizonHours: { min: number; max: number; mean: number }
  summary: Summary
  margins: MarginRow[]
  histogram: { from: number; to: number; count: number }[]
  byHour: { hour: number; count: number; mae: number; bias: number }[]
  byLevel: { from: number; to: number | null; count: number; mae: number; bias: number; p90Error: number }[]
  daily: { date: string; mae: number; bias: number; forecastGWh: number; actualGWh: number }[]
  worst: {
    time: string
    forecast: number
    actual: number
    error: number
    publishTime: string
    horizonHours: number
  }[]
  scatter: [number, number][]
  gateComparison: (Gate & { mae: number; rmse: number; bias: number; p90Error: number })[]
}

export interface HorizonRow {
  hours: number
  count: number
  mae: number
  rmse: number
  bias: number
  p10Error: number
  p90Error: number
  meanActualHorizon: number
}

export interface Explorer {
  start: string
  end: string
  horizon: number
  points: { time: string; actual: number; forecast?: number; publishTime?: string }[]
  summary: Summary | { count: 0 }
}
