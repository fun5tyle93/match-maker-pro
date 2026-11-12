#!/usr/bin/env node
// Reference prototype for the Swiss pairing described in docs/UMSETZUNGSPLAN.md (Schritt B).
// Rules: no pair meets twice in the Swiss phase; a bye counts as a pairing against the virtual player BYE,
// so nobody gets a second bye; a round is only accepted if all remaining rounds stay solvable (lookahead).
//
//   node scripts/swiss-pairing-prototype.mjs          quick simulation
//   FULL=1 node scripts/swiss-pairing-prototype.mjs   larger simulation (takes a few minutes)
//
// Translate this to TypeScript (src/lib/swissPairingEngine.ts) instead of inventing a new algorithm.
const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
let budget = 0;
function canSchedule(nodes, played, k, memo) {
  if (k === 0) return true;
  const mk = k + '#' + [...played].sort().join(',');
  if (memo.has(mk)) return memo.get(mk);
  let ok = false;
  const un = new Set(nodes);
  const pairs = [];
  const dfs = () => {
    if (ok) return;
    if (--budget < 0) throw new Error('budget');
    if (un.size === 0) {
      const next = new Set(played); pairs.forEach(([a, b]) => next.add(key(a, b)));
      if (canSchedule(nodes, next, k - 1, memo)) ok = true;
      return;
    }
    const a = un.values().next().value; un.delete(a);
    for (const b of [...un]) {
      if (played.has(key(a, b))) continue;
      un.delete(b); pairs.push([a, b]); dfs(); pairs.pop(); un.add(b);
      if (ok) break;
    }
    un.add(a);
  };
  dfs(); memo.set(mk, ok); return ok;
}
// order: ids nach Rang (bester zuerst), BYE (falls vorhanden) ans Ende
function pairRound(order, played, roundsAfter) {
  const rank = new Map(order.map((id, i) => [id, i]));
  const un = new Set(order); const pairs = []; let result = null; const memo = new Map();
  const dfs = () => {
    if (result) return;
    if (--budget < 0) throw new Error('budget');
    if (un.size === 0) {
      const next = new Set(played); pairs.forEach(([a, b]) => next.add(key(a, b)));
      if (canSchedule(order, next, roundsAfter, memo)) result = pairs.map(p => [...p]);
      return;
    }
    const a = order.find(id => un.has(id)); un.delete(a);
    const cands = [...un].filter(b => !played.has(key(a, b))).sort((x, y) => Math.abs(rank.get(x) - rank.get(a)) - Math.abs(rank.get(y) - rank.get(a)));
    for (const b of cands) { un.delete(b); pairs.push([a, b]); dfs(); pairs.pop(); un.add(b); if (result) break; }
    un.add(a);
  };
  dfs(); return result;
}

// ─── Simulation: random results, players ordered by points (ties shuffled) ───
const FULL = process.env.FULL === '1';
const out = [];
for (const n of FULL ? [4, 5, 6, 7, 8, 9, 10, 12, 13, 16, 20] : [4, 5, 6, 7, 8, 9, 12, 13]) {
  const odd = n % 2 === 1; const maxR = odd ? n : n - 1;
  for (const R of [...new Set([2, Math.min(5, maxR), maxR])]) {
    let fails = 0, rematches = 0, budgetHits = 0, maxMs = 0;
    const T = FULL ? (n >= 16 && R === maxR ? 20 : 150) : 40;
    for (let t = 0; t < T; t++) {
      const ids = Array.from({ length: n }, (_, i) => 'p' + i); const pts = Object.fromEntries(ids.map(i => [i, 0]));
      const played = new Set();
      for (let r = 1; r <= R; r++) {
        const order = [...ids].sort((a, b) => pts[b] - pts[a] || Math.random() - 0.5); if (odd) order.push('BYE');
        budget = 3_000_000; const t0 = Date.now(); let pr;
        try { pr = pairRound(order, played, R - r); } catch { budgetHits++; break; }
        maxMs = Math.max(maxMs, Date.now() - t0);
        if (!pr) { fails++; break; }
        for (const [a, b] of pr) {
          if (played.has(key(a, b))) rematches++;
          played.add(key(a, b));
          if (a !== 'BYE' && b !== 'BYE') { const x = Math.random(); if (x < 0.45) pts[a] += 2; else if (x < 0.9) pts[b] += 2; else { pts[a]++; pts[b]++; } }
        }
      }
    }
    out.push(`n=${n} Runden=${R}${R === maxR ? ' (max)' : ''}: Turniere ${T}, nicht auslosbar ${fails}, Wiederholungen ${rematches}, Budget erreicht ${budgetHits}, langsamste Runde ${maxMs} ms`);
  }
}
console.log(out.join('\n'));
