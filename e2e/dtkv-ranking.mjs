// Browser test for the DTKV ranking (docs/UMSETZUNGSPLAN.md, Schritt W). Supabase is mocked with state.
//   node e2e/dtkv-ranking.mjs http://127.0.0.1:4173 <ausgabeordner> [backup-data-ordner]
// The optional third argument is a folder with the backup JSON files (data/*.json): then every evening that was
// played under the old rule is also checked against an independent oracle (rankOld of the reference script).
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [BASE, OUT, BACKUP] = process.argv.slice(2);
const REF = 'swuwjjmspplzfguapvty';
const here = dirname(fileURLToPath(import.meta.url));
const { rankOld } = await import(join(here, '..', 'scripts', 'dtkv-ranking-reference.mjs'));

let fails = 0;
const check = (label, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : extra); if (!ok) fails++; };

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

/** Stateful Supabase mock: GET with filters, POST (upsert), PATCH, DELETE. */
async function newContext(tables, { admin = true, localStorageItems = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  const posts = [];
  if (admin) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
  for (const [k, v] of Object.entries(localStorageItems)) await ctx.addInitScript(([key, val]) => localStorage.setItem(key, val), [k, JSON.stringify(v)]);
  const filter = (row, params) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
      if (op === 'eq' && String(row[k]) !== val) return false;
      if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false;
    }
    return true;
  };
  let seq = 1000;
  await ctx.route(`https://${REF}.supabase.co/**`, async route => {
    const req = route.request(); const url = new URL(req.url()); const t = url.pathname.split('/').pop();
    const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
    if (!url.pathname.includes('/rest/v1/') || !(t in tables)) return json(200, {});
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (req.method() === 'GET') {
      // PostgREST: order=date.desc,id.asc (several order parameters are applied in the order they were given)
      const keys = url.searchParams.getAll('order').flatMap(o => o.split(',')).map(o => { const [col, dir] = o.split('.'); return { col, desc: dir === 'desc' }; });
      const rows = tables[t].filter(r => filter(r, url.searchParams));
      rows.sort((a, b) => { for (const { col, desc } of keys) { if (a[col] === b[col]) continue; return (a[col] < b[col] ? -1 : 1) * (desc ? -1 : 1); } return 0; });
      return json(200, rows);
    }
    if (req.method() === 'POST') {
      let body = JSON.parse(req.postData()); body = Array.isArray(body) ? body : [body];
      posts.push({ table: t, rows: JSON.parse(JSON.stringify(body)) });
      for (const row of body) { const i = tables[t].findIndex(r => row.id !== undefined && r.id === row.id); if (i >= 0) tables[t][i] = { ...tables[t][i], ...row }; else tables[t].push({ id: row.id ?? `gen${seq++}`, ...row }); }
      return json(201);
    }
    if (req.method() === 'PATCH') { const patch = JSON.parse(req.postData()); tables[t] = tables[t].map(r => filter(r, url.searchParams) ? { ...r, ...patch } : r); return json(204); }
    if (req.method() === 'DELETE') { tables[t] = tables[t].filter(r => !filter(r, url.searchParams)); return json(204); }
    return json(200, {});
  });
  return { ctx, posts };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Running evening under the DTKV rule: complete tie at place 1 -> decider dialog -> order -> transfer
// ─────────────────────────────────────────────────────────────────────────────
const sid = 'ev000000-0000-4000-8000-0000000000d1';
const names = { A: 'Anna', B: 'Bernd', C: 'Clara', D: 'Dirk' };
// A and B draw 2:2 and beat C and D alike: complete tie at place 1 (points, direct comparison, goals)
const ties = [['A', 'B', 2, 2], ['C', 'D', 0, 1], ['A', 'C', 1, 0], ['B', 'D', 1, 0], ['A', 'D', 1, 0], ['B', 'C', 1, 0]];
function eveningTables(rule, { withColumns = true } = {}) {
  const row = { id: sid, name: null, date: '2026-11-12T18:00:00Z', is_completed: false, round_count: 3, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' };
  if (withColumns) Object.assign(row, { ranking_rule: rule, decider_results: null });
  return {
    current_session: [{ id: 1, session_id: sid }],
    training_sessions: [row],
    training_players: Object.entries(names).map(([id, n], i) => ({ id: `tp${i}`, session_id: sid, player_id: id, player_name: n })),
    matches: ties.map(([h, a, hs, as], i) => ({ id: `m${i + 1}`, session_id: sid, round: Math.floor(i / 2) + 1, home_player_id: h, home_player_name: names[h], away_player_id: a, away_player_name: names[a], home_score: hs, away_score: as, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: (i % 2) + 1, ...(withColumns ? { sudden_death: false } : {}) })),
    leagues: [{ id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }],
    player_stats: [],
  };
}

async function completeEvening(page) {
  await page.getByRole('button', { name: /Training abschließen/ }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Training abschließen/ }).click();
}

{
  const tables = eveningTables('dtkv2026');
  const { ctx, posts } = await newContext(tables);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/training');
  await completeEvening(page);
  await page.getByText('Gleichstand um Platz 1').waitFor({ timeout: 8000 })
    .then(() => check('DTKV-Abend mit völligem Gleichstand: Entscheidungsdialog erscheint', true))
    .catch(() => check('DTKV-Abend mit völligem Gleichstand: Entscheidungsdialog erscheint', false));
  const rowsText = await page.locator('[role=dialog] .font-medium').allInnerTexts();
  const firstBefore = rowsText[0];
  // put the second player first
  await page.getByRole('button', { name: new RegExp(`${rowsText[1]} nach oben`) }).click();
  const after = await page.locator('[role=dialog] .font-medium').allInnerTexts();
  check('Reihenfolge lässt sich ändern', after[0] === rowsText[1] && after[1] === firstBefore, JSON.stringify(after));
  check('Tabelle zeigt bei Gleichstand dieselbe Platzzahl', await page.locator('table tbody tr').first().innerText().then(t => t.startsWith('1')) && await page.locator('table tbody tr').nth(1).innerText().then(t => t.startsWith('1')));
  check('Hinweis auf § 8 Abs. 3 unter der Tabelle', (await page.getByText(/DTKV-Spielordnung § 8 Abs\. 3/).count()) > 0);
  await page.getByRole('button', { name: 'Reihenfolge übernehmen' }).click();
  await page.getByRole('button', { name: /Liga Eins/ }).click();
  await page.getByRole('button', { name: /Übertragen \(1\)/ }).click();
  await page.waitForSelector('text=/Ergebnisse zu .* Liga/', { timeout: 10000 }).catch(() => console.log('(keine Erfolgsmeldung gesehen)'));
  await page.waitForTimeout(2000);
  const s = tables.training_sessions[0];
  check('Abend ist abgeschlossen', s.is_completed === true);
  check('Wertungsregel bleibt dtkv2026', s.ranking_rule === 'dtkv2026', String(s.ranking_rule));
  const winnerId = rowsText[1] === names.A ? 'A' : 'B';
  const otherId = winnerId === 'A' ? 'B' : 'A';
  check('Ergebnis des Entscheidungsspiels gespeichert', Array.isArray(s.decider_results) && s.decider_results.length === 1 && s.decider_results[0].order[0] === winnerId, JSON.stringify(s.decider_results));
  const stat = id => tables.player_stats.find(r => r.player_name === names[id]);
  check('Meister und Vize in der Liga: Sieger des Entscheidungsspiels / sein Gegner', stat(winnerId)?.championships === 1 && stat(otherId)?.vice_championships === 1 && stat('C')?.championships === 0,
    JSON.stringify(tables.player_stats.map(r => [r.player_name, r.championships, r.vice_championships])));
  check('Punkte und Tore des Abends bleiben unberührt (Entscheidungsspiel zählt nicht)', stat('A')?.points === 5 && stat('B')?.points === 5 && stat('A')?.goals_for === 4 && stat('B')?.goals_for === 4,
    JSON.stringify(tables.player_stats.map(r => [r.player_name, r.points, r.goals_for])));
  check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Same evening, old rule: no tie notion, no dialog; the order is the old one
{
  const tables = eveningTables('legacy');
  const { ctx } = await newContext(tables);
  const page = await ctx.newPage();
  await page.goto(BASE + '/training');
  await completeEvening(page);
  await page.getByRole('button', { name: /Liga Eins/ }).waitFor({ timeout: 8000 })
    .then(() => check('Abend nach alter Regel: kein Entscheidungsdialog, direkt die Liga-Auswahl', true))
    .catch(() => check('Abend nach alter Regel: kein Entscheidungsdialog, direkt die Liga-Auswahl', false));
  check('Abend nach alter Regel: kein Hinweis auf § 8 Abs. 3', (await page.getByText(/DTKV-Spielordnung § 8 Abs\. 3/).count()) === 0);
  await ctx.close();
}

// Before the migration (rows without the new columns): nothing new is written, the app behaves as before
{
  const tables = eveningTables(null, { withColumns: false });
  const { ctx, posts } = await newContext(tables);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/training');
  await completeEvening(page);
  await page.getByRole('button', { name: /Liga Eins/ }).click();
  await page.getByRole('button', { name: /Übertragen \(1\)/ }).click();
  await page.waitForTimeout(2500);
  const written = posts.filter(p => p.table === 'training_sessions').flatMap(p => p.rows);
  check('Vor der Migration: Abend wird abgeschlossen', tables.training_sessions[0].is_completed === true);
  check('Vor der Migration: ranking_rule und decider_results werden nicht geschrieben', written.length > 0 && written.every(r => !('ranking_rule' in r) && !('decider_results' in r)), JSON.stringify(written[0]));
  check('Vor der Migration: sudden_death wird nicht geschrieben', posts.filter(p => p.table === 'matches').flatMap(p => p.rows).every(r => !('sudden_death' in r)));
  check('Vor der Migration: keine Seitenfehler', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Swiss tournament: a draw in the playoff is rejected, sudden death is recorded, the final ranking appears
// ─────────────────────────────────────────────────────────────────────────────
const P = id => ({ id, name: `Spieler ${id}` });
const swissPlayers = ['A', 'B', 'C', 'D'].map(P);
const swissMatch = (id, round, h, a, hs, as) => ({ id, round, homePlayer: P(h), awayPlayer: P(a), homeScore: hs, awayScore: as, isCompleted: true });
const swissSession = () => ({
  id: 'sw000000-0000-4000-8000-0000000000e1', date: '2026-11-12T18:00:00Z',
  config: { rounds: 3, refereeMode: false, endMode: 'playoff', playoffFormat: 'standard', playoffStart: 'sf' },
  players: swissPlayers.map(p => ({ ...p, hasHadBye: false })),
  rounds: [
    { roundNumber: 1, phase: 'swiss', isCompleted: true, matches: [swissMatch('s1', 1, 'A', 'B', 2, 0), swissMatch('s2', 1, 'C', 'D', 1, 0)] },
    { roundNumber: 2, phase: 'swiss', isCompleted: true, matches: [swissMatch('s3', 2, 'A', 'C', 2, 1), swissMatch('s4', 2, 'B', 'D', 1, 0)] },
    { roundNumber: 3, phase: 'swiss', isCompleted: true, matches: [swissMatch('s5', 3, 'A', 'D', 3, 0), swissMatch('s6', 3, 'B', 'C', 0, 0)] },
  ],
  currentRound: 3, isCompleted: false, playoffActive: true,
  lot: { A: 0.1, B: 0.2, C: 0.3, D: 0.4 },
  playoffMatches: [
    { id: 'p1', round: 2, matchNumber: 1, homePlayer: P('A'), awayPlayer: P('D'), homeScore: null, awayScore: null, isCompleted: false },
    { id: 'p2', round: 2, matchNumber: 2, homePlayer: P('C'), awayPlayer: P('B'), homeScore: null, awayScore: null, isCompleted: false },
    { id: 'p3', round: 1, matchNumber: 1, homePlayer: null, awayPlayer: null, homeScore: null, awayScore: null, isCompleted: false },
  ],
});
{
  // The tournament lies on the device; on loading it is moved to the database (step B), so the test reads it from there
  const swissTables = { current_session: [{ id: 1, session_id: null }], training_sessions: [], training_players: [], matches: [], leagues: [{ id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }], player_stats: [] };
  const { ctx } = await newContext(swissTables, { localStorageItems: { 'swiss-session-v1': swissSession() } });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/schweizer-system');
  await page.getByRole('tab', { name: /Playoff/ }).click();
  const card = n => page.locator('div.w-48').nth(n);
  const ok = n => card(n).getByRole('button', { name: 'OK', exact: true });
  const inputs = n => card(n).locator('input[type=number]');

  await inputs(0).nth(0).fill('1'); await inputs(0).nth(1).fill('1');
  check('Playoff: Unentschieden wird abgelehnt (Hinweis sichtbar)', await card(0).getByText(/kein Unentschieden/).isVisible());
  check('Playoff: Unentschieden: OK ist gesperrt', await ok(0).isDisabled());

  await card(0).getByRole('switch').click();
  await inputs(0).nth(0).fill('4'); await inputs(0).nth(1).fill('1');
  check('Playoff: Sudden Death nur mit einem Tor Vorsprung (Hinweis)', await card(0).getByText(/genau einem Tor/).isVisible() && await ok(0).isDisabled());

  await inputs(0).nth(0).fill('2'); await inputs(0).nth(1).fill('1');
  check('Playoff: Sudden Death mit 2:1 wird angenommen', await ok(0).isEnabled());
  await ok(0).click();
  await page.waitForTimeout(400);
  check('Playoff: gespielte Sudden-Death-Partie ist gekennzeichnet', (await page.getByText('Sudden Death', { exact: true }).count()) >= 1);
  await page.waitForTimeout(1000);
  const stored = swissTables.training_sessions[0]?.swiss_state;
  check('Playoff: suddenDeath wird mit dem Turnier gespeichert', stored?.playoffMatches?.find(m => m.id === 'p1')?.suddenDeath === true, JSON.stringify(stored?.playoffMatches?.[0]));

  // second semi-final (normal result), then the final
  await inputs(1).nth(0).fill('1'); await inputs(1).nth(1).fill('0'); await ok(1).click();
  await page.waitForTimeout(400);
  check('Nach den Halbfinals stehen die Finalisten fest (A gegen C)', (await page.locator('div.w-48').count()) >= 3);
  const finalIdx = (await page.locator('div.w-48').count()) - 1;
  await inputs(finalIdx).nth(0).fill('0'); await inputs(finalIdx).nth(1).fill('1');
  await card(finalIdx).getByRole('switch').click();
  await ok(finalIdx).click();
  await page.waitForSelector('text=Abschlussrangliste', { timeout: 8000 })
    .then(() => check('Abschlussrangliste erscheint nach dem Finale', true))
    .catch(() => check('Abschlussrangliste erscheint nach dem Finale', false));
  const rows = await page.locator('table').last().locator('tbody tr').allInnerTexts();
  const flat = rows.map(r => r.replace(/\s+/g, ' ').trim());
  // Swiss: A 6, C 3, B 3, D 0 points. Playoff: A beat D after sudden death (1.5), lost the final after sudden death (0.5);
  // C beat B (2), won the final after sudden death (1.5). Semi-final losers: D, B.
  console.log('Abschlussrangliste:', JSON.stringify(flat));
  check('Abschlussrangliste: Reihenfolge Sieger, Finalist, Halbfinal-Verlierer', flat.map(r => r.split(' ')[1] + ' ' + r.split(' ')[2]).join(',') .startsWith('Spieler C,Spieler A'), flat.join(' | '));
  check('Abschlussrangliste: Punkte mit Komma bei halben Punkten', flat.some(r => /\d,5/.test(r)));
  check('Abschlussrangliste: Hinweis auf § 9 Abs. 6', (await page.getByText(/§ 9 Abs\. 6/).count()) > 0);
  await page.screenshot({ path: join(OUT, 'dtkv-final-ranking.png'), fullPage: true });
  check('Schweizer System: keine Seitenfehler', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. History and exports of a saved Swiss tournament with playoff
// ─────────────────────────────────────────────────────────────────────────────
{
  const sw = 'sw000000-0000-4000-8000-0000000000f2';
  const m = (id, round, h, a, hs, as, extra = {}) => ({ id, session_id: sw, round, home_player_id: h, home_player_name: `Spieler ${h}`, away_player_id: a, away_player_name: `Spieler ${a}`, home_score: hs, away_score: as, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: null, sudden_death: false, ...extra });
  const tables = {
    current_session: [{ id: 1, session_id: null }],
    training_sessions: [{ id: sw, name: 'Schweizer System vom 12.11.2026', date: '2026-11-12T18:00:00Z', is_completed: true, round_count: 3, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'swiss', ranking_rule: 'dtkv2026', decider_results: null }],
    training_players: ['A', 'B', 'C', 'D'].map((id, i) => ({ id: `tp${i}`, session_id: sw, player_id: id, player_name: `Spieler ${id}` })),
    matches: [
      m('a1', 1, 'A', 'B', 2, 0), m('a2', 1, 'C', 'D', 1, 0), m('a3', 2, 'A', 'C', 2, 1), m('a4', 2, 'B', 'D', 1, 0), m('a5', 3, 'A', 'D', 3, 0), m('a6', 3, 'B', 'C', 0, 0),
      m('p1', 4, 'A', 'D', 2, 1, { phase: 'playoff', playoff_round: 2, match_number: 1, sudden_death: true }),
      m('p2', 4, 'C', 'B', 2, 0, { phase: 'playoff', playoff_round: 2, match_number: 2 }),
      m('p3', 5, 'C', 'A', 1, 0, { phase: 'playoff', playoff_round: 1, match_number: 1, sudden_death: true }),
    ],
    leagues: [], player_stats: [],
  };
  const { ctx } = await newContext(tables);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/history');
  await page.getByText('Schweizer System vom 12.11.2026').first().waitFor({ timeout: 15000 });
  check('Historie: Turniersieger in der Liste', (await page.getByText('Spieler C').count()) > 0);
  await page.getByRole('button', { name: /Details/ }).first().click();
  await page.getByText('Abschlussrangliste').first().waitFor({ timeout: 8000 })
    .then(() => check('Historie: Abschlussrangliste in den Details', true))
    .catch(() => check('Historie: Abschlussrangliste in den Details', false));
  await page.screenshot({ path: join(OUT, 'dtkv-history-final.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.locator('button:has(svg.lucide-download)').first().click();
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: 'Als PDF' }).click()]);
  await pdf.saveAs(join(OUT, 'dtkv-swiss.pdf'));
  await page.waitForTimeout(800); await page.keyboard.press('Escape');
  await page.locator('button:has(svg.lucide-download)').first().click();
  const [xlsx] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: 'Als XLSX' }).click()]);
  await xlsx.saveAs(join(OUT, 'dtkv-swiss.xlsx'));
  console.log('Exporte gespeichert');
  check('Historie: keine Seitenfehler', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Old evenings (backup data): winner and order exactly as before
// ─────────────────────────────────────────────────────────────────────────────
if (BACKUP && existsSync(join(BACKUP, 'matches.json'))) {
  const read = t => JSON.parse(readFileSync(join(BACKUP, `${t}.json`), 'utf8'));
  const tables = { current_session: read('current_session'), training_sessions: read('training_sessions'), training_players: read('training_players'), matches: read('matches'), leagues: read('leagues'), player_stats: read('player_stats') };
  // The backup is from before the migration: after it every existing evening has the old rule
  tables.training_sessions = tables.training_sessions.map(s => ({ ...s, ranking_rule: 'legacy', decider_results: null }));
  tables.matches = tables.matches.map(x => ({ ...x, sudden_death: false }));
  const { ctx } = await newContext(tables, { admin: false });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/history');
  await page.waitForSelector('text=Sieger', { timeout: 20000 });
  const completed = tables.training_sessions.filter(s => s.is_completed).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const shown = await page.locator('text=/Sieger:/').evaluateAll(els => els.map(e => e.parentElement.textContent.replace('Sieger:', '').trim()));
  const expected = completed.map(s => {
    const ids = [...new Set(tables.training_players.filter(p => p.session_id === s.id).map(p => p.player_id))];
    const name = new Map(tables.training_players.filter(p => p.session_id === s.id).map(p => [p.player_id, p.player_name]));
    const ms = tables.matches.filter(x => x.session_id === s.id && x.is_completed && x.phase === 'swiss' && x.home_score !== null)
      .map(x => ({ home: x.home_player_id, away: x.away_player_id, hs: x.home_score, as: x.away_score }));
    return name.get(rankOld(ids, ms)[0]);
  });
  check(`Altdaten: ${completed.length} Abende, Sieger in der Historie wie nach der alten Wertung`, JSON.stringify(shown) === JSON.stringify(expected), `\n gezeigt:   ${JSON.stringify(shown)}\n erwartet:  ${JSON.stringify(expected)}`);
  check('Altdaten: keine Seitenfehler', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nALLE BESTANDEN');
process.exit(fails ? 1 : 0);
