// Token Radar v2's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's
// own inputs, a readiness breakdown, same-category peers and the protocol's farm plan, and the
// method behind the ranking. No network: every byte it shows is in data.js.
//
// The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age
// and seven-day change decide the action, the capital, the hold and every cost and time. No name
// is special-cased. The page also recomputes each row's implied value from the snapshot figures
// and checks the number board.json carries, so the page's code and the board's data are visibly
// the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', tier: 'all', watchlistOnly: false, minTvl: 0,
    tab: 'pre-token', sort: 'implied', dir: -1, selected: null,
  };
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });
  // The watchlist is the floor: rows on it are marked, and the toggle shows only them.
  function isWatchlist(r) {
    return !!WATCHLIST[r.slug];
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    return 'x' + n.toFixed(2);
  }
  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries. Category multiple comes from the snapshot's own live-token medians
  // (DATA.category_multiples), never from a hand-written table; momentum is measured against the
  // category's own median seven-day move, and scale against the watchlist's $50M floor.
  function impliedOf(row, model) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, model.growth_floor, model.growth_cap);
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains);
    var momentum = 1 + (clamp((row.change_7d === null ? 0 : row.change_7d) - (row.category_median_7d || 0), model.momentum_floor, model.momentum_cap) / 100) * model.momentum_weight;
    var scale = model.scale_floor + model.scale_range * Math.min(1, Math.max(row.tvl_usd, 0) / model.scale_tvl_usd);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth * momentum * scale));
  }

  // The readiness score's five parts, each 0 to its weight, so the detail view can show the
  // score as a breakdown rather than a bare number.
  function readinessParts(row, model) {
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days;
    var growth = (clamp(row.change_7d === null ? 0 : row.change_7d, model.readiness_growth_floor, model.readiness_growth_cap) - model.readiness_growth_floor) / (model.readiness_growth_cap - model.readiness_growth_floor);
    var breadth = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains) / model.breadth_max_chains;
    var category = clamp((row.category_multiple - model.category_min) / (model.category_max - model.category_min), 0, 1);
    var scale = Math.min(1, Math.max(row.tvl_usd, 0) / model.scale_tvl_usd);
    return [
      { label: 'Maturity', pts: model.readiness_maturity * maturity, max: model.readiness_maturity },
      { label: 'Growth', pts: model.readiness_growth * growth, max: model.readiness_growth },
      { label: 'Breadth', pts: model.readiness_breadth * breadth, max: model.readiness_breadth },
      { label: 'Category', pts: model.readiness_category * category, max: model.readiness_category },
      { label: 'Scale', pts: model.readiness_scale * scale, max: model.readiness_scale }
    ];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- Farm plan: the same derivation as lib/model.ts, step for step. ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function secondChainOf(p) { return p.chains && p.chains.length > 1 ? p.chains[1] : null; }
  function gasUsd(chain) {
    switch (chain) {
      case 'Ethereum': return 8;
      case 'Bitcoin': return 5;
      case 'Solana': case 'Base': case 'Arbitrum': case 'Optimism':
      case 'Polygon': case 'Avalanche': case 'BNB Chain': case 'Binance':
      case 'Monad': case 'Hyperliquid L1': case 'Tron': case 'Sui':
      case 'Aptos': case 'Sei': case 'Berachain': case 'Sonic': return 1;
      default: return 2;
    }
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + " and leave the vault shares in the farming wallet so the curator's allocation is tied to you.";
    if (c.indexOf('capital allocator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s allocation vault on " + chain + ' and keep the position open through at least one rebalance.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow a small amount against it and repay it once, so the position shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open through at least one fee cycle.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds in its app instead of bridging straight back.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ', open one small hedge, and close it the same week so the account shows real trading.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then settle or close it before the market resolves.';
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it so the balance accrues.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the whole hold.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " through " + name + "'s shielded pool on " + chain + ' and withdraw it to a fresh address only after the hold.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s basis vault on " + chain + ' and keep the position through one funding cycle.';
    if (c.indexOf('liquid') >= 0) return 'Mint $' + capital + ' of the liquid staking token through ' + name + ' on ' + chain + ' and use it once in another app on the same chain.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold the index token for the whole hold.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + " across " + name + "'s flagship apps on " + chain + ': swap once, deposit once, and hold the chain\'s gas token for the whole hold.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' across two separate weeks, keeping the receipts in the farming wallet.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote once in its governance while the position is open.';
    if (c.indexOf('otc') >= 0) return 'Complete one $' + capital + ' trade through ' + name + ' on ' + chain + ' and keep the settlement receipt in the farming wallet.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use the app once a week while the position is open.';
  }
  function secondActionFor(p, capital, chain) {
    var second = secondChainOf(p);
    var small = Math.max(25, Math.round(capital / 2));
    if (second !== null) {
      return 'Repeat a smaller $' + small + ' position on ' + second + ", the protocol's second chain, so the farm is counted on two chains instead of one.";
    }
    return 'Do a second kind of action on ' + chain + ' with $' + small + ': if the first step was a deposit, add a swap or a vote in the same wallet, so the farm shows more than one behaviour.';
  }
  function riskNote(p, age) {
    if (p.change_7d !== null && p.change_7d !== undefined && p.change_7d <= -20) {
      return 'TVL fell ' + Math.abs(p.change_7d).toFixed(1) + '% in 7 days: size the position small and check the outflow before adding more.';
    }
    if (age !== null && age !== undefined && age < 90) {
      return 'Listed under 90 days ago: the protocol is young, so treat the farm as a small test before committing the full amount.';
    }
    if (!p.chains || p.chains.length === 0) {
      return 'No chain is recorded for this protocol: confirm where it actually runs before sending funds.';
    }
    if (p.tvl_usd < 1e7) {
      return 'TVL under $10M: a small protocol can move fast, but check its audits and team before depositing.';
    }
    return null;
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasUsd(chain);
    var risk = riskNote(p, p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about $' + gas + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + gas + ' of gas on the second action', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the receipts.', cost: 'about $' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: "Once a week, open the protocol's own points or rewards page and write down your points balance and any snapshot date it names.", cost: 'no fee to check', time: '5 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: risk || "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: risk ? 'no fee to check' : 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  // The whole farm, priced: capital at risk, gas across the hold, and the minutes it takes.
  function farmCost(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasUsd(chain);
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var gasTotal = gas * (3 + weeks);
    var minutes = 5 + 15 + 10 + 10 * weeks + 5 * weeks + 10 + 5;
    return { capital: capital, gasTotal: gasTotal, hold: hold, weeks: weeks, minutes: minutes };
  }

  // ---- State from the URL hash, so a board, a detail and a filtered view are linkable. ----
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('mintvl')) state.minTvl = Number(params.get('mintvl')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.minTvl) params.set('mintvl', String(state.minTvl));
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.watchlistOnly && !isWatchlist(r)) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'score') { av = a.readiness_score; bv = b.readiness_score; }
      else if (key === 'catmult') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { html: 'Snapshot <b>' + DATA.as_of + '</b>' }),
        el('span', { html: 'DefiLlama protocol index' }),
        el('span', { html: '<b>' + DATA.model_version + '</b> model · 6 factors' })
      )
    );
  }

  function lede() {
    var top10 = DATA.rows.slice(0, 10).reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var tierS = DATA.rows.filter(function (r) { return r.tier === 'S'; }).length;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { html: 'Every pre-token protocol,<br>ranked by <em>implied value</em>' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least ' + fmtUsd(DATA.floor_usd) + ' of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, down to the snapshot\u2019s $5M cut. Each row carries an implied value, a readiness score out of 100 and a tier, so the strongest launches and the most ready ones are visible at a glance.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list is ranked' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' of them below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top 10 implied value' }), el('b', { text: fmtUsd(top10) }), el('small', { text: tierS + ' tier-S launches lead the board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'they already trade; their market cap is shown' }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 10);
    return el('section', { class: 'spot' },
      el('h2', { text: 'Top 10 · strongest implied value' }),
      el('div', { class: 'spot-grid' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rankline', text: 'Rank ' + r.rank + ' · Tier ' + r.tier }),
          el('b', { text: r.name }),
          el('span', { class: 'val num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'mv', text: ' ' + fmtPct(r.change_7d) + ' 7d · ' + fmtUsd(r.tvl_usd) })
        );
      }))
    );
  }

  function heat() {
    var heatRows = DATA.category_heat || [];
    if (heatRows.length === 0) return null;
    var max = heatRows[0].total_implied_usd || 1;
    return el('section', { class: 'heat' },
      el('h2', { text: 'Where the value sits · implied value by category' }),
      el('div', { class: 'heat-rows' }, heatRows.map(function (h) {
        return el('button', {
          type: 'button', class: 'heat-row',
          onclick: function () { state.category = h.category; state.tab = 'pre-token'; writeHash(); render(); document.getElementById('board').scrollIntoView(); }
        },
          el('span', { class: 'cat', text: h.category }),
          el('span', { class: 'track', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((h.total_implied_usd / max) * 100)) + '%' })),
          el('span', { class: 'tot num', text: fmtUsd(h.total_implied_usd) }),
          el('span', { class: 'top', text: h.rows + ' rows · ' + h.top_name })
        );
      }))
    );
  }

  function movers() {
    var hot = DATA.rows
      .filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined; })
      .slice().sort(function (a, b) { return b.change_7d - a.change_7d; })
      .slice(0, 5);
    return el('section', { class: 'movers' },
      el('h2', { text: 'Moving fastest this week' }),
      el('div', { class: 'mover-row' }, hot.map(function (r) {
        return el('button', { type: 'button', class: 'mover', onclick: function () { openDetail(r.slug); } },
          el('b', { text: '#' + r.rank + ' ' + r.name }),
          el('span', { class: 'mv' }, fmtPct(r.change_7d), el('small', { text: ' 7d \u00b7 ' + fmtUsd(r.tvl_usd) + ' TVL' }))
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var tier = el('select', { id: 'tier', 'aria-label': 'Filter by tier' },
      [['all', 'All tiers'], ['S', 'Tier S · top 10'], ['A', 'Tier A · 11–25'], ['B', 'Tier B · 26–99'], ['C', 'Tier C · 100+']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: state.tier === o[0] ? 'selected' : null });
      })
    );
    tier.addEventListener('change', function () { state.tier = tier.value; writeHash(); render(); });
    var tvl = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      [[0, 'Any TVL'], [5e7, '$50M TVL or more'], [1e8, '$100M TVL or more'], [5e8, '$500M TVL or more'], [1e9, '$1B TVL or more']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: state.minTvl === o[0] ? 'selected' : null });
      })
    );
    tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value); writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'tier', text: 'Tier' }), tier),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Size' }), tvl),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.watchlistOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (isWatchlist(r) ? ' \u00b7 watchlist' : ' \u00b7 early radar') + ' \u00b7 #' + r.category_rank + ' in category' })
        )),
        el('td', { class: 'col-tier' }, el('span', { class: 'tier tier-' + r.tier, text: r.tier })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num col-age', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'score-cell' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, r.readiness_score) + '%' })),
          el('span', { class: 'num', text: String(r.readiness_score) })
        )),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, readiness, peers and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', class: 'col-tier', text: 'Tier' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age', 'col-age'),
            sortHeader('score', 'Ready'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl_ratio === null ? 'n/a' : fmtMult(r.mcap_tvl_ratio) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap / TVL ratios are what set the category multiples above.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var top = DATA.rows[0];
    var example = '';
    if (top) {
      example = 'Worked example, rank 1 (' + top.name + '): ' + fmtUsd(top.tvl_usd) + ' TVL x ' + fmtMult(top.category_multiple) + ' category x ' + fmtMult(top.growth_multiplier) + ' growth x ' + fmtMult(top.maturity_multiplier) + ' maturity x ' + fmtMult(top.breadth_multiplier) + ' breadth x ' + fmtMult(top.momentum_multiplier) + ' momentum x ' + fmtMult(top.scale_multiplier) + ' scale = ' + fmtUsd(top.implied_value_usd) + ' implied value, readiness ' + top.readiness_score + '/100.';
    }
    var catRows = (DATA.category_multiples || []).map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', { class: 'num', text: String(c.live_n) }),
        el('td', { class: 'num ' + (c.median_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(c.median_7d) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The category multiple is the part the snapshot itself sets: it is the median market-cap / TVL of the live-token protocols in that category, so a category whose tokens already trade dear against TVL earns a higher multiple. Momentum is new in radar-3: a protocol is measured against its own category\u2019s median seven-day move, so outrunning its peers counts and riding the category\u2019s wave does not. Scale is new too: below the watchlist\u2019s $50M floor the model takes a modest haircut, because a small protocol\u2019s implied value is less certain than a large one\u2019s.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category x growth x maturity x breadth x momentum x scale )\n' +
        '  category = median(mcap / tvl) of live-token protocols in the category (n >= ' + m.category_min_live + '),\n' +
        '             else the global median ' + fmtMult(DATA.global_multiple) + '; clamped to [' + m.category_min + ', ' + m.category_max + ']\n' +
        '  growth   = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '\n' +
        '  maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '\n' +
        '  breadth  = 1 + ' + m.breadth_step + ' x min(chains - 1, ' + m.breadth_max_chains + ')\n' +
        '  momentum = 1 + clamp(change_7d - category_median_7d, ' + m.momentum_floor + ', ' + m.momentum_cap + ') / 100 x ' + m.momentum_weight + '\n' +
        '  scale    = ' + m.scale_floor + ' + ' + m.scale_range + ' x min(1, tvl_usd / ' + fmtUsd(m.scale_tvl_usd) + ')'
      ),
      el('p', { class: 'example' }, el('b', { text: example })),
      el('h3', { text: 'Readiness: a second read of the same figures' }),
      el('p', { text: 'Readiness is 0 to 100 and independent of size: a large protocol can score low on it and a small one high. It blends maturity (' + m.readiness_maturity + ' points), growth (' + m.readiness_growth + '), breadth (' + m.readiness_breadth + '), category strength (' + m.readiness_category + ') and scale (' + m.readiness_scale + '). The detail view shows the five parts for every protocol.' }),
      el('div', { class: 'bands' },
        el('span', { class: 'band', html: '<b>55+</b> Strong' }),
        el('span', { class: 'band', html: '<b>40–54</b> Solid' }),
        el('span', { class: 'band', html: '<b>25–39</b> Early' }),
        el('span', { class: 'band', html: '<b>under 25</b> Thin' }),
        el('span', { class: 'band', html: '<b>S</b> rank 1–10 · <b>A</b> 11–25 · <b>B</b> 26–99 · <b>C</b> 100+' })
      ),
      el('h3', { text: 'Category multiples, from the snapshot' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'cat-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Multiple' }), el('th', { scope: 'col', class: 'num', text: 'Live tokens' }), el('th', { scope: 'col', class: 'num', text: 'Median 7d' }))),
          el('tbody', null, catRows)
        )
      ),
      el('p', { class: 'fine', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. "Records no token" means DefiLlama carries no market cap, CoinGecko id or symbol for it: a protocol on the list may still have a token its record does not carry. The early radar is every rankable pre-token protocol below the watchlist floor, by implied value, and the live-token protocols are set aside with their market caps shown. The model does not predict whether or when a token is issued, and it never ranks a protocol by its name. This is an estimate, not a price and not financial advice.' })
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '; the data does not move. Model ' + DATA.model_version + ': six factors plus a readiness score, all from the snapshot\u2019s own figures.' }),
      el('p', { text: 'Token Radar ranks protocols that record no token by what a token could be worth if the protocol\u2019s record stayed as it is. It does not predict whether or when a token is issued.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var risk = riskNote(row, row.age_days);
    var cost = farmCost(row);
    var parts = readinessParts(row, DATA.model);
    var peers = DATA.rows.filter(function (r) { return (r.category || 'Other') === (row.category || 'Other'); }).slice(0, 5);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · Tier ' + row.tier + (isWatchlist(row) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · #' + row.category_rank + ' in its category' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Category median 7d' }), el('b', { class: 'num', text: fmtPct(row.category_median_7d) })),
        el('div', null, el('span', { text: 'Momentum multiplier' }), el('b', { class: 'num', text: fmtMult(row.momentum_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: fmtMult(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Scale multiplier' }), el('b', { class: 'num', text: fmtMult(row.scale_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'verify', html: 'Model ' + DATA.model_version + ': the page recomputes this row as <b>' + fmtUsd(recomputed) + '</b>' + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Readiness ' + row.readiness_score + ' / 100' }),
      el('div', { class: 'readiness' }, parts.map(function (p) {
        return el('div', null,
          el('span', { text: p.label + ' · ' + p.max + ' pts' }),
          el('span', { class: 'track' }, el('i', { style: 'width:' + Math.max(2, Math.round((p.pts / p.max) * 100)) + '%' })),
          el('b', { class: 'num', text: p.pts.toFixed(1) })
        );
      })),
      el('p', { text: 'Readiness is size-free: it says how mature, fast-growing, broad and well-placed the protocol is, not how big it is.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Peers in ' + (row.category || 'Other') }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'peer-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Rank' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Implied value' }))),
          el('tbody', null, peers.map(function (p) {
            return el('tr', { 'data-here': p.slug === row.slug ? 'true' : 'false' },
              el('td', { class: 'num', text: '#' + p.rank }),
              el('td', { text: p.name }),
              el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
              el('td', { class: 'num ' + (p.change_7d !== null && p.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(p.change_7d) }),
              el('td', { class: 'num', text: fmtUsd(p.implied_value_usd) })
            );
          }))
        )
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      risk ? el('p', { class: 'risk', text: risk }) : null,
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'costline', text: 'Whole farm, priced: $' + cost.capital + ' of capital at risk, about $' + cost.gasTotal + ' of gas over ' + cost.hold + ' days (' + cost.weeks + ' weekly actions), and about ' + cost.minutes + ' minutes of clicking in all. The capital comes back when the position is unwound; the gas does not.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    // Clearing the shell removes the open dialog from the document, which fires its
    // close event and clears state.selected; keep the selection so the detail view
    // survives a re-render (a filter change, a hash change) instead of vanishing.
    var keepSelected = state.selected;
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    if (state.tab === 'pre-token') shell.appendChild(heat());
    if (state.tab === 'pre-token') shell.appendChild(movers());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (keepSelected) openDetail(keepSelected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
  // Back/forward and in-page links change the hash without reloading: re-read it and
  // re-render, so a detail or filtered view reached that way shows the right protocol.
  window.addEventListener('hashchange', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all';
    state.watchlistOnly = false; state.minTvl = 0; state.tab = 'pre-token'; state.selected = null;
    readHash();
    if (!state.selected && dialog.open) dialog.close();
    render();
  });
})();
