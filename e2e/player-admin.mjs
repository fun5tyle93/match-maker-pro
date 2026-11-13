// Admin page "Spielerliste" (src/pages/Players.tsx, route /spieler), docs/UMSETZUNGSPLAN-2.md Punkt 3.
//   node e2e/player-admin.mjs <url> [ausgabeordner]      (W=390 für Handybreite)
// The mock server imitates the database functions rename_player and merge_players and the foreign keys.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const OUT = process.argv[3] || '.'; const REF = 'swuwjjmspplzfguapvty';
const id = n => `a0000000-0000-4000-8000-0000000000${n}`;
const P = { anna: id('01'), anni: id('02'), ben: id('03'), cem: id('04'), dora: id('05') };
const tables = {
  players: [
    { id: P.anna, display_name: 'Anna Test' }, { id: P.anni, display_name: 'Anni Test' }, { id: P.ben, display_name: 'Ben Test' },
    { id: P.cem, display_name: 'Cem Unbenutzt' }, { id: P.dora, display_name: 'Dora Test' },
  ],
  player_aliases: [{ alias: 'bobby', player_id: P.ben }],
  training_players: [
    { id: 't1', session_id: 'S1', player_id: 'e1', player_name: 'Anna Test', player_ref: P.anna },
    { id: 't2', session_id: 'S1', player_id: 'e2', player_name: 'Anni', player_ref: P.anni },
    { id: 't3', session_id: 'S1', player_id: 'e3', player_name: 'Ben Test', player_ref: P.ben },
    { id: 't4', session_id: 'S2', player_id: 'e4', player_name: 'Ben Test', player_ref: P.ben },
  ],
  matches: [
    { id: 'm1', session_id: 'S1', home_player_ref: P.anna, away_player_ref: P.ben },
    { id: 'm2', session_id: 'S1', home_player_ref: P.anni, away_player_ref: P.ben },
  ],
  leagues: [{ id: 'L1', name: 'Liga Eins' }, { id: 'L2', name: 'Liga Zwei' }],
  player_stats: [
    { id: 's1', league_id: 'L1', player_id: 'x1', player_name: 'Anna Test', player_ref: P.anna, points: 10, championships: 1 },
    { id: 's2', league_id: 'L1', player_id: 'x2', player_name: 'Ben Test', player_ref: P.ben, points: 8, championships: 0 },
    { id: 's3', league_id: 'L1', player_id: 'x3', player_name: 'Dora Test', player_ref: P.dora, points: 3, championships: 0 },
    { id: 's4', league_id: 'L2', player_id: 'x4', player_name: 'Ohne Spieler', player_ref: null, points: 4, championships: 2 },
  ],
  training_sessions: [], current_session: [{ id: 1, session_id: null }],
};
const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const matchFilter = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue; const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]; if (op === 'eq' && String(row[k]) !== val) return false; if (op === 'is' && val === 'null' && row[k] != null) return false; if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false; } return true; };

function rpc(name, a) {
  const T = tables;
  const fail = (status, code, message) => ({ status, body: { code, message } });
  if (name === 'rename_player') {
    const player = T.players.find(p => p.id === a.p_player);
    const next = a.p_new_name.trim().replace(/\s+/g, ' ');
    if (!next) return fail(400, 'P0001', 'Der neue Name ist leer.');
    if (!player) return fail(400, 'P0001', 'Spieler nicht gefunden.');
    if (player.display_name === next) return { status: 204 };
    if (T.players.some(p => p.id !== player.id && norm(p.display_name) === norm(next))) return fail(409, '23505', 'duplicate key value violates unique constraint "players_display_name_unique"');
    if (T.player_aliases.some(x => x.alias === norm(next) && x.player_id !== player.id)) return fail(400, 'P0001', 'Der Name ist schon ein anderer Name eines anderen Spielers.');
    const old = player.display_name; player.display_name = next;
    if (!T.player_aliases.some(x => x.alias === norm(old))) T.player_aliases.push({ alias: norm(old), player_id: player.id });
    T.player_aliases = T.player_aliases.filter(x => !(x.alias === norm(next) && x.player_id === player.id));
    T.player_stats.filter(r => r.player_ref === player.id).forEach(r => (r.player_name = next));
    return { status: 204 };
  }
  if (name === 'merge_players') {
    const from = T.players.find(p => p.id === a.p_from), into = T.players.find(p => p.id === a.p_into);
    if (a.p_from === a.p_into) return fail(400, 'P0001', 'Ein Spieler kann nicht mit sich selbst zusammengeführt werden.');
    if (!from || !into) return fail(400, 'P0001', 'Spieler nicht gefunden.');
    const shared = T.player_stats.find(r => r.player_ref === from.id && T.player_stats.some(o => o.player_ref === into.id && o.league_id === r.league_id));
    if (shared) return fail(400, 'P0001', `Beide Spieler stehen in der Liga "${T.leagues.find(l => l.id === shared.league_id).name}". Bitte dort zuerst eine der Zeilen bereinigen.`);
    T.training_players.forEach(r => { if (r.player_ref === from.id) r.player_ref = into.id; });
    T.matches.forEach(r => { if (r.home_player_ref === from.id) r.home_player_ref = into.id; if (r.away_player_ref === from.id) r.away_player_ref = into.id; });
    T.player_stats.forEach(r => { if (r.player_ref === from.id) { r.player_ref = into.id; r.player_name = into.display_name; } });
    T.player_aliases.forEach(x => { if (x.player_id === from.id) x.player_id = into.id; });
    T.player_aliases = T.player_aliases.filter(x => x.alias !== norm(from.display_name));
    T.player_aliases.push({ alias: norm(from.display_name), player_id: into.id });
    T.players = T.players.filter(p => p.id !== from.id);
    return { status: 204 };
  }
  return fail(404, 'PGRST202', 'unbekannte Funktion');
}
const used = pid => tables.training_players.some(r => r.player_ref === pid) || tables.player_stats.some(r => r.player_ref === pid) || tables.matches.some(m => m.home_player_ref === pid || m.away_player_ref === pid);

const requests = [];
async function newContext(browser, admin) {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 900), height: 1100 } });
  if (admin) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
  await ctx.route(`https://${REF}.supabase.co/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
    requests.push(`${admin ? 'admin' : 'gast'} ${req.method()} ${url.pathname.replace('/rest/v1/', '')}`);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const rpcMatch = url.pathname.match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpcMatch) { const r = rpc(rpcMatch[1], JSON.parse(req.postData() || '{}')); return json(r.status, r.body); }
    const t = url.pathname.split('/').pop();
    if (!url.pathname.includes('/rest/v1/') || !(t in tables)) return json(200, {});
    if (req.method() === 'GET') return json(200, tables[t].filter(r => matchFilter(r, url.searchParams)));
    if (req.method() === 'PATCH') {
      const patch = JSON.parse(req.postData()); const changed = [];
      tables[t] = tables[t].map(r => { if (!matchFilter(r, url.searchParams)) return r; const n = { ...r, ...patch }; changed.push(n); return n; });
      return (req.headers()['prefer'] || '').includes('return=representation') ? json(200, changed) : json(204);
    }
    if (req.method() === 'DELETE') {
      if (t === 'players') { const doomed = tables.players.filter(r => matchFilter(r, url.searchParams)); if (doomed.some(d => used(d.id))) return json(409, { code: '23503', message: 'violates foreign key constraint' }); }
      tables[t] = tables[t].filter(r => !matchFilter(r, url.searchParams)); return json(204);
    }
    return json(200, {});
  });
  return ctx;
}

let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

// ── ohne Anmeldung ──
{
  const ctx = await newContext(browser, false); const page = await ctx.newPage();
  await page.goto(BASE + '/spieler');
  await page.getByText('Bitte als Admin einloggen').waitFor({ timeout: 10000 });
  check('Gast: Hinweis statt Spielerliste', await page.getByTestId('player-row').count() === 0);
  check('Gast: es werden keine Spielerdaten geladen', !requests.some(r => r.startsWith('gast') && /players|player_aliases|player_stats|training_players/.test(r)), requests.join(' | '));
  await ctx.close();
}

const ctx = await newContext(browser, true); const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/spieler');
await page.getByTestId('player-row').first().waitFor({ timeout: 15000 });
// exact name: a row can contain another name of the player as text ("auch: anni test")
const nameOf = name => page.locator('p.font-medium', { hasText: new RegExp(`^${name}$`) });
const row = name => page.getByTestId('player-row').filter({ has: nameOf(name) });
const names = async () => (await page.getByTestId('player-row').locator('p.font-medium').allInnerTexts());

check('Liste nach Namen sortiert', JSON.stringify(await names()) === JSON.stringify(['Anna Test', 'Anni Test', 'Ben Test', 'Cem Unbenutzt', 'Dora Test']), JSON.stringify(await names()));
check('Anzeige: andere Namen und Zählung', (await row('Ben Test').innerText()).includes('auch: bobby') && (await row('Ben Test').innerText()).includes('2 Abende') && (await row('Ben Test').innerText()).includes('1 Liga-Zeile'));
check('Karte „Liga-Zeilen ohne Spieler (1)“ mit der Zeile', (await page.getByTestId('unassigned').innerText()).includes('Ohne Spieler') && (await page.getByTestId('unassigned').innerText()).includes('(1)'));
await page.screenshot({ path: `${OUT}/player-admin-list-${process.env.W || 900}.png` });

// Suche (auch über andere Namen)
await page.getByLabel('Suche').fill('bobby');
check('Suche findet über einen anderen Namen', JSON.stringify(await names()) === JSON.stringify(['Ben Test']));
await page.getByLabel('Suche').fill('ANNA');
check('Suche ignoriert Groß-/Kleinschreibung', JSON.stringify(await names()) === JSON.stringify(['Anna Test']));
await page.getByLabel('Suche').fill('gibtesnicht');
check('Suche ohne Treffer: Hinweis', await page.getByText('Kein Spieler gefunden.').isVisible());
await page.getByLabel('Suche').fill('');

// Löschen nur für unbenutzte
check('Löschen-Knopf nur beim unbenutzten Spieler', await page.getByLabel('Cem Unbenutzt löschen').count() === 1 && await page.getByLabel('Ben Test löschen').count() === 0 && await page.getByLabel('Anna Test löschen').count() === 0);

// Umbenennen auf vergebenen Namen: Fehlermeldung, nichts geändert
await row('Cem Unbenutzt').getByRole('button', { name: /Umbenennen/ }).click();
await page.getByLabel('Neuer Name').fill('anna  TEST');
await page.getByRole('button', { name: 'Speichern' }).click();
await page.getByText(/Den Namen gibt es schon/).waitFor({ timeout: 5000 });
check('Umbenennen auf vergebenen Namen: Meldung, Name unverändert', tables.players.find(p => p.id === P.cem).display_name === 'Cem Unbenutzt');
await page.getByRole('button', { name: 'Abbrechen' }).click();

// Umbenennen
await row('Cem Unbenutzt').getByRole('button', { name: /Umbenennen/ }).click();
await page.getByLabel('Neuer Name').fill('  Cem   Neu ');
await page.getByRole('button', { name: 'Speichern' }).click();
await row('Cem Neu').waitFor({ timeout: 5000 });
check('Umbenennen: neuer Name (Leerzeichen bereinigt) und alter Name als anderer Name', tables.players.find(p => p.id === P.cem).display_name === 'Cem Neu' && tables.player_aliases.some(a => a.alias === 'cem unbenutzt' && a.player_id === P.cem));
check('Umbenennen: die Liste zeigt den neuen Namen und den alten als „auch“', (await row('Cem Neu').innerText()).includes('auch: cem unbenutzt'));

// Zusammenführen: Anni -> Anna
await row('Anni Test').getByRole('button', { name: /Zusammenführen/ }).click();
const dialog = page.getByRole('dialog');
await dialog.getByPlaceholder('Spieler suchen…').fill('Anna');
await dialog.getByRole('option', { name: 'Anna Test' }).click();
check('Zusammenführen: Zusammenfassung nennt Quelle und Ziel', (await dialog.innerText()).includes('„Anni Test“') && (await dialog.innerText()).includes('„Anna Test“') && (await dialog.innerText()).includes('nicht automatisch rückgängig'));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/player-admin-merge-${process.env.W || 900}.png` });
await dialog.getByRole('button', { name: 'Zusammenführen' }).click();
await row('Anni Test').waitFor({ state: 'detached', timeout: 5000 });
check('Zusammenführen: Quelle ist weg, Abende und Partien zeigen auf das Ziel', !tables.players.some(p => p.id === P.anni) && tables.training_players.find(r => r.id === 't2').player_ref === P.anna && tables.matches.find(m => m.id === 'm2').home_player_ref === P.anna);
check('Zusammenführen: Name der Quelle ist anderer Name des Ziels', tables.player_aliases.some(a => a.alias === 'anni test' && a.player_id === P.anna));
check('Zusammenführen: Zählung des Ziels aktualisiert (2 Abende)', (await row('Anna Test').innerText()).includes('2 Abende'));

// Zusammenführen verweigert: Dora und Ben stehen beide in „Liga Eins“
const beforeMerge = JSON.stringify([tables.players, tables.player_stats, tables.training_players]);
await row('Dora Test').getByRole('button', { name: /Zusammenführen/ }).click();
await dialog.getByPlaceholder('Spieler suchen…').fill('Ben');
await dialog.getByRole('option', { name: 'Ben Test' }).click();
await dialog.getByText(/Beide stehen in der Liga „Liga Eins“/).waitFor({ timeout: 5000 });
check('gleiche Liga: Warnung mit Liganamen, Knopf „Zusammenführen“ gesperrt', await dialog.getByRole('button', { name: 'Zusammenführen' }).isDisabled());
check('gleiche Liga: nichts verändert', JSON.stringify([tables.players, tables.player_stats, tables.training_players]) === beforeMerge);
await dialog.getByRole('button', { name: 'Abbrechen' }).click();

// Löschen
await row('Cem Neu').getByLabel('Cem Neu löschen').click();
await page.getByRole('button', { name: 'Löschen', exact: true }).click();
await row('Cem Neu').waitFor({ state: 'detached', timeout: 5000 });
check('Löschen: nur dieser Spieler ist weg', !tables.players.some(p => p.id === P.cem) && tables.players.length === 3);

// Liga-Zeile ohne Spieler zuordnen
const unassigned = page.getByTestId('unassigned');
await unassigned.getByPlaceholder('Spieler wählen…').fill('Ben');
await unassigned.getByRole('option', { name: 'Ben Test' }).click();
await page.getByRole('alertdialog').getByText(/wird dem Spieler „Ben Test“ zugeordnet/).waitFor();
await page.getByRole('alertdialog').getByRole('button', { name: 'Zuordnen' }).click();
await page.getByTestId('unassigned').waitFor({ state: 'detached', timeout: 5000 });
const s4 = tables.player_stats.find(r => r.id === 's4');
check('Zuordnen: Zeile hat Spieler und dessen Namen, Zahlen unverändert', s4.player_ref === P.ben && s4.player_name === 'Ben Test' && s4.points === 4 && s4.championships === 2, JSON.stringify(s4));
check('Zuordnen: die Karte verschwindet, wenn nichts mehr offen ist', await page.getByTestId('unassigned').count() === 0);
check('Zuordnen: Zählung bei Ben aktualisiert (2 Liga-Zeilen)', (await row('Ben Test').innerText()).includes('2 Liga-Zeilen'));
// Navigation mit dem achten Punkt (nur Admin): nichts darf überlaufen, Beschriftung erst ab xl
for (const width of [320, 360, 374, 375, 390, 768, 1024, 1100, 1279, 1280, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const header = document.querySelector('header .container > div');
    const link = document.querySelector('header a[href="/spieler"]');
    const logout = document.querySelector('header button[title="Abmelden"]');
    const right = Math.max(...[...document.querySelectorAll('header a, header button')].map(e => e.getBoundingClientRect().right));
    return { page: document.documentElement.scrollWidth - window.innerWidth, header: header.scrollWidth - header.clientWidth, right: Math.round(right), inner: window.innerWidth, label: getComputedStyle(link.querySelector('span')).display, linkVisible: !!link, logoutVisible: !!logout };
  });
  check(`Navigation bei ${width} px: kein Überlauf, alle Knöpfe im Bild`, m.page <= 0 && m.header <= 0 && m.right <= m.inner, JSON.stringify(m));
  if (width >= 1280) check(`  Beschriftung „Spieler“ ab 1280 px sichtbar`, m.label !== 'none');
  if (width < 1280) check(`  unter 1280 px nur das Symbol`, m.label === 'none');
}
check('keine Seitenfehler', errors.length === 0, errors.join('|'));
await browser.close(); process.exit(failed ? 1 : 0);
