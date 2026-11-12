import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const REF = 'swuwjjmspplzfguapvty';
const LEAGUES = Number(process.env.LEAGUES || 2);
const evening = 'ev000000-0000-4000-8000-000000000001';
const names = { p1: 'Anna', p2: 'Bernd', p3: 'Clara', p4: 'Dirk' };
const pairs = [['p1', 'p2'], ['p3', 'p4'], ['p1', 'p3'], ['p2', 'p4'], ['p1', 'p4'], ['p2', 'p3']];
const tables = {
  current_session: [{ id: 1, session_id: evening }],
  training_sessions: [{ id: evening, name: null, date: '2026-11-06T18:00:00Z', is_completed: false, round_count: 3, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }],
  training_players: Object.entries(names).map(([id, n], i) => ({ id: `tp${i}`, session_id: evening, player_id: id, player_name: n })),
  matches: pairs.map(([h, a], i) => ({ id: `m${i + 1}`, session_id: evening, round: Math.floor(i / 2) + 1, home_player_id: h, home_player_name: names[h], away_player_id: a, away_player_name: names[a], home_score: (i * 3) % 4, away_score: (i + 1) % 3, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: (i % 2) + 1 })),
  leagues: [{ id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }, { id: 'L2', name: 'Liga Zwei', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }].slice(0, LEAGUES),
  player_stats: [],
};
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
await page.goto(BASE + '/training'); await page.getByRole('button', { name: /Training abschließen/ }).waitFor({ timeout: 15000 });
await page.getByRole('button', { name: /Training abschließen/ }).click();
for (const n of ['Liga Eins', 'Liga Zwei'].slice(0, LEAGUES)) await page.getByRole('button', { name: new RegExp(n) }).click();
await page.getByRole('button', { name: new RegExp(`Übertragen \\(${LEAGUES}\\)`) }).click();
await page.waitForSelector('text=/Ergebnisse zu .* Liga/', { timeout: 10000 }).catch(() => console.log('(keine Erfolgsmeldung gesehen)'));
await page.waitForTimeout(2500);
const s = tables.training_sessions[0];
console.log('Schreibvorgänge:\n  ' + log.filter(l => l.includes('training_sessions') || l.includes('current_session')).join('\n  '));
console.log(`ENDZUSTAND: is_completed=${s.is_completed}, übertragen an ${s.transferred_to_leagues.length} Liga(en), current_session=${JSON.stringify(tables.current_session[0].session_id)}`);
console.log(s.is_completed ? 'PASS Abend ist abgeschlossen' : 'FAIL Abend steht auf "nicht abgeschlossen"');
console.log(errors.length ? 'Seitenfehler: ' + errors.join('|') : 'keine Seitenfehler');
await browser.close(); process.exit(s.is_completed ? 0 : 1);
