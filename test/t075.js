/* v0.8.88 시험 — ✕ 주문 취소: 사유 필수 + 한 번 더 확인 → orders.cancelWhy/cancelAt 저장 · 세일즈맨 알림(notifyq) · 담당자/세일즈맨 화면에 사유 표시 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8809', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8809/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  /* 관리자: 주문 열고 ✕ 취소 */
  let pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mCancel', { timeout: 8000 }).catch(() => errs.push('cancel button missing'));
  await pg.click('#mCancel'); await pg.waitForSelector('#cxGo');
  if (!(await pg.evaluate(() => document.getElementById('cxGo').disabled))) errs.push('cancel button should be disabled until a reason is given');
  const modal = await txt(pg, '#mbox'); log('modal:', modal.slice(0, 160)); if (!/O261014-AAAA/.test(modal) || !/사유/.test(modal)) errs.push('modal should show order and ask for a reason');
  await pg.click('[data-cxw="중복 주문"]'); await pg.waitForTimeout(150);
  if (await pg.evaluate(() => document.getElementById('cxGo').disabled)) errs.push('button should enable after picking a reason');
  await pg.fill('#cxWhy', '중복 주문 — 10/13 주문과 같음'); await pg.click('#cxGo'); await pg.waitForSelector('#cfOk', { timeout: 3000 }).catch(() => errs.push('second confirm missing'));
  const ask = await txt(pg, '#mbox'); log('ask:', ask.slice(0, 120)); if (!/정말 취소/.test(ask) || !/중복 주문/.test(ask)) errs.push('second confirm should repeat the reason');
  await pg.click('#cfNo'); await pg.waitForTimeout(300);
  let o = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261014-AAAA']); if (o.st === 'x') errs.push('cancel on 취소 should not cancel');
  /* 다시: 끝까지 */
  await pg.click('#mCancel'); await pg.waitForSelector('#cxGo'); await pg.fill('#cxWhy', '중복 주문 — 10/13 주문과 같음'); await pg.waitForTimeout(100); await pg.click('#cxGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  o = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261014-AAAA']); log('order:', o.st, o.cancelWhy, o.cancelBy, !!o.cancelAt);
  if (o.st !== 'x' || o.cancelWhy !== '중복 주문 — 10/13 주문과 같음' || !o.cancelAt || o.cancelBy !== 'luke@theonefl.com') errs.push('order should be cancelled with reason');
  const nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'cancel')); log('notifyq:', nq.length, nq[0] && [nq[0].toSm, nq[0].text.slice(0, 60)]);
  if (!nq.length || nq[0].toSm !== 'ALEX' || !/중복 주문/.test(nq[0].text)) errs.push('salesman notice with reason should be queued');
  const det = await txt(pg, '#page'); if (!/취소된 주문/.test(det) || !/중복 주문 — 10\/13/.test(det)) errs.push('detail should show cancel reason');
  if (await pg.$('#mCancel')) errs.push('cancel button should disappear on a cancelled order');
  await pg.close();
  /* 세일즈맨: 취소 사유 보임 */
  pg = await mk('brandon@x.com', "s.orders.forEach(o => { if (o.id === 'O261014-AAAA') { o.sm = 'BRANDON'; o.st = 'x'; o.cancelWhy = '재고 없음 · 출고 불가'; o.cancelAt = new Date().toISOString(); o.cancelBy = 'office@x.com'; } });");
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForTimeout(1500);
  const sv = await txt(pg, '#page'); log('salesman view:', sv.slice(0, 160)); if (!/취소된 주문/.test(sv) || !/재고 없음/.test(sv)) errs.push('salesman should see the cancel reason');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
