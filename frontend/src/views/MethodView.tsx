import { fmtDateTime } from '../format'
import type { Meta } from '../types'

export function MethodView({ meta }: { meta: Meta }) {
  const snap = meta.snapshot
  return (
    <div className="prose">
      <h2>What question this answers</h2>
      <p>
        Power for day D is bought in the day-ahead auction on day D−1. Whatever wind does not turn up has to be bought later, at
        intraday or imbalance prices. So the useful questions are: what did the wind forecast say <strong>when bids closed</strong>,
        and how far off has that forecast been?
      </p>

      <h2>Data</h2>
      <ul>
        <li>
          <strong>Actual wind</strong>: Elexon <code>FUELHH</code>, fuel type <code>WIND</code>. Half-hourly average output in MW,
          by settlement period start time.
        </li>
        <li>
          <strong>Forecasts</strong>: Elexon <code>WINDFOR</code>. Hourly MW, about 73 hours per run, published eight times a day (
          {meta.publishScheduleUtc.join(', ')} UTC, the same as UK time in January).
        </li>
        <li>
          Snapshot taken {fmtDateTime(snap.generatedAt)}: {snap.actualRows.toLocaleString('en-GB')} half-hours of outturn,{' '}
          {snap.forecastRuns} forecast runs, {snap.forecastRows.toLocaleString('en-GB')} forecast points. The app reads the snapshot
          rather than calling Elexon on each request, so numbers are reproducible.
        </li>
      </ul>

      <h2>Which forecast counts</h2>
      <p>
        Scope is purchase decisions made in January 2026: decision days 1 to 31 January, so delivery days 2 January to 1 February
        (UK calendar days). For each delivery hour the app uses the newest run published <strong>strictly before</strong> gate
        closure on the day before. A run published after that moment is never used, even if it was better. Three GB day-ahead
        auctions are offered: EPEX SPOT hourly (bids close 09:20), Nord Pool N2EX hourly (09:50) and EPEX SPOT half-hourly
        (15:30), all UK time.
      </p>
      <p>
        Forecasts are hourly and outturn is half-hourly, so errors are measured on the hour, against the settlement period that
        starts at that hour. No values are interpolated for scoring.
      </p>

      <h2>Measures</h2>
      <ul>
        <li>
          <strong>Error</strong> is forecast minus actual. Positive means less wind than forecast: the buyer is short.
        </li>
        <li>
          <strong>Typical miss</strong> is mean absolute error (MAE). Also reported: RMSE, bias (mean error), percentiles, and MAE as
          a share of average output. MAPE is avoided because it explodes in calm hours.
        </li>
        <li>
          <strong>Margin at X% confidence</strong> is the X-th percentile of the error. Forecast minus margin is the firm wind line:
          wind came in at or above it in X% of January hours.
        </li>
        <li>
          <strong>Held in test</strong>: for each delivery day, the margin is re-estimated from the other days only, then checked on
          that day (leave-one-day-out). The day chart's band and firm line use the same rule, so a day never sees its own outcome.
        </li>
      </ul>

      <h2>Limits</h2>
      <ul>
        <li>One month of winter data: margins should be recalibrated on a rolling window before relying on them in summer.</li>
        <li>
          Over-forecasting grows with wind level. That fits wind farms being turned down when the grid is congested, but these two
          datasets cannot confirm it; balancing-mechanism data would.
        </li>
        <li>Both datasets cover transmission-metered wind only, not small wind farms connected to local networks.</li>
      </ul>
    </div>
  )
}
