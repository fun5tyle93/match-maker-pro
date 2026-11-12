// Fixed player identity (Player.ref, tables players / player_aliases), see docs/UMSETZUNGSPLAN.md Schritt D.
//   node e2e/player-identity.mjs <url>      (NO_REGISTRY=1: ohne Spielerliste, die Statistik-Prüfung muss dann scheitern)
// An earlier evening and the running evening carry identities. The running evening has "Erik" (identity of the
// league row "Erik Schwarz") and "Ben". Expected: transfer without a question, booked on the identity's row, stored
// identities kept; the statistics show both spellings as one player with the display name.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const REF = 'swuwjjmspplzfguapvty';
const old = 'ee000000-0000-4000-8000-000000000001'; const running = 'ee000000-0000-4000-8000-000000000002';
const R = { erik: 'a0000000-0000-4000-8000-000000000001', ben: 'a0000000-0000-4000-8000-000000000002' };
const mk = (id, sid, round, h, hn, hr, a, an, ar, hs, as) => ({ id, session_id: sid, round, home_player_id: h, home_player_name: hn, home_player_ref: hr, away_player_id: a, away_player_name: an, away_player_ref: ar, home_score: hs, away_score: as, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: 1 });
const session = (id, date, name, done) => ({ id, name, date, is_completed: done, round_count: 1, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' });
const stat = (id, league, name, ref, over = {}) => ({ id, league_id: league, player_id: `pl-${id}`, player_name: name, player_ref: ref, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0, points_against: 0, goal_difference: 0, championships: 0, vice_championships: 0, ...over });
const tables = {
  current_session: [{ id: 1, session_id: running }],
  training_sessions: [session(old, '2026-03-01T18:00:00Z', 'Frueher', true), session(running, '2026-11-13T18:00:00Z', null, false)],
  training_players: [
    { id: 'o1', session_id: old, player_id: 'old-e', player_name: 'Erik Schwarz', player_ref: R.erik },
    { id: 'o2', session_id: old, player_id: 'old-b', player_name: 'Ben', player_ref: R.ben },
    { id: 'r1', session_id: running, player_id: 'run-e', player_name: 'Erik', player_ref: R.erik },
    { id: 'r2', session_id: running, player_id: 'run-b', player_name: 'Ben', player_ref: R.ben },
  ],
  matches: [
    mk('m1', old, 1, 'old-e', 'Erik Schwarz', R.erik, 'old-b', 'Ben', R.ben, 3, 1),
    mk('m2', running, 1, 'run-e', 'Erik', R.erik, 'run-b', 'Ben', R.ben, 2, 2),
  ],
  leagues: [{ id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }],
  player_stats: [stat('s1', 'L1', 'Erik Schwarz', R.erik, { wins: 5, points: 10, points_against: 4 }), stat('s2', 'L1', 'Ben', R.ben, { points: 3, points_against: 9 })],
  players: process.env.NO_REGISTRY ? [] : [{ id: R.erik, display_name: 'Erik Schwarz' }, { id: R.ben, display_name: 'Ben' }],
  player_aliases: [{ alias: 'erik', player_id: R.erik }],
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const matchFilter = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue; const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]; if (op === 'eq' && String(row[k]) !== val) return false; if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false; } return true; };
let seq = 1000;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
await ctx.route(`https://${REF}.supabase.co/**`, async route => {
  const req = route.request(); const url = new URL(req.url()); const t = url.pathname.split('/').pop();
  const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
  if (!url.pathname.includes('/rest/v1/') || !(t in tables)) return json(200, {});
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (req.method() === 'GET') return json(200, tables[t].filter(r => matchFilter(r, url.searchParams)));
  if (req.method() === 'POST') {
    let body = JSON.parse(req.postData()); body = Array.isArray(body) ? body : [body];
    for (const row of body) { const i = tables[t].findIndex(r => r.id === row.id && row.id !== undefined); if (i >= 0) tables[t][i] = { ...tables[t][i], ...row }; else tables[t].push({ id: row.id ?? `gen${seq++}`, ...row }); }
    return json(201, undefined);
  }
  if (req.method() === 'PATCH') { const patch = JSON.parse(req.postData()); tables[t] = tables[t].map(r => matchFilter(r, url.searchParams) ? { ...r, ...patch } : r); return json(204); }
  if (req.method() === 'DELETE') { tables[t] = tables[t].filter(r => !matchFilter(r, url.searchParams)); return json(204); }
  return json(200, {});
});
let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/training'); await page.getByRole('button', { name: /Training abschließen/ }).waitFor({ timeout: 15000 });
await page.getByRole('button', { name: /Training abschließen/ }).click();
await page.getByRole('button', { name: /Liga Eins/ }).click();
await page.getByRole('button', { name: /Übertragen \(1\)/ }).click();
// the identity is known, so there is nothing to ask: the transfer runs straight through
await page.waitForTimeout(3500);
check('keine Frage "Ist das dieselbe Person?"', await page.getByText('Ist das dieselbe Person?').count() === 0);
const rows = n => tables.player_stats.filter(r => r.player_name === n);
check('Liga: Zeile "Erik Schwarz" bekommt die Punkte des Abends, keine neue Zeile "Erik"', rows('Erik').length === 0 && rows('Erik Schwarz')[0].points === 11 && rows('Erik Schwarz')[0].player_ref === R.erik, `(${rows('Erik Schwarz')[0]?.points})`);
check('Liga: Ben bekommt seine Punkte, Identität bleibt', rows('Ben')[0].points === 4 && rows('Ben')[0].player_ref === R.ben);
check('Abend abgeschlossen und übertragen', tables.training_sessions.find(s => s.id === running).is_completed === true && tables.training_sessions.find(s => s.id === running).transferred_to_leagues.length === 1);
const tp = tables.training_players.filter(r => r.session_id === running);
check('gespeicherte Identitäten der Spieler des Abends blieben erhalten', tp.find(r => r.player_name === 'Erik').player_ref === R.erik && tp.find(r => r.player_name === 'Ben').player_ref === R.ben);
const m2 = tables.matches.find(m => m.id === 'm2');
check('gespeicherte Identitäten der Partie blieben erhalten', m2.home_player_ref === R.erik && m2.away_player_ref === R.ben);

// statistics: "Erik" and "Erik Schwarz" are one person
await page.goto(BASE + '/statistiken');
await page.getByText('Spielerübersicht', { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
check('Statistik zeigt einen Spieler "Erik Schwarz" (Anzeigename) und keinen eigenen Spieler "Erik"',
  await page.getByText('Erik Schwarz', { exact: true }).count() >= 1 && await page.getByText('Erik', { exact: true }).count() === 0);
check('keine Seitenfehler', errors.length === 0, errors.join('|'));
await browser.close(); process.exit(failed ? 1 : 0);
