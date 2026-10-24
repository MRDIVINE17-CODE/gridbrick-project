// Chart colours. Mirrors the CSS custom properties in index.css (Recharts needs literal values).
// Palette borrowed from Admiralty sea charts: white deep water, blue shallows,
// navy ink, and chart magenta for hazards (here: wind that does not turn up).
export const C = {
  ink: '#0F2436',
  ink2: '#4A6276',
  ink3: '#8199AB',
  rule: '#D5E2E9',
  shallows: '#DCEBF1',
  shoal: '#B9D6E2',
  forecast: '#1D5FA8',
  hazard: '#B0177C',
  hazardWash: '#F6E3EF',
  held: '#137A63',
  heldWash: '#DDF1EA',
} as const

export const AXIS = {
  stroke: C.rule,
  tick: { fill: C.ink2, fontSize: 12, fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif' },
  tickLine: false,
} as const

/** Round-number axis ticks (in MW) that read well once shown in GW. */
export function gwTicks(lo: number, hi: number, target = 6): number[] {
  const span = Math.max(1, hi - lo)
  const step = [250, 500, 1000, 2000, 4000, 5000, 10000].find((s) => span / s <= target) ?? 20000
  const ticks: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step; v += step) ticks.push(v)
  return ticks
}

export const gwTick = (mw: number) => String(Number((mw / 1000).toFixed(2)))

export const UNIT_LABEL = (unit: string) => ({ value: unit, position: 'top' as const, offset: 12, fill: C.ink3, fontSize: 12 })
