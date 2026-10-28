/* v0.8.91 시험 — 🏭 공장 중복 정리: 명세서(stmt) 줄과 옛 자료(seed) · 손입력 줄이 겹친 연도 경고 → 🧹 명세서만 남기기 · 🔗 공장 합치기 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8811', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
    window.__AFTER_SEED__ = s => {
      s.factories = [{ id: 'SX', code: 'SX', name: 'SHENGXING', active: true }, { id: 'SHEN', code: 'SHEN', name: 'SHENGXING YIWU', active: true }];
      const I = (id, f, d, amt, extra) => Object.assign({ id, f, d, type: '인보이스', item: amt, frt: 0, amt, note: '' }, extra || {});
      s.factoryInvoices = [I('S1', 'SX', '2025-02-01', 1000, { seed: true }), I('S2', 'SX', '2025-03-01', 500, { seed: true }), I('M1', 'SX', '2025-04-01', 200), I('T1', 'SX', '2025-02-01', 1000, { src: 'stmt' }), I('T2', 'SX', '2025-03-01', 500, { src: 'stmt' }), I('T3', 'SX', '2025-04-01', 200, { src: 'stmt' }), I('K1', 'SX', '2024-06-01', 300, { seed: true }), I('N1', 'SHEN', '2026-01-10', 777, { src: 'stmt' }), I('T1b', 'SX', '2025-02-01', 1000, { src: 'stmt', createdAt: 'z' }), I('O1', 'SX', '2023-05-01', 400, { src: 'stmt', file: 'OLD.xlsx' }), I('O2', 'SX', '2024-03-01', 600, { src: 'stmt', file: 'OLD.xlsx' })];
      s.factoryPayments = [{ id: 'P1', f: 'SX', d: '2025-02-20', amt: 900, seed: true }, { id: 'O3', f: 'SX', d: '2023-06-01', amt: 400, src: 'stmt', file: 'OLD.xlsx' }, { id: 'Q1', f: 'SX', d: '2025-02-20', amt: 900, src: 'stmt' }, { id: 'P0', f: 'SX', d: '2024-07-01', amt: 300, seed: true }, { id: 'R1', f: 'SHEN', d: '2026-02-01', amt: 100, src: 'stmt' }];
    }; });
  await pg.goto('http://127.0.0.1:8811/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/mg/fac'; }); await pg.waitForSelector('#facClean', { timeout: 8000 });
  await pg.click('[data-fc="SX"]'); await pg.waitForTimeout(800);
  const t = (await pg.textContent('#page')).replace(/\s+/g, ' '); log('fac:', t.slice(0, 200));
  if (!/겹치는 줄이 있습니다/.test(t) || !/2025년: 명세서 5줄 \+ 그 전 자료 4줄/.test(t)) errs.push('duplicate warning should list 2025 with 4 + 4');
  if (!/2024년/.test(t.split('중복 정리로')[0])) errs.push('2024 (old-file statement + seed) should be flagged too');
  await pg.click('#facClean'); await pg.waitForSelector('#clGo');
  const ck = await pg.$$eval('[data-cy]', c => c.map(x => x.dataset.cy + ':' + (x.checked ? 'on' : 'off') + (x.disabled ? ':dis' : ''))); log('years:', ck);
  if (!ck.includes('2025:on') || !ck.includes('2024:on') || !ck.includes('2023:off:dis')) errs.push('2024 · 2025 checked, 2023 (statement only) disabled');
  const kp = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('kpi:', kp.slice(0, 160)); if (!/앱 잔액/.test(kp) || !/명세서 줄만/.test(kp) || !/명세서 첫 연도\(2023\) 앞에|앱 잔액/.test(kp)) errs.push('modal should compare app vs statement balance and warn about pre-statement rows');
  await pg.click('#clGo'); await pg.waitForSelector('#cfOk'); const q = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('ask:', q.slice(0, 100)); if (!/6개를 지울까요/.test(q)) errs.push('should delete 6 rows (2024 seed 2 + 2025 seed 2 + manual 1 + seed pay 1)');
  await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const left = await pg.evaluate(() => ({ inv: Object.keys(window.__MOCK_STORE__.factoryInvoices).sort(), pay: Object.keys(window.__MOCK_STORE__.factoryPayments).sort() })); log('left:', left);
  if (left.inv.join() !== 'N1,O1,O2,T1,T1b,T2,T3' || left.pay.join() !== 'O3,Q1,R1') errs.push('only statement rows for 2025 should remain, 2024 untouched');
  /* 명세서 줄끼리 겹침 (T1 · T1b) → 겹친 줄 지우기 */
  await pg.click('#facClean'); await pg.waitForSelector('#clDup', { timeout: 4000 }).catch(() => errs.push('duplicate statement rows should be offered for removal')); if (await pg.$('#clDup')) { await pg.click('#clDup'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200); }
  const left2 = await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.factoryInvoices).sort()); log('after dedupe:', left2); if (left2.join() !== 'N1,O1,O2,T1,T2,T3') errs.push('dedupe should drop the later duplicate T1b');
  /* 📄 파일별 — OLD.xlsx 줄만 지우기 */
  await pg.click('#facClean'); await pg.waitForSelector('[data-clf="OLD.xlsx"]', { timeout: 4000 }).catch(() => errs.push('per-file section should list OLD.xlsx')); if (await pg.$('[data-clf="OLD.xlsx"]')) { await pg.click('[data-clf="OLD.xlsx"]'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200); }
  const left3 = await pg.evaluate(() => ({ inv: Object.keys(window.__MOCK_STORE__.factoryInvoices).sort(), pay: Object.keys(window.__MOCK_STORE__.factoryPayments).sort() })); log('after file delete:', left3); if (left3.inv.join() !== 'N1,T1,T2,T3' || left3.pay.join() !== 'Q1,R1') errs.push('file delete should remove only OLD.xlsx rows');
  const t2 = (await pg.textContent('#page')).replace(/\s+/g, ' '); if (/겹치는 줄이 있습니다/.test(t2)) errs.push('warning should disappear after cleanup');
  /* 합치기: SHEN → SX */
  await pg.click('#facClean'); await pg.waitForSelector('#mgGo'); await pg.selectOption('#mgFrom', 'SHEN'); await pg.click('#mgGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const m = await pg.evaluate(() => ({ n1: window.__MOCK_STORE__.factoryInvoices.N1.f, r1: window.__MOCK_STORE__.factoryPayments.R1.f, shen: window.__MOCK_STORE__.factories.SHEN.active })); log('merged:', m);
  if (m.n1 !== 'SX' || m.r1 !== 'SX' || m.shen !== false) errs.push('merge should move rows and deactivate SHEN');
  if (await pg.$('[data-fc="SHEN"]')) errs.push('merged factory should leave the chip row');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
