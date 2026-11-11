/* v0.8.186 시험 — 📝 주문 메모 화면 (2026-11-11 관리자: "메모가 제일 위에 · 디스플레이 선택을 밑으로 · 한 줄이 너무 길어 두 줄로 · Shipping With Jewelry · No Cross")
 *   ① 메모 탭: 📝 메모 카드가 맨 위, 🎁 인서트 · 디스플레이 카드가 그 아래, 주문 요약이 마지막
 *   ② 폰(390px): 인서트 · 디스플레이가 한 줄에 두 개씩 (− 수 ＋ 가 칸 안) · "어떤 것" 칸이 열린 줄은 한 줄 전체
 *   ③ 메모 빠른 단추에 Shipping With Jewelry · No Cross — 누르면 메모 칸에 그대로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8860', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' }; });
  await pg.goto('http://127.0.0.1:8860/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(300); await pg.tap('#eStoreHits [data-ac="1111"]'); await pg.waitForTimeout(900);
  if (await pg.$('#modal.on')) { await pg.tap('#modal .mclose'); await pg.waitForTimeout(300); }
  await pg.tap('[data-ev="memo"]'); await pg.waitForSelector('#eMemo');
  /* ① */
  const order = await pg.$$eval('#eBody > .card h2', H => H.map(h => h.textContent.replace(/\s+/g, ' ').trim().slice(0, 14)));
  log('① cards:', order.join(' | '));
  if (!/메모/.test(order[0] || '') || !/인서트/.test(order[1] || '') || !/주문 요약/.test(order[2] || '')) errs.push('① memo first, then insert · display, then summary');
  /* ② */
  const g = await pg.evaluate(() => { const rows = Array.from(document.querySelectorAll('.reqs .reqrow')); const r0 = rows[0].getBoundingClientRect(), r1 = rows[1].getBoundingClientRect(), box = document.querySelector('.reqs').getBoundingClientRect(); const over = rows.filter(r => { const b = r.querySelector('.rqs button:last-child').getBoundingClientRect(); return b.right > r.getBoundingClientRect().right + 1; }).length; return { n: rows.length, sameLine: Math.abs(r0.top - r1.top) < 2, w0: Math.round(r0.width), box: Math.round(box.width), over, page: document.documentElement.scrollWidth, vw: innerWidth }; });
  log('② grid:', JSON.stringify(g));
  if (!g.sameLine || g.w0 > g.box / 2 + 2 || g.over || g.page > g.vw) errs.push('② two per line on a phone, ＋ inside each box, no sideways scroll');
  await pg.tap('[data-rqp="C13"]'); await pg.waitForTimeout(300);
  const wide = await pg.evaluate(() => { const r = document.querySelector('[data-rqn="C13"]'); const row = r && r.closest('.reqrow'); return row ? Math.round(row.getBoundingClientRect().width) + '/' + Math.round(document.querySelector('.reqs').getBoundingClientRect().width) : ''; });
  log('② C13 with note:', wide); const [w, b] = wide.split('/').map(Number); if (!w || w < b - 2) errs.push('② a row with its "which one" box spans the whole line');
  /* ③ */
  const chips = await pg.$$eval('[data-mq]', B => B.map(b => b.dataset.mq)); log('③ chips:', chips.join(' | '));
  if (!chips.includes('Shipping With Jewelry') || !chips.includes('No Cross')) errs.push('③ memo presets include Shipping With Jewelry and No Cross');
  await pg.tap('[data-mq="Shipping With Jewelry"]'); await pg.waitForTimeout(200); await pg.tap('[data-mq="No Cross"]'); await pg.waitForTimeout(200);
  const memo = await pg.inputValue('#eMemo'); log('③ memo:', JSON.stringify(memo));
  if (!/Shipping With Jewelry/.test(memo) || !/No Cross/.test(memo)) errs.push('③ tapping them writes the text into the memo');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
