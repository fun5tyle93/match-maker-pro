import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [BASE, OUT] = process.argv.slice(2); const REF = 'swuwjjmspplzfguapvty';
const N = ['Klaudio Lange (Kazmierczak)', 'Benjamin Buza (Reule)', 'Susanna Grellmann', 'Michael Bräuning', 'Max Daub'];
const rounds = [[[0,1],[2,3]],[[0,2],[1,4]],[[0,3],[2,4]],[[0,4],[1,3]],[[1,2],[3,4]]];
const sid = 'ev000000-0000-4000-8000-000000000009'; let k = 0;
const matches = rounds.flatMap((pairs, r) => pairs.map((p, t) => { k++; const done = r < 3; return { id: `m${k}`, session_id: sid, round: r + 1, home_player_id: `p${p[0]}`, home_player_name: N[p[0]], away_player_id: `p${p[1]}`, away_player_name: N[p[1]], home_score: done ? (k * 3) % 10 : null, away_score: done ? (k + 7) % 11 : null, is_completed: done, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false, table_number: t + 1 }; }));
const T = { current_session: [{ id: 1, session_id: sid }], training_sessions: [{ id: sid, name: null, date: '2026-11-06T18:00:00Z', is_completed: false, round_count: 5, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }], training_players: N.map((n, i) => ({ id: `tp${i}`, session_id: sid, player_id: `p${i}`, player_name: n })), matches, leagues: [], player_stats: [] };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'); const exp = Math.floor(Date.now() / 1000) + 604800;
const auth = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
let fails = 0; const check = (l, ok, x = '') => { console.log(ok ? 'PASS' : 'FAIL', l, x); if (!ok) fails++; };
async function open(vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(auth)]);
  await ctx.route(`https://${REF}.supabase.co/**`, r => { const u = new URL(r.request().url()); const n = u.pathname.split('/').pop(); if (r.request().method() !== 'GET') return r.fulfill({ status: 204 }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(T[n] ?? []) }); });
  const page = await ctx.newPage(); await page.goto(BASE + '/training'); await page.getByText('Pause', { exact: true }).first().waitFor({ timeout: 10000 }); return { ctx, page };
}
// 1. Namensbreite auf dem Handy
for (const w of [320, 360, 390, 768, 1100]) {
  const { ctx, page } = await open({ width: w, height: 1000 });
  for (const r of [1, 2]) { const hdr = page.getByText(`Runde ${r}`, { exact: true }).first(); const isOpen = await page.getByText('Heim').first().isVisible().catch(() => false); }
  await page.getByText('Runde 1', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const words = (p) => { const r = document.createElement('span'); const cs = getComputedStyle(p); r.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font}`; document.body.appendChild(r); const max = Math.max(...p.textContent.split(/\s+/).map(w => { r.textContent = w; return r.getBoundingClientRect().width; })); r.remove(); return max; };
    const out = { overflowPage: document.documentElement.scrollWidth > document.documentElement.clientWidth, bad: [], names: 0 };
    document.querySelectorAll('div.bg-card.rounded-lg p.font-semibold').forEach(p => {
      const inp = p.closest('div.bg-card').querySelectorAll('input'); inp.forEach(i => { const cs = getComputedStyle(i); const content = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); const m = document.createElement('span'); m.style.cssText = `position:absolute;visibility:hidden;font:${cs.font}`; m.textContent = '10'; document.body.appendChild(m); const need = m.getBoundingClientRect().width; m.remove(); if (content < need + 2) out.bad.push(`Feld zu schmal: ${content.toFixed(0)}px für zwei Ziffern (${need.toFixed(0)}px)`); });
      out.names++; const card = p.closest('div.bg-card'); const cb = card.getBoundingClientRect(); const pb = p.getBoundingClientRect();
      const clipped = p.scrollWidth > p.clientWidth + 1 || (window.innerWidth >= 360 && words(p) > p.clientWidth + 0.5); const outside = pb.left < cb.left - 0.5 || pb.right > cb.right + 0.5;
      if (clipped || outside) out.bad.push(`${p.textContent} (${Math.round(pb.left)}..${Math.round(pb.right)} in ${Math.round(cb.left)}..${Math.round(cb.right)})`);
    });
    return out;
  });
  check(`Handybreite ${w}px: ${res.names} Namen vollständig innerhalb der Karte, kein Seiten-Scrollen`, res.names >= 4 && res.bad.length === 0 && !res.overflowPage, JSON.stringify(res.bad));
  if (w === 320 || w === 390) await page.screenshot({ path: `${OUT}/pause-names-${w}.png`, fullPage: false });
  await ctx.close();
}
// 2. Exporte
const { ctx, page } = await open({ width: 1100, height: 900 });
await page.locator('button:has(svg.lucide-download)').first().click();
for (const [label, ext] of [['Als PDF', 'pdf'], ['Als XLSX', 'xlsx']]) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: label }).click()]);
  await dl.saveAs(`${OUT}/pause-export.${ext}`); console.log('gespeichert', ext);
  await page.waitForTimeout(800); if (ext === 'pdf') await page.locator('button:has(svg.lucide-download)').first().click();
}
await ctx.close(); await browser.close(); process.exit(fails ? 1 : 0);
