// Name matching when an evening is transferred to leagues (src/lib/nameMatching.ts, components/TransferDialog.tsx).
//   node e2e/name-matching.mjs <url> [ausgabeordner]      (Umgebungsvariable W = Breite des Fensters, Standard 900)
// Evening players: "Anna", "bernd  MEIER" (only case/spacing differs), "Clara Schmid" (typo), "Dirk Neu" (new).
// Eternal table: Bernd Meier, Clara Schmidt. Annual league "Liga Eins": Clara Schmitt (another, similar name).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const OUT = process.argv[3] || '.'; const REF = 'swuwjjmspplzfguapvty';
const evening = 'ev000000-0000-4000-8000-000000000001';
const names = { p1: 'Anna', p2: 'bernd  MEIER', p3: 'Clara Schmid', p4: 'Dirk Neu' };
const pairs = [['p1', 'p2'], ['p3', 'p4'], ['p1', 'p3'], ['p2', 'p4'], ['p1', 'p4'], ['p2', 'p3']];
const stat = (id, league, name, over = {}) => ({ id, league_id: league, player_id: `pl-${id}`, player_name: name, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0, points_against: 0, goal_difference: 0, championships: 0, vice_championships: 0, ...over });
const tables = {
  current_session: [{ id: 1, session_id: evening }],
  training_sessions: [{ id: evening, name: null, date: '2026-11-13T18:00:00Z', is_completed: false, round_count: 3, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }],
  training_players: Object.entries(names).map(([id, n], i) => ({ id: `tp${i}`, session_id: evening, player_id: id, player_name: n })),
  matches: pairs.map(([h, a], i) => ({ id: `m${i + 1}`, session_id: evening, round: Math.floor(i / 2) + 1, home_player_id: h, home_player_name: names[h], away_player_id: a, away_player_name: names[a], home_score: (i * 3) % 4, away_score: (i + 1) % 3, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: (i % 2) + 1 })),
  leagues: [
    { id: 'LE', name: 'Ewige Tabelle', year: 1971, created_at: '2026-01-01T00:00:00Z', is_eternal: true },
    { id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false },
  ],
  player_stats: [
    stat('e1', 'LE', 'Bernd Meier', { points: 100, points_against: 50, championships: 3 }),
    stat('e2', 'LE', 'Clara Schmidt', { points: 50, points_against: 60, championships: 2 }),
    stat('a1', 'L1', 'Clara Schmitt', { wins: 2, points: 4, points_against: 2 }),
  ],
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const matchFilter = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue; const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]; if (op === 'eq' && String(row[k]) !== val) return false; if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false; } return true; };
let seq = 1000;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 900), height: 1000 }, deviceScaleFactor: 1 });
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
for (const n of ['Ewige Tabelle', 'Liga Eins']) await page.getByRole('button', { name: new RegExp(n) }).click();
await page.getByRole('button', { name: /Übertragen \(2\)/ }).click();

await page.getByText('Ist das dieselbe Person?').waitFor({ timeout: 10000 });
const groups = page.getByRole('radiogroup');
check('zwei Fragen (Clara in beiden Ligen), keine für Bernd/Anna/Dirk', await groups.count() === 2, `(${await groups.count()})`);
check('Bernd wird automatisch zugeordnet und angezeigt', await page.getByText('„bernd  MEIER“ → „Bernd Meier“').isVisible());
const eternalCard = groups.filter({ hasText: 'Ewige Tabelle' });
const annualCard = groups.filter({ hasText: 'Liga Eins' });
check('Verschreiber ist vorausgewählt (ewige Tabelle)', await eternalCard.getByRole('radio', { name: /Clara Schmidt/ }).getAttribute('aria-checked') === 'true');
check('Kandidat zeigt Punkte und Meisterschaften der ewigen Tabelle', (await eternalCard.innerText()).includes('50 Pkt · 2 M'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/name-dialog-${process.env.W || 900}.png` });
await annualCard.getByRole('radio', { name: /Nein, neuer Spieler/ }).click();
check('Antwort für Liga Eins gewechselt, ewige Tabelle bleibt', await annualCard.getByRole('radio', { name: /Nein/ }).getAttribute('aria-checked') === 'true' && await eternalCard.getByRole('radio', { name: /Clara Schmidt/ }).getAttribute('aria-checked') === 'true');
await page.getByRole('button', { name: 'Übertragen', exact: true }).click();
await page.waitForTimeout(3000);

const rows = l => tables.player_stats.filter(r => r.league_id === l);
const byName = (l, n) => rows(l).filter(r => r.player_name === n);
check('Ewige Tabelle: keine neue Zeile für Bernd, Punkte addiert', byName('LE', 'bernd  MEIER').length === 0 && byName('LE', 'Bernd Meier')[0].points > 100, `(${byName('LE', 'Bernd Meier')[0]?.points})`);
check('Ewige Tabelle: Clara auf vorhandener Zeile gebucht, kein „Clara Schmid“', byName('LE', 'Clara Schmid').length === 0 && byName('LE', 'Clara Schmidt')[0].points > 50, `(${byName('LE', 'Clara Schmidt')[0]?.points})`);
check('Liga Eins: „Clara Schmid“ als neuer Spieler, „Clara Schmitt“ unverändert', byName('L1', 'Clara Schmid').length === 1 && byName('L1', 'Clara Schmitt')[0].points === 4);
check('Dirk und Anna neu angelegt, je einmal', byName('LE', 'Dirk Neu').length === 1 && byName('L1', 'Anna').length === 1);
check('Abend abgeschlossen und an beide Ligen übertragen', tables.training_sessions[0].is_completed === true && tables.training_sessions[0].transferred_to_leagues.length === 2);
check('keine Seitenfehler', errors.length === 0, errors.join('|'));
await browser.close(); process.exit(failed ? 1 : 0);
