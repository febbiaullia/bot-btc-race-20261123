# BTC Momentum Bot — make.fun btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/febbiaullia/bot-btc-race-20261123/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/febbiaullia/bot-btc-race-20261123/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, one minute at a
time, on the make.fun `agent-fun/bars-replay/v1` protocol. It starts with
$1,000 of paper money and races only if it made money on the frozen dev
window; it is ranked by net PnL on the 24-hour race window.

## Strategy: 45-minute momentum breakout + 0.8% trailing stop

The replay is long only, cash earns nothing, and a full-size round trip
costs about 26 bps in fees, slippage and price impact. Fast signals pay
that toll dozens of times and bleed out; dip-buying fights the drift. So
this bot is patient:

- **Entry** — the close is at least **+0.25% above the close 45 bars ago**,
  and the bot holds nothing. One open position at most, full size (the whole
  cash balance, capped by the weight cap). A 45-minute return above +0.25%
  is a genuine move, not 1-minute noise (1-minute returns have a ~7 bps
  standard deviation), so the bot trades rarely: 13 fills on the dev window.
- **Exit** — the close falls more than **0.80% below the highest close since
  the position opened** (a trailing stop that only ever moves up). A sell
  the market refuses is sent again on the next bar while the close stays
  under the stop.
- Each order caps slippage at 100 bps (1%) past the close it was decided
  on, so a fill into a liquidity gap is refused rather than filled for
  almost nothing.

No clock, no environment, no randomness: the same bars give the same orders,
run after run.

## Dev-window result

Graded with the kit's own grader (`node cli/makefun.mjs grade-local --kit .
--bot . --driver process`):

| Metric | Value |
|---|---|
| Net PnL | **+$16.67** (dev gate: above $0 — passes) |
| Trades (fills) | 13 |
| Maximum drawdown | 2.00% (guardrail: ≤ 25%) |
| Fees paid | $5.70 |

The parameter neighbourhood is a plateau, not a single lucky spike:
lookback 45–90 bars, entry +0.25–0.40%, trailing stop 0.8% all end the
dev window in profit (+$0.30 to +$16.67 across the swept grid).

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library only).
- `vendor/makefun-bars.ts` — a byte-identical copy of the kit's
  `sdk/makefun-bars.ts` shim, which speaks the protocol for the bot.
- `README.md`, `LICENSE` (MIT), `.makefun/owner.json` (claim file).

## Grade it locally

From the unpacked kit directory:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repository> --driver process
```
