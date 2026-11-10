/* v0.8.151 시험 — 💬 메시지 · 🔔 알림: 사무실에 온 메시지가 🔔 숫자로 · 창을 열면 읽음 · 답장은 세일즈맨 코드로 · 세일즈맨은 사무실 · 창고에만 보냄
 *   주문 창의 💬 (담당자 → 세일즈맨 · 세일즈맨 → 사무실) · 보낸 메시지는 notifyq 에도 (이메일 · 챗) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8869', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 900 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' };
    if (o.seed) window.__AFTER_SEED__ = s => { const at = new Date().toISOString(); s.msgs = [{ id: 'M1', from: 'brandon@x.com', fromName: 'Brandon', fromRole: 'salesman', fromSm: 'BRANDON', to: 'g:office', toLabel: '사무실', text: '1111 ALI 주문 오늘 꼭 나가야 해요', ref: { kind: 'order', id: 'O261014-AAAA', label: 'O261014-AAAA · BEAUTY EXCHANGE ORLANDO' }, at, reads: {} }, { id: 'M2', from: 'alex@x.com', fromName: 'Alex', fromRole: 'salesman', fromSm: 'ALEX', to: 'sm:BRANDON', toLabel: 'Brandon', text: '세일즈맨끼리 — 사무실엔 안 보여야 함', ref: null, at, reads: {} }]; }; }, { email, seed }); await pg.goto('http://127.0.0.1:8869/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(2500); return pg; };

  /* ---------- 관리자(사무실): 🔔 1 · 열기 · 읽음 · 답장 ---------- */
  let pg = await mk('luke@theonefl.com', true);
  const badge = await pg.$eval('#hBell', b => (b.querySelector('.hbadge') || {}).textContent || ''); log('badge:', badge); if (badge !== '1') errs.push('bell should show 1 unread office message (got ' + badge + ')');
  await pg.click('#hBell'); await pg.waitForSelector('#msgPanel .mrow', { timeout: 5000 }); await pg.waitForTimeout(800);
  const rows = await pg.$$eval('#msgPanel .mrow', r => r.map(x => x.dataset.mid + ':' + x.querySelector('.mt').textContent)); log('rows:', rows);
  if (!rows.some(r => r.startsWith('M1:'))) errs.push('office should see the message addressed to g:office'); if (rows.some(r => r.startsWith('M2:'))) errs.push('office must not see a salesman-to-salesman message');
  if (!(await pg.$('#msgPanel [data-mref="order:O261014-AAAA"]'))) errs.push('message should show the order link');
  const read = await pg.evaluate(() => { const m = window.__MOCK_STORE__.msgs.M1; return m && m.reads && Object.keys(m.reads); }); log('reads:', read); if (!read || !read.length) errs.push('opening the panel should mark the message read');
  await pg.waitForTimeout(500); const badge2 = await pg.$eval('#hBell', b => (b.querySelector('.hbadge') || {}).textContent || ''); if (badge2 !== '') errs.push('badge should clear after reading (got ' + badge2 + ')');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'msg_panel.png') });
  await pg.click('[data-mrep="M1"]'); await pg.waitForSelector('#msgText', { timeout: 5000 });
  const to = await pg.$eval('#msgTo .on', b => b.dataset.mto); log('reply to:', to); if (to !== 'sm:BRANDON') errs.push('reply should target the salesman code');
  await pg.fill('#msgText', '네, 오늘 나갑니다'); await pg.click('#msgSend'); await pg.waitForTimeout(1200);
  const sent = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.msgs).find(m => m.from === 'luke@theonefl.com')); log('sent:', sent && { to: sent.to, text: sent.text, ref: sent.ref && sent.ref.id });
  if (!sent || sent.to !== 'sm:BRANDON' || !sent.ref || sent.ref.id !== 'O261014-AAAA') errs.push('reply should be saved to sm:BRANDON with the order ref');
  const nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'msg')); log('notifyq:', nq.length, nq[0] && nq[0].toSm); if (!nq.length || nq[0].toSm !== 'BRANDON') errs.push('message should queue an email/chat notice for the salesman');
  /* 담당자 주문 창의 💬 */
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mMsg', { timeout: 8000 }); await pg.click('#mMsg'); await pg.waitForSelector('#msgText', { timeout: 5000 });
  const to2 = await pg.$eval('#msgTo .on', b => b.dataset.mto); if (to2 !== 'sm:ALEX') errs.push('order 💬 should address the order\'s salesman (got ' + to2 + ')'); await pg.click('#msgC'); await pg.waitForTimeout(150);
  await pg.close();

  /* ---------- 세일즈맨: 받는 곳은 사무실 · 창고만 · 주문 창의 💬 사무실에 문의 ---------- */
  pg = await mk('brandon@x.com', true);
  const b3 = await pg.$eval('#hBell', b => (b.querySelector('.hbadge') || {}).textContent || ''); log('salesman badge:', b3); if (b3 !== '1') errs.push('salesman should see 1 unread (the sm:BRANDON message)');
  await pg.click('#hBell'); await pg.waitForSelector('#msgNew'); await pg.click('#msgNew'); await pg.waitForSelector('#msgTo');
  const tos = await pg.$$eval('#msgTo [data-mto]', b => b.map(x => x.dataset.mto)); log('salesman targets:', tos); if (tos.join(',') !== 'g:office,g:wh') errs.push('salesman should only pick office or warehouse');
  await pg.click('[data-mq]'); await pg.click('#msgSend'); await pg.waitForTimeout(1000);
  const s2 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.msgs).find(m => m.from === 'brandon@x.com' && m.id !== 'M1')); if (!s2 || s2.to !== 'g:office') errs.push('salesman message should go to g:office');
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForTimeout(1200);
  log('salesman order 💬 present (own order only):', !!(await pg.$('#oMsg')));
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'msg_compose.png') });
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
