import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const REF = 'swuwjjmspplzfguapvty';
const evening = 'ev000000-0000-4000-8000-000000000001';
const names = { p1: 'Anna', p2: 'Bernd', p3: 'Clara', p4: 'Dirk' };
const pairs = [['p1', 'p2'], ['p3', 'p4'], ['p1', 'p3'], ['p2', 'p4'], ['p1', 'p4'], ['p2', 'p3']];
// A league row of the page's league with only the points set (the other numbers are 0)
const row = (id, playerId, name, points) => ({ id, league_id: 'L1', player_id: playerId, player_name: name, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points, points_against: 0, goal_difference: 0, championships: 0, vice_championships: 0 });
const tables = {
  current_session: [{ id: 1, session_id: evening }],
  training_sessions: [{ id: evening, name: null, date: '2026-11-06T18:00:00Z', is_completed: false, round_count: 3, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }],
  training_players: Object.entries(names).map(([id, n], i) => ({ id: `tp${i}`, session_id: evening, player_id: id, player_name: n })),
  matches: pairs.map(([h, a], i) => ({ id: `m${i + 1}`, session_id: evening, round: Math.floor(i / 2) + 1, home_player_id: h, home_player_name: names[h], away_player_id: a, away_player_name: names[a], home_score: (i * 3) % 4, away_score: (i + 1) % 3, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: (i % 2) + 1 })),
  leagues: [{ id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }],
  player_stats: [row('r1', 'pa', 'Anna', 10), row('r2', 'pb', 'Bernd', 20), row('r9', 'pz', 'Zed Fremd', 50)],
};
// League page (admin): rename one row, remove another, while ANOTHER device changed a third row and added a fourth.
// Expected: only the touched rows are written, exactly one row is deleted, the other device's changes stay and show up.
const log = [];
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const matchFilter = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue; const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]; if (op === 'eq' && String(row[k]) !== val) return false; if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false; } return true; };
let seq = 1000;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
await ctx.route(`https://${REF}.supabase.co/**`, async route => {
  const req = route.request(); const url = new URL(req.url()); const t = url.pathname.split('/').pop();
  const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
  if (!url.pathname.includes('/rest/v1/') || !(t in tables)) return json(200, {});
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (req.method() === 'GET') { const rows = tables[t].filter(r => matchFilter(r, url.searchParams)); return json(200, rows); }
  log.push(`${req.method()} ${t}${req.method() === 'POST' ? ' ' + (req.postData() || '').slice(0, 0) : ''}`);
  if (req.method() === 'POST') {
    let body = JSON.parse(req.postData()); body = Array.isArray(body) ? body : [body];
    for (const row of body) { const i = tables[t].findIndex(r => r.id === row.id && row.id !== undefined); if (i >= 0) tables[t][i] = { ...tables[t][i], ...row }; else tables[t].push({ id: row.id ?? `gen${seq++}`, ...row }); }
    log[log.length - 1] += t === 'training_sessions' ? ` is_completed=${body[0].is_completed} transferred=${(body[0].transferred_to_leagues || []).length}` : '';
    return json(201, undefined);
  }
  if (req.method() === 'PATCH') { const patch = JSON.parse(req.postData()); tables[t] = tables[t].map(r => matchFilter(r, url.searchParams) ? { ...r, ...patch } : r); return json(204); }
  if (req.method() === 'DELETE') { tables[t] = tables[t].filter(r => !matchFilter(r, url.searchParams)); return json(204); }
  return json(200, {});
});
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/leagues'); await page.getByText('Zed Fremd').first().waitFor({ timeout: 15000 });

// "the other device"
tables.player_stats.find(r => r.id === 'r9').points = 77;
tables.player_stats.push(row('r10', 'pn', 'Neu Von Anderswo', 5));

let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const rowOf = name => page.locator('tr', { hasText: name });

// rename Anna
await rowOf('Anna').getByRole('button').first().click();
await page.getByLabel('Spielername').fill('Anna Neu');
await page.getByRole('button', { name: /Speichern/ }).click();
await page.getByText('Spieler aktualisiert').waitFor({ timeout: 8000 });
check('Umbenennen: nur diese Zeile geschrieben', tables.player_stats.find(r => r.id === 'r1').player_name === 'Anna Neu');
check('Umbenennen: Änderung des anderen Geräts bleibt (Zed 77)', tables.player_stats.find(r => r.id === 'r9').points === 77);
check('Umbenennen: die Seite zeigt danach auch die neue Zeile des anderen Geräts', await page.getByText('Neu Von Anderswo').first().isVisible());

// remove Bernd
await rowOf('Bernd').getByRole('button').nth(1).click();
await page.getByRole('button', { name: 'Entfernen', exact: true }).click();
await page.getByText('Spieler entfernt').waitFor({ timeout: 8000 });
check('Entfernen: genau Bernd ist weg', !tables.player_stats.some(r => r.player_name === 'Bernd') && tables.player_stats.length === 3);
check('Entfernen: genau ein DELETE, mit Liga und Spieler im Filter', log.filter(l => l.startsWith('DELETE player_stats')).length === 1, log.join(' | '));
check('Entfernen: Zed (77) und die neue Zeile sind unverändert', tables.player_stats.find(r => r.id === 'r9').points === 77 && tables.player_stats.some(r => r.id === 'r10'));
console.log(errors.length ? 'Seitenfehler: ' + errors.join('|') : 'keine Seitenfehler');
await browser.close(); process.exit(failed ? 1 : 0);
