/* v0.8.94 시험 — ↩️ 바운스 체크: 회계가 체크 번호로 등록 → 원래 수금 bounced(잔액 · 커미션 제외) · 앱 인보이스 입금 되돌림 + hold · 세일즈맨 알림 → 세일즈맨 탭에서 메모 · 새 체크 받음(대체 체크 미리 채움) → 회계 해결(재입금 · 새 체크) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8815', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const seedInv = `s.invoices = (s.invoices || []).concat([{ id: 'A10021', no: 'A10021', t: 'A', d: '2026-10-01', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', lines: [], total: 1500, bal: 0, paid: 1500, pays: { E1: 1500 }, st: 'open' }]);`;
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8815/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* 회계: 등록 */
  let pg = await mk('acct@theonefl.com', seedInv + " s.users.forEach(u => { if (u.email === 'acct@theonefl.com') u.job = 'acct'; });");
  if (!(await pg.$('#nav button[data-go="bounce"]'))) errs.push('acct nav should have bounce tab');
  await pg.click('#nav button[data-go="bounce"]'); await pg.waitForSelector('#bnNew', { timeout: 8000 });
  await pg.click('#bnNew'); await pg.waitForSelector('#bnRef'); await pg.fill('#bnRef', '1042'); await pg.waitForSelector('[data-be="E1"]', { timeout: 5000 }).catch(() => errs.push('check 1042 (E1) should be found'));
  await pg.click('[data-be="E1"]'); await pg.waitForSelector('#bnGo'); await pg.fill('#bnNote', 'NSF'); await pg.click('#bnGo'); await pg.waitForTimeout(1800);
  const st = await pg.evaluate(() => { const B = Object.values(window.__MOCK_STORE__.bounces || {})[0]; const e = window.__MOCK_STORE__.entries.E1; const inv = window.__MOCK_STORE__.invoices.A10021; return { b: B && [B.ref, B.amt, B.sm, B.st, B.invs.length, B.log.length], e: [e.bounced, e.bounceId === (B && B.id)], inv: [inv.bal, inv.paid, inv.hold === (B && B.id)], nq: Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'bounce').map(n => n.toSm) }; }); log('after register:', JSON.stringify(st));
  if (!st.b || st.b[0] !== '1042' || st.b[1] !== 1200 || st.b[2] !== 'BRANDON' || st.b[3] !== 'open' || st.b[5] !== 1) errs.push('bounce doc');
  if (!st.e[0] || !st.e[1]) errs.push('entry should be flagged bounced');
  if (st.inv[0] !== 1500 || st.inv[1] !== 0 || !st.inv[2]) errs.push('app invoice balance should revive with hold');
  if (st.nq.join() !== 'BRANDON') errs.push('salesman notice');
  const lst = await txt(pg, '#page'); if (!/BRANDON/.test(lst) || !/#1042/.test(lst) || !/미해결/.test(lst)) errs.push('acct list should show the open bounce under BRANDON');
  const bid = await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.bounces)[0]);
  /* 메모 → 세일즈맨 알림 */
  if (!(await pg.$('#bnSend'))) await pg.click('[data-bn="' + bid + '"]'); await pg.waitForSelector('#bnSend');   /* 등록 직후엔 상세가 바로 열려 있음 */ await pg.fill('#bnMsg', '가게에 연락 부탁'); await pg.click('#bnSend'); await pg.waitForTimeout(800);
  const lg = await pg.evaluate(id => window.__MOCK_STORE__.bounces[id].log.length, bid); if (lg !== 2) errs.push('note should append to log');
  /* 재입금 성공 → 원래 수금 복구 */
  await pg.click('#bnRedep'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const st2 = await pg.evaluate(id => { const B = window.__MOCK_STORE__.bounces[id], e = window.__MOCK_STORE__.entries.E1, inv = window.__MOCK_STORE__.invoices.A10021; return [B.st, B.how, e.bounced, inv.bal, inv.hold || '']; }, bid); log('after redeposit:', st2);
  if (st2[0] !== 'cleared' || st2[1] !== 'redeposit' || st2[2] !== false || st2[3] !== 0 || st2[4] !== '') errs.push('redeposit should restore the payment and release hold');
  await pg.close();
  /* 세일즈맨: 내 바운스 · 새 체크 받음 → 수금 입력 미리 채움 · 저장하면 바운스에 연결 */
  const seedB = seedInv + ` s.bounces = [{ id: 'B1', eid: 'E1', sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', ref: '1042', amt: 1200, d: '2026-10-20', ym: '2026-10', invs: [{ no: 'A10021', amt: 1500 }], st: 'open', how: '', log: [], by: 'acct@theonefl.com', at: '2026-10-20T10:00:00Z' }]; s.entries.forEach(e => { if (e.id === 'E1') { e.bounced = true; e.bounceId = 'B1'; } });`;
  pg = await mk('brandon@x.com', seedB);
  if (!(await pg.$('#nav button[data-go="bounce"]'))) errs.push('salesman nav should have bounce tab');
  await pg.click('#nav button[data-go="bounce"]'); await pg.waitForSelector('[data-bn="B1"]', { timeout: 8000 });
  if (await pg.$('#bnNew')) errs.push('salesman must not register bounces');
  await pg.click('[data-bn="B1"]'); await pg.waitForSelector('#bnNewChk'); if (await pg.$('#bnRedep')) errs.push('salesman must not clear');
  await pg.fill('#bnMsg', '금요일에 새 체크 받기로 함'); await pg.click('#bnSend'); await pg.waitForTimeout(800);
  const nq2 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'bounceNote' && n.toStaff).length); if (nq2 !== 1) errs.push('salesman note should notify staff');
  await pg.click('#bnNewChk'); await pg.waitForSelector('[data-porig="0"]', { timeout: 6000 }).catch(() => errs.push('entry form with replacement check should open'));
  const pre = await pg.evaluate(() => ({ store: (document.getElementById('eStore') || document.querySelector('#hubBody input') || {}).value, orig: (document.querySelector('[data-porig="0"]') || {}).value })); log('prefill:', pre);
  if (pre.orig !== '1042') errs.push('original check # should be prefilled');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
