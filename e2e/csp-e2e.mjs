import { createRequire } from 'module';
import http from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
// Repo root (this file lives in e2e/); serves dist/ with the headers from vercel.json
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'swuwjjmspplzfguapvty';
const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const hdrs = Object.fromEntries(cfg.headers[0].headers.map(h => [h.key, h.value]));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = join(ROOT, 'dist', decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(ROOT, 'dist', 'index.html');
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', ...hdrs });
  res.end(readFileSync(p));
}).listen(4180, '127.0.0.1');
const BASE = 'http://127.0.0.1:4180';

const NAMES = ['Anna', 'Bernd', 'Carla', 'Dirk', 'Eva', 'Frank'];
const sid = 's1';
const matches = []; let k = 0;
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { k++; matches.push({ id: `m${k}`, session_id: sid, round: ((k - 1) % 5) + 1, home_player_id: `p${i}`, home_player_name: NAMES[i], away_player_id: `p${j}`, away_player_name: NAMES[j], home_score: k % 7, away_score: (k * 3) % 5, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: (k % 3) + 1 }); }
const tables = {
  training_sessions: [{ id: sid, name: 'Testabend', date: '2026-10-23T18:00:00Z', is_completed: true, round_count: 5, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }],
  training_players: NAMES.map((n, i) => ({ id: `t${i}`, session_id: sid, player_id: `p${i}`, player_name: n })),
  matches,
  leagues: [{ id: 'L1', name: 'Liga Test', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }],
  player_stats: NAMES.map((n, i) => ({ id: `s${i}`, league_id: 'L1', player_id: `q${i}`, player_name: n, wins: 5 - i, draws: 1, losses: i, goals_for: 30 - i, goals_against: 10 + i, points: 11 - 2 * i, points_against: 2 * i + 1, goal_difference: 20 - 2 * i, championships: i < 2 ? 1 : 0, vice_championships: 0 })),
  current_session: [],
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
const authSession = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1200, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(authSession)]);
await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
await ctx.route(`https://${REF}.supabase.co/**`, route => {
  const u = new URL(route.request().url()); const n = u.pathname.split('/').pop();
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(u.pathname.includes('/rest/v1/') && n in tables ? tables[n] : []) });
});
const problems = [];
const watch = p => { p.on('pageerror', e => problems.push('pageerror [' + p.url().slice(0,30) + ']: ' + e.message)); p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push('console: ' + m.text()); }); };
const page = await ctx.newPage(); watch(page);
ctx.on('page', watch);
const resp = await page.goto(BASE + '/');
console.log('CSP-Header kommt an:', !!(await resp.headerValue('content-security-policy')));
for (const path of ['/', '/training', '/leagues', '/spieler', '/statistiken', '/history', '/dokumentation', '/schweizer-system', '/admin', '/gibt-es-nicht']) {
  await page.goto(BASE + path); await page.waitForTimeout(700);
  const v = await page.evaluate(() => window.__csp); if (v.length) problems.push(`${path}: ${v.join(' | ')}`);
  console.log('Seite ok:', path, (await page.locator('body').innerText()).length, 'Zeichen');
}
// Exporte aus History
await page.goto(BASE + '/history'); await page.waitForSelector('text=Testabend');
for (const [label, ext] of [['Als PDF', 'pdf'], ['Als XLSX', 'xlsx']]) {
  await page.locator('button:has(svg.lucide-download)').first().click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: label }).click()]);
  console.log('Export', ext, 'ok:', dl.suggestedFilename());
  await page.waitForTimeout(500); await page.keyboard.press('Escape');
}
// Drucken (öffnet Blob-URL im neuen Tab)
await page.locator('button:has(svg.lucide-download)').first().click();
const popupP = ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null);
await page.getByRole('menuitem', { name: /Drucken/ }).click();
const popup = await popupP; console.log('Druck-Tab geöffnet:', !!popup, popup ? popup.url().slice(0, 40) : '');
// Liga-Export
await page.goto(BASE + '/leagues'); await page.waitForSelector('text=Liga Test'); await page.getByText('Liga Test').first().click(); await page.waitForTimeout(500);
await page.locator('button:has(svg.lucide-download)').first().click();
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: 'Als PDF' }).click()]);
console.log('Liga-PDF ok:', dl2.suggestedFilename());
const v = await page.evaluate(() => window.__csp); if (v.length) problems.push('nach Exporten: ' + v.join(' | '));
// Externe Anfrage muss blockiert werden (Gegenprobe)
const blocked = await page.evaluate(() => fetch('https://example.com/').then(() => 'NICHT blockiert', () => 'blockiert'));
const inl = await page.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.textContent = 'window.__x=1'; document.head.appendChild(s); setTimeout(() => r(String(window.__x)), 100); }));
console.log('Gegenprobe fetch example.com:', blocked, '| Inline-Script:', inl === 'undefined' ? 'blockiert' : 'NICHT blockiert');
console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'keine CSP-Verstöße / Seitenfehler');
await browser.close(); server.close();
