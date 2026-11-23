// A running training evening seen by a guest (not logged in) and by an admin.
// The guest sees the results but cannot enter or change one; the admin can. A guest's browser never writes anything.
//   node e2e/guest-readonly.mjs <url>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const REF = 'swuwjjmspplzfguapvty';
const evening = 'ev000000-0000-4000-8000-000000000001';
const names = { p1: 'Anna', p2: 'Bernd', p3: 'Clara', p4: 'Dirk' };
const pairs = [['p1', 'p2'], ['p3', 'p4'], ['p1', 'p3'], ['p2', 'p4']];
const tables = () => ({
  current_session: [{ id: 1, session_id: evening }],
  training_sessions: [{ id: evening, name: null, date: '2026-11-20T18:00:00Z', is_completed: false, round_count: 2, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }],
  training_players: Object.entries(names).map(([id, n], i) => ({ id: `tp${i}`, session_id: evening, player_id: id, player_name: n })),
  // round 1 played, round 2 open
  matches: pairs.map(([h, a], i) => ({ id: `m${i + 1}`, session_id: evening, round: i < 2 ? 1 : 2, home_player_id: h, home_player_name: names[h], away_player_id: a, away_player_name: names[a], home_score: i < 2 ? 3 : null, away_score: i < 2 ? 1 : null, is_completed: i < 2, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: (i % 2) + 1 })),
  leagues: [], player_stats: [], players: [], player_aliases: [],
});
const matchFilter = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue; const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]; if (op === 'eq' && String(row[k]) !== val) return false; if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false; } return true; };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };

let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open(admin) {
  const t = tables(); const writes = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (admin) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
  await ctx.route(`https://${REF}.supabase.co/**`, async route => {
    const req = route.request(); const url = new URL(req.url()); const name = url.pathname.split('/').pop();
    const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (!url.pathname.includes('/rest/v1/') || !(name in t)) return json(200, {});
    if (req.method() === 'GET') return json(200, t[name].filter(r => matchFilter(r, url.searchParams)));
    writes.push(`${req.method()} ${name}`);
    return json(admin ? 201 : 401, admin ? undefined : { message: 'not allowed' });
  });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/training');
  await page.getByText('Trainingsabend').first().waitFor({ timeout: 15000 });
  // Round 2 (the first open one) is expanded by default; expand round 1 as well, so all four games are on screen
  await page.getByRole('button', { name: /Runde 1/ }).click();
  await page.waitForTimeout(800);
  const cards = await page.getByText('Heim', { exact: true }).count();
  return { ctx, page, writes, errors, cards };
}

// ── guest ──
{
  const { ctx, page, writes, errors, cards } = await open(false);
  check('Gast: alle vier Spiele beider Runden sind aufgeklappt', cards === 4, String(cards));
  check('Gast: der laufende Abend ist sichtbar (Spieler und Ergebnis der Runde 1)', await page.getByText('Anna').first().isVisible() && (await page.locator('body').innerText()).includes('3'));
  check('Gast: keine Eingabefelder für Ergebnisse', await page.locator('input[type="number"]').count() === 0, String(await page.locator('input[type="number"]').count()));
  check('Gast: kein Knopf „Speichern“ und kein „Bearbeiten“', await page.getByRole('button', { name: /^Speichern$/ }).count() === 0 && await page.getByRole('button', { name: /Bearbeiten/ }).count() === 0);
  check('Gast: kein Zurücksetzen, kein Abschließen', await page.getByRole('button', { name: /Zurücksetzen|Training abschließen/ }).count() === 0);
  await page.waitForTimeout(1500);
  check('Gast: der Browser schreibt nichts', writes.length === 0, writes.join(' | '));
  check('Gast: keine Seitenfehler', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${process.argv[3] || '.'}/guest-readonly-390.png` });
  await ctx.close();
}

// ── admin (counter-check) ──
{
  const { ctx, page, errors, cards } = await open(true);
  check('Admin: alle vier Spiele beider Runden sind aufgeklappt', cards === 4, String(cards));
  // completed games show their fields disabled (until "Bearbeiten"), the two open games have two free fields each
  const free = await page.locator('input[type="number"]:not([disabled])').count();
  check('Admin: freie Eingabefelder für die zwei offenen Spiele', free === 4, String(free));
  check('Admin: gespielte Spiele lassen sich bearbeiten', await page.getByRole('button', { name: /Bearbeiten/ }).count() >= 1);
  check('Admin: keine Seitenfehler', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close(); process.exit(failed ? 1 : 0);
