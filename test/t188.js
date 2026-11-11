/* v0.8.185 시험 — 🛒 주문 ☰ 목록이 폰 화면을 넘지 않음 (2026-11-11 관리자: "리스트에서 오른쪽이 짤렸어" — 세트 구성품 줄 KEY-BCH01×3 · … 외 12종 이 표를 넓힘)
 *   ① 폰(390px): 세트(🧩 15종)가 있는 목록에서도 표 너비 ≤ 화면 · 모든 줄의 수량 칸(− 0 +)이 화면 안 · 페이지 가로 스크롤 없음
 *   ② 구성품 줄은 한 줄로 … 처리 (줄을 눌러 담기 · 수량 + 는 그대로 동작)
 *   ③ 컴퓨터(1280px)에서도 표가 칸 안에 맞음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8857', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (w, h, mobile) => {
    const pg = await (await br.newContext(Object.assign({ viewport: { width: w, height: h } }, mobile ? { isMobile: true, hasTouch: true } : {}))).newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; try { localStorage.setItem('theone.order.view', 'list'); } catch (e) {}
      window.__AFTER_SEED__ = s => { const sets = s.catalog.find(c => c.id === 'sets'); const J = JSON.parse(sets.j); J['KEY-BCHSET'] = { n: 'KEY CHAIN -BAG CHARM SET (3PC/45PC)', k: Array.from({ length: 15 }, (_, i) => ['KEY-BCH' + String(i + 1).padStart(2, '0'), 3]), p: 180 }; sets.j = JSON.stringify(J); }; });
    await pg.goto('http://127.0.0.1:8857/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(300); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(1000);
    if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(300); }
    await pg.fill('#eQ1', 'SET'); await pg.waitForTimeout(700);
    if (!(await pg.$$('#eRes tr.irow')).length) { await pg.click('#eVM'); await pg.waitForTimeout(600); }
    return pg;
  };
  const measure = pg => pg.evaluate(() => { const t = document.querySelector('#eRes table.olist'), box = t && t.parentElement; return { vw: innerWidth, page: document.documentElement.scrollWidth, table: t ? Math.round(t.getBoundingClientRect().width) : 0, box: box ? Math.round(box.clientWidth) : 0, qtyR: Array.from(document.querySelectorAll('#eRes tr.irow td.qc')).map(td => Math.round(td.getBoundingClientRect().right)), kit: (document.querySelector('#eRes tr[data-row="KEY-BCHSET"] small.sub0') || {}).textContent || '', priceCut: Array.from(document.querySelectorAll('#eRes tr.irow td.pc')).filter(td => td.scrollWidth > td.clientWidth + 1).length }; });
  /* ① ② 폰 */
  const ph = await open(390, 844, true); const m = await measure(ph);
  log('① phone:', JSON.stringify(m));
  if (!m.table || m.table > m.box || m.page > m.vw || m.qtyR.some(r => r > m.vw) || !m.qtyR.length) errs.push('① phone: table fits the screen and every qty box is on screen (table ' + m.table + ' / box ' + m.box + ', page ' + m.page + ', qty right ' + m.qtyR.join(',') + ')');
  if (!/KEY-BCH01×3/.test(m.kit)) errs.push('② the set row still shows its components');
  if (m.priceCut) errs.push('① prices ($180.00) are not cut off in the narrow price column');
  await ph.click('#eRes tr[data-row="KEY-BCHSET"] [data-qp], #eRes tr[data-row="KEY-BCHSET"] td.qc button:last-child'); await ph.waitForTimeout(400);
  const q = await ph.evaluate(() => { const i = document.querySelector('#eRes tr[data-row="KEY-BCHSET"] td.qc input'); return i ? i.value : ''; });
  log('② qty after +:', q); if (q !== '1') errs.push('② + on the set row still adds it (got ' + q + ')');
  /* ③ 컴퓨터 */
  const pc = await open(1280, 900, false); const m2 = await measure(pc);
  log('③ desktop:', JSON.stringify({ table: m2.table, box: m2.box, page: m2.page, vw: m2.vw }));
  if (!m2.table || m2.table > m2.box || m2.page > m2.vw) errs.push('③ desktop: table fits its box');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
