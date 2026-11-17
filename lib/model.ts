// Token Radar's model, version radar-3: one snapshot of the protocol universe in, one ranked
// board out. Written from scratch for token-radar-01.
//
// The board ranks every pre-token protocol the snapshot can rank (198 of them here): the 40
// watchlist protocols are the floor, and the early radar is every other rankable pre-token
// protocol, down to the snapshot's $5M TVL cut. Live-token protocols are kept apart and shown
// with the market's own values, never mixed into the ranking.
//
// Implied value follows only from the snapshot's own figures, through six factors:
//
//   category  = the median market-cap / TVL of the snapshot's own live-token protocols in the
//               same category (at least 3 of them, else the global median), clamped to
//               [0.05, 0.80]. A category whose tokens already trade dear against TVL earns a
//               higher multiple; one whose tokens trade cheap earns a lower one. No name is
//               ever special-cased: the multiple is computed from the snapshot at run time.
//   growth    = 1 + clamp(change_7d, -50, 150) / 100 * 0.6. A protocol whose TVL is growing
//               fast is worth more than one whose TVL is draining away.
//   maturity  = 0.7 + min(age_days, 1095) / 1095 * 0.5. Age is the time since DefiLlama first
//               listed the protocol: the best record of how long it has run with no token.
//               An unlisted age uses 365 days.
//   breadth   = 1 + 0.05 * min(chains - 1, 4). A protocol live on several chains has more
//               surface to launch from than one on a single chain.
//   momentum  = 1 + clamp(change_7d - category_median_7d, -30, 60) / 100 * 0.4. The protocol's
//               seven-day move measured against its own category's median move: a protocol
//               outrunning its peers earns more than one riding the category's wave. The
//               category median is the median 7-day change of the rankable pre-token protocols
//               in that category (0 when the category reports none).
//   scale     = 0.85 + 0.15 * min(1, tvl_usd / 50,000,000). A small protocol's implied value is
//               less certain than a large one's, so the model takes a modest haircut below the
//               watchlist's $50M floor and none at or above it.
//
//   implied = max(1, round(tvl_usd * category * growth * maturity * breadth * momentum * scale))
//
// Beside the implied value each row carries a readiness score, 0 to 100, a second and
// independent read of the same figures: how mature, how fast-growing, how broad, how strong
// its category and how large it is. A row can be large but not ready (big TVL, young, flat)
// or ready but small (old, growing, multi-chain, tiny TVL). The score's five components are:
//
//   maturity  30 points: min(age_days, 1095) / 1095
//   growth    25 points: (clamp(change_7d, -50, 100) + 50) / 150
//   breadth   15 points: min(chains - 1, 4) / 4
//   category  15 points: (category_multiple - 0.05) / 0.75
//   scale     15 points: min(1, tvl_usd / 50,000,000)
//
// Rows are tiered by implied-value rank: S is the top 10, A the next 15, B the next 74, C the
// rest. Each row also carries its rank inside its own category, so a reader can see the best
// lending launch, the best RWA launch, and so on without leaving the board.
//
// Every factor is shown on the dashboard, per row, and the page recomputes the row from the
// same figures, so the board's number can be checked by hand.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and its method note explains. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_min: number;
  category_max: number;
  category_min_live: number;
  breadth_step: number;
  breadth_max_chains: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  scale_floor: number;
  scale_range: number;
  scale_tvl_usd: number;
  readiness_maturity: number;
  readiness_growth: number;
  readiness_breadth: number;
  readiness_category: number;
  readiness_scale: number;
  readiness_growth_floor: number;
  readiness_growth_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_min: 0.05,
  category_max: 0.8,
  category_min_live: 3,
  breadth_step: 0.05,
  breadth_max_chains: 4,
  momentum_weight: 0.6,
  momentum_floor: -40,
  momentum_cap: 80,
  scale_floor: 0.8,
  scale_range: 0.2,
  scale_tvl_usd: 50_000_000,
  readiness_maturity: 30,
  readiness_growth: 25,
  readiness_breadth: 15,
  readiness_category: 15,
  readiness_scale: 15,
  readiness_growth_floor: -50,
  readiness_growth_cap: 100,
};

/** The model's version label: the dashboard names it and the method note quotes it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many categories the dashboard's category heat shows. */
export const HEAT_CATEGORIES = 8;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  readiness_score: number;
  tier: string;
  category_rank: number;
  model: {
    category_multiple: number;
    category_live_n: number;
    category_median_7d: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    momentum_multiplier: number;
    scale_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  readiness_score: number;
  tier: string;
  category_rank: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  momentum_multiplier: number;
  scale_multiplier: number;
  category_median_7d: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** One category's market multiple, derived from the snapshot's live-token protocols. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  live_n: number;
  median_7d: number;
}

/** One category's weight on the board, for the dashboard's category heat. */
export interface CategoryAggregate {
  category: string;
  rows: number;
  total_implied_usd: number;
  top_name: string;
  top_implied_usd: number;
  multiple: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  category_multiples: CategoryMultiple[];
  category_heat: CategoryAggregate[];
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted array, or null when it is empty. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Clamp a number into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The category multiples, computed from the snapshot itself: for each category, the median
 * market-cap / TVL of its live-token protocols (at least `category_min_live` of them), clamped
 * into [category_min, category_max]; categories with too few live tokens take the global median
 * of the same ratio across every live-token protocol. Returns the global multiple and the table.
 */
export function categoryMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { global: number; byCategory: Map<string, CategoryMultiple> } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(ratio);
    byCat.set(key, list);
  }
  all.sort((a, b) => a - b);
  const globalRaw = median(all) ?? 0.2;
  const global = clamp(globalRaw, model.category_min, model.category_max);
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [cat, ratios] of byCat) {
    ratios.sort((a, b) => a - b);
    const m = ratios.length >= model.category_min_live ? median(ratios) : null;
    const multiple = clamp(m ?? globalRaw, model.category_min, model.category_max);
    byCategory.set(cat, { category: cat, multiple: round4(multiple), live_n: ratios.length, median_7d: 0 });
  }
  return { global, byCategory };
}

/**
 * Each category's median seven-day TVL change among the rankable pre-token protocols, so a
 * protocol's momentum is measured against its own peers. Categories with no reported change
 * take 0. `rankable` is the board's own selection, so the median never leaks a live token in.
 */
export function categoryMedianChange(rankable: SnapshotProtocol[]): Map<string, number> {
  const byCat = new Map<string, number[]>();
  for (const p of rankable) {
    if (p.change_7d === null) continue;
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(p.change_7d);
    byCat.set(key, list);
  }
  const out = new Map<string, number>();
  for (const [cat, changes] of byCat) {
    changes.sort((a, b) => a - b);
    out.set(cat, median(changes) ?? 0);
  }
  return out;
}

/** The six multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  categoryMultiple: number,
  categoryLiveN: number,
  categoryMedian7d: number,
  model: ModelConstants,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  momentumMult: number;
  scaleMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult =
    1 + model.breadth_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const momentumMult =
    1 +
    (clamp(rawGrowth - categoryMedian7d, model.momentum_floor, model.momentum_cap) / 100) *
      model.momentum_weight;
  const scaleMult =
    model.scale_floor +
    model.scale_range * Math.min(1, Math.max(protocol.tvl_usd, 0) / model.scale_tvl_usd);
  const implied = Math.max(
    1,
    Math.round(
      protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * breadthMult * momentumMult * scaleMult,
    ),
  );
  return { implied, growthPct, growthMult, maturityMult, breadthMult, momentumMult, scaleMult, age };
}

/** A protocol's readiness score, 0 to 100, from the same figures the implied value uses. */
export function readinessScore(
  protocol: SnapshotProtocol,
  age: number | null,
  categoryMultiple: number,
  model: ModelConstants,
): number {
  const ageForModel = age ?? model.unknown_age_days;
  const maturityPart =
    Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days;
  const growthPart =
    (clamp(finite(protocol.change_7d, 0), model.readiness_growth_floor, model.readiness_growth_cap) -
      model.readiness_growth_floor) /
    (model.readiness_growth_cap - model.readiness_growth_floor);
  const breadthPart = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains) / model.breadth_max_chains;
  const categoryPart = clamp((categoryMultiple - model.category_min) / (model.category_max - model.category_min), 0, 1);
  const scalePart = Math.min(1, Math.max(protocol.tvl_usd, 0) / model.scale_tvl_usd);
  return Math.round(
    model.readiness_maturity * maturityPart +
      model.readiness_growth * growthPart +
      model.readiness_breadth * breadthPart +
      model.readiness_category * categoryPart +
      model.readiness_scale * scalePart,
  );
}

/** The tier a rank earns: S is the top 10, A the next 15, B the next 74, C the rest. */
export function tierFor(rank: number): string {
  if (rank <= 10) return 'S';
  if (rank <= 25) return 'A';
  if (rank <= 99) return 'B';
  return 'C';
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name. */
const EXCHANGE_PREFIX =
  /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or
 * bridged product of a protocol whose token already trades. This is the house's own watchlist
 * rule, applied to the whole board: WBTC is Bitcoin on Ethereum, not a protocol waiting on a
 * launch of its own. The watchlist itself passes this rule by construction, so every
 * watchlist slug stays ranked.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { global, byCategory } = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is ranked, whatever its size.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, down to the snapshot's $5M cut.
  // Nothing is hand-picked and nothing is capped by TVL: the radar exists to find them early.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const median7d = categoryMedianChange([...chosen.values()]);
  const scored = [...chosen.values()].map((p) => {
    const entry = byCategory.get(p.category ?? 'Other');
    const multiple = entry !== undefined ? entry.multiple : global;
    const liveN = entry !== undefined ? entry.live_n : 0;
    const catMed = median7d.get(p.category ?? 'Other') ?? 0;
    const v = impliedValue(p, snapshot.as_of, multiple, liveN, catMed, model);
    const score = readinessScore(p, v.age, multiple, model);
    return { p, multiple, liveN, catMed, score, ...v };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  // Rank inside each category: the board's order is global, the category rank is per-category.
  const catCount = new Map<string, number>();
  return scored.map((s, i) => {
    const key = s.p.category ?? 'Other';
    const catRank = (catCount.get(key) ?? 0) + 1;
    catCount.set(key, catRank);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      readiness_score: s.score,
      tier: tierFor(i + 1),
      category_rank: catRank,
      model: {
        category_multiple: s.multiple,
        category_live_n: s.liveN,
        category_median_7d: s.catMed,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        momentum_multiplier: round4(s.momentumMult),
        scale_multiplier: round4(s.scaleMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, or null when it runs on one chain only. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** A rough gas price for one transaction on the protocol's first chain, in whole dollars. */
export function gasUsd(chain: string): number {
  switch (chain) {
    case 'Ethereum':
      return 8;
    case 'Bitcoin':
      return 5;
    case 'Solana':
    case 'Base':
    case 'Arbitrum':
    case 'Optimism':
    case 'Polygon':
    case 'Avalanche':
    case 'BNB Chain':
    case 'Binance':
    case 'Monad':
    case 'Hyperliquid L1':
    case 'Tron':
    case 'Sui':
    case 'Aptos':
    case 'Sei':
    case 'Berachain':
    case 'Sonic':
      return 1;
    default:
      return 2;
  }
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator')) {
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and leave the vault shares in the farming wallet so the curator's allocation is tied to you.`;
  }
  if (c.includes('capital allocator') || c.includes('allocator')) {
    return `Deposit $${capital} of USDC into ${name}'s allocation vault on ${chain} and keep the position open through at least one rebalance.`;
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it and repay it once, so the position shows both sides of the market.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open through at least one fee cycle.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in its app instead of bridging straight back.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name}, open one small hedge, and close it the same week so the account shows real trading.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} and place one market position on ${name}, then settle or close it before the market resolves.`;
  }
  if (c.includes('yield aggregator')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it so the balance accrues.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the whole hold.`;
  }
  if (c.includes('privacy')) {
    return `Deposit $${capital} through ${name}'s shielded pool on ${chain} and withdraw it to a fresh address only after the hold.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the position through one funding cycle.`;
  }
  if (c.includes('liquid')) {
    return `Mint $${capital} of the liquid staking token through ${name} on ${chain} and use it once in another app on the same chain.`;
  }
  if (c.includes('index')) {
    return `Buy $${capital} of the ${name} index on ${chain} and hold the index token for the whole hold.`;
  }
  if (c.includes('chain')) {
    return `Use $${capital} across ${name}'s flagship apps on ${chain}: swap once, deposit once, and hold the chain's gas token for the whole hold.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Spend $${capital} through ${name} on ${chain} across two separate weeks, keeping the receipts in the farming wallet.`;
  }
  if (c.includes('governance')) {
    return `Deposit $${capital} into ${name} on ${chain} and vote once in its governance while the position is open.`;
  }
  if (c.includes('otc')) {
    return `Complete one $${capital} trade through ${name} on ${chain} and keep the settlement receipt in the farming wallet.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use the app once a week while the position is open.`;
}

/** A second on-chain action, on the protocol's second chain when it has one, else a second kind of action on its main chain. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const second = secondChainOf(p);
  const small = Math.max(25, Math.round(capital / 2));
  if (second !== null) {
    return `Repeat a smaller $${small} position on ${second}, the protocol's second chain, so the farm is counted on two chains instead of one.`;
  }
  return `Do a second kind of action on ${chain} with $${small}: if the first step was a deposit, add a swap or a vote in the same wallet, so the farm shows more than one behaviour.`;
}

/** A risk note derived from the protocol's own figures, or null when nothing stands out. */
export function riskNote(p: SnapshotProtocol, age: number | null): string | null {
  if (p.change_7d !== null && p.change_7d <= -20) {
    return `TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in 7 days: size the position small and check the outflow before adding more.`;
  }
  if (age !== null && age < 90) {
    return `Listed under 90 days ago: the protocol is young, so treat the farm as a small test before committing the full amount.`;
  }
  if (p.chains.length === 0) {
    return `No chain is recorded for this protocol: confirm where it actually runs before sending funds.`;
  }
  if (p.tvl_usd < 10_000_000) {
    return `TVL under $10M: a small protocol can move fast, but check its audits and team before depositing.`;
  }
  return null;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age, seven-day change),
 * never from a hand-written list of names. The second step is the category's action, the
 * third repeats it on a second chain when the protocol runs on one, the fifth is points
 * tracking, and the seventh carries the risk note when the figures stand out.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasUsd(chain);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const risk = riskNote(p, age);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about $${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about $${gas} of gas on the second action`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the receipts.`,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Once a week, open the protocol's own points or rewards page and write down your points balance and any snapshot date it names.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: risk ??
        `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: risk ? 'no fee to check' : 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio:
        p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** One category's weight on the board, for the dashboard's category heat. */
export function categoryHeat(board: BoardRow[], multiples: Map<string, CategoryMultiple>): CategoryAggregate[] {
  const byCat = new Map<string, { rows: number; total: number; topName: string; topImplied: number }>();
  for (const r of board) {
    const key = r.category ?? 'Other';
    const agg = byCat.get(key) ?? { rows: 0, total: 0, topName: '', topImplied: 0 };
    agg.rows += 1;
    agg.total += r.implied_value_usd;
    if (r.implied_value_usd > agg.topImplied) {
      agg.topImplied = r.implied_value_usd;
      agg.topName = r.name;
    }
    byCat.set(key, agg);
  }
  return [...byCat.entries()]
    .map(([category, agg]) => ({
      category,
      rows: agg.rows,
      total_implied_usd: agg.total,
      top_name: agg.topName,
      top_implied_usd: agg.topImplied,
      multiple: multiples.get(category)?.multiple ?? 0,
    }))
    .sort((a, b) => b.total_implied_usd - a.total_implied_usd)
    .slice(0, HEAT_CATEGORIES);
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    readiness_score: row.readiness_score,
    tier: row.tier,
    category_rank: row.category_rank,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    momentum_multiplier: row.model.momentum_multiplier,
    scale_multiplier: row.model.scale_multiplier,
    category_median_7d: row.model.category_median_7d,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { global, byCategory } = categoryMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  // The multiples table the model panel shows: every category on the board, by multiple.
  const onBoard = new Set(board.map((r) => r.category ?? 'Other'));
  const multiples = [...byCategory.values()]
    .filter((c) => onBoard.has(c.category))
    .map((c) => {
      const catRows = board.filter((r) => (r.category ?? 'Other') === c.category);
      const med = catRows.length > 0 ? catRows[0]!.model.category_median_7d : 0;
      return { category: c.category, multiple: c.multiple, live_n: c.live_n, median_7d: med };
    })
    .sort((a, b) => b.multiple - a.multiple);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: global,
    category_multiples: multiples,
    category_heat: categoryHeat(board, byCategory),
    watchlist: snapshot.watchlist,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (
      typeof p.slug !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.tvl_usd !== 'number' ||
      !Number.isFinite(p.tvl_usd)
    ) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains)
        ? p.chains.filter((c): c is string => typeof c === 'string')
        : [],
      tvl_usd: p.tvl_usd,
      change_7d:
        typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd:
        typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (
    board.length >= 2 &&
    board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd
  ) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.readiness_score < 0 || r.readiness_score > 100) {
      return `${r.slug} has readiness score ${r.readiness_score}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
