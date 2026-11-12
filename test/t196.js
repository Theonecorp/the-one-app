/* v0.8.188 시험 — 👤 세일즈맨이 다른 세일즈맨의 가게를 고르면 한 번 묻기: 그 세일즈맨 이름으로 · 내 이름으로 (2026-11-12 관리자: "다른 세일즈맨의 어카운트를 골라서 오더를 넣을 때는 한번 확인 — 그 세일즈맨으로 그대로 넣을 건지 내 이름으로 넣을 건지")
 *   ① BRANDON 이 ALEX 가게(BEAUTY EXCHANGE ORLANDO)를 고름 → 창 "다른 세일즈맨의 가게입니다" · 👤 ALEX 이름으로 / 🙋 내 이름으로 (BRANDON)
 *   ② ALEX 이름으로 → 저장: 주문 sm BRANDON(쓴 사람 — 내 목록 · 규칙) · smFor ALEX · 보낼 주문에 BRANDON → ALEX
 *   ③ 내 이름으로 → smFor 없음 · 자기 가게(ALI, BRANDON)는 묻지 않음
 *   ④ 사무실: 주문 화면에 → ALEX 안내 · 인보이스 만들면 인보이스 sm = ALEX */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8866', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, store) => { const pg = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = s => { s.invoices = (s.invoices || []).filter(v => v.acct !== '3001' && v.acct !== '1111'); if (o.store) { const D = JSON.parse(o.store); Object.keys(D).forEach(k => { s[k] = Object.values(D[k]); }); } }; }, { email, store });
    await pg.goto('http://127.0.0.1:8866/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const sm = await open('brandon@x.com');
  const order = async (q, ac, choose) => {
    await sm.evaluate(() => { localStorage.removeItem('theone.order.wip.brandon@x.com'); location.hash = '#/order'; }); await sm.waitForTimeout(300);
    await sm.evaluate(() => { location.hash = '#/order/new'; }); await sm.waitForSelector('#eStoreQ', { timeout: 8000 });
    await sm.fill('#eStoreQ', q); await sm.waitForTimeout(300); await sm.click('#eStoreHits [data-ac="' + ac + '"]'); await sm.waitForTimeout(700);
    const asked = await sm.$('#sfOther'); const txt = asked ? (await sm.textContent('#modal .box')).replace(/\s+/g, ' ') : '';
    if (asked && choose) { await sm.click(choose); await sm.waitForTimeout(300); }
    if (await sm.$('#modal.on')) { await sm.click('#modal .mclose'); await sm.waitForTimeout(300); }
    await sm.fill('#eQ1', 'AHG100'); await sm.waitForTimeout(500); await sm.click('#eRes [data-gc="AHG100"], #eRes tr[data-frow="AHG100"] td.ct'); await sm.waitForTimeout(700);
    await sm.click('#eDraft'); await sm.waitForSelector('#cfOk', { timeout: 5000 }); await sm.click('#cfOk'); await sm.waitForTimeout(1500);
    if (await sm.$('#acNo')) { await sm.click('#acNo'); await sm.waitForTimeout(300); }
    const o = await sm.evaluate(ac => { const L = Object.values(window.__MOCK_STORE__.orders || {}).filter(o => o.acct === ac); const x = L[L.length - 1]; return x && { id: x.id, sm: x.sm, smFor: x.smFor }; }, ac);
    return { asked: !!asked, txt, o };
  };
  /* ① ② */
  const r1 = await order('BEAUTY EXCHANGE', '3001', '#sfOther'); log('① asked:', r1.asked, '|', r1.txt.slice(0, 120)); log('② saved:', JSON.stringify(r1.o));
  if (!r1.asked || !/다른 세일즈맨의 가게/.test(r1.txt) || !/ALEX/.test(r1.txt) || !/BRANDON/.test(r1.txt)) errs.push('① another salesman\'s store asks: ALEX name / my name (BRANDON)');
  if (!r1.o || r1.o.sm !== 'BRANDON' || r1.o.smFor !== 'ALEX') errs.push('② ALEX name → sm BRANDON (writer) · smFor ALEX');
  await sm.evaluate(() => { location.hash = '#/order'; }); await sm.waitForSelector('#oSendAll', { timeout: 8000 });
  const rv = (await sm.textContent('#page')).replace(/\s+/g, ' '); if (!/BEAUTY EXCHANGE/.test(rv)) errs.push('② the order is in my review & send list');
  /* ③ */
  const r3 = await order('BEAUTY EXCHANGE', '3001', '#sfMe'); log('③ my name:', JSON.stringify(r3.o)); if (!r3.asked || !r3.o || r3.o.sm !== 'BRANDON' || r3.o.smFor) errs.push('③ my name → no smFor');
  const r4 = await order('ali', '1111', null); log('③ own store asked:', r4.asked); if (r4.asked) errs.push('③ own store is not asked');
  /* ④ 사무실 — ① 주문을 픽킹 끝난 상태로 놓고 인보이스 */
  await sm.evaluate(() => { location.hash = '#/order'; }); await sm.waitForSelector('#oSendAll'); await sm.click('#oSendAll'); await sm.waitForTimeout(400); if (await sm.$('#cfOk')) await sm.click('#cfOk'); await sm.waitForTimeout(1500);
  const store = await sm.evaluate(id => { const M = window.__MOCK_STORE__; const o = {}; ['orders', 'orderLines'].forEach(k => { o[k] = {}; Object.entries(M[k] || {}).forEach(([i, d]) => { o[k][i] = Object.assign({ id: i }, d); }); }); Object.assign(o.orders[id], { st: 'picked', pickAt: new Date().toISOString(), picker: 'pick01@x.com', pickerName: 'P1' }); return JSON.stringify(o); }, r1.o.id);
  const of = await open('luke@theonefl.com', store);
  await of.evaluate(id => { location.hash = '#/order/' + id; }, r1.o.id); await of.waitForSelector('#mInv', { timeout: 8000 }).catch(() => errs.push('④ office sees the invoice button'));
  const pv = (await of.textContent('#page')).replace(/\s+/g, ' '); log('④ office view:', /BRANDON → ALEX/.test(pv)); if (!/BRANDON → ALEX/.test(pv)) errs.push('④ office sees BRANDON → ALEX');
  if (await of.$('#mInv')) { await of.click('#mInv'); await of.waitForSelector('#ivOk'); await of.click('#ivOk'); await of.waitForTimeout(1500); }
  const inv = await of.evaluate(id => Object.values(window.__MOCK_STORE__.invoices || {}).filter(v => v.orderId === id).map(v => v.no + ':' + v.sm), r1.o.id); log('④ invoices:', JSON.stringify(inv));
  if (!inv.length || inv.some(x => !/:ALEX$/.test(x))) errs.push('④ invoice salesman = ALEX');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
