import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2];
const REF = 'swuwjjmspplzfguapvty';
const failTables = process.env.FAIL_TABLES ? process.env.FAIL_TABLES.split(',') : null;

const evening = 'ev00000-0000-0000-0000-000000000001';
const names = { p1: 'Anna', p2: 'Bernd', p3: 'Clara', p4: 'Dirk' };
const pairs = [['p1', 'p2'], ['p3', 'p4'], ['p1', 'p3'], ['p2', 'p4'], ['p1', 'p4'], ['p2', 'p3']];
const tables = {
  current_session: [{ id: 1, session_id: evening }],
  training_sessions: [{ id: evening, name: null, date: '2026-10-30T18:00:00Z', is_completed: false, round_count: 3, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }],
  training_players: Object.entries(names).map(([id, n], i) => ({ id: `tp${i}`, session_id: evening, player_id: id, player_name: n })),
  matches: pairs.map(([h, a], i) => ({ id: `m${i + 1}`, session_id: evening, round: Math.floor(i / 2) + 1, home_player_id: h, home_player_name: names[h], away_player_id: a, away_player_name: names[a], home_score: null, away_score: null, is_completed: false, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: (i % 2) + 1 })),
  leagues: [], player_stats: [],
};

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@example.org', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
let fails = 0; const check = (l, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', l, extra); if (!ok) fails++; };

async function newContext({ admin, failWrites }) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const state = { failWrites, writes: [], deletes: [], failedWrites: 0 };
  if (admin) await ctx.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
  await ctx.route(`https://${REF}.supabase.co/**`, route => {
    const req = route.request(); const url = new URL(req.url()); const name = url.pathname.split('/').pop();
    if (!url.pathname.includes('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tables[name] ?? []) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    // Teilausfall: Löschen klappt noch, Einfügen/Schreiben der betroffenen Tabellen scheitert
    const fail = state.failWrites && (!failTables || (req.method() === 'POST' && failTables.includes(name)));
    state.writes.push({ method: req.method(), table: name, body: req.postData() ?? '', ok: !fail });
    if (req.method() === 'DELETE' && !fail) state.deletes.push(name);
    if (fail) { state.failedWrites++; return route.abort('failed'); }
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' });
  });
  return { ctx, state };
}

// ---------- 1. Zuschauer ----------
{
  const { ctx, state } = await newContext({ admin: false, failWrites: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/training'); await page.waitForSelector('text=Platte 1'); await page.waitForTimeout(1500);
  check('Zuschauer: Abend wird angezeigt', (await page.locator('text=Anna').count()) > 0);
  check('Zuschauer: es wird nie geschrieben', state.writes.length === 0, `(${state.writes.map(w => w.method + ' ' + w.table).join(', ')})`);
  check('Zuschauer: keine Fehlermeldung "Nicht gespeichert"', (await page.locator('[role=alert]').count()) === 0);
  await ctx.close();
}

// ---------- 2. Admin, Verbindung fällt aus ----------
const { ctx, state } = await newContext({ admin: true, failWrites: true });
const page = await ctx.newPage();
const dialogs = []; page.on('dialog', d => { dialogs.push(d.type()); d.accept(); });
await page.goto(BASE + '/training'); await page.waitForSelector('text=Platte 1');
await page.waitForTimeout(1200);
check('Admin: beim reinen Ansehen wird nichts gespeichert', state.writes.length === 0, `(${state.writes.length})`);

const inputs = () => page.locator('input[type=number]');
await inputs().nth(0).fill('3');
await inputs().nth(1).fill('1');
await inputs().nth(1).press('Enter');

await page.waitForSelector('[role=alert]:has-text("Nicht gespeichert")', { timeout: 8000 })
  .then(() => check('Ausfall: Warnung "Nicht gespeichert" erscheint', true))
  .catch(() => check('Ausfall: Warnung "Nicht gespeichert" erscheint', false));
check('Ausfall: keine voreilige Meldung "Ergebnis gespeichert"', (await page.locator('[data-sonner-toast]:has-text("Ergebnis gespeichert")').count()) === 0);
const backup = await page.evaluate(() => localStorage.getItem('matchmaker:unsaved-training-session'));
check('Ausfall: Eingaben sind im Browser gesichert', !!backup && backup.includes('"homeScore":3'));
check('Ausfall: es wurde nichts gelöscht', state.deletes.length === 0, `(erfolgreiche DELETE: ${state.deletes.join(', ') || 'keine'})`);
check('Ausfall: Speichern wurde versucht', state.failedWrites > 0, `(${state.failedWrites} Versuche)`);

if (process.env.CONTROL) { await browser.close(); console.log(fails ? `\n${fails} FEHLGESCHLAGEN (Kontrolle)` : '\nALLE BESTANDEN'); process.exit(0); }

// ---------- 3. Neu laden während der Ausfall anhält ----------
await page.reload(); await page.waitForSelector('text=Platte 1');
await page.waitForSelector('[data-sonner-toast]:has-text("wiederhergestellt")', { timeout: 8000 })
  .then(() => check('Neuladen: Hinweis auf wiederhergestellte Änderungen', true))
  .catch(() => check('Neuladen: Hinweis auf wiederhergestellte Änderungen', false));
const vals = (await inputs().evaluateAll(els => els.map(e => e.value))).slice(0, 2);
check('Neuladen: das Ergebnis 3:1 ist wieder da', vals.join(':') === '3:1', `(${vals.join(':')})`);
await page.waitForSelector('[role=alert]:has-text("Nicht gespeichert")', { timeout: 8000 })
  .then(() => check('Neuladen: Warnung bleibt, solange nicht gespeichert', true))
  .catch(() => check('Neuladen: Warnung bleibt, solange nicht gespeichert', false));

// ---------- 4. Verbindung kommt zurück ----------
state.failWrites = false; const before = state.writes.length;
await page.getByRole('button', { name: 'Jetzt erneut versuchen' }).click();
await page.waitForSelector('[role=alert]', { state: 'detached', timeout: 8000 })
  .then(() => check('Erholung: Warnung verschwindet', true))
  .catch(() => check('Erholung: Warnung verschwindet', false));
await page.waitForSelector('text=Gespeichert', { timeout: 5000 }).then(() => check('Erholung: Status "Gespeichert"', true)).catch(() => check('Erholung: Status "Gespeichert"', false));
const okWrites = state.writes.slice(before).filter(w => w.ok);
check('Erholung: Ergebnis 3:1 wurde an den Server gesendet', okWrites.some(w => w.table === 'matches' && w.body.includes('"home_score":3') && w.body.includes('"away_score":1')));
check('Erholung: Spiele wurden per Upsert geschrieben (kein Löschen)', state.deletes.length === 0);
const left = await page.evaluate(() => localStorage.getItem('matchmaker:unsaved-training-session'));
check('Erholung: Browser-Sicherung ist entfernt', left === null);

// ---------- 5. Weitere Eingabe nach Erholung ----------
await inputs().nth(2).fill('2');
await inputs().nth(3).fill('2');
await inputs().nth(3).press('Enter');
await page.waitForSelector('[data-sonner-toast]:has-text("Ergebnis gespeichert")', { timeout: 8000 })
  .then(() => check('Normalbetrieb: "Ergebnis gespeichert" erst nach Bestätigung', true))
  .catch(() => check('Normalbetrieb: "Ergebnis gespeichert" erst nach Bestätigung', false));

await browser.close();
console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nALLE BESTANDEN');
process.exit(fails ? 1 : 0);
