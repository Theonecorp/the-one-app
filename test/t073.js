/* v0.8.85 시험 — 📦 체크 봉투: 세일즈맨이 체크를 묶어 보냄(발송 목록 인쇄) → 담당자 수금 확인에서 봉투 열고 체크 번호로 맞춤(② 수령) → 빠진 것 미도착 → 봉투 완료 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8807', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const mk = async (email) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'X' }; }, email); await pg.goto('http://127.0.0.1:8807/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* 세일즈맨: 📦 체크 보내기 */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/send'; }); await pg.waitForSelector('.evck', { timeout: 8000 }).catch(() => errs.push('send tab missing'));
  const n0 = await pg.$$eval('.evck', c => c.length); log('checks to send:', n0, (await pg.textContent('#evSum')).trim());
  await pg.fill('#evTrk', 'USPS 9400'); await pg.click('#evGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const prt = await pg.evaluate(() => document.getElementById('prt').className + '|' + document.getElementById('prtbody').textContent.replace(/\s+/g, ' ').slice(0, 80)); log('print:', prt); if (!/on\|/.test(prt) || !/체크 발송 목록/.test(prt)) errs.push('packing list should print');
  const env = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.envelopes || {})[0]); log('envelope:', env && [env.id, env.sm, env.n, env.total, env.st, env.trk]);
  if (!env || env.sm !== 'BRANDON' || env.n !== n0 || env.st !== 'sent') errs.push('envelope wrong');
  const marked = await pg.evaluate(id => Object.values(window.__MOCK_STORE__.entries).filter(e => e.env === id).length, env.id); if (marked !== env.entries.length) errs.push('entries not marked with env');
  await pg.click('#prtClose').catch(() => {}); await pg.waitForTimeout(400);
  const left = await pg.$$eval('.evck', c => c.length).catch(() => 0); log('left to send:', left); if (left) errs.push('sent checks should leave the list');
  if (!/가는 중/.test(await pg.textContent('#hubBody'))) errs.push('sent envelope should be listed as in transit');
  await pg.close();
  /* 담당자: 📦 도착한 봉투 */
  /* (시험 화면은 페이지마다 자료가 새로 시작하므로 담당자 쪽은 봉투를 미리 넣어 둠) */
  pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { const E1 = s.entries.find(e => e.id === 'E1'), E3 = s.entries.find(e => e.id === 'E3'); E1.env = 'VTEST'; E3.env = 'VTEST'; E1.rc = false; E3.rc = false;
    s.envelopes = [{ id: 'VTEST', sm: 'BRANDON', n: 3, total: 2480, st: 'sent', sentAt: new Date(Date.now() - 20 * 86400000).toISOString(), by: 'brandon@x.com', entries: ['E1', 'E3'], got: {}, miss: {}, checks: [{ eid: 'E1', ref: '1042', amt: 1200, store: E1.store, acct: E1.acct, d: E1.d }, { eid: 'E1', ref: '1043', amt: 300, store: E1.store, acct: E1.acct, d: E1.d }, { eid: 'E3', ref: '555', amt: 980, store: E3.store, acct: E3.acct, d: E3.d }] }]; }; });
  await pg.goto('http://127.0.0.1:8807/test/demo.html'); await pg.waitForSelector('#nav button');
  const env2 = { id: 'VTEST', checks: [{ ref: '1042' }, { ref: '1043' }, { ref: '555' }] };
  await pg.evaluate(() => { location.hash = '#/verify'; }); await pg.waitForSelector('[data-ev]', { timeout: 8000 }).catch(() => errs.push('envelope card missing'));
  log('env card:', (await pg.textContent('#envBox')).replace(/\s+/g, ' ').slice(0, 120));
  if (!/⚠️/.test(await pg.textContent('#envBox'))) errs.push('20-day-old envelope should be flagged late');
  await pg.click('[data-ev]'); await pg.waitForSelector('#evNo'); const refs = env2.checks.map(c => c.ref); log('refs:', refs);
  await pg.fill('#evNo', refs[0]); await pg.press('#evNo', 'Enter'); await pg.waitForTimeout(800);
  await pg.fill('#evNo', '999999'); await pg.press('#evNo', 'Enter'); await pg.waitForTimeout(300); const msg = await pg.textContent('#evMsg'); log('unknown:', msg.slice(0, 50)); if (!/목록에 없는/.test(msg)) errs.push('unknown check should warn');
  const st1 = await pg.evaluate((id) => { const M = window.__MOCK_STORE__, e = M.envelopes[id]; return { got: Object.keys(e.got).length, rcE1: !!M.entries.E1.rc, rcE3: !!M.entries.E3.rc }; }, env2.id); log('after 1st match:', st1);
  if (st1.got !== 0 || st1.rcE1) errs.push('v0.8.126: a match is only marked on screen — nothing saved until 💾');
  if (!(await pg.$('#evSave'))) errs.push('💾 save bar should show after a match');
  await pg.fill('#evNo', '1043'); await pg.press('#evNo', 'Enter'); await pg.waitForTimeout(500);
  await pg.click('#evSave'); await pg.waitForTimeout(800);
  const st1b = await pg.evaluate(() => ({ rcE1: !!window.__MOCK_STORE__.entries.E1.rc, sbE1: !!window.__MOCK_STORE__.entries.E1.sb })); log('after 2nd:', st1b); if (!st1b.rcE1) errs.push('both checks matched → E1 rc');
  await pg.click('#evDone'); await pg.waitForSelector('#cfOk').catch(() => {}); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(1000);
  const st2 = await pg.evaluate((id) => { const M = window.__MOCK_STORE__, e = M.envelopes[id]; return { st: e.st, miss: Object.keys(e.miss).length, envMiss: Object.values(M.entries).filter(x => x.envMiss).length }; }, env2.id); log('after done:', st2);
  if (st2.st !== 'done' || st2.miss !== 1 || st2.envMiss !== 1) errs.push('envelope done / missing wrong');
  if (await pg.$('[data-ev]')) errs.push('done envelope should leave the card');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
