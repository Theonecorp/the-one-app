/* v0.8.189 시험 — 🔒 내부 메모(사무실 전용 · 인보이스 인쇄에 안 나옴) · 👷 작업 완료 때 실제로 피킹한 사람 고르기 (2026-11-12 오피스: "INTERNAL MEMO 가 없음 — 피킹 끝난 후 피킹한 사람을 선택할 수 있게")
 *   ① 사무실: 픽킹 중 주문 화면에 🔒 내부 메모 · ✏️ 쓰기 → 저장 → 주문 imemo · 화면에 보임
 *   ② ✅ 작업 완료 → "누가 피킹했나요?" 창 · 배정된 사람(pick01)이 기본 선택 · 다른 사람(pick02)을 고르고 다음 → 확인 → 주문 pickedBy/pickedByName = pick02
 *   ③ 인보이스 발행 → 인보이스 imemo · pickedBy 저장 · 인쇄된 인보이스에는 내부 메모가 없음 · 인보이스 창(사무실)에 🔒 · 👷 보임
 *   ④ 세일즈맨 화면에는 내부 메모가 안 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8868', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = "s.users.push({ id: 'pick01@x.com', email: 'pick01@x.com', name: 'PICK01', role: 'manager', job: 'pick', active: true }, { id: 'pick02@x.com', email: 'pick02@x.com', name: 'PICK02', role: 'manager', job: 'pick', active: true }); Object.assign(s.orders[0], { st: 'pick', cfOk: true, picker: 'pick01@x.com', pickerName: 'PICK01', pickAt: '2026-11-12T10:00:00Z' });";
  const open = async email => { const pg = await (await br.newContext({ viewport: { width: 900, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED });
    await pg.goto('http://127.0.0.1:8868/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const pg = await open('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mIMemo', { timeout: 8000 }).catch(() => errs.push('① office sees 🔒 internal memo'));
  /* ① */
  await pg.click('#mIMemo'); await pg.waitForSelector('#imT'); await pg.fill('#imT', '박스 2개로 나눔 · 손님 전화 확인'); await pg.click('#imOk'); await pg.waitForTimeout(1200);
  const o1 = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261014-AAAA'].imemo); const t1 = await pg.textContent('#mIMemoT').catch(() => ''); log('① saved:', o1, '| shown:', t1);
  if (o1 !== '박스 2개로 나눔 · 손님 전화 확인' || !/박스 2개/.test(t1)) errs.push('① internal memo saved and shown');
  /* ② */
  await pg.waitForSelector('#mPickDone'); await pg.click('#mPickDone'); await pg.waitForSelector('#cpOk', { timeout: 5000 }).catch(() => errs.push('② asks who picked'));
  const on = await pg.$eval('#cpL .pick.on', e => e.textContent).catch(() => ''); log('② default:', on.replace(/\s+/g, ' ')); if (!/PICK01/.test(on)) errs.push('② default = assigned picker PICK01');
  const idx = await pg.$$eval('[data-cpk]', B => B.findIndex(b => /PICK02/.test(b.textContent))); await pg.click('[data-cpk="' + idx + '"]'); await pg.click('#cpOk');
  await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const o2 = await pg.evaluate(() => { const o = window.__MOCK_STORE__.orders['O261014-AAAA']; return { st: o.st, by: o.pickedBy, name: o.pickedByName }; }); log('② order:', JSON.stringify(o2));
  if (o2.st !== 'picked' || o2.by !== 'pick02@x.com' || o2.name !== 'PICK02') errs.push('② picked by PICK02 saved');
  /* ③ */
  await pg.waitForSelector('#mInv'); await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForTimeout(1800);
  const prt = await pg.evaluate(() => { const p = document.getElementById('prt'); return p ? p.textContent : ''; }); if (/박스 2개/.test(prt)) errs.push('③ internal memo must not be printed');
  if (await pg.$('#prt.on')) await pg.click('#prtClose');
  const inv = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices).filter(v => v.orderId === 'O261014-AAAA').map(v => ({ no: v.no, imemo: v.imemo, pickedBy: v.pickedBy }))); log('③ invoices:', JSON.stringify(inv));
  if (!inv.length || inv[0].imemo !== '박스 2개로 나눔 · 손님 전화 확인' || inv[0].pickedBy !== 'PICK02') errs.push('③ invoice keeps internal memo and picker');
  if (inv.length) { await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }); await pg.click('[data-go="inv:' + inv[0].no + '"]'); await pg.waitForTimeout(1500);
    const box = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('③ invoice window:', /내부 메모/.test(box), /PICK02/.test(box), box.slice(0, 300)); if (!/내부 메모/.test(box) || !/PICK02/.test(box)) errs.push('③ office invoice window shows 🔒 and 👷'); }
  /* ④ */
  const store = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const o = {}; ['orders', 'orderLines', 'invoices'].forEach(k => { o[k] = {}; Object.entries(M[k] || {}).forEach(([i, d]) => { o[k][i] = Object.assign({ id: i }, d); }); }); return JSON.stringify(o); });
  const sm = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage(); sm.on('pageerror', e => errs.push('sm: ' + e.message));
  await sm.addInitScript(o => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' }; window.__AFTER_SEED__ = s => { const D = JSON.parse(o); Object.keys(D).forEach(k => { s[k] = Object.values(D[k]); }); s.orders.forEach(x => { x.sm = 'BRANDON'; }); s.orderLines.forEach(x => { x.sm = 'BRANDON'; }); }; }, store);
  await sm.goto('http://127.0.0.1:8868/test/demo.html'); await sm.waitForSelector('#nav button', { state: 'attached' });
  await sm.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await sm.waitForTimeout(2000);
  const st = (await sm.textContent('#page')).replace(/\s+/g, ' '); log('④ salesman sees memo:', /박스 2개/.test(st)); if (/박스 2개|내부 메모/.test(st)) errs.push('④ salesman must not see the internal memo');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
