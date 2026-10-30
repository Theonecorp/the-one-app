/* v0.8.122 시험 — ✕ 세일즈맨 주문 취소: 접수(작업 전) 주문은 사유 → 한 번 더 확인 → st x · 사무실 알림 / 작업 중 주문은 "취소 요청"(cfIssue) → 담당자 화면 빨간 띠 / 폰에만 있는 주문은 지우기 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8843', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  const seed = "s.orders.forEach(o => { o.sm = 'BRANDON'; }); s.orderLines.forEach(l => { l.sm = 'BRANDON'; }); const o = s.orders[0]; s.orders.push(Object.assign({}, o, { id: 'O261020-PICK', no: 'O261020-PICK', st: 'pick', store: 'PICKING STORE', picker: 'pick1@x.com' })); s.orderLines.push(Object.assign({}, s.orderLines[0], { id: 'O261020-PICK' }));";
  const mk = async (email) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8843/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  let pg = await mk('brandon@x.com');
  /* 접수 주문 취소 */
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#oCx', { timeout: 8000 }).catch(() => errs.push('cancel button on sent order missing'));
  await pg.click('#oCx'); await pg.waitForSelector('#cxGo'); if (!(await pg.evaluate(() => document.getElementById('cxGo').disabled))) errs.push('cancel needs a reason first');
  await pg.click('[data-cxw="중복 주문"]'); await pg.click('#cxGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  let o = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261014-AAAA']); log('cancelled:', o.st, o.cancelWhy, o.cancelBy, o.cancelSelf);
  if (o.st !== 'x' || o.cancelWhy !== '중복 주문' || o.cancelBy !== 'brandon@x.com' || !o.cancelSelf) errs.push('salesman should cancel the sent order with reason');
  let nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'cancel')); log('notify:', nq.map(n => [n.toStaff, n.text.slice(0, 50)]));
  if (nq.length !== 1 || !nq[0].toStaff) errs.push('office should be notified of the cancel');
  if (!/취소된 주문/.test(await pg.textContent('#page'))) errs.push('order should show as cancelled'); if (await pg.$('#oCx')) errs.push('no cancel button on a cancelled order');
  /* 작업 중 주문 — 취소 요청 */
  await pg.evaluate(() => { location.hash = '#/order/O261020-PICK'; }); await pg.waitForSelector('#oCxReq', { timeout: 8000 }).catch(() => errs.push('cancel request button on picking order missing'));
  if (await pg.$('#oCx')) errs.push('picking order should not offer direct cancel');
  await pg.click('#oCxReq'); await pg.waitForSelector('#crWhy'); await pg.click('#crGo'); await pg.waitForTimeout(300); if (await pg.evaluate(() => window.__MOCK_STORE__.orders['O261020-PICK'].cfIssueOpen)) errs.push('request needs a reason');
  await pg.fill('#crWhy', '가게가 주문 취소'); await pg.waitForTimeout(1000); await pg.click('#crGo');   // 같은 버튼 연타 방지(앱) 를 피하려고 1초 뒤 await pg.waitForTimeout(1200);
  log('toast/modal:', await pg.evaluate(() => (document.querySelector('.toast') || {}).textContent + ' | ' + document.getElementById('modal').className + ' | ' + (document.getElementById('crGo') ? 'crGo present' : 'no crGo')));
  o = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261020-PICK']); log('request:', o.st, o.cfIssue, o.cfIssueOpen);
  if (o.st !== 'pick' || !o.cfIssueOpen || !/취소 요청: 가게가 주문 취소/.test(o.cfIssue)) errs.push('cancel request should flag the order, not cancel it');
  nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'cancelReq')); if (nq.length !== 1 || !nq[0].toStaff) errs.push('office should get the cancel request');
  if (!/사무실에 보낸 요청 처리 중/.test(await pg.textContent('#page'))) errs.push('salesman should see request pending');
  /* 폰에만 있는 주문 — 지우기 */
  await pg.evaluate(() => { localStorage.setItem('theone.outbox.v1', JSON.stringify({ 'O261030-LOCAL': { o: { id: 'O261030-LOCAL', no: 'O261030-LOCAL', sm: 'BRANDON', store: 'LOCAL SHOP', acct: '1271', st: 'sent', d: '2026-10-30', amt: 12, n: 1, qty: 1 }, lines: [{ c: 'AHG100', d: 'x', q: 1, p: 12 }] } })); location.hash = '#/order/O261030-LOCAL'; });
  await pg.waitForSelector('#oCxLocal', { timeout: 8000 }).catch(() => errs.push('local order delete button missing'));
  if (await pg.$('#oCxLocal')) { await pg.click('#oCxLocal'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(800); const left = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('theone.outbox.v1') || '{}'))); log('outbox after:', left); if (left.includes('O261030-LOCAL')) errs.push('local order should be removed from the phone'); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
