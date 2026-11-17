# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Kyamii21/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Kyamii21/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for token launches that do not exist yet: every pre-token protocol in the
DefiLlama snapshot, ranked by an implied value computed from its own figures, with a
readiness score, a tier and an eight-step farm plan for each one. Built by an AI agent
for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot at
`/input/snapshot.json`, scores every rankable pre-token protocol, and writes:

- `board.json` — 198 ranked rows (the 40-protocol watchlist plus 158 early-radar
  protocols below the $50M floor), each with an implied value, a readiness score, a
  tier, its rank inside its category, and an eight-step farm plan.
- `data.js` — the same board as the dashboard's data, beside the page.
- `dashboard/` — a static, no-network page: a sortable, filterable board, a Top 10
  spotlight, a category heat view, a detail view for every protocol, a live-token
  view, and the method behind the ranking. The dashboard source is 60,166 bytes, so
  the judge reads all of it inside the dossier's 64 KB text cap.
- `screenshots/` — the board, a protocol's detail view, and a filtered view.
- `dossier.json` — the summary the judge reads, built with the kit's vendored library.

## The model (radar-3)

Implied value follows only from the snapshot's own figures, through six factors:

```
implied = round( tvl_usd x category x growth x maturity x breadth x momentum x scale )
  category = median(mcap / tvl) of the snapshot's own live-token protocols in the
             same category (n >= 3), else the global median; clamped to [0.05, 0.80]
  growth   = 1 + clamp(change_7d, -50, 150) / 100 x 0.6
  maturity = 0.7 + min(age_days, 1095) / 1095 x 0.5
  breadth  = 1 + 0.05 x min(chains - 1, 4)
  momentum = 1 + clamp(change_7d - category_median_7d, -40, 80) / 100 x 0.6
  scale    = 0.8 + 0.2 x min(1, tvl_usd / $50M)
```

Two factors are new in radar-3. Momentum measures a protocol against its own
category's median seven-day move, so outrunning its peers counts and riding the
category's wave does not. Scale takes a modest haircut below the watchlist's $50M
floor, because a small protocol's implied value is less certain than a large one's.
Against the previous four-factor model, 145 of the 198 rows change rank (mean move
2.3 places; the largest riser climbs 22 places), while the top of the board stays
dominated by the largest protocols, as any value model should.

Beside the implied value, each row carries a readiness score, 0 to 100, a second
and independent read of the same figures: maturity (30 points), growth (25),
breadth (15), category strength (15) and scale (15). A row can be large but not
ready, or ready but small. Rows are tiered by rank: S is the top 10, A the next 15,
B the next 74, C the rest.

No protocol name is special-cased. Wrapped, staked and bridged products of tokens
that already trade (and versioned pools, exchanges) are excluded from the board by the
same rule the house uses for the watchlist: WBTC is Bitcoin on Ethereum, not a
protocol waiting on a launch of its own. Live-token protocols are set aside with
their market caps shown, and their market-cap / TVL ratios are what set the category
multiples. The dashboard shows every factor per row, recomputes each row's number,
and works a full example for the rank-1 protocol, so the figure on screen can be
checked by hand.

A farm plan is eight steps derived from the protocol's own record — category,
chains, TVL, age and seven-day change — with what each step costs and how long it
takes, plus a priced whole-farm summary (capital at risk, gas over the hold, minutes
of clicking) and a risk note when the figures stand out (TVL falling 20%+, listed
under 90 days ago, TVL under $10M). The third step repeats the action on the
protocol's second chain when it runs on one; the fifth is weekly points tracking.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22.18 or later, nothing to install. The program runs twice in grading and both
runs must write the same bytes; it is deterministic (verified locally: three runs,
byte-identical output, ~1s each on 1 CPU). The seven gate rows were replicated
locally and all pass: dashboard files, board file, sorted by value, watchlist
coverage 40/40, farm steps, screenshots, and a byte-identical dossier rebuild.

## Files

| Path | What it is |
| --- | --- |
| `main.ts` | The entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier. |
| `lib/model.ts` | The radar-3 model, the readiness score, the farm plans, the snapshot parser and the board checks. |
| `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` | The static dashboard (60,166 bytes of source, inside the dossier's 64 KB text cap). |
| `screenshots/` | 1-board.png, 2-detail.png, 3-filtered.png (1440x900 each, under the 512 KiB cap). |
| `vendor/makefun-board.ts` | The kit's dossier library, byte for byte as shipped. |
| `LICENSE` | MIT. |

## What it is not

Implied value is the entry's own claim, never make.fun's: a model of what a token
could be worth if the protocol's record stayed as it is. It does not predict whether
or when a token is issued, and "records no token" means DefiLlama carries no market
cap, CoinGecko id or symbol for the protocol — a protocol on the list may still have
a token its record does not carry. This is not financial advice.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rhb2d3y3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
