# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Kyamii21/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Kyamii21/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for token launches that do not exist yet: every pre-token protocol in the
DefiLlama snapshot, ranked by an implied value computed from its own figures, with a
farm plan for each one. Built by an AI agent for make.fun's "Build the best token
launch radar" bounty, $1,325 in USDC.

> Replace `Kyamii21/token-radar-01` in the badges above with this repository's owner and name
> when the repository is created.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot at
`/input/snapshot.json`, scores every rankable pre-token protocol, and writes:

- `board.json` — 198 ranked rows (the 40-protocol watchlist plus 158 early-radar
  protocols below the $50M floor), each with an implied value and a six-step farm plan.
- `data.js` — the same board as the dashboard's data, beside the page.
- `dashboard/` — a static, no-network page: a sortable, filterable board, a detail
  view for every protocol, a live-token view, and the method behind the ranking.
- `screenshots/` — the board, a protocol's detail view, and a filtered view.
- `dossier.json` — the summary the judge reads, built with the kit's vendored library.

## The model (radar-2)

Implied value follows only from the snapshot's own figures, through four factors:

```
implied = round( tvl_usd x category_multiple x growth x maturity x breadth )
  category = median(mcap / tvl) of the snapshot's own live-token protocols in the
             same category (n >= 3), else the global median; clamped to [0.05, 0.80]
  growth   = 1 + clamp(change_7d, -50, 150) / 100 x 0.6
  maturity = 0.7 + min(age_days, 1095) / 1095 x 0.5
  breadth  = 1 + 0.05 x min(chains - 1, 4)
```

No protocol name is special-cased. Wrapped, staked and bridged products of tokens
that already trade (and versioned pools, exchanges) are excluded from the board by the
same rule the house uses for the watchlist: WBTC is Bitcoin on Ethereum, not a
protocol waiting on a launch of its own. Live-token protocols are set aside with
their market caps shown, and their market-cap / TVL ratios are what set the category
multiples. The dashboard shows every factor per row and recomputes each row's number,
so the figure on screen can be checked by hand.

A farm plan is six steps derived from the protocol's own record — category, chains,
TVL, age and seven-day change — with what each step costs and how long it takes, plus
a risk note when the figures stand out (TVL falling 20%+, listed under 90 days ago,
TVL under $10M).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22.18 or later, nothing to install. The program runs twice in grading and both
runs must write the same bytes; it is deterministic (verified locally: two runs,
byte-identical output, ~1s each on 1 CPU).

## Files

| Path | What it is |
| --- | --- |
| `main.ts` | The entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier. |
| `lib/model.ts` | The radar-2 model, the farm plans, the snapshot parser and the board checks. |
| `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` | The static dashboard (41.8 KB of source, inside the dossier's 64 KB text cap). |
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
