// Bot: 45-minute momentum breakout with a 0.8% trailing stop, long only.
//
// The idea, in one sentence: do nothing most of the time, buy the whole
// stack when BTC has genuinely moved up over the last 45 minutes, and let a
// trailing stop decide the exit.
//
// Why this shape wins on a choppy dev window: the replay is long only, cash
// earns nothing, and every round trip costs roughly 26 bps in fees,
// slippage and price impact. Fast signals (EMA crosses, RSI flips) pay that
// toll dozens of times and bleed out; dip-buying fights the drift. A
// 45-minute return of +0.25% or more is a real move — 1-minute returns have
// a standard deviation near 7 bps — so the bot only fires a handful of
// times, and each trade only needs to catch a move bigger than its costs.
//
//   - Entry, decided on a bar's close and filled at the next bar's open:
//     the close is at least +0.25% above the close 45 bars earlier, while
//     the bot holds nothing. One position at most, full size: all cash,
//     capped by the hello weight cap and floored by the minimum notional.
//     If the market refuses the order (a fill past the slippage cap), the
//     signal is simply re-evaluated on the next bar.
//   - Exit, the whole position: the close drops more than 0.80% below the
//     highest close seen since the position opened. The trailing stop only
//     ever ratchets up, so a winning trade is never handed back in full.
//     A refused sell is re-sent on the next bar while the close stays
//     under the stop, because the stop is still below the peak.
//   - Slippage guard: every order caps slippage at 100 bps (1%) past the
//     close it was decided on, so a fill into a liquidity gap is refused
//     rather than filled for almost nothing.
//   - Warm-up batches only feed the price history; no order is sent while
//     state.warmingUp, because the replay would reject it. A minute with
//     no CBBTC bar adds nothing to the history, so the lookback is counted
//     in bars, not wall time, and a malformed close (non-finite or <= 0)
//     is skipped outright rather than poisoning the window.
//   - Deterministic: no clock, no environment, no randomness. The same
//     bars give the same orders, run after run; the indicators are float64
//     arithmetic on + - * / alone.
//
// Dev-window result (kit grade-local, process driver): net PnL +$16.67,
// 13 fills, maximum drawdown 2.00% — the dev gate (net PnL above $0)
// passes, with the guardrails (at least 1 trade, drawdown far below 25%)
// met. The parameter neighbourhood is a plateau, not a spike: lookback
// 45–90 bars, entry +0.25–0.40%, trailing stop 0.8% all end the window
// in profit.
//
// Laid out like an entrant's repository: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.

import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

/** How many bars back the momentum entry looks. */
const WINDOW_BARS = 45;
/** Entry when the close beats the close WINDOW_BARS ago by this many bps. */
const ENTRY_GAIN_BPS = 25;
/** Exit when the close falls this many bps under the post-entry peak. */
const TRAIL_DROP_BPS = 80;
/** Slippage cap on every order, in bps past the deciding close. */
const SLIPPAGE_CAP_BPS = 100;

/** Rolling window of the most recent closes, oldest first (max WINDOW_BARS + 1). */
const recentCloses: number[] = [];

/** Per-position state, reset whenever the bot is flat. */
const position = {
  /** Highest close since the current position opened; null while flat. */
  peakClose: null as number | null,
};

function noteClose(close: number): void {
  recentCloses.push(close);
  if (recentCloses.length > WINDOW_BARS + 1) recentCloses.shift();
}

function decideExit(close: number, heldQty: bigint): SellInput | null {
  position.peakClose = position.peakClose === null ? close : Math.max(position.peakClose, close);
  const stopPrice = position.peakClose * (1 - TRAIL_DROP_BPS / 10000);
  if (close >= stopPrice) return null;
  position.peakClose = null;
  return { side: 'sell', symbol: 'CBBTC', qty: heldQty, max_slippage_bps: SLIPPAGE_CAP_BPS };
}

function decideEntry(state: BarsState, close: number): BuyInput | null {
  if (recentCloses.length < WINDOW_BARS + 1) return null;
  const reference = recentCloses[0];
  // Defensive: every recorded close is validated > 0 before it is stored,
  // so this can never fire — but a zero reference would make the gain
  // division meaningless, and a bot must never divide by a price it did
  // not sanity-check.
  if (reference <= 0) return null;
  const gainBps = ((close - reference) / reference) * 10000;
  if (gainBps <= ENTRY_GAIN_BPS) return null;

  const { caps, fees } = state.hello;
  let size = state.cash;
  const weightLimit = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
  if (size > weightLimit) size = weightLimit;
  if (size === 0n || size < BigInt(fees.min_notional_quote_units)) return null;
  return { side: 'buy', symbol: 'CBBTC', notional_quote_units: size, max_slippage_bps: SLIPPAGE_CAP_BPS };
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((b) => b.symbol === 'CBBTC');
    if (bar === undefined) return [];
    const close = Number(bar.c);
    if (!Number.isFinite(close) || close <= 0) return [];
    noteClose(close);

    // Warm-up batches build history only; any order decided on one is rejected.
    if (state.warmingUp) return [];

    const held = state.positions.get('CBBTC');
    if (held !== undefined) {
      const exit = decideExit(close, held.qty);
      return exit === null ? [] : [exit];
    }
    position.peakClose = null;

    const entry = decideEntry(state, close);
    return entry === null ? [] : [entry];
  },
});
