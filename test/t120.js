/* v0.8.156 시험 — 가게 · 아이템 창이 느리던 원인
 *   🏷 아이템 창: 바코드 스크립트(CDN)가 안 와도 창은 바로 열림 (스크립트는 뒤에 와서 바코드만 채움)
 *   🏬 가게 창: 인보이스 기록은 최근 12달만 받고 전체 장수는 개수로 — 옛 인보이스가 많은 가게도 "전체 N장" 과 최근 목록이 나옴 · AR 문서는 가게를 바꿔도 다시 읽지 않음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8875', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = s => { const L = []; const d0 = new Date(); for (let i = 0; i < 30; i++) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 10); const ds = d.toISOString().substring(0, 10); L.push({ id: 'A-09' + String(1000 + i), no: 'A-09' + String(1000 + i), t: 'A', d: ds, ym: ds.substring(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 100, bal: 0, st: 'paid', src: 'legacy', lines: [] }); } s.invoices = (s.invoices || []).concat(L); };
  const pg = await br.newPage({ viewport: { width: 420, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  /* 바코드 스크립트는 영영 안 옴 (느린 LTE 흉내) */
  await pg.route('**/jsbarcode/**', () => new Promise(() => {}));
  await pg.addInitScript(f => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f); }, '(' + seed.toString() + ')(s)');
  await pg.goto('http://127.0.0.1:8875/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500);
  /* ---------- 아이템 창 ---------- */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itList [data-it]', { timeout: 8000 }); await pg.waitForTimeout(400);
  const t0 = Date.now(); await pg.click('#itList [data-it="AHG100"] .ct'); await pg.waitForSelector('#modal.on #isBar', { timeout: 2500 }).catch(() => errs.push('item sheet should open even when the barcode script never arrives'));
  log('item sheet opened in', Date.now() - t0, 'ms'); const bar = await pg.$eval('#isBar', e => e.textContent).catch(() => ''); log('bar box:', bar.slice(0, 40)); if (!/바코드 준비 중|Loading barcode/.test(bar)) errs.push('barcode box should say it is loading');
  await pg.click('#modal .mclose'); await pg.waitForTimeout(150);
  /* ---------- 가게 창 ---------- */
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForSelector('[data-st="1111"]', { timeout: 8000 }); await pg.waitForTimeout(300);
  const t1 = Date.now(); await pg.click('[data-st="1111"]'); await pg.waitForSelector('#modal.on .seg', { timeout: 8000 }); await pg.waitForTimeout(300); log('store sheet in', Date.now() - t1, 'ms');
  const seg = (await pg.textContent('#modal .seg')).replace(/\s+/g, ' '); log('seg:', seg.slice(0, 120));
  if (!/인보이스[^0-9]*3[0-9]/.test(seg)) errs.push('invoice tab count should be the full count (30+) from the count query: ' + seg.slice(0, 80));
  const tab = await pg.$('#modal [data-ss="invh"]');
  if (tab) { await tab.click(); await pg.waitForTimeout(400); const body = (await pg.textContent('#modal')).replace(/\s+/g, ' '); if (!/최근 12달|last 12 months/.test(body)) errs.push('invoice history should say it shows the last 12 months'); const n = (body.match(/A-09\d{4}/g) || []).length; log('rows shown:', n); if (n < 10 || n > 13) errs.push('should list the last 12 months (got ' + n + ')'); }
  else log('(no tab selector matched — skipping tab check)');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'store_fast.png') });
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
