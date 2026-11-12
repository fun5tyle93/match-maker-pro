// Browser test of the Swiss system (docs/UMSETZUNGSPLAN.md, Schritt B). Supabase is mocked with state.
//   node e2e/swiss-flow.mjs http://127.0.0.1:4173 <ausgabeordner>
// Scenarios: a whole tournament (no rematch, reload in between, completing with the eternal table), referee mode with
// an odd number of players, import from the device, conflict between device and server, a database without the
// swiss_state column, reset, and a round that cannot be drawn.
import { createRequire } from 'module';
import { join } from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [BASE, OUT] = process.argv.slice(2);
const REF = 'swuwjjmspplzfguapvty';

let fails = 0;
const check = (label, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : extra); if (!ok) fails++; };

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

function baseTables(extra = {}) {
  return {
    current_session: [{ id: 1, session_id: null }],
    training_sessions: [], training_players: [], matches: [],
    leagues: [
      { id: 'L-eternal', name: 'Ewige Tabelle', year: 1971, created_at: '2026-01-01T00:00:00Z', is_eternal: true },
      { id: 'L-year', name: 'Liga Eins', year: 2026, created_at: '2026-01-02T00:00:00Z', is_eternal: false },
    ],
    player_stats: [],
    ...extra,
  };
}

/** Stateful Supabase mock (GET with filters, order and limit; POST = upsert; PATCH; DELETE). */
async function newContext(tables, { missingSwissColumn = false, localStorageItems = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const posts = [];
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
  for (const [k, v] of Object.entries(localStorageItems)) await ctx.addInitScript(([key, val]) => { if (!localStorage.getItem(key + '-seeded')) { localStorage.setItem(key, val); localStorage.setItem(key + '-seeded', '1'); } }, [k, JSON.stringify(v)]);
  const matches = (row, params) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
      if (op === 'eq' && String(row[k]) !== val) return false;
      if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false;
      if (op === 'not' && val === 'is.null' && (row[k] === null || row[k] === undefined)) return false;
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
      if (missingSwissColumn && (url.searchParams.get('select') ?? '').includes('swiss_state')) {
        return json(400, { code: '42703', message: 'column training_sessions.swiss_state does not exist' });
      }
      const keys = url.searchParams.getAll('order').flatMap(o => o.split(',')).map(o => { const [col, dir] = o.split('.'); return { col, desc: dir === 'desc' }; });
      let rows = tables[t].filter(r => matches(r, url.searchParams));
      rows.sort((a, b) => { for (const { col, desc } of keys) { if (a[col] === b[col]) continue; return (a[col] < b[col] ? -1 : 1) * (desc ? -1 : 1); } return 0; });
      const limit = url.searchParams.get('limit'); if (limit) rows = rows.slice(0, Number(limit));
      return json(200, rows);
    }
    if (req.method() === 'POST') {
      let body = JSON.parse(req.postData()); body = Array.isArray(body) ? body : [body];
      posts.push({ table: t, rows: JSON.parse(JSON.stringify(body)) });
      for (const row of body) { const i = tables[t].findIndex(r => row.id !== undefined && r.id === row.id); if (i >= 0) tables[t][i] = { ...tables[t][i], ...row }; else tables[t].push({ id: row.id ?? `gen${seq++}`, ...row }); }
      return json(201);
    }
    if (req.method() === 'PATCH') { const patch = JSON.parse(req.postData()); tables[t] = tables[t].map(r => matches(r, url.searchParams) ? { ...r, ...patch } : r); return json(204); }
    if (req.method() === 'DELETE') { tables[t] = tables[t].filter(r => !matches(r, url.searchParams)); return json(204); }
    return json(200, {});
  });
  return { ctx, posts, tables: () => tables };
}

const newPage = async ctx => { const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page._errors = errors; return page; };

async function addPlayers(page, names) {
  for (const n of names) { await page.getByPlaceholder('Spielername eingeben...').fill(n); await page.getByPlaceholder('Spielername eingeben...').press('Enter'); }
}

/** Enters a result for every open match, one after the other. */
async function playOpenMatches(page, seed = 1) {
  let k = seed;
  for (let guard = 0; guard < 40; guard++) {
    const inputs = page.locator('input[type=number]:visible');
    if ((await inputs.count()) < 2) return;
    await inputs.nth(0).fill(String((k * 3) % 5));
    await inputs.nth(1).fill(String((k * 2 + 1) % 4));
    await inputs.nth(1).press('Enter');
    await page.waitForTimeout(120);
    k++;
  }
}

const P = id => ({ id, name: `Spieler ${id}` });
const swissMatch = (id, round, h, a, hs, as) => ({ id, round, homePlayer: P(h), awayPlayer: P(a), homeScore: hs, awayScore: as, isCompleted: hs !== null, phase: 'swiss' });
const runningSession = (id, over = {}) => ({
  id, date: '2026-11-13T18:00:00Z', config: { rounds: 3, refereeMode: false, endMode: 'direct', playoffFormat: 'standard', playoffStart: 'qf' },
  players: ['A', 'B', 'C', 'D'].map(P),
  rounds: [{ roundNumber: 1, phase: 'swiss', isCompleted: false, matches: [swissMatch('r1a', 1, 'A', 'B', null, null), swissMatch('r1b', 1, 'C', 'D', null, null)] }],
  currentRound: 1, isCompleted: false, lot: { A: 0.1, B: 0.2, C: 0.3, D: 0.4 }, ...over,
});
const sessionRow = (state, over = {}) => ({ id: state.id, name: null, date: state.date, is_completed: false, round_count: 3, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'swiss', ranking_rule: 'dtkv2026', decider_results: null, swiss_state: state, ...over });

// ─────────────────────────────────────────────────────────────────────────────
// 1. A whole tournament of four players: the rounds are limited to what is possible, no rematch, reload in between,
//    completing books the eternal table with points and championships only
// ─────────────────────────────────────────────────────────────────────────────
{
  const eternalRows = ['Anna', 'Bernd', 'Clara', 'Dirk'].map((n, i) => ({ id: `e${i}`, league_id: 'L-eternal', player_id: `ep${i}`, player_name: n, wins: 10, draws: 2, losses: 3, goals_for: 50, goals_against: 40, points: 22, points_against: 8, goal_difference: 10, championships: 1, vice_championships: 1 }));
  const tables = baseTables({ player_stats: eternalRows });
  const { ctx, posts } = await newContext(tables);
  const page = await newPage(ctx);
  await page.goto(BASE + '/schweizer-system');
  await page.getByRole('button', { name: /Schweizer System starten/ }).waitFor({ timeout: 15000 });
  await addPlayers(page, ['Anna', 'Bernd', 'Clara', 'Dirk']);
  check('Regler: mit 4 Spielern höchstens 3 Runden', (await page.getByText(/Anzahl Runden:/).innerText()).includes('3'), await page.getByText(/Anzahl Runden:/).innerText());
  await page.getByRole('button', { name: /Schweizer System starten/ }).click();
  await page.getByText('Runde 1 / 3').waitFor({ timeout: 10000 });
  check('Runde 1 von 3 gestartet', true);
  await page.waitForTimeout(800);
  const s0 = tables.training_sessions[0];
  check('Das laufende Turnier steht in der Datenbank (swiss_state)', !!s0?.swiss_state && s0.swiss_state.currentRound === 1 && s0.tournament_type === 'swiss', JSON.stringify(s0)?.slice(0, 200));
  check('Das Turnier hat ein Los', !!s0?.swiss_state?.lot && Object.keys(s0.swiss_state.lot).length === 4);

  await playOpenMatches(page, 1);
  await page.getByRole('button', { name: /Runde 2 generieren/ }).click();
  await page.getByText('Runde 2 / 3').waitFor();
  await playOpenMatches(page, 5);
  await page.waitForTimeout(800);

  // Reload in the middle of the tournament: it comes back from the database
  await page.reload();
  await page.getByText('Runde 2 / 3').waitFor({ timeout: 15000 })
    .then(() => check('Nach dem Neuladen ist das Turnier wieder da (Runde 2 von 3)', true))
    .catch(() => check('Nach dem Neuladen ist das Turnier wieder da (Runde 2 von 3)', false));
  await page.getByRole('button', { name: /Runde 3 generieren/ }).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /Runde 3 generieren/ }).click();
  await page.getByText('Runde 3 / 3').waitFor();
  await playOpenMatches(page, 9);
  await page.waitForTimeout(800);

  const swissGames = tables.matches.filter(m => m.session_id === tables.training_sessions[0].id && m.phase === 'swiss');
  const pairs = swissGames.map(m => [m.home_player_name, m.away_player_name].sort().join('|'));
  check('3 Runden mit je 2 Spielen gespeichert', swissGames.length === 6, String(swissGames.length));
  check('Keine Paarung kommt zweimal vor (jeder spielt gegen jeden genau einmal)', new Set(pairs).size === 6, pairs.join(' '));

  await page.getByRole('button', { name: /Turnier abschließen & übertragen/ }).click();
  await page.getByRole('button', { name: /Ewige Tabelle/ }).click();
  await page.getByRole('button', { name: /Liga Eins/ }).click();
  await page.getByRole('button', { name: /Übertragen \(2\)/ }).click();
  await page.waitForSelector('text=/Ergebnisse zu 2 Liga/', { timeout: 10000 }).catch(() => console.log('(keine Erfolgsmeldung gesehen)'));
  await page.waitForTimeout(3000);

  const done = tables.training_sessions[0];
  check('Das Turnier ist abgeschlossen und bleibt es (kein späterer Autosave überschreibt es)', done.is_completed === true, JSON.stringify(done.is_completed));
  check('Übertragen an beide Ligen vermerkt', (done.transferred_to_leagues ?? []).length === 2);
  const eternal = tables.player_stats.filter(r => r.league_id === 'L-eternal');
  check('Ewige Tabelle: Siege, Unentschieden, Niederlagen, Tore und Vizetitel unverändert', eternal.every(r => r.wins === 10 && r.draws === 2 && r.losses === 3 && r.goals_for === 50 && r.goals_against === 40 && r.vice_championships === 1), JSON.stringify(eternal.map(r => [r.player_name, r.wins, r.draws, r.losses, r.goals_for, r.vice_championships])));
  const pointsGained = eternal.reduce((n, r) => n + (r.points - 22), 0);
  check('Ewige Tabelle: Punkte kamen dazu (6 Spiele, je 2 Punkte = 12)', pointsGained === 12, String(pointsGained));
  check('Ewige Tabelle: genau ein Meistertitel kam dazu', eternal.reduce((n, r) => n + (r.championships - 1), 0) === 1, JSON.stringify(eternal.map(r => r.championships)));
  const normal = tables.player_stats.filter(r => r.league_id === 'L-year');
  check('Jahresliga: 4 Spieler mit je 3 Spielen eingetragen', normal.length === 4 && normal.every(r => r.wins + r.draws + r.losses === 3), JSON.stringify(normal.map(r => [r.player_name, r.wins, r.draws, r.losses])));
  check('Jahresliga: 1 Meister und 1 Vize', normal.reduce((n, r) => n + r.championships, 0) === 1 && normal.reduce((n, r) => n + r.vice_championships, 0) === 1);
  const sd = posts.filter(p => p.table === 'training_sessions').flatMap(p => p.rows);
  check('Beim Abschluss wurde swiss_state nicht mit null überschrieben', sd.filter(r => r.is_completed === true).every(r => !('swiss_state' in r) || r.swiss_state !== null));
  check('Turnier-Seite: keine Seitenfehler', page._errors.length === 0, page._errors.join(' | '));
  await page.reload();
  await page.getByRole('button', { name: /Schweizer System starten/ }).waitFor({ timeout: 15000 })
    .then(() => check('Nach dem Abschluss erscheint kein laufendes Turnier mehr', true))
    .catch(() => check('Nach dem Abschluss erscheint kein laufendes Turnier mehr', false));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Referee mode with seven players (odd): two passes, the player with the bye is free in one pass and referees in the other
// ─────────────────────────────────────────────────────────────────────────────
{
  const tables = baseTables();
  const { ctx } = await newContext(tables);
  const page = await newPage(ctx);
  await page.goto(BASE + '/schweizer-system');
  await page.getByRole('button', { name: /Schweizer System starten/ }).waitFor({ timeout: 15000 });
  const names = ['Anna', 'Bernd', 'Clara', 'Dirk', 'Eva', 'Frank', 'Gerd'];
  await addPlayers(page, names);
  await page.getByRole('switch').first().click();
  await page.getByRole('button', { name: /Schweizer System starten/ }).click();
  await page.getByText('Runde 1 / 4').waitFor({ timeout: 10000 });
  await page.getByText(/Durchgang 2/).first().waitFor();
  await page.getByText(/Durchgang 2/).first().click();
  await page.waitForTimeout(300);
  const refereeLines = await page.locator('text=/^Schiedsrichter:/').locator('xpath=..').allInnerTexts();
  check('Beide Durchgänge zeigen Schiedsrichter', refereeLines.length === 2, JSON.stringify(refereeLines));
  const lists = refereeLines.map(t => t.replace('Schiedsrichter:', '').split(',').map(x => x.trim()).filter(Boolean));
  const byeText = await page.locator('text=/^Spielfrei:/').locator('xpath=..').first().innerText();
  const bye = names.find(n => byeText.includes(n));
  check('Ein Spieler hat Freilos', !!bye, byeText);
  check('Der Spieler mit Freilos ist Schiedsrichter in genau einem Durchgang, im anderen hat er frei', lists.filter(l => l.includes(bye)).length === 1, JSON.stringify({ bye, lists }));
  check('Durchgänge: 2 und 1 Spiele, Schiedsrichter 3 und 4 (der Freilos-Spieler hilft im Durchgang mit mehr Spielen)', JSON.stringify(lists.map(l => l.length).sort()) === JSON.stringify([3, 4]), JSON.stringify(lists.map(l => l.length)));
  await page.waitForTimeout(800);
  // in the stored tournament: the pass that carries the bye ("Spielfrei") is the one he does not referee, and it has fewer matches
  const stored = tables.training_sessions[0]?.swiss_state?.rounds ?? [];
  const freePass = stored.filter(r => r.byePlayerId);
  const refereePass = stored.filter(r => !r.byePlayerId);
  const byeId = freePass[0]?.byePlayerId;
  check('Gespeichert: genau ein Durchgang trägt das Freilos, dort ist der Spieler nicht Schiedsrichter', freePass.length === 1 && !freePass[0].referees.includes(byeId) && refereePass[0]?.referees.includes(byeId), JSON.stringify(stored.map(r => [r.pass, r.byePlayerId, r.referees])));
  check('Gespeichert: frei ist er im Durchgang mit weniger Spielen (1 gegen 2)', freePass[0]?.matches.length === 1 && refereePass[0]?.matches.length === 2);
  const matchesInDb = () => tables.matches.filter(m => m.phase === 'swiss');
  await page.waitForTimeout(800);
  check('Die 3 Spiele der Runde stehen in der Datenbank, der Freilos-Spieler spielt nicht', matchesInDb().length === 3 && !matchesInDb().some(m => m.home_player_name === bye || m.away_player_name === bye), JSON.stringify(matchesInDb().map(m => [m.home_player_name, m.away_player_name])));
  await page.reload();
  await page.getByText('Runde 1 / 4').waitFor({ timeout: 15000 })
    .then(() => check('Referee-Turnier ist nach dem Neuladen wieder da', true))
    .catch(() => check('Referee-Turnier ist nach dem Neuladen wieder da', false));
  check('Referee-Turnier: keine Seitenfehler', page._errors.length === 0, page._errors.join(' | '));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A tournament that so far only existed on this device is moved to the database
// ─────────────────────────────────────────────────────────────────────────────
{
  const tables = baseTables();
  const { ctx } = await newContext(tables, { localStorageItems: { 'swiss-session-v1': runningSession('00000000-0000-4000-8000-0000000000a1') } });
  const page = await newPage(ctx);
  await page.goto(BASE + '/schweizer-system');
  await page.getByText('Runde 1 / 3').waitFor({ timeout: 15000 });
  await page.waitForSelector('text=/vom Gerät übernommen/', { timeout: 8000 })
    .then(() => check('Übernahme vom Gerät: Hinweis erscheint nach dem bestätigten Speichern', true))
    .catch(() => check('Übernahme vom Gerät: Hinweis erscheint nach dem bestätigten Speichern', false));
  check('Übernahme vom Gerät: das Turnier steht jetzt in der Datenbank', tables.training_sessions.some(s => s.id === '00000000-0000-4000-8000-0000000000a1' && s.swiss_state));
  check('Übernahme vom Gerät: die alte Gerätekopie wurde erst danach entfernt', await page.evaluate(() => localStorage.getItem('swiss-session-v1')) === null);
  check('Übernahme vom Gerät: die 2 Spiele der Runde sind gespeichert', tables.matches.length === 2, String(tables.matches.length));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Device and server differ: the server version wins, the device copy is kept
// ─────────────────────────────────────────────────────────────────────────────
{
  const serverState = runningSession('00000000-0000-4000-8000-0000000000b1', { currentRound: 1 });
  const tables = baseTables({ training_sessions: [sessionRow(serverState)] });
  const deviceState = runningSession('00000000-0000-4000-8000-0000000000b2');
  const { ctx } = await newContext(tables, { localStorageItems: { 'swiss-session-v1': deviceState } });
  const page = await newPage(ctx);
  await page.goto(BASE + '/schweizer-system');
  await page.getByText('Runde 1 / 3').waitFor({ timeout: 15000 });
  await page.waitForSelector('text=/abweichende Fassung/', { timeout: 8000 })
    .then(() => check('Konflikt: Hinweis auf die abweichende Gerätefassung', true))
    .catch(() => check('Konflikt: Hinweis auf die abweichende Gerätefassung', false));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  const conflictKey = keys.find(k => k.startsWith('swiss-session-v1-conflict-') && !k.endsWith('-seeded'));
  check('Konflikt: die Gerätefassung bleibt unter einem eigenen Schlüssel gesichert', !!conflictKey && JSON.parse(await page.evaluate(k => localStorage.getItem(k), conflictKey)).id === '00000000-0000-4000-8000-0000000000b2', JSON.stringify(keys));
  check('Konflikt: die Datenbank wurde nicht überschrieben', tables.training_sessions.length === 1 && tables.training_sessions[0].id === serverState.id);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Database without the swiss_state column (before the migration): the tournament stays on the device, as before
// ─────────────────────────────────────────────────────────────────────────────
{
  const tables = baseTables();
  const { ctx, posts } = await newContext(tables, { missingSwissColumn: true });
  const page = await newPage(ctx);
  await page.goto(BASE + '/schweizer-system');
  await page.getByRole('button', { name: /Schweizer System starten/ }).waitFor({ timeout: 15000 });
  await addPlayers(page, ['Anna', 'Bernd', 'Clara', 'Dirk']);
  await page.getByRole('button', { name: /Schweizer System starten/ }).click();
  await page.getByText('Runde 1 / 3').waitFor({ timeout: 10000 });
  check('Ohne Spalte: Hinweis, dass das Turnier nur auf diesem Gerät gespeichert wird', (await page.getByText(/nur auf diesem Gerät gespeichert/).count()) > 0);
  await page.waitForTimeout(800);
  check('Ohne Spalte: Turnier liegt im Browser', await page.evaluate(() => !!localStorage.getItem('swiss-session-v1')));
  check('Ohne Spalte: nichts wird in die Datenbank geschrieben', posts.length === 0, JSON.stringify(posts.map(p => p.table)));
  await page.reload();
  await page.getByText('Runde 1 / 3').waitFor({ timeout: 15000 })
    .then(() => check('Ohne Spalte: nach dem Neuladen ist das Turnier wieder da', true))
    .catch(() => check('Ohne Spalte: nach dem Neuladen ist das Turnier wieder da', false));
  check('Ohne Spalte: keine Seitenfehler', page._errors.length === 0, page._errors.join(' | '));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Reset: nothing is deleted, only the running state is cleared
// ─────────────────────────────────────────────────────────────────────────────
{
  const tables = baseTables();
  const { ctx } = await newContext(tables);
  const page = await newPage(ctx);
  await page.goto(BASE + '/schweizer-system');
  await page.getByRole('button', { name: /Schweizer System starten/ }).waitFor({ timeout: 15000 });
  await addPlayers(page, ['Anna', 'Bernd', 'Clara', 'Dirk']);
  await page.getByRole('button', { name: /Schweizer System starten/ }).click();
  await page.getByText('Runde 1 / 3').waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  check('Zurücksetzen: vorher steht das Turnier in der Datenbank', !!tables.training_sessions[0]?.swiss_state && tables.matches.length === 2);
  await page.getByRole('button', { name: /Zurücksetzen/ }).click();
  await page.getByRole('button', { name: /Schweizer System starten/ }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check('Zurücksetzen: der laufende Zustand ist geleert', tables.training_sessions[0].swiss_state === null);
  check('Zurücksetzen: Abend, Spieler und Spiele bleiben erhalten (nichts gelöscht)', tables.training_sessions.length === 1 && tables.training_players.length === 4 && tables.matches.length === 2);
  await page.reload();
  await page.getByRole('button', { name: /Schweizer System starten/ }).waitFor({ timeout: 15000 })
    .then(() => check('Zurücksetzen: nach dem Neuladen kommt es nicht zurück', true))
    .catch(() => check('Zurücksetzen: nach dem Neuladen kommt es nicht zurück', false));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. A round that cannot be drawn: a message, no crash, nothing changes
// ─────────────────────────────────────────────────────────────────────────────
{
  const done = (id, round, h, a) => swissMatch(id, round, h, a, 2, 1);
  const state = runningSession('00000000-0000-4000-8000-0000000000c1', {
    config: { rounds: 5, refereeMode: false, endMode: 'direct', playoffFormat: 'standard', playoffStart: 'qf' },   // an old setting: 5 rounds for 4 players
    rounds: [
      { roundNumber: 1, phase: 'swiss', isCompleted: true, matches: [done('x1', 1, 'A', 'B'), done('x2', 1, 'C', 'D')] },
      { roundNumber: 2, phase: 'swiss', isCompleted: true, matches: [done('x3', 2, 'A', 'C'), done('x4', 2, 'B', 'D')] },
      { roundNumber: 3, phase: 'swiss', isCompleted: true, matches: [done('x5', 3, 'A', 'D'), done('x6', 3, 'B', 'C')] },
    ],
    currentRound: 3,
  });
  const tables = baseTables({ training_sessions: [sessionRow(state)] });
  const { ctx } = await newContext(tables);
  const page = await newPage(ctx);
  await page.goto(BASE + '/schweizer-system');
  await page.getByRole('button', { name: /Runde 4 generieren/ }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Runde 4 generieren/ }).click();
  await page.waitForSelector('text=/keine Auslosung ohne Wiederholung möglich/', { timeout: 6000 })
    .then(() => check('Nicht auslosbar: verständliche Meldung statt stillem Nichtstun', true))
    .catch(() => check('Nicht auslosbar: verständliche Meldung statt stillem Nichtstun', false));
  await page.waitForTimeout(500);
  check('Nicht auslosbar: das Turnier bleibt bei Runde 3', (await page.getByText('Runde 3 / 5').count()) > 0 && tables.training_sessions[0].swiss_state.currentRound === 3);
  check('Nicht auslosbar: es entstand keine Wiederholungspaarung', tables.matches.length === 0 || tables.matches.every(m => m.round <= 3));
  check('Nicht auslosbar: keine Seitenfehler', page._errors.length === 0, page._errors.join(' | '));
  await page.screenshot({ path: join(OUT, 'swiss-cannot-draw.png') });
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nALLE BESTANDEN');
process.exit(fails ? 1 : 0);
