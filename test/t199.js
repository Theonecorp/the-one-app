/* v0.8.189 시험 — 💳 결제 방법 COD · ACH: 세일즈맨이 주문 📝 메모 탭에서 고름 → 인보이스 Terms 칸에 ACH → 사무실 🏦 ACH 입력(가게 · 인보이스 번호 · 금액이 채워진 ➕ 입력) → 저장하면 주문에 achId (2026-11-12 오피스)
 *   ① 세일즈맨: 📝 메모 탭에 💳 결제 방법 COD / ACH — ACH 누르고 저장 → 주문 pay ACH · 다시 누르면 끔
 *   ② 사무실: 인보이스 발행 → 인보이스 pay ACH · 인쇄된 인보이스 Terms 칸에 ACH
 *   ③ 주문 화면 🏦 ACH 입력 → ACH ➕ 입력 탭에 그 가게 · 인보이스 번호 · 금액 → 저장 → ach 건 · 주문 achId · 다시 열면 "ACH 입력됨" */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8869', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, store, w) => { const pg = await (await br.newContext({ viewport: { width: w || 420, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = s => { s.invoices = (s.invoices || []).filter(v => v.acct !== '1111'); if (o.store) { const D = JSON.parse(o.store); Object.keys(D).forEach(k => { s[k] = Object.values(D[k]); }); } }; }, { email, store });
    await pg.goto('http://127.0.0.1:8869/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① */
  const sm = await open('brandon@x.com');
  await sm.evaluate(() => { location.hash = '#/order/new'; }); await sm.waitForSelector('#eStoreQ', { timeout: 8000 });
  await sm.fill('#eStoreQ', 'ali'); await sm.waitForTimeout(300); await sm.click('#eStoreHits [data-ac="1111"]'); await sm.waitForTimeout(900); if (await sm.$('#modal.on')) { await sm.click('#modal .mclose'); await sm.waitForTimeout(300); }
  await sm.fill('#eQ1', 'AHG100'); await sm.waitForTimeout(500); await sm.click('#eRes [data-gc="AHG100"], #eRes tr[data-frow="AHG100"] td.ct'); await sm.waitForTimeout(400);
  await sm.click('[data-ev="memo"]'); await sm.waitForSelector('[data-epay="ACH"]', { timeout: 5000 }).catch(() => errs.push('① memo tab has COD / ACH'));
  await sm.click('[data-epay="COD"]'); await sm.click('[data-epay="COD"]'); await sm.waitForTimeout(100); if (await sm.$('[data-epay="COD"].on')) errs.push('① tapping again turns it off');
  await sm.click('[data-epay="ACH"]'); await sm.waitForTimeout(600);
  await sm.click('#eDraft'); await sm.waitForSelector('#cfOk', { timeout: 5000 }); await sm.click('#cfOk'); await sm.waitForTimeout(1500); if (await sm.$('#acNo')) { await sm.click('#acNo'); await sm.waitForTimeout(300); }
  const o1 = await sm.evaluate(() => Object.values(window.__MOCK_STORE__.orders).find(o => o.acct === '1111')); log('① order pay:', o1 && o1.pay); if (!o1 || o1.pay !== 'ACH') errs.push('① order saved with pay ACH');
  /* ② */
  const store = await sm.evaluate(id => { const M = window.__MOCK_STORE__; const o = {}; ['orders', 'orderLines'].forEach(k => { o[k] = {}; Object.entries(M[k] || {}).forEach(([i, d]) => { o[k][i] = Object.assign({ id: i }, d); }); }); Object.assign(o.orders[id], { st: 'picked', picker: 'luke@theonefl.com', pickerName: 'L' }); return JSON.stringify(o); }, o1.id);
  const of = await open('luke@theonefl.com', store, 900);
  await of.evaluate(id => { location.hash = '#/order/' + id; }, o1.id); await of.waitForSelector('#mInv', { timeout: 8000 });
  const ov = (await of.textContent('#page')).replace(/\s+/g, ' '); if (!/ACH/.test(ov)) errs.push('② office sees ACH on the order');
  await of.click('#mInv'); await of.waitForSelector('#ivOk'); await of.click('#ivOk'); await of.waitForTimeout(1800);
  const terms = await of.evaluate(() => { const t = document.querySelector('#prt .ivinfo tr:nth-child(2) td'); return t ? t.textContent : ''; }); log('② printed Terms:', terms); if (!/ACH/.test(terms)) errs.push('② printed invoice Terms shows ACH');
  if (await of.$('#prt.on')) await of.click('#prtClose'); await of.waitForTimeout(600);
  const inv = await of.evaluate(id => Object.values(window.__MOCK_STORE__.invoices).filter(v => v.orderId === id).map(v => ({ no: v.no, pay: v.pay, total: v.total })), o1.id); log('② invoice:', JSON.stringify(inv)); if (!inv.length || inv[0].pay !== 'ACH') errs.push('② invoice pay ACH');
  /* ③ */
  await of.evaluate(id => { location.hash = '#/order/' + id; }, o1.id); await of.waitForSelector('#mAch', { timeout: 8000 }).catch(() => errs.push('③ 🏦 ACH 입력 on the invoiced ACH order'));
  if (await of.$('#mAch')) {
    await of.click('#mAch'); await of.waitForSelector('#aSave', { timeout: 8000 });
    const nos = await of.$$eval('[data-lno]', E => E.map(e => e.value)); const page = (await of.textContent('#page')).replace(/\s+/g, ' '); log('③ ACH form:', nos.join(','), /ALI B\/S # 1/.test(page));
    if (!inv.length || !nos.includes(inv[0].no) || !/ALI B\/S # 1/.test(page)) errs.push('③ ACH form prefilled with the store and invoice');
    await of.click('#aSave'); await of.waitForSelector('#cfOk', { timeout: 5000 }); await of.click('#cfOk'); await of.waitForTimeout(1500);
    const r = await of.evaluate(id => { const M = window.__MOCK_STORE__; const a = Object.values(M.ach || {}).find(x => x.acct === '1111'); return { ach: a && { inv: a.inv, amt: a.amt }, achId: M.orders[id].achId }; }, o1.id); log('③ saved:', JSON.stringify(r));
    if (!r.ach || !r.achId || (inv.length && r.ach.inv !== inv[0].no)) errs.push('③ ACH saved and linked to the order');
    await of.evaluate(id => { location.hash = '#/order/x'; }, o1.id); await of.waitForTimeout(200); await of.evaluate(id => { location.hash = '#/order/' + id; }, o1.id); await of.waitForTimeout(1500);
    if (await of.$('#mAch') || !/ACH 입력됨/.test((await of.textContent('#page')).replace(/\s+/g, ' '))) errs.push('③ order now shows ACH entered');
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
