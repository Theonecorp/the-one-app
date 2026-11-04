/* v0.8.163 시험 — 주문 목록 묶음 단추(❓ 확인 요청 · 👍 확인 완료 · 👷 작업 배정)를 아무것도 체크하지 않고 누르면 "주문을 체크하세요" (맞춤법) · 아무 일도 안 일어남 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8881', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = s => { s.users.forEach(u => { if (u.email === 'acct@theonefl.com') u.job = 'office'; }); }; });
  await pg.goto('http://127.0.0.1:8881/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800);
  /* 홈 묶음의 📥 신규 타일로 접수 목록 열기 (접힌 묶음은 펴서) */
  await pg.evaluate(() => { const t = document.querySelector('[data-hg="sent"]'), g = t && t.closest('.hgrp'); if (g) g.classList.add('open'); }); await pg.click('[data-hg="sent"]'); await pg.waitForTimeout(700);
  const ids = ['bkCf', 'bkCfOk', 'bkAssign'].filter(async () => true); let seen = 0;
  for (const id of ids) {
    if (!(await pg.$('#' + id))) continue; seen++;
    const before = await pg.evaluate(() => JSON.stringify(Object.values(window.__MOCK_STORE__.orders).map(o => [o.id, o.st, o.cfReq || '', o.cfOk || '', o.assignTo || ''])));
    await pg.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; });
    await pg.click('#' + id); await pg.waitForTimeout(300);
    const t = await pg.evaluate(() => { const e = document.querySelector('#toast.on'); return e ? e.textContent : ''; }); log(id, '→', t);
    if (t !== '주문을 체크하세요') errs.push(id + ' toast should read 주문을 체크하세요, got "' + t + '"');
    if (await pg.$('#modal.on')) errs.push(id + ' should not open anything without a selection');
    const after = await pg.evaluate(() => JSON.stringify(Object.values(window.__MOCK_STORE__.orders).map(o => [o.id, o.st, o.cfReq || '', o.cfOk || '', o.assignTo || ''])));
    if (after !== before) errs.push(id + ' changed orders without a selection');
  }
  if (!seen) errs.push('bulk buttons not found on the intake list');
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
