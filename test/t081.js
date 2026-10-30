/* v0.8.95 시험 — 📅 체크 날짜 변경 요청 (세일즈맨 → 담당자 승인 → 수금 pays.dep 바뀜) · ⏸ 홀드 (담당자 → 세일즈맨이 손님 날짜 알림 → 담당자 홀드 풀며 날짜 적용) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8816', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.type() === 'prompt' ? d.accept('다음 주로') : d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed || ''); }, { email, seed }); await pg.goto('http://127.0.0.1:8816/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const acctJob = "s.users.forEach(u => { if (u.email === 'acct@theonefl.com') u.job = 'acct'; });";
  /* 세일즈맨: 날짜 변경 요청 (E2 체크 #2201, dep 5일 전 → 10일 뒤) */
  let pg = await mk('brandon@x.com');
  await pg.click('#nav button[data-go="hub/smoney"]'); await pg.click('[data-hub="bounce"]'); await pg.waitForSelector('#rqNew', { timeout: 8000 });
  if (await pg.$('#rqHold')) errs.push('salesman must not hold checks');
  await pg.click('#rqNew'); await pg.waitForSelector('#rqQ'); await pg.fill('#rqQ', '2201'); await pg.waitForSelector('[data-rh="0"]', { timeout: 5000 }).catch(() => errs.push('check 2201 should be found'));
  await pg.click('[data-rh="0"]'); await pg.waitForSelector('#rqGo');
  const nd = new Date(); nd.setDate(nd.getDate() + 10); const newD = nd.toISOString().substring(0, 10);
  await pg.fill('#rqD', newD); await pg.fill('#rqN', '손님이 다음 주 입금 원함'); await pg.click('#rqGo'); await pg.waitForTimeout(1500);
  const rq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.checkReq || {})[0]); log('req:', rq && [rq.kind, rq.store, rq.ref, rq.newDep, rq.st, rq.pi]);
  if (!rq || rq.kind !== 'date' || rq.ref !== '2201' || rq.newDep !== newD || rq.st !== 'open') errs.push('date request doc');
  const dep0 = await pg.evaluate(() => window.__MOCK_STORE__.entries.E2.pays[0].dep); if (dep0 === newD) errs.push('salesman request must not change the date by itself');
  const nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'checkDate' && n.toStaff).length); if (nq !== 1) errs.push('staff notice for request');
  const l1 = await txt(pg, '#page'); if (!/⏳ 대기/.test(l1) || !/#2201/.test(l1)) errs.push('salesman list shows pending request');
  await pg.close();
  /* 담당자: 승인 → dep 바뀜 · 세일즈맨 알림 */
  const seedReq = acctJob + ` s.checkReq = [{ id: 'R1', kind: 'date', eid: 'E2', pi: 0, sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', ref: '2201', amt: 2400, curDep: s.entries[1].pays[0].dep, newDep: '${newD}', why: '손님 요청', note: '', st: 'open', log: [], by: 'brandon@x.com', at: '2026-10-28T01:00:00Z' }];`;
  pg = await mk('acct@theonefl.com', seedReq);
  await pg.click('#nav button[data-go="hub/money"]'); await pg.click('[data-hub="bounce"]');   /* v0.8.125: 💵 수금 묶음 → 체크 관리 */ await pg.waitForSelector('[data-rq="R1"]', { timeout: 8000 });
  await pg.click('[data-rq="R1"]'); await pg.waitForSelector('#rqOk'); await pg.click('#rqOk'); await pg.waitForTimeout(1500);
  const a1 = await pg.evaluate(() => [window.__MOCK_STORE__.entries.E2.pays[0].dep, window.__MOCK_STORE__.checkReq.R1.st, Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'checkDateOk').map(n => n.toSm).join()]); log('approved:', a1);
  if (a1[0] !== newD || a1[1] !== 'ok' || a1[2] !== 'BRANDON') errs.push('approve should change dep, close request, notify salesman');
  /* 담당자: 홀드 (E1 체크 #1042) — 세일즈맨이 손님 날짜 받기 */
  await pg.click('#rqHold'); await pg.waitForSelector('#rqQ'); await pg.fill('#rqQ', '1042'); await pg.waitForSelector('[data-rh="0"]'); await pg.click('[data-rh="0"]'); await pg.waitForSelector('#rqGo');
  await pg.fill('#rqN', '잔고 확인 필요'); await pg.click('#rqGo'); await pg.waitForTimeout(1500);
  const h1 = await pg.evaluate(() => { const r = Object.values(window.__MOCK_STORE__.checkReq).find(x => x.kind === 'hold'); return [r && r.st, r && r.contact, window.__MOCK_STORE__.entries.E1.pays[0].hold, Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'checkHold').map(n => n.toSm).join()]; }); log('hold:', h1);
  if (h1[0] !== 'open' || h1[1] !== 'sm' || h1[2] !== true || h1[3] !== 'BRANDON') errs.push('hold should flag the check and notify the salesman');
  /* 담당자 직접 날짜로 풀기 */
  const hid = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.checkReq).find(x => x.kind === 'hold').id);
  await pg.click('[data-rq="' + hid + '"]'); await pg.waitForSelector('#rqRel'); await pg.fill('#rqDep', newD); await pg.click('#rqRel'); await pg.waitForSelector('#cfOk', { timeout: 1500 }).then(() => pg.click('#cfOk')).catch(() => {}); await pg.waitForTimeout(1500);
  const h2 = await pg.evaluate(id => [window.__MOCK_STORE__.entries.E1.pays[0].hold, window.__MOCK_STORE__.entries.E1.pays[0].dep, window.__MOCK_STORE__.checkReq[id].st], hid); log('released:', h2);
  if (h2[0] !== false || h2[1] !== newD || h2[2] !== 'released') errs.push('release should clear hold and set the date');
  await pg.close();
  /* 세일즈맨: 홀드 체크에 손님 날짜 알리기 */
  pg = await mk('brandon@x.com', `s.checkReq = [{ id: 'H2', kind: 'hold', eid: 'E1', pi: 0, sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', ref: '1042', amt: 1200, curDep: '2026-10-28', newDep: '', propDep: '', note: '잔고', contact: 'sm', st: 'open', log: [], by: 'acct@theonefl.com', at: '2026-10-28T02:00:00Z' }]; s.entries[0].pays[0].hold = true;`);
  await pg.click('#nav button[data-go="hub/smoney"]'); await pg.click('[data-hub="bounce"]'); await pg.waitForSelector('[data-rq="H2"]', { timeout: 8000 }); await pg.click('[data-rq="H2"]'); await pg.waitForSelector('#rqProp');
  if (await pg.$('#rqRel')) errs.push('salesman must not release holds');
  await pg.fill('#rqDep', newD); await pg.click('#rqProp'); await pg.waitForTimeout(1200);
  const p1 = await pg.evaluate(() => [window.__MOCK_STORE__.checkReq.H2.propDep, window.__MOCK_STORE__.entries.E1.pays[0].hold, Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'checkProp' && n.toStaff).length]); log('proposed:', p1);
  if (p1[0] !== newD || p1[1] !== true || p1[2] !== 1) errs.push('proposal should record the date, keep hold, notify staff');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
