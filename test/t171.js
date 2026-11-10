/* v0.8.178 시험 — 🚗 딜리버리: UPS 라벨 없이 세일즈맨 · 다른 직원이 가져가거나 손님이 픽업하는 주문
 *   ① 인보이스 발행 · 포장 대기(done) 주문에 🚗 딜리버리로 — 메모가 "Salesman delivers" 면 세일즈맨이 배달 · 그 세일즈맨이 미리 채워짐
 *      → st dlv · dlvKind sm · dlvBy · shipVia DELIVERY · 그 세일즈맨 앱에 메시지 · UPS 출고 목록에서 빠짐 · 🚗 딜리버리 대기 목록 · 담당자 홈 타일 숫자
 *   ② ✅ 배달 완료 → shipped · deliveredAt · receivedBy · 출고 취소하면 딜리버리 대기로 돌아감
 *   ③ 손님 픽업으로 고르면 shipVia PICKUP */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8836', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = `const o = s.orders[0]; o.st = 'done'; o.doneAt = new Date().toISOString(); o.invs = ['A-000600']; o.memo = 'Salesman delivers';
    s.orders.push(Object.assign(JSON.parse(JSON.stringify(o)), { id: 'O261014-BBBB', no: 'O261014-BBBB', memo: 'Customer pickup', invs: ['A-000601'] }));
    s.orderLines.push(Object.assign(JSON.parse(JSON.stringify(s.orderLines[0])), { id: 'O261014-BBBB' }));`;
  const pg = await br.newPage({ viewport: { width: 1100, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'office@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', 'let u = s.users.find(x => x.id === "office@theonefl.com"); if (!u) { u = { id: "office@theonefl.com", email: "office@theonefl.com", name: "X", active: true }; s.users.push(u); } u.role = "manager"; u.job = "office";' + o.seed); }, { seed });
  await pg.goto('http://127.0.0.1:8836/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300);
  const ord = id => pg.evaluate(id => window.__MOCK_STORE__.orders[id], id);
  /* ① */
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDlv', { timeout: 8000 }).catch(() => errs.push('① invoiced order has 🚗 딜리버리로'));
  await pg.click('#mDlv'); await pg.waitForSelector('#dkOk');
  const pre = await pg.evaluate(() => ({ on: (document.querySelector('[data-dk].on') || {}).dataset.dk, by: document.getElementById('dkBy').value })); log('① preset:', JSON.stringify(pre));
  if (pre.on !== 'sm' || pre.by !== 'ALEX') errs.push('① memo "Salesman delivers" presets 세일즈맨 · ALEX');
  await pg.fill('#dkNote', '금요일 방문'); await pg.click('#dkOk'); await pg.waitForTimeout(900);
  let a = await ord('O261014-AAAA'); log('① saved:', JSON.stringify({ st: a.st, kind: a.dlvKind, by: a.dlvBy, via: a.shipVia, note: a.dlvNote }));
  if (a.st !== 'dlv' || a.dlvKind !== 'sm' || a.dlvBy !== 'ALEX' || a.shipVia !== 'DELIVERY' || a.dlvNote !== '금요일 방문') errs.push('① order is awaiting delivery by ALEX');
  const msg = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.msgs || {}).filter(m => m.to === 'sm:ALEX' && /배달할 주문/.test(m.text)).length); if (msg !== 1) errs.push('① the salesman gets an in-app message');
  const info = await pg.$eval('.alert.a-amb', e => e.textContent).catch(() => ''); if (!/딜리버리 대기.*세일즈맨이 배달.*ALEX/.test(info)) errs.push('① order screen shows who delivers');
  /* 목록: 딜리버리 대기 · UPS 출고에서 빠짐 */
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('[data-lf="dlv"]', { timeout: 8000 }).catch(() => errs.push('① 🚗 딜리버리 대기 chip in the staff menu'));
  if (await pg.$('[data-lf="dlv"]')) { await pg.click('[data-lf="dlv"]'); await pg.waitForTimeout(900); const ids = await pg.$$eval('#page [data-oid]', e => e.map(x => x.dataset.oid)); log('① dlv list:', ids.join(' ')); if (!ids.includes('O261014-AAAA')) errs.push('① delivery list shows the order'); }
  await pg.click('[data-lf="ups"]'); await pg.waitForTimeout(1200); const upsTxt = await pg.textContent('#page'); if (/O261014-AAAA/.test(upsTxt)) errs.push('① the delivery order is not in the UPS shipping list'); if (!/O261014-BBBB|BEAUTY EXCHANGE/.test(upsTxt)) errs.push('① the other invoiced order is still in the UPS list');
  await pg.click('[data-lf="home"]'); await pg.waitForSelector('#ht-dlv', { state: 'attached', timeout: 8000 }).catch(() => errs.push('① staff home has the 🚗 딜리버리 대기 tile')); await pg.waitForTimeout(800);
  const tileTxt = await pg.$eval('#ht-dlv', e => e.textContent).catch(() => ''); log('① tile:', tileTxt); if (!/1/.test(tileTxt) || !/ALEX/.test(tileTxt)) errs.push('① tile counts 1 · ALEX');
  /* ② 배달 완료 · 되돌리기 */
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDlvDone', { timeout: 8000 });
  await pg.click('#mDlvDone'); await pg.waitForSelector('#ddOk'); await pg.fill('#ddR', 'MR KIM'); await pg.click('#ddOk'); await pg.waitForTimeout(900);
  a = await ord('O261014-AAAA'); log('② delivered:', JSON.stringify({ st: a.st, via: a.shipVia, rec: a.receivedBy, at: !!a.deliveredAt }));
  if (a.st !== 'shipped' || a.shipVia !== 'DELIVERY' || a.receivedBy !== 'MR KIM' || !a.deliveredAt || !a.shipAt) errs.push('② delivered → shipped with who received it');
  await pg.waitForSelector('#mUnship', { timeout: 6000 }); await pg.click('#mUnship'); await pg.waitForTimeout(300); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(800);
  a = await ord('O261014-AAAA'); if (a.st !== 'dlv') errs.push('② undo shipping of a delivered order goes back to awaiting delivery (got ' + a.st + ')');
  /* ③ 손님 픽업 */
  await pg.evaluate(() => { location.hash = '#/order/O261014-BBBB'; }); await pg.waitForSelector('#mDlv', { timeout: 8000 }); await pg.click('#mDlv'); await pg.waitForSelector('#dkOk');
  const pre2 = await pg.evaluate(() => (document.querySelector('[data-dk].on') || {}).dataset.dk); if (pre2 !== 'pickup') errs.push('③ memo "Customer pickup" presets 손님 픽업');
  await pg.click('#dkOk'); await pg.waitForTimeout(800); const b = await ord('O261014-BBBB'); log('③ pickup:', JSON.stringify({ st: b.st, kind: b.dlvKind, via: b.shipVia, by: b.dlvBy }));
  if (b.st !== 'dlv' || b.dlvKind !== 'pickup' || b.shipVia !== 'PICKUP') errs.push('③ customer pickup → dlv with shipVia PICKUP');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
