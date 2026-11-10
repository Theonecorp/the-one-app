/* v0.8.162 시험 — 🏷 인보이스 종류: 주얼리(세트 · 디스플레이 포함)는 전부 A 로 시작, W 는 사무실 · 인보이스 담당이 접수 · 배정 · 픽킹 중에 손으로 바꿀 때만
 *   ① 세트/디스플레이 아이템(FLSIDE52, Set Orders & Displays)의 인보이스 종류가 A  ② 배정된(mine) 주문에서도 🏷 종류 막대가 보이고 모두 W 로 바꾸면 저장됨
 *   ③ 📦 재고 부족 알림은 설정의 stockAlertTo 로 (notifyq.to) · 사무실 💬 메시지는 그대로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8879', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seed = s => {
    const o = s.orders[0]; s.orders.push(Object.assign({}, o, { id: 'O261015-MINE', no: 'O261015-MINE', st: 'mine', assignTo: 'luke@theonefl.com', assignAt: '2026-10-15T15:00:00Z' }));
    s.orderLines.push({ id: 'O261015-MINE', sm: o.sm, lines: [{ c: 'FLSIDE52', d: 'FL INT #52', q: 1, p: 198 }, { c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 12, p: 2.5 }] });
    s.stock = (s.stock || []).concat([{ id: 'AHG100', code: 'AHG100', qty: 15 }]);
    s.settings[0].stockAlertTo = 'office@theonefl.com, luke@theonefl.com';
  };
  await pg.addInitScript(f => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f); }, '(' + seed.toString() + ')(s)');
  await pg.goto('http://127.0.0.1:8879/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(400);
  /* ① 세트 · 디스플레이 아이템도 A */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itQ', { timeout: 8000 }); await pg.fill('#itQ', 'FLSIDE52'); await pg.waitForTimeout(500);
  await pg.click('#itList [data-it="FLSIDE52"] .ct'); await pg.waitForSelector('#isEd', { timeout: 5000 }); await pg.click('#isEd'); await pg.waitForSelector('#fType', { timeout: 5000 }); await pg.waitForTimeout(200);
  const ft = (await pg.textContent('#fType')).replace(/\s+/g, ' '); log('FLSIDE52 type:', ft.slice(0, 60)); if (!/종류: A\b/.test(ft)) errs.push('set/display item should default to invoice type A, got: ' + ft.slice(0, 40));
  await pg.click('#modal .mclose').catch(() => {}); await pg.waitForTimeout(200);
  /* ② 배정된 주문에서 🏷 막대 → 모두 W */
  await pg.evaluate(() => { location.hash = '#/order/O261015-MINE'; }); await pg.waitForSelector('#mTypes', { timeout: 8000 }); await pg.waitForTimeout(500);
  const tb = (await pg.textContent('#mTypes')).replace(/\s+/g, ' '); log('type bar (mine):', tb.slice(0, 80)); if (!/A 2/.test(tb) || !/W 0/.test(tb)) errs.push('assigned order should show the type bar with A 2 · W 0: ' + tb.slice(0, 60));
  await pg.click('[data-tall="W"]'); await pg.waitForSelector('#cfOk', { timeout: 3000 }); await pg.click('#cfOk'); await pg.waitForTimeout(900);
  const saved = await pg.evaluate(() => (window.__MOCK_STORE__.orderLines['O261015-MINE'].lines || []).map(l => l.t).join(',')); log('saved types:', saved); if (saved !== 'W,W') errs.push('모두 W should save t=W on both lines, got ' + saved);
  /* ③ 부족 알림 받는 사람 — notifyq.to = stockAlertTo */
  await pg.evaluate(() => { location.hash = '#/stock'; }); await pg.waitForSelector('#skQ', { timeout: 8000 }); await pg.fill('#skQ', 'AHG100'); await pg.waitForTimeout(500);
  await pg.click('[data-sti="AHG100"]'); await pg.waitForSelector('#skSave', { timeout: 5000 }); await pg.fill('#skAdj', '-10'); await pg.fill('#skWhy', 'sold'); await pg.click('#skSave'); await pg.waitForTimeout(900);
  const nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'lowstock')); log('lowstock notifyq:', nq.length, nq[0] && nq[0].to);
  if (nq.length !== 1) errs.push('one lowstock notification should be queued'); else if (!Array.isArray(nq[0].to) || nq[0].to.join(',') !== 'office@theonefl.com,luke@theonefl.com') errs.push('lowstock notification should go to stockAlertTo, got ' + JSON.stringify(nq[0].to));
  const staffQ = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'msg' && n.toStaff).length); if (staffQ) errs.push('the office message must not also queue a staff email (double mail)');
  const msgs = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.msgs || {}).filter(m => m.to === 'g:office').length); if (msgs !== 1) errs.push('office in-app message should still be sent');
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
