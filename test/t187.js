/* v0.8.184 시험 — ⏳ 느리거나 멈춘 연결에서도 화면이 열림 · 📥 입고 손입력 칸 (2026-11-11 관리자: "입고 예정 · 세일즈맨 주문이 1분이 지나도 안 열려" · "입고 칸이 안 보여")
 *   ① 재고 → 입고: 폰 너비에서 코드 · 수량 칸이 제대로 보이고(＋ 단추가 칸을 밀어내지 않음) 입력 가능
 *   ② 아이템 목록: 폰에 한 번 받아 둔 목록이 있으면 서버가 멈춰 있어도 바로 돌려줌 (새 버전 확인은 뒤에서)
 *   ③ 읽는 중이 15초 넘으면 그 자리에 "🔄 다시 시도" 단추 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8854', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; });
  await pg.goto('http://127.0.0.1:8854/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  /* ① */
  await pg.evaluate(() => { location.hash = '#/stock/recv'; }); await pg.waitForSelector('#rvC', { timeout: 8000 });
  const W = await pg.evaluate(() => ['rvC', 'rvQ', 'rvAdd'].map(id => Math.round(document.getElementById(id).getBoundingClientRect().width)));
  log('① widths code · qty · ＋:', W.join(' · '));
  if (!(W[0] >= 120 && W[1] >= 60 && W[2] < 80 && W[0] > W[1])) errs.push('① code and qty boxes are wide enough on a phone, ＋ stays small (' + W.join(',') + ')');
  await pg.fill('#rvC', 'AHG100'); if ((await pg.inputValue('#rvC')) !== 'AHG100') errs.push('① code box takes input');
  /* ② 앱이 목록을 받아 폰(IndexedDB)에 둔 뒤, 서버가 멈춘 상태에서 다시 부르면 바로 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForTimeout(1500);
  const r2 = await pg.evaluate(async () => {
    for (let i = 0; i < 40; i++) { const ok = await new Promise(res => { const o = indexedDB.open('theone', 1); o.onsuccess = () => { try { const q = o.result.transaction('kv').objectStore('kv').get('catalog.v1'); q.onsuccess = () => res(!!(q.result && q.result.rows && q.result.rows.length)); q.onerror = () => res(false); } catch (e) { res(false); } }; o.onerror = () => res(false); }); if (ok) break; await new Promise(r => setTimeout(r, 250)); }
    const M = await import('/src/catalog.js'); const stuck = { DB: { get: () => new Promise(() => {}), list: () => new Promise(() => {}) }, settings: {} };
    const t0 = Date.now(); const C = await Promise.race([M.loadCatalog(stuck), new Promise(r => setTimeout(() => r(null), 6000))]);
    return { ms: Date.now() - t0, n: C && C.items ? C.items.length : 0 };
  });
  log('② cached catalog with a stuck server:', JSON.stringify(r2));
  if (!r2.n || r2.ms > 5000) errs.push('② items come from the phone right away even when the server never answers');
  /* ③ 서버가 20초 걸리는 화면 */
  const pg3 = await ctx.newPage(); pg3.on('pageerror', e => errs.push(e.message));
  await pg3.goto('http://127.0.0.1:8854/test/demo.html'); await pg3.waitForSelector('#nav button', { state: 'attached' });
  await pg3.evaluate(() => { window.__MOCK_DELAY__ = 25000; location.hash = '#/stock/inb'; });
  const shown = await pg3.waitForSelector('.load .lwRetry button', { timeout: 24000 }).then(() => true).catch(() => false);
  const txt = shown ? await pg3.textContent('.lwRetry') : ''; log('③ retry:', shown, txt.replace(/\s+/g, ' '));
  if (!shown || !/다시 시도/.test(txt)) errs.push('③ a "loading" that lasts over 15s shows 🔄 Try again');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
