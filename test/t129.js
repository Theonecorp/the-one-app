/* v0.8.164 시험 — 🖼 Notes Display (직원 앱의 Notes Display 와 같은 흐름)
 *   ① 인보이스 담당: 주문 창 🖼 Notes Display → 가게가 채워진 새 요청 → 상품 BASE - 2 TIER (LONG) ×2 · LD STACKABLE ×4 → 저장
 *      → displays: 상품마다 무게 · 크기 · 박스 6 · 대기 · 주문 연결 / 창고에 🔔 (앱 안 메시지 + 팝업만)
 *   ② 창고 매니저: 대기 숫자(박스) · 두 칸(준비 대기 | 완료 24시간 · 취소됨) · [준비 시작] → 상품 ☑ 모두 해야 [완료] → UPS 창에 박스 6개(30 lb ×2 · 15 lb ×4)
 *      → 트래킹 → 출고됨 · 완료 칸 · 주문 문서는 안 생김 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8883', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async (job, seed, w) => {
    const pg = await br.newPage({ viewport: { width: w || 430, height: 1000 } }); pg.on('pageerror', e => errs.push(job + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', 's.users.forEach(u => { if (u.email === "acct@theonefl.com") u.job = "' + o.job + '"; });' + (o.seed || '')); }, { job, seed });
    await pg.goto('http://127.0.0.1:8883/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg;
  };
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); };
  /* ① 인보이스 담당 — 주문 창에서 */
  let pg = await mk('invoice', 's.orders[0].req = { WALL: 1 };');
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDisp', { timeout: 8000 }).catch(() => errs.push('order screen should have 🖼 Notes Display'));
  if (await pg.$('#mDisp')) {
    await pg.click('#mDisp'); await pg.waitForSelector('#dvSave', { timeout: 4000 });
    const store = await pg.inputValue('#dvStore'); log('prefilled store:', store); if (!/3001 BEAUTY EXCHANGE/.test(store)) errs.push('store should be prefilled from the order');
    const opts = await pg.$$eval('[data-dvi="0"] option', L => L.map(o => o.value).filter(Boolean)); log('items:', opts.join(' | '));
    if (!opts.includes('BASE - 2 TIER (LONG)') || !opts.includes('LD STACKABLE')) errs.push('default display items should be offered');
    await pg.selectOption('[data-dvi="0"]', 'BASE - 2 TIER (LONG)'); await pg.fill('[data-dvq="0"]', '2');
    await pg.click('#dvAdd'); await pg.waitForSelector('[data-dvi="1"]'); await pg.selectOption('[data-dvi="1"]', 'LD STACKABLE'); await pg.fill('[data-dvq="1"]', '4');
    await pg.fill('#dvNote', '주문과 같이'); await pg.click('#dvSave'); await pg.waitForTimeout(900);
    const D = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.displays || {})); log('saved:', JSON.stringify(D.map(d => ({ st: d.st, qty: d.qty, due: d.due, items: d.items.map(x => x.n + '×' + x.q + ' ' + x.w + 'lb ' + x.l + 'x' + x.wd + 'x' + x.h), orderNo: d.orderNo }))));
    const d0 = D[0] || {}; const it = (d0.items || []).find(x => x.n === 'BASE - 2 TIER (LONG)') || {};
    if (D.length !== 1 || d0.st !== 'open' || d0.qty !== 6 || d0.orderId !== 'O261014-AAAA' || it.w !== 30 || it.h !== 26 || d0.due !== day(0)) errs.push('one waiting request with 6 boxes, weights/sizes copied, linked to the order, due today by default');
    const wh = await pg.evaluate(() => ({ m: Object.values(window.__MOCK_STORE__.msgs || {}).filter(m => m.to === 'g:wh').length, q: Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.toGroup === 'g:wh' && n.pushOnly).length }));
    if (wh.m !== 1 || wh.q !== 1) errs.push('warehouse should get one in-app message and one pop-up-only notification');
    await pg.waitForTimeout(400); if ((await pg.evaluate(() => (document.getElementById('mDispN') || {}).textContent || '')) !== '(1)') errs.push('order button should show (1)');
  }
  await pg.close();
  /* ② 창고 매니저 — 넓은 화면 */
  const seed = 's.displays = [' +
    '{ id: "DS1", acct: "1111", store: "ALI B/S # 1", sm: "BRANDON", items: [{ n: "BASE - 2 TIER (LONG)", q: 2, w: 30, l: 15, wd: 15, h: 26 }, { n: "LD STACKABLE", q: 4, w: 15, l: 22, wd: 15, h: 15 }], qty: 6, due: "' + day(-1) + '", st: "open", createdBy: "x", createdByName: "Lindsey Lee", createdAt: "2026-11-04T10:00:00Z" },' +
    '{ id: "DS2", acct: "3001", store: "BEAUTY EXCHANGE ORLANDO", sm: "ALEX", items: [{ n: "BASE - 3 TIER (SHORT)", q: 1, w: 19, l: 15, wd: 15, h: 13 }], qty: 1, due: "' + day(2) + '", st: "open", createdBy: "x", createdAt: "2026-11-04T11:00:00Z" },' +
    '{ id: "DS3", acct: "2478", store: "JIM DANDY MART", items: [{ n: "LD STACKABLE", q: 1, w: 15 }], qty: 1, due: "' + day(0) + '", st: "x", cancelAt: new Date().toISOString(), createdBy: "x", createdAt: "2026-11-04T12:00:00Z" }];';
  pg = await mk('whmgr', seed, 1200);
  await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('[data-dv]', { timeout: 6000 });
  const kpi = (await pg.textContent('.dvkpi')).replace(/\s+/g, ' '); log('kpi:', kpi); if (!/대기[^0-9]*2[^0-9]*7/.test(kpi)) errs.push('waiting card should read 2 requests · 7 boxes: ' + kpi);
  const cols = await pg.$$eval('.dvcols > .card', C => C.map(c => Array.from(c.querySelectorAll('[data-dv]')).map(x => x.dataset.dv).join(','))); log('columns:', JSON.stringify(cols));
  if (cols[0] !== 'DS1,DS2' || cols[1] !== 'DS3') errs.push('waiting column DS1,DS2 by date · done column has the cancelled DS3');
  if (!/취소됨|Cancelled/.test(await pg.textContent('[data-dv="DS3"]'))) errs.push('cancelled request should be tagged 취소됨');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'notes_display.png'), fullPage: true });
  await pg.click('[data-dvgo="DS1"]'); await pg.waitForTimeout(700);
  let d1 = await pg.evaluate(() => window.__MOCK_STORE__.displays.DS1); if (d1.st !== 'prep') errs.push('준비 시작 → prep, got ' + d1.st);
  if (!(await pg.$eval('[data-dvdone="DS1"]', b => b.disabled))) errs.push('완료 should wait until every item is ticked');
  await pg.click('label.ckw:has([data-dvok="DS1|0"])'); await pg.waitForTimeout(600); await pg.click('label.ckw:has([data-dvok="DS1|1"])'); await pg.waitForTimeout(600);
  d1 = await pg.evaluate(() => window.__MOCK_STORE__.displays.DS1); log('ticked:', d1.items.map(x => x.ok).join(','));
  if (await pg.$eval('[data-dvdone="DS1"]', b => b.disabled)) errs.push('완료 should be enabled once all items are ticked');
  await pg.click('[data-dvdone="DS1"]'); await pg.waitForSelector('#shOk', { timeout: 6000 }).catch(() => errs.push('완료 should open the UPS window'));
  d1 = await pg.evaluate(() => window.__MOCK_STORE__.displays.DS1); if (d1.st !== 'done' || d1.boxes !== 6) errs.push('완료 → done with 6 boxes, got ' + d1.st + '/' + d1.boxes);
  if (await pg.$('#shOk')) {
    const W = await pg.$$eval('#mbox [data-f]', L => L.filter(i => /^boxes\.\d+\.w$/.test(i.dataset.f)).map(i => i.value)); log('UPS box weights:', W.join(','));
    if (W.join(',') !== '30,30,15,15,15,15') errs.push('UPS window should have one box per unit with the item weights');
    if (await pg.$('#shTrack')) await pg.fill('#shTrack', '1Z999AA10123456784');
    if (await pg.$('#shVia')) await pg.selectOption('#shVia', 'UPS').catch(() => {});
    await pg.click('#shOk'); await pg.waitForTimeout(1000);
    d1 = await pg.evaluate(() => window.__MOCK_STORE__.displays.DS1); log('after ship:', d1.st, d1.track);
    if (d1.st !== 'shipped' || !/1Z999AA10123456784/.test(d1.track || '')) errs.push('should be shipped with the tracking number');
    if (await pg.evaluate(() => !!(window.__MOCK_STORE__.orders || {}).DS1)) errs.push('must not create an order document');
    await pg.waitForTimeout(500); const c2 = await pg.$$eval('.dvcols > .card', C => C.map(c => Array.from(c.querySelectorAll('[data-dv]')).map(x => x.dataset.dv).join(','))); log('columns after:', JSON.stringify(c2));
    if (!/DS1/.test(c2[1] || '')) errs.push('shipped request should show in the done (24h) column');
  }
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
