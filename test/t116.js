/* v0.8.152 시험 — ‹ 뒤로 = 바로 전 화면 (홈 → 새 주문 → 뒤로 = 홈 · 거래처 → 가게 → 뒤로 = 거래처 · 분류 안에서는 한 단계 위)
 *   주문 목록 보기: 설명이 안 잘리고 전체 · 📦 재고 · 🕘 지난 주문이 아이템 밑에 · 가격 · 수량 칸은 좁게 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8871', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 420, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; try { localStorage.removeItem('theone.order.wip.brandon@x.com'); localStorage.setItem('theone.order.view', 'list'); } catch (x) {}
    /* 이 가게에 AHG100 이 지난달에 나간 인보이스 — 🕘 지난 주문이 줄에 보여야 함 */
    window.__AFTER_SEED__ = s => { const d = new Date(Date.now() - 20 * 86400000).toISOString().substring(0, 10); s.invoices = (s.invoices || []).concat([{ id: 'A-099001', no: 'A-099001', t: 'A', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', d, ym: d.substring(0, 7), lines: [{ c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 12, p: 2.5, lp: 2.5 }], sub: 30, disc: 0, total: 30, bal: 0, terms: 'N30', st: 'open', createdAt: d + 'T10:00:00Z' }]); }; });
  await pg.goto('http://127.0.0.1:8871/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(600);
  const hash = () => pg.evaluate(() => location.hash);
  /* ---------- 뒤로 = 전 화면 ---------- */
  await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('.dhead', { timeout: 8000 }); await pg.waitForTimeout(300);
  await pg.click('.qgrid [data-hg="order/new"]'); await pg.waitForSelector('#eStoreQ'); await pg.waitForTimeout(300);
  if (!(await pg.$eval('#hBack', b => b.classList.contains('show')))) errs.push('back button should show in the editor');
  await pg.click('#hBack'); await pg.waitForTimeout(700); log('home → new order → back:', await hash()); if (!/#\/home/.test(await hash())) errs.push('back from the editor should return to home, not the sales tab');
  await pg.click('#nav button[data-go="stores"]'); await pg.waitForTimeout(800); await pg.evaluate(() => { location.hash = '#/stores/1111'; }); await pg.waitForTimeout(800);
  await pg.click('#hBack'); await pg.waitForTimeout(700); log('stores → store → back:', await hash()); if (!/#\/stores$/.test(await hash())) errs.push('back from a store should return to the customer list');
  /* 분류 안에서는 한 단계 위 (화면 안의 단계가 먼저) */
  await pg.evaluate(() => { location.hash = '#/cat'; }); await pg.waitForTimeout(800); const k = await pg.$('[data-cpk]'); if (k) { await k.click(); await pg.waitForTimeout(400); await pg.click('#hBack'); await pg.waitForTimeout(500); log('cat drill → back:', await hash(), 'crumbs:', await pg.$$eval('.crumbs button', b => b.length)); if (!/#\/cat/.test(await hash())) errs.push('back inside the catalog should pop the category, not leave the page'); }
  /* ---------- 주문 목록 보기 줄 ---------- */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(1200); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(150); }
  await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(1200);
  const th = await pg.$$eval('#eRes table.olist th', t => t.map(x => x.textContent.trim())); log('heads:', th); if (th.length !== 4) errs.push('list should have photo · item · price · qty columns only');
  const row = await pg.$eval('#eRes tr[data-frow="AHG100"]', tr => { const d = tr.querySelector('.desc'), cs = getComputedStyle(d); return { desc: d.textContent, clamp: cs.webkitLineClamp, overflow: cs.overflow, clipped: d.scrollHeight > d.clientHeight + 2, meta: (tr.querySelector('small.meta') || {}).textContent, hist: (tr.querySelector('small.hist') || {}).textContent, pcW: Math.round(tr.querySelector('td.pc').getBoundingClientRect().width), qcW: Math.round(tr.querySelector('td.qc').getBoundingClientRect().width), ctW: Math.round(tr.querySelector('td.ct').getBoundingClientRect().width) }; });
  log('row:', row);
  if (row.clipped || (row.clamp && row.clamp !== 'none')) errs.push('description must not be clipped'); if (!/📦/.test(row.meta || '')) errs.push('stock should sit under the description'); if (!/🕘/.test(row.hist || '') || !/12/.test(row.hist || '')) errs.push('last-order history should show under the item: ' + row.hist);
  if (row.pcW > 64 || row.qcW > 120) errs.push('price/qty columns should be narrow: ' + row.pcW + '/' + row.qcW); if (row.ctW < 170) errs.push('item column should be the widest: ' + row.ctW);
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'order_list_full.png') });
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
