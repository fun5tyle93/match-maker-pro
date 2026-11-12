#!/usr/bin/env node
// Reference implementation of the DTKV tie-break for a group (round robin), Spielordnung 2026 § 8 Absatz 3.
// Used to verify the TypeScript implementation (docs/UMSETZUNGSPLAN.md, Abschnitt "Wertung").
//
//   node scripts/dtkv-ranking-reference.mjs                 runs the worked examples (§ 8 Abs. 3 and § 9 Abs. 6)
//   node scripts/dtkv-ranking-reference.mjs <backup/data>   compares every saved evening with the old ranking
//
// Rules (§ 8 Abs. 3):
//  - Sort by points in the group (Hauptgruppe).
//  - Players level on points form a sub-group; points are recomputed from the games among them only
//    (for two players this is the direct comparison). Players still level form a sub-sub-group, and so on.
//  - When points inside a (sub-)group cannot separate the players any more, the goal difference and then
//    the goals scored decide, taken first from the next higher group, then from the group above that, up to
//    the Hauptgruppe ("Torverhältnis aller Betroffenen in der nächst höheren Gruppe").
//  - A complete tie after that stays a tie (Entscheidungsspiel/-runde needed, § 8 Abs. 3 Sätze 11-15).
import { readFileSync } from 'fs';
import { join } from 'path';

/** matches: [{ home, away, hs, as }] (completed games only). Returns blocks: [[id], [id, id] (tie), ...] best first. */
export function rankGroup(playerIds, matches) {
  const statsOf = (set, ms) => {
    const st = new Map([...set].map(id => [id, { pts: 0, gf: 0, ga: 0 }]));
    for (const m of ms) {
      if (!st.has(m.home) || !st.has(m.away)) continue;
      const h = st.get(m.home), a = st.get(m.away);
      h.gf += m.hs; h.ga += m.as; a.gf += m.as; a.ga += m.hs;
      if (m.hs > m.as) h.pts += 2; else if (m.hs < m.as) a.pts += 2; else { h.pts++; a.pts++; }
    }
    return st;
  };
  const among = set => matches.filter(m => set.has(m.home) && set.has(m.away));
  const groupBy = (ids, keyFn) => {
    const sorted = [...ids].sort((x, y) => { const kx = keyFn(x), ky = keyFn(y); for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return ky[i] - kx[i]; return 0; });
    const blocks = [];
    for (const id of sorted) { const last = blocks[blocks.length - 1]; if (last && keyFn(last[0]).every((v, i) => v === keyFn(id)[i])) last.push(id); else blocks.push([id]); }
    return blocks;
  };
  // ancestors: groups above `set`, nearest first, Hauptgruppe last
  const rank = (set, ancestors) => {
    const st = statsOf(set, among(set));
    const out = [];
    for (const block of groupBy(set, id => [st.get(id).pts])) {
      if (block.length === 1) { out.push(block); continue; }
      if (block.length < set.size) { out.push(...rank(new Set(block), [set, ...ancestors])); continue; }
      // points inside this group cannot separate: goals of the next higher group(s), up to the Hauptgruppe
      const chain = ancestors.length ? ancestors : [set];
      const goalStats = chain.map(g => statsOf(g, among(g)));
      const key = id => goalStats.flatMap(s => { const x = s.get(id); return [x.gf - x.ga, x.gf]; });
      out.push(...groupBy(block, key));
    }
    return out;
  };
  return rank(new Set(playerIds), []);
}

// Old app ranking (calculatePlayerStats): points, goal difference, goals scored, goals against, pairwise head-to-head
export function rankOld(playerIds, matches) {
  const st = new Map(playerIds.map(id => [id, { pts: 0, gf: 0, ga: 0 }]));
  for (const m of matches) { const h = st.get(m.home), a = st.get(m.away); if (!h || !a) continue; h.gf += m.hs; h.ga += m.as; a.gf += m.as; a.ga += m.hs; if (m.hs > m.as) h.pts += 2; else if (m.hs < m.as) a.pts += 2; else { h.pts++; a.pts++; } }
  const h2h = (x, y) => { let p = 0; for (const m of matches) { if (m.home === x && m.away === y) p += Math.sign(m.hs - m.as); if (m.home === y && m.away === x) p += Math.sign(m.as - m.hs); } return p; };
  return [...playerIds].sort((x, y) => { const a = st.get(x), b = st.get(y); return (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf) || (a.ga - b.ga) || -h2h(x, y); });
}


// Final ranking of a Swiss tournament with playoff, Spielordnung 2026 § 9 Absatz 6.
// playoff: [{ round, home, away, hs, as, sd, bye }]  round: 1 = final, 2 = semi-final, 3 = quarter-final, 4 = round of 16
//          sd = decided by sudden death; bye = playoff Freilos (home advances, no game)
// swissOrder: player ids in Swiss ranking order (6.6). Returns all player ids, place 1 first.
export function finalRankingSwiss(playoff, swissOrder) {
  const winner = m => (m.bye ? m.home : m.hs > m.as ? m.home : m.away);
  const loser = m => (m.bye ? null : m.hs > m.as ? m.away : m.home);
  // Playoff points per game: win 2, win after sudden death 1.5, loss after sudden death 0.5, loss 0
  const games = id => playoff.filter(m => !m.bye && (m.home === id || m.away === id));
  const pts = id => games(id).reduce((sum, m) => sum + (winner(m) === id ? (m.sd ? 1.5 : 2) : (m.sd ? 0.5 : 0)), 0);
  const diff = id => games(id).reduce((sum, m) => sum + (m.home === id ? m.hs - m.as : m.as - m.hs), 0);
  const order = [];
  const place = new Map();
  const add = id => { order.push(id); place.set(id, order.length); };
  const final = playoff.find(m => m.round === 1);
  if (final) { add(winner(final)); add(loser(final)); }
  const rounds = [...new Set(playoff.map(m => m.round))].filter(r => r > 1).sort((a, b) => a - b);
  for (const r of rounds) {
    const out = playoff.filter(m => m.round === r && !m.bye).map(m => ({ id: loser(m), by: winner(m) }));
    out.sort((a, b) => (pts(b.id) - pts(a.id)) || (diff(b.id) - diff(a.id)) || (place.get(a.by) - place.get(b.by)));
    out.forEach(o => add(o.id));
  }
  swissOrder.filter(id => !place.has(id)).forEach(add);   // not qualified for the playoff: Swiss ranking
  return order;
}

const show = blocks => blocks.map(b => b.join('=')).join(' > ');
const g = (home, away, hs, as) => ({ home, away, hs, as });

if (process.argv.length <= 2) {
  const cases = [
    { name: '1 Zwei punktgleich, direkter Vergleich schlägt bessere Tordifferenz',
      // A and B 4 points, A beat B 1:0 although B has +17 goal difference; C and D 2 points, D beat C
      players: ['A', 'B', 'C', 'D'], matches: [g('A', 'B', 1, 0), g('C', 'A', 1, 0), g('A', 'D', 1, 0), g('B', 'C', 9, 0), g('B', 'D', 9, 0), g('D', 'C', 1, 0)],
      expect: 'A > B > D > C' },
    { name: '2 Zwei punktgleich, direkter Vergleich unentschieden: Tordifferenz der Hauptgruppe',
      players: ['A', 'B', 'C'], matches: [g('A', 'B', 2, 2), g('A', 'C', 3, 0), g('B', 'C', 1, 0)], expect: 'A > B > C' },
    { name: '3 Drei punktgleich im Kreis: Untergruppe gleich, Tordifferenz der Hauptgruppe',
      players: ['A', 'B', 'C', 'D'], matches: [g('A', 'B', 1, 0), g('B', 'C', 1, 0), g('C', 'A', 1, 0), g('A', 'D', 5, 0), g('B', 'D', 3, 0), g('C', 'D', 1, 0)], expect: 'A > B > C > D' },
    { name: '4 Zwei punktgleiche Paare, jeweils direkter Vergleich',
      players: ['A', 'B', 'C', 'D'], matches: [g('A', 'B', 3, 0), g('A', 'C', 3, 0), g('B', 'C', 0, 1), g('D', 'A', 1, 0), g('B', 'D', 1, 0), g('C', 'D', 1, 0)], expect: 'A > C > B > D' },
    { name: '5 Völlige Gleichheit bleibt Gleichstand (Entscheidungsspiel nötig)',
      players: ['A', 'B'], matches: [g('A', 'B', 2, 2)], expect: 'A=B' },
    { name: '6 Unteruntergruppe unentschieden: Tore der Untergruppe vor Hauptgruppe',
      // A, B, C level on 4 points. Sub-group: A 4 points, B and C 1 each with a 0:0 draw.
      // Sub-group goal difference B -1, C -5 -> B before C, although C has the better main-group difference (+4 vs 0).
      players: ['A', 'B', 'C', 'D', 'E'],
      matches: [g('A', 'B', 1, 0), g('A', 'C', 5, 0), g('B', 'C', 0, 0), g('D', 'A', 1, 0), g('E', 'A', 1, 0),
        g('B', 'D', 1, 0), g('B', 'E', 1, 1), g('C', 'D', 9, 0), g('C', 'E', 0, 0), g('D', 'E', 0, 0)],
      expect: 'E > A > B > C > D' },
  ];
  let fails = 0;
  for (const c of cases) {
    const got = show(rankGroup(c.players, c.matches));
    const ok = got === c.expect; if (!ok) fails++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name}: ${got}${ok ? '' : ` (erwartet ${c.expect})`}   alt: ${rankOld(c.players, c.matches).join(' > ')}`);
  }

  // § 9 Abs. 6: quarter-final playoff of 8, 12 players in the Swiss phase (P1 = best of the Swiss ranking)
  {
    const P = n => 'P' + n;
    const po = [
      { round: 3, home: P(1), away: P(8), hs: 2, as: 1 },
      { round: 3, home: P(4), away: P(5), hs: 2, as: 3, sd: true },   // 2:2, P5 scores the sudden-death goal
      { round: 3, home: P(2), away: P(7), hs: 4, as: 0 },
      { round: 3, home: P(3), away: P(6), hs: 1, as: 2 },
      { round: 2, home: P(1), away: P(5), hs: 1, as: 2 },
      { round: 2, home: P(2), away: P(6), hs: 2, as: 1, sd: true },   // 1:1, P2 scores the sudden-death goal
      { round: 1, home: P(5), away: P(2), hs: 0, as: 3 },
    ];
    const got = finalRankingSwiss(po, Array.from({ length: 12 }, (_, i) => P(i + 1))).join(' > ');
    // 1 P2, 2 P5; semi-final losers: P6 2.5 points (2 + 0.5) before P1 2 points;
    // quarter-final losers: P4 0.5 first; P3 and P8 both 0 points and -1 -> P3 lost to P6 (place 3), P8 to P1 (place 4) -> P3 first; P7 0 / -4 last;
    // places 9-12 from the Swiss ranking
    const expect = 'P2 > P5 > P6 > P1 > P4 > P3 > P8 > P7 > P9 > P10 > P11 > P12';
    const ok = got === expect; if (!ok) fails++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} 7 Abschlussrangliste Schweizer System (§ 9 Abs. 6, halbe Punkte nach Sudden Death): ${got}${ok ? '' : ` (erwartet ${expect})`}`);
  }
  process.exit(fails ? 1 : 0);
}

// Compare saved evenings (backup data dir)
const dir = process.argv[2];
const read = t => JSON.parse(readFileSync(join(dir, `${t}.json`), 'utf8'));
const sessions = read('training_sessions'), tp = read('training_players'), allMatches = read('matches');
let differ = 0, top1 = 0, top2 = 0, ties = 0, n = 0;
for (const s of sessions.filter(x => x.is_completed).sort((a, b) => a.date.localeCompare(b.date))) {
  const ids = [...new Set(tp.filter(p => p.session_id === s.id).map(p => p.player_id))];
  const name = new Map(tp.filter(p => p.session_id === s.id).map(p => [p.player_id, p.player_name]));
  const ms = allMatches.filter(m => m.session_id === s.id && m.is_completed && (m.phase ?? 'swiss') === 'swiss' && m.home_score !== null)
    .map(m => g(m.home_player_id, m.away_player_id, m.home_score, m.away_score));
  if (!ids.length || !ms.length) continue;
  n++;
  const neu = rankGroup(ids, ms), alt = rankOld(ids, ms);
  const neuFlat = neu.flat();
  const tie12 = neu[0].length > 1 || (neu[1] && neu[1].length > 1 && neu[0].length === 1);
  if (neu.some(b => b.length > 1)) ties++;
  if (neuFlat.join() !== alt.join()) {
    differ++;
    const t1 = neuFlat[0] !== alt[0], t2 = neuFlat[1] !== alt[1];
    if (t1) top1++; if (t2) top2++;
    console.log(`${s.date.slice(0, 10)} ${s.name ?? '-'}: ${t1 || t2 ? 'SIEGER/VIZE ÄNDERN SICH' : 'nur hintere Plätze'}`);
    console.log(`   neu: ${neu.map(b => b.map(id => name.get(id)).join(' = ')).join(' > ')}`);
    console.log(`   alt: ${alt.map(id => name.get(id)).join(' > ')}`);
  }
  if (tie12) console.log(`${s.date.slice(0, 10)} ${s.name ?? '-'}: GLEICHSTAND um Platz 1/2 nach DTKV`);
}
console.log(`\n${n} abgeschlossene Abende geprüft: ${differ} mit anderer Reihenfolge, davon Sieger anders: ${top1}, Vize anders: ${top2}; Abende mit verbleibendem Gleichstand: ${ties}`);
