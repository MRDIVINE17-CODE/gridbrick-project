// All times are shown in UK local time, because that is the clock the market runs on.
const UK = 'Europe/London'

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: UK, hour: '2-digit', minute: '2-digit' })
const dayShort = new Intl.DateTimeFormat('en-GB', { timeZone: UK, weekday: 'short', day: 'numeric', month: 'short' })
const dayLong = new Intl.DateTimeFormat('en-GB', { timeZone: UK, weekday: 'long', day: 'numeric', month: 'long' })
const dayNum = new Intl.DateTimeFormat('en-GB', { timeZone: UK, day: 'numeric' })
const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: UK, weekday: 'narrow' })

export const toMs = (iso: string) => new Date(iso).getTime()

/** A UK calendar date "2026-01-15" as a Date at UK midday (safe for formatting the day). */
export const dateOf = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`)

export const fmtTime = (value: string | number) => hm.format(new Date(value))
export const fmtDayShort = (value: string | number | Date) => dayShort.format(new Date(value))
export const fmtDayLong = (value: string | number | Date) => dayLong.format(new Date(value))
export const fmtDayNum = (value: Date) => dayNum.format(value)
export const fmtWeekday = (value: Date) => weekday.format(value)
export const fmtDateTime = (value: string | number) => `${fmtDayShort(value)}, ${fmtTime(value)}`

/** MW value shown in GW with one decimal: 12345 -> "12.3". */
export const gw = (mw: number, digits = 1) => (mw / 1000).toFixed(digits)
export const signedGw = (mw: number, digits = 1) => `${mw > 0 ? '+' : mw < 0 ? '−' : ''}${Math.abs(mw / 1000).toFixed(digits)}`
export const gwh = (value: number) => (value >= 100 ? value.toFixed(0) : value.toFixed(1))
export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`
export const mwInt = (mw: number) => Math.round(mw).toLocaleString('en-GB')

export function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export const shiftDate = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
