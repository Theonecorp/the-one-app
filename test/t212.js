/* v0.8.194 시험 — 🔢 인보이스 새 번호 구간 (A 50001 · P 20001 · W 10001 부터 · 이미 있는 번호는 건너뜀) · 🏷 픽킹 화면 · ✏️ 인보이스 수정에서 할인율 바꾸기 (2026-11-12 관리자)
 *   ① 픽킹 중 주문: 🏷 할인 바꾸기 → A 10% → 주문 disc {A:10} · 금액 다시 계산
 *   ② 인보이스 발행: 번호가 새 구간 — A-050001 은 이미 있어서(옛 번호) 건너뛰고 A-050002 · P 는 P-020001 · 할인 10% 적용
 *   ③ ✏️ 인보이스 수정: 할인 10 → 20% → 합계 다시 계산 · disc 20 · 잔액 차이만큼 · 기록 "DC 10%→20%" */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8882', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 1000, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => {
    Object.assign(s.orders[0], { st: 'pick', picker: 'luke@theonefl.com', pickerName: 'L', cfOk: true });
    s.orderLines[0].lines = [{ c: 'AHG100', d: 'ITEM 0', q: 20, pq: 20, ok: true, p: 2.5, t: 'A' }, { c: 'EB103', d: 'EDGE BOOSTER', q: 4, pq: 4, ok: true, p: 3.25, t: 'P' }];
    s.counters = [{ id: 'inv2', A: 43125, P: 8757, W: 617 }];
    s.invoices = (s.invoices || []).concat([{ id: 'A50001', no: 'A50001', t: 'A', d: '2026-01-02', ym: '2026-01', acct: '1271', store: 'OLD', total: 1, bal: 0, src: 'legacy', lines: [] }]); }; });
  await pg.goto('http://127.0.0.1:8882/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mDisc', { timeout: 8000 }).catch(() => errs.push('① 🏷 change discount on a picking order'));
  /* ① */
  if (await pg.$('#mDisc')) { await pg.click('#mDisc'); await pg.waitForSelector('[data-mdc="A"]'); await pg.fill('[data-mdc="A"]', '10'); await pg.click('#mdOk'); await pg.waitForTimeout(1200); }
  const o1 = await pg.evaluate(() => { const o = window.__MOCK_STORE__.orders['O261014-AAAA']; return { disc: o.disc, amt: o.amt }; }); log('① order:', JSON.stringify(o1));
  if (!o1.disc || o1.disc.A !== 10 || o1.amt !== 58) errs.push('① order disc A 10% · amount 45 + 13 = 58');
  /* ② */
  await pg.waitForSelector('#mPickDone'); await pg.click('#mPickDone'); await pg.waitForSelector('#cpOk'); await pg.click('#cpOk'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  await pg.waitForSelector('#mInv'); await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForTimeout(1800); if (await pg.$('#prt.on')) await pg.click('#prtClose');
  const V = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices).filter(v => v.orderId === 'O261014-AAAA').map(v => ({ no: v.no, t: v.t, disc: v.disc, total: v.total, bal: v.bal })).sort((a, b) => a.t.localeCompare(b.t))); log('② invoices:', JSON.stringify(V));
  const A = V.find(v => v.t === 'A'), P = V.find(v => v.t === 'P');
  if (!A || A.no !== 'A-050002') errs.push('② A number from the new range, skipping the existing A50001 → A-050002');
  if (!P || P.no !== 'P-020001') errs.push('② P number starts at P-020001');
  if (!A || A.disc !== 10 || A.total !== 45) errs.push('② A invoice carries the 10% discount');
  /* ③ */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }); await pg.click('[data-go="inv:' + (A && A.no) + '"]'); await pg.waitForSelector('#idInvEdit', { timeout: 6000 });
  await pg.click('#idInvEdit'); await pg.waitForSelector('#ieDc'); await pg.fill('#ieDc', '20'); await pg.dispatchEvent('#ieDc', 'change'); await pg.waitForTimeout(200);
  const nw = await pg.textContent('#ieNew'); log('③ preview new total:', nw); if (!/\$40\.00/.test(nw)) errs.push('③ preview recalculates with 20% (40.00)');
  await pg.waitForTimeout(600); await pg.click('#ieOk'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const A3 = await pg.evaluate(no => { const v = window.__MOCK_STORE__.invoices[no]; return { disc: v.disc, total: v.total, bal: v.bal, what: (v.edits || [])[0] && v.edits[0].what }; }, A && A.no); log('③ after edit:', JSON.stringify(A3));
  if (A3.disc !== 20 || A3.total !== 40 || A3.bal !== 40 || !/DC 10%→20%/.test(A3.what || '')) errs.push('③ discount 20% saved · total 40 · balance 40 · logged');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
