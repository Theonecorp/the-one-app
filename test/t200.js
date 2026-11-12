/* v0.8.189 시험 — ✏️ 발행된 인보이스 직접 고치기 (2026-11-12 오피스: "인보이스로 넘어간 후 수정")
 *   ① 인보이스 발행(AHG100 20 × $2.50 + AHG101 10 × $3.00 = $80) → 수금 $50 들어온 것으로(잔액 $30)
 *   ② 주문 화면 ✏️ 인보이스 수정 → AHG100 20 → 10 · AHG101 $3 → $4 · ＋ AHG102 2개 · 메모 → 새 합계 · 차이 · 새 잔액 미리보기 → 저장
 *   ③ 인보이스: 줄 · 합계(25 + 40 + AHG102 2 × 목록가) · 잔액 = 30 + 차이 · edits 기록(누가 · 옛 합계 → 새 합계 · 무엇) · 메모 · 주문 amt 도 같이
 *   ④ 재고: AHG100 +10 (되돌림) · AHG102 −2 · AHG101 그대로 (stockLog kind invedit)
 *   ⑤ 인보이스 창(📄)에도 ✏️ 인보이스 수정 · 세일즈맨은 못 고침 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8870', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 900, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { Object.assign(s.orders[0], { st: 'picked', cfOk: true, picker: 'luke@theonefl.com', pickerName: 'L' }); s.stock = [{ id: 'AHG100', code: 'AHG100', qty: 100 }, { id: 'AHG101', code: 'AHG101', qty: 100 }, { id: 'AHG102', code: 'AHG102', qty: 100 }]; }; });
  await pg.goto('http://127.0.0.1:8870/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  /* ① */
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mInv', { timeout: 8000 });
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForTimeout(1800); if (await pg.$('#prt.on')) await pg.click('#prtClose');
  const no = await pg.evaluate(() => { const v = Object.values(window.__MOCK_STORE__.invoices).find(v => v.orderId === 'O261014-AAAA'); v.bal = 30; return v.no; });
  const st0 = await pg.evaluate(() => { const S = window.__MOCK_STORE__.stock || {}; return ['AHG100', 'AHG101', 'AHG102'].map(c => (S[c] || {}).qty); }); log('① invoice', no, 'stock after issue:', st0.join(','));
  /* ② */
  await pg.evaluate(() => { location.hash = '#/order/x'; }); await pg.waitForTimeout(200); await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; });
  await pg.waitForSelector('[data-mie]', { timeout: 8000 }).catch(() => errs.push('② ✏️ Edit invoice on the invoiced order'));
  await pg.click('[data-mie="' + no + '"]'); await pg.waitForSelector('#ieOk', { timeout: 6000 });
  const L0 = await pg.$$eval('[data-ieq]', E => E.length); if (L0 !== 2) errs.push('② two lines in the editor');
  await pg.fill('[data-ieq="0"]', '10'); await pg.dispatchEvent('[data-ieq="0"]', 'change'); await pg.waitForTimeout(150);
  await pg.fill('[data-iep="1"]', '4'); await pg.dispatchEvent('[data-iep="1"]', 'change'); await pg.waitForTimeout(150);
  await pg.fill('#ieAdd', 'AHG102'); await pg.fill('#ieAddQ', '2'); await pg.click('#ieAddGo'); await pg.waitForTimeout(150);
  await pg.fill('#ieMemo', '가격 조정 · 수량 정정');
  const prev = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('② preview:', prev.match(/옛 합계.{0,80}|\$[\d.]+옛 합계.{0,120}/) ? prev.slice(prev.indexOf('$80.00'), prev.indexOf('$80.00') + 90) : prev.slice(-200));
  const want = await pg.evaluate(() => { const r = (window.__MOCK_SEED__.catalog || []).find(x => x.id === 'c0'); const rows = r ? JSON.parse(r.j) : []; const it = rows.find(x => x[0] === 'AHG102'); return it ? Number(it[2]) : null; });
  const total = Math.round((25 + 40 + 2 * want) * 100) / 100, diff = Math.round((total - 80) * 100) / 100, bal = Math.round((30 + diff) * 100) / 100; log('② expect total', total, 'diff', diff, 'bal', bal);
  await pg.waitForTimeout(600); await pg.click('#ieOk'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(2000);
  /* ③ */
  const v = await pg.evaluate(no => { const M = window.__MOCK_STORE__, x = M.invoices[no]; return { total: x.total, bal: x.bal, qty: x.qty, memo: x.memo, lines: x.lines.map(l => l.c + ':' + l.q + '@' + l.p).join(' '), edits: x.edits, amt: M.orders['O261014-AAAA'].amt }; }, no);
  log('③ invoice:', JSON.stringify(v));
  if (v.total !== total || v.bal !== bal || v.qty !== 22 || v.lines !== 'AHG100:10@2.5 AHG101:10@4 AHG102:2@' + want || v.memo !== '가격 조정 · 수량 정정') errs.push('③ lines · total · balance · memo');
  if (!v.edits || v.edits.length !== 1 || v.edits[0].from !== 80 || v.edits[0].to !== total || !/AHG100 20→10/.test(v.edits[0].what) || v.edits[0].by !== 'luke@theonefl.com') errs.push('③ edit log');
  if (v.amt !== total) errs.push('③ order amount follows');
  /* ④ */
  const st1 = await pg.evaluate(() => { const S = window.__MOCK_STORE__.stock || {}; return ['AHG100', 'AHG101', 'AHG102'].map(c => (S[c] || {}).qty); }); log('④ stock:', st0.join(','), '→', st1.join(','));
  if (st1[0] !== st0[0] + 10 || st1[1] !== st0[1] || st1[2] !== st0[2] - 2) errs.push('④ stock moves by the difference only');
  const lg = await pg.evaluate(no => Object.values(window.__MOCK_STORE__.stockLog || {}).filter(x => x.kind === 'invedit' && x.ref === no).map(x => x.code + ':' + x.delta).sort().join(' '), no); log('④ log:', lg); if (lg !== 'AHG100:10 AHG102:-2') errs.push('④ stock log invedit');
  /* ⑤ */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }); await pg.click('[data-go="inv:' + no + '"]'); await pg.waitForTimeout(1500);
  if (!(await pg.$('#idInvEdit'))) errs.push('⑤ invoice window has ✏️ Edit invoice');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
