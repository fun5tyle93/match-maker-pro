// "Prüfung: berechnet = gespeichert" on the league page (components/LeagueCheckCard.tsx), docs/UMSETZUNGSPLAN.md Schritt E.
//   node e2e/league-check.mjs <url> [ausgabeordner]
// One evening (Anna beats Ben 3:1 and Cem 2:0, Ben draws with Cem 1:1) is transferred to "Liga Eins". The league holds
// a history on top (Anna: 10 wins, 20 points). The opening balance table says exactly that history.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const OUT = process.argv[3] || '.'; const REF = 'swuwjjmspplzfguapvty';
const ev = 'ee000000-0000-4000-8000-000000000001';
const R = { anna: 'a0000000-0000-4000-8000-00000000000a', ben: 'a0000000-0000-4000-8000-00000000000b', cem: 'a0000000-0000-4000-8000-00000000000c' };
const mk = (id, round, h, hn, a, an, hs, as) => ({ id, session_id: ev, round, home_player_id: `e-${hn}`, home_player_name: hn, home_player_ref: R[h], away_player_id: `e-${an}`, away_player_name: an, away_player_ref: R[a], home_score: hs, away_score: as, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: 1 });
const zero = { wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0, points_against: 0, goal_difference: 0, championships: 0, vice_championships: 0 };
const stat = (id, name, ref, v) => ({ id, league_id: 'L1', player_id: `pl-${id}`, player_name: name, player_ref: ref, ...zero, ...v });
const open = (ref, v) => ({ league_id: 'L1', player_ref: ref, ...zero, ...v });
const tables = {
  current_session: [{ id: 1, session_id: null }],
  training_sessions: [{ id: ev, name: 'Abend eins', date: '2026-03-01T18:00:00Z', is_completed: true, round_count: 1, matches_per_pairing: 1, transferred_to_leagues: ['L1'], tournament_type: 'training', ranking_rule: 'legacy' }],
  training_players: [['anna', 'Anna'], ['ben', 'Ben'], ['cem', 'Cem']].map(([k, n], i) => ({ id: `tp${i}`, session_id: ev, player_id: `e-${n}`, player_name: n, player_ref: R[k] })),
  matches: [mk('m1', 1, 'anna', 'Anna', 'ben', 'Ben', 3, 1), mk('m2', 1, 'anna', 'Anna', 'cem', 'Cem', 2, 0), mk('m3', 1, 'ben', 'Ben', 'cem', 'Cem', 1, 1)],
  leagues: [{ id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }],
  // stored = history + the evening
  player_stats: [
    stat('s1', 'Anna', R.anna, { wins: 12, goals_for: 5, goals_against: 1, points: 24, points_against: 0, goal_difference: 4, championships: 1 }),
    stat('s2', 'Ben', R.ben, { draws: 1, losses: 1, goals_for: 2, goals_against: 4, points: 1, points_against: 3, goal_difference: -2, vice_championships: 1 }),
    stat('s3', 'Cem', R.cem, { draws: 1, losses: 1, goals_for: 1, goals_against: 3, points: 1, points_against: 3, goal_difference: -2 }),
  ],
  players: [{ id: R.anna, display_name: 'Anna' }, { id: R.ben, display_name: 'Ben' }, { id: R.cem, display_name: 'Cem' }],
  player_aliases: [],
  league_opening_balances: [open(R.anna, { wins: 10, points: 20 }), open(R.ben), open(R.cem)],
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const matchFilter = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue; const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]; if (op === 'eq' && String(row[k]) !== val) return false; if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false; } return true; };
const keyOf = r => r.id !== undefined ? `id:${r.id}` : r.league_id !== undefined && r.player_ref !== undefined ? `${r.league_id}|${r.player_ref}` : undefined;
let seq = 1000; const writes = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 900), height: 1100 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
await ctx.route(`https://${REF}.supabase.co/**`, async route => {
  const req = route.request(); const url = new URL(req.url()); const t = url.pathname.split('/').pop();
  const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
  if (!url.pathname.includes('/rest/v1/') || !(t in tables)) return json(200, {});
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (req.method() === 'GET') return json(200, tables[t].filter(r => matchFilter(r, url.searchParams)));
  if (req.method() === 'POST') {
    let body = JSON.parse(req.postData()); body = Array.isArray(body) ? body : [body];
    for (const row of body) { const k = keyOf(row); const i = k ? tables[t].findIndex(r => keyOf(r) === k) : -1; if (i >= 0) tables[t][i] = { ...tables[t][i], ...row }; else tables[t].push({ id: row.id ?? (t === 'league_opening_balances' ? undefined : `gen${seq++}`), ...row }); }
    writes.push(`POST ${t}`); return json(201, undefined);
  }
  if (req.method() === 'PATCH') { const patch = JSON.parse(req.postData()); tables[t] = tables[t].map(r => matchFilter(r, url.searchParams) ? { ...r, ...patch } : r); writes.push(`PATCH ${t}`); return json(204); }
  if (req.method() === 'DELETE') { tables[t] = tables[t].filter(r => !matchFilter(r, url.searchParams)); writes.push(`DELETE ${t}`); return json(204); }
  return json(200, {});
});
let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/leagues');
await page.getByText('Liga Eins').first().click();
const card = page.getByTestId('league-check');
await card.getByRole('button', { name: 'Prüfen' }).click();
await card.getByText(/Berechnet = gespeichert/).waitFor({ timeout: 10000 });
check('stimmige Liga: "Berechnet = gespeichert", 3 Zeilen geprüft', (await card.innerText()).includes('3 Zeilen geprüft'));
check('die Prüfung schrieb nichts', writes.length === 0, JSON.stringify(writes));

// somebody changes the table by hand: Ben gets a championship
tables.player_stats.find(r => r.player_name === 'Ben').championships = 1;
await page.reload(); await page.getByText('Liga Eins').first().click();
await card.getByRole('button', { name: 'Prüfen' }).click();
await card.getByText(/Abweichung gefunden/).waitFor({ timeout: 10000 });
const text = await card.innerText();
check('Handänderung: Abweichung bei Ben / Meister, berechnet 0, gespeichert 1', /Ben\s+Meister\s+0\s+1/.test(text.replace(/\n/g, ' ')), JSON.stringify(text.slice(0, 200)));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/league-check-${process.env.W || 900}.png` });

await card.getByRole('button', { name: 'Als neuen Stand übernehmen' }).click();
await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
await card.getByText(/Berechnet = gespeichert/).waitFor({ timeout: 10000 });
const ben = tables.league_opening_balances.find(r => r.player_ref === R.ben);
check('nach "Übernehmen": Prüfung besteht, Startbestand von Ben hat den Titel', ben.championships === 1 && tables.league_opening_balances.length === 3, JSON.stringify(ben));
check('die gespeicherte Tabelle wurde dabei nicht verändert', tables.player_stats.find(r => r.player_name === 'Ben').championships === 1 && !writes.some(w => w.includes('player_stats')));
check('keine Seitenfehler', errors.length === 0, errors.join('|'));
await browser.close(); process.exit(failed ? 1 : 0);
