// Player entry with the list of known players (components/PlayerNameField.tsx), docs/UMSETZUNGSPLAN.md Schritt D3b.
//   node e2e/player-picker.mjs <url> [ausgabeordner]      (NO_REGISTRY=1: ohne Spielerliste, freie Texteingabe wie früher)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const BASE = process.argv[2]; const OUT = process.argv[3] || '.'; const REF = 'swuwjjmspplzfguapvty';
const NO_REGISTRY = !!process.env.NO_REGISTRY;
const ids = { erik: 'a0000000-0000-4000-8000-000000000001', maxi: 'a0000000-0000-4000-8000-000000000002', tim: 'a0000000-0000-4000-8000-000000000003', max: 'a0000000-0000-4000-8000-000000000004' };
const tables = {
  current_session: [{ id: 1, session_id: null }],
  training_sessions: [], training_players: [], matches: [], player_stats: [{ id: 'ps-erik', league_id: 'L1', player_id: 'old-erik-id', player_name: 'Erik Schwarz', player_ref: 'a0000000-0000-4000-8000-000000000001', wins: 1, draws: 0, losses: 0, goals_for: 3, goals_against: 1, points: 2, points_against: 0, goal_difference: 2, championships: 0, vice_championships: 0 }],
  leagues: [{ id: 'L1', name: 'Liga Eins', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }],
  players: NO_REGISTRY ? [] : [
    { id: ids.erik, display_name: 'Erik Schwarz' }, { id: ids.maxi, display_name: 'Maxi Scheibitz' },
    { id: ids.tim, display_name: 'Tim KumpelMaxi' }, { id: ids.max, display_name: 'Max Daub' },
  ],
  player_aliases: NO_REGISTRY ? [] : [{ alias: 'tim', player_id: ids.tim }],
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const matchFilter = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue; const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]; if (op === 'eq' && String(row[k]) !== val) return false; if (op === 'in' && !val.slice(1, -1).split(',').includes(String(row[k]))) return false; } return true; };
let seq = 1000; const created = [];
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
    let body = JSON.parse(req.postData()); const wasArray = Array.isArray(body); body = wasArray ? body : [body];
    const stored = [];
    for (const row of body) {
      const i = tables[t].findIndex(r => r.id === row.id && row.id !== undefined);
      if (i >= 0) { tables[t][i] = { ...tables[t][i], ...row }; stored.push(tables[t][i]); }
      else { const r = { id: row.id ?? `gen${seq++}`, ...row }; tables[t].push(r); stored.push(r); if (t === 'players') created.push(r); }
    }
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    return json(201, (req.headers()['prefer'] || '').includes('return=representation') ? (wantsObject ? stored[0] : stored) : undefined);
  }
  if (req.method() === 'PATCH') { const patch = JSON.parse(req.postData()); tables[t] = tables[t].map(r => matchFilter(r, url.searchParams) ? { ...r, ...patch } : r); return json(204); }
  if (req.method() === 'DELETE') { tables[t] = tables[t].filter(r => !matchFilter(r, url.searchParams)); return json(204); }
  return json(200, {});
});
let failed = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/training');
const field = page.getByPlaceholder(/Spieler suchen|Spielername eingeben/);
await field.waitFor({ timeout: 15000 });
const chips = () => page.locator('span.font-medium').allInnerTexts();
const add = async text => { await field.fill(text); await field.press('Enter'); };

if (NO_REGISTRY) {
  await add('Frei Eins'); await add('Frei Zwei');
  check('ohne Spielerliste: Text wird direkt übernommen (wie früher), keine Rückfrage', (await chips()).includes('Frei Eins') && await page.getByText('ist noch nicht in der Spielerliste').count() === 0);
  await page.getByRole('button', { name: /Training starten/ }).click();
  await page.waitForTimeout(2500);
  check('ohne Spielerliste: keine Identität gespeichert, Spieler gespeichert', tables.training_players.length === 2 && tables.training_players.every(r => !r.player_ref));
  await browser.close(); process.exit(failed ? 1 : 0);
}

await field.fill('ma');
await page.getByRole('option', { name: 'Maxi Scheibitz' }).waitFor();
const sug = await page.getByRole('option').allInnerTexts();
check('Vorschläge beim Tippen: Namensanfang zuerst', sug[0] === 'Max Daub' && sug.includes('Maxi Scheibitz'), JSON.stringify(sug));
await page.screenshot({ path: `${OUT}/picker-suggest-${process.env.W || 900}.png` });
await page.getByRole('option', { name: 'Maxi Scheibitz' }).click();
check('Klick auf Vorschlag fügt den Spieler hinzu', (await chips()).includes('Maxi Scheibitz'));

await add('tim');
check('Alias "tim" fügt den Anzeigenamen "Tim KumpelMaxi" hinzu, ohne Rückfrage', (await chips()).includes('Tim KumpelMaxi') && await page.getByText('ist noch nicht in der Spielerliste').count() === 0);

await add('Erik Schwartz');
await page.getByText('ist noch nicht in der Spielerliste').waitFor();
check('Verschreiber: Rückfrage mit Hinweis auf den ähnlichen Spieler', await page.getByRole('button', { name: /Ja, das ist Erik Schwarz/ }).isVisible());
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/picker-${process.env.W || 900}.png` });
await page.getByRole('button', { name: /Ja, das ist Erik Schwarz/ }).click();
check('"Ja, das ist Erik Schwarz" fügt den vorhandenen Spieler hinzu, es wird kein neuer angelegt', (await chips()).includes('Erik Schwarz') && created.length === 0);

await add('Peter Pan');
await page.getByRole('button', { name: /Neuen Spieler anlegen/ }).click();
await page.getByText('Peter Pan', { exact: true }).first().waitFor({ timeout: 5000 });
check('neuer Name: nach Bestätigung in der Spielerliste angelegt und hinzugefügt', created.length === 1 && created[0].display_name === 'Peter Pan' && (await chips()).includes('Peter Pan'));

const before = (await chips()).length;
await add('erik schwarz');
await page.waitForTimeout(400);
check('derselbe Spieler ein zweites Mal wird abgelehnt', (await chips()).length === before);

await page.getByRole('button', { name: /Training starten/ }).click();
await page.waitForTimeout(3000);
const tp = tables.training_players;
const byName = n => tp.find(r => r.player_name === n);
check('Abend gespeichert: 4 Spieler', tp.length === 4, `(${tp.length})`);
check('Spieler des Abends haben Identität, und die ID ist die Identität (stabil über Abende)', tp.every(r => r.player_ref && r.player_id === r.player_ref));
check('richtige Zuordnung: Alias → Tim KumpelMaxi, Erik Schwarz, Maxi Scheibitz', byName('Tim KumpelMaxi')?.player_ref === ids.tim && byName('Erik Schwarz')?.player_ref === ids.erik && byName('Maxi Scheibitz')?.player_ref === ids.maxi);
check('neuer Spieler hat die ID aus der Spielerliste', byName('Peter Pan')?.player_ref === created[0]?.id);
check('Partien tragen die Identitäten beider Spieler', tables.matches.length > 0 && tables.matches.every(m => m.home_player_ref && m.away_player_ref && m.home_player_id === m.home_player_ref));

// League management: the same field, and a known player keeps its fixed id in the league
await page.goto(BASE + '/leagues');
await page.getByText('Liga Eins').first().click();
await page.getByRole('button', { name: /^Spieler$/ }).click();
const leagueField = page.getByPlaceholder(/Spieler suchen/);
await leagueField.fill('erik schwarz');
await leagueField.press('Enter');
await page.waitForTimeout(500);
check('Liga: ein Spieler, der schon in der Liga steht, wird abgelehnt (andere Schreibweise)', tables.player_stats.filter(r => r.league_id === 'L1').length === 1);
await leagueField.fill('max');
await page.getByRole('option', { name: 'Max Daub' }).click();
await page.waitForTimeout(2000);
const added = tables.player_stats.find(r => r.player_name === 'Max Daub');
check('Liga: bekannter Spieler wird mit Identität und stabiler ID eingetragen', added?.player_ref === ids.max && added?.player_id === ids.max, JSON.stringify(added && { ref: added.player_ref, id: added.player_id }));
check('keine Seitenfehler', errors.length === 0, errors.join('|'));
await browser.close(); process.exit(failed ? 1 : 0);
