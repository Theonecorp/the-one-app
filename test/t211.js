/* v0.8.194 시험 — 🚚 인보이스 발행 때 운임(Freight) — 인보이스 금액(인쇄 Total · Amount Due · 잔액)에 더함 · 매출 · 커미션(total)에는 안 들어감 (2026-11-12 관리자: "인보이스 발행 시 Freight fee 를 넣어서 인보이스 금액에")
 *   ① 인보이스 확정 창에 🚚 운임 칸 · 종류가 둘이면 어느 인보이스에 넣을지 고름 (A · P)
 *   ② 운임 $15 → 고른 인보이스(P): ship 15 · total 은 물건 금액 그대로 · bal = total + 15 · 다른 인보이스(A)는 ship 0
 *   ③ 인쇄: Freight 15.00 · Total · Amount Due 가 물건 + 운임
 *   ④ 인보이스 목록 · 인보이스 창의 합계가 운임 포함
 *   ⑤ ✏️ 인보이스 수정에서 운임 15 → 20 → ship 20 · 잔액 +5 · 물건 금액(total) · 주문 금액은 그대로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8881', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 1000, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => {
    Object.assign(s.orders[0], { st: 'picked', picker: 'luke@theonefl.com', pickerName: 'L', cfOk: true });
    s.orderLines[0].lines = [{ c: 'AHG100', d: 'ITEM 0', q: 20, pq: 20, ok: true, p: 2.5, t: 'A' }, { c: 'EB103', d: 'EDGE BOOSTER', q: 4, pq: 4, ok: true, p: 3.25, t: 'P' }]; }; });
  await pg.goto('http://127.0.0.1:8881/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mInv', { timeout: 8000 });
  /* ① */
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk');
  if (!(await pg.$('#ivFrt')) || !(await pg.$('#ivFrtT'))) errs.push('① freight field and target select');
  await pg.fill('#ivFrt', '15'); await pg.selectOption('#ivFrtT', 'P');
  await pg.click('#ivOk'); await pg.waitForTimeout(1800);
  /* ③ */
  const prt = await pg.evaluate(() => { const b = document.getElementById('prtbody'); if (!b) return []; return [...b.querySelectorAll('.ivtot')].map(t => t.textContent.replace(/\s+/g, ' ')); }); log('③ print totals:', JSON.stringify(prt));
  if (!prt.some(t => /Freight\s*15\.00/.test(t) && /Total\s*28\.00/.test(t) && /Amount Due\s*\$28\.00/.test(t))) errs.push('③ P invoice prints Freight 15.00 · Total 28.00 (13 + 15)');
  if (!prt.some(t => /Freight\s*0\.00/.test(t) && /Total\s*50\.00/.test(t))) errs.push('③ A invoice has no freight');
  if (await pg.$('#prt.on')) await pg.click('#prtClose');
  /* ② */
  const V = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices).filter(v => v.orderId === 'O261014-AAAA').map(v => ({ no: v.no, t: v.t, total: v.total, ship: v.ship, bal: v.bal })));
  log('② invoices:', JSON.stringify(V));
  const P = V.find(v => v.t === 'P'), A = V.find(v => v.t === 'A');
  if (!P || P.total !== 13 || P.ship !== 15 || P.bal !== 28) errs.push('② P: total 13 (goods) · ship 15 · bal 28');
  if (!A || A.ship !== 0 || A.bal !== 50) errs.push('② A: no freight');
  const amt = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261014-AAAA'].amt); log('② order amt:', amt); if (amt !== 63) errs.push('② order amount stays goods only (63)');
  /* ④ */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }); await pg.waitForTimeout(400);
  const rowP = await pg.evaluate(no => { const r = document.querySelector('#iList [data-go="inv:' + no + '"]'); return r ? r.textContent.replace(/\s+/g, ' ') : ''; }, P && P.no); log('④ list row:', rowP.slice(0, 120));
  if (!/\$28\.00/.test(rowP)) errs.push('④ invoice list amount includes freight');
  await pg.click('[data-go="inv:' + (P && P.no) + '"]'); await pg.waitForTimeout(1500);
  const box = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); if (!/\$28\.00합계|\$28\.00 합계/.test(box)) errs.push('④ invoice window total includes freight');
  /* ⑤ */
  if (await pg.$('#idInvEdit')) {
    await pg.click('#idInvEdit'); await pg.waitForSelector('#ieFrt');
    await pg.fill('#ieFrt', '20'); await pg.dispatchEvent('#ieFrt', 'change'); await pg.waitForTimeout(200);
    await pg.waitForTimeout(600); await pg.click('#ieOk'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
    const P2 = await pg.evaluate(no => { const v = window.__MOCK_STORE__.invoices[no]; return { total: v.total, ship: v.ship, bal: v.bal, what: (v.edits || [])[0] && v.edits[0].what }; }, P.no);
    const amt2 = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261014-AAAA'].amt); log('⑤ after edit:', JSON.stringify(P2), 'order amt', amt2);
    if (P2.total !== 13 || P2.ship !== 20 || P2.bal !== 33 || !/freight/.test(P2.what || '') || amt2 !== 63) errs.push('⑤ freight 20 · bal +5 · goods total and order amount unchanged');
  } else errs.push('⑤ edit button');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
