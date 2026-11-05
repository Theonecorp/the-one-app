/* v0.8.164 시험 — 🖼 디스플레이 출고
 *   ① 인보이스 담당: 주문 창 🖼 디스플레이 출고 → 가게 · 요청한 디스플레이(o.req)가 채워진 창 → 날짜 · 메모 → 저장 → displays 문서(주문 연결) · 창고에 🔔(앱 안 메시지 + 팝업만)
 *   ② 창고 매니저: 홈 타일 숫자 · 목록(날짜 순 · 지난 날짜 ⚠️) · ✓ 준비 → ready · 🚚 UPS 창(직접 트래킹) → shipped + 트래킹, 주문 문서는 안 생김 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8883', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async (job, seed) => {
    const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(job + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', 's.users.forEach(u => { if (u.email === "acct@theonefl.com") u.job = "' + o.job + '"; });' + (o.seed || '')); }, { job, seed });
    await pg.goto('http://127.0.0.1:8883/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(300); return pg;
  };
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().substring(0, 10); };
  /* ① 인보이스 담당 */
  let pg = await mk('invoice', 's.orders[0].req = { WALL: 1, FLOOR: 2 };');
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDisp', { timeout: 8000 }).catch(() => errs.push('order screen should have 🖼 디스플레이 출고'));
  if (await pg.$('#mDisp')) {
    await pg.click('#mDisp'); await pg.waitForSelector('#dvSave', { timeout: 4000 });
    const pre = await pg.evaluate(() => ({ store: document.getElementById('dvStore').value, wall: document.querySelector('[data-dk="WALL"]').value, floor: document.querySelector('[data-dk="FLOOR"]').value }));
    log('prefilled:', JSON.stringify(pre)); if (!/BEAUTY EXCHANGE/.test(pre.store) || pre.wall !== '1' || pre.floor !== '2') errs.push('form should be prefilled from the order (store, WALL 1, FLOOR 2)');
    await pg.click('#dvSave'); await pg.waitForTimeout(300); const t0 = await pg.evaluate(() => (document.querySelector('#toast.on') || {}).textContent || ''); if (!/날짜|date/i.test(t0)) errs.push('saving without a date should ask for it: ' + t0);
    await pg.waitForTimeout(500);   /* 같은 단추 두 번 누름 막기(0.45초) 다음에 */
    await pg.fill('#dvDue', day(3)); await pg.fill('#dvNote', '2단 월 디스플레이 · 주문과 같이'); await pg.click('#dvSave'); await pg.waitForTimeout(900);
    const D = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.displays || {}));
    log('displays:', JSON.stringify(D.map(d => ({ st: d.st, acct: d.acct, kinds: d.kinds, qty: d.qty, due: d.due, orderNo: d.orderNo }))));
    if (D.length !== 1 || D[0].st !== 'open' || D[0].orderId !== 'O261014-AAAA' || D[0].kinds.WALL !== 1 || D[0].kinds.FLOOR !== 2 || D[0].qty !== 3) errs.push('one open display linked to the order with WALL 1 + FLOOR 2');
    const wh = await pg.evaluate(() => ({ m: Object.values(window.__MOCK_STORE__.msgs || {}).filter(m => m.to === 'g:wh').length, q: Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.toGroup === 'g:wh' && n.pushOnly).length }));
    log('warehouse notice:', JSON.stringify(wh)); if (wh.m !== 1 || wh.q !== 1) errs.push('warehouse should get one in-app message and one pop-up-only notification');
    await pg.waitForTimeout(400); const n = await pg.evaluate(() => (document.getElementById('mDispN') || {}).textContent || ''); if (n !== '(1)') errs.push('order button should show (1), got ' + n);
  }
  await pg.close();
  /* ② 창고 매니저 */
  const seed = 's.displays = [{ id: "DS1", acct: "1111", store: "ALI B/S # 1", sm: "BRANDON", kinds: { WALL: 1 }, qty: 1, due: "' + day(-2) + '", note: "late one", st: "open", createdBy: "x", createdAt: "2026-11-01T10:00:00Z" }, { id: "DS2", acct: "3001", store: "BEAUTY EXCHANGE ORLANDO", sm: "ALEX", kinds: { FLOOR: 2 }, other: "SPINNER", otherN: 1, qty: 3, due: "' + day(5) + '", st: "open", createdBy: "x", createdAt: "2026-11-02T10:00:00Z" }];';
  pg = await mk('whmgr', seed);
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(1500);
  const tile = await pg.evaluate(() => (document.getElementById('ht-displays') || {}).textContent || ''); log('home tile:', tile); if (!/2/.test(tile) || !/지남|late/.test(tile)) errs.push('home tile should show 2 to ship with 1 late');
  await pg.evaluate(() => { location.hash = '#/displays'; }); await pg.waitForSelector('[data-dv]', { timeout: 6000 });
  const order = await pg.$$eval('[data-dv]', L => L.map(x => x.dataset.dv)); const txt = (await pg.textContent('#page')).replace(/\s+/g, ' ');
  log('order:', order.join(','), '|', txt.slice(0, 140)); if (order.join(',') !== 'DS1,DS2') errs.push('list should be by due date (late first)');
  if (!/지남|late/.test(txt)) errs.push('late display should be flagged'); if (!/SPINNER ×1/.test(txt)) errs.push('other display name should show');
  await pg.click('label.ckw:has([data-dvr="DS2"])'); await pg.waitForTimeout(700);   /* 손가락 영역(라벨)을 누름 */
  let st = await pg.evaluate(() => window.__MOCK_STORE__.displays.DS2.st); if (st !== 'ready') errs.push('✓ should mark ready, got ' + st);
  await pg.click('[data-dvu="DS2"]'); await pg.waitForSelector('#shOk', { timeout: 6000 }).catch(() => errs.push('UPS window should open'));
  if (await pg.$('#shOk')) {
    if (await pg.$('#shTrack')) await pg.fill('#shTrack', '1Z999AA10123456784');
    if (await pg.$('#shVia')) await pg.selectOption('#shVia', 'UPS').catch(() => {});
    await pg.click('#shOk'); await pg.waitForTimeout(1000);
    const d2 = await pg.evaluate(() => window.__MOCK_STORE__.displays.DS2); log('after ship:', d2.st, d2.track, d2.shipVia);
    if (d2.st !== 'shipped' || !/1Z999AA10123456784/.test(d2.track || '')) errs.push('display should be shipped with the tracking number');
    const junk = await pg.evaluate(() => !!(window.__MOCK_STORE__.orders || {}).DS2); if (junk) errs.push('shipping a display must not create an order document');
    const sh = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.shipments || {}).map(x => x.orderId + '|' + x.dispId)); log('shipments:', sh); if (sh.length && sh.some(x => !/^\|DS2$/.test(x))) errs.push('shipment record should carry dispId and no orderId');
  }
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
