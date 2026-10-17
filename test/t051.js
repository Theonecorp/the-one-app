/* v0.8.6 시험 — ACH 허브: 입력(인출일 자동) → 할 일(셋업 ☑ · 상세 복사) → 거래처 등록(라우팅 검사) → 달력 → 현황 → 인출 완료 → COD·ACH 로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8774', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: '회계' }; window.open = () => null; });
  await pg.goto('http://127.0.0.1:8774/test/demo.html'); await pg.waitForSelector('#nav button');
  /* 1. 거래처 ACH 등록 (라우팅 검사) */
  await pg.evaluate(() => { location.hash = '#/ach/acct'; }); await pg.waitForSelector('#nRt');
  await pg.fill('#nAcct', '1111'); await pg.fill('#nStore', 'ALI B/S # 1'); await pg.fill('#nBank', 'BANK OF AMERICA');
  await pg.fill('#nRt', '063100277'); await pg.dispatchEvent('#nRt', 'input'); log('rt check:', await pg.textContent('#rtMsg'));
  await pg.fill('#nAn', '123456789012'); await pg.fill('#nEm', 'ali@store.com'); await shot('a0_reg');
  await pg.click('#nSave'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  log('toast:', await pg.textContent('#toast')); const tag = await pg.$eval('[data-ah="1111"]', e => e.textContent.replace(/\s+/g, ' ')); log('acct row:', tag); if (!/준비됨/.test(tag)) errs.push('acct not ready');
  /* 2. 입력 — 인출일 자동 (ACH 30 → +30일 다음 영업일) */
  await pg.click('[data-at="new"]'); await pg.waitForSelector('#aQ'); await pg.fill('#aQ', '1111'); await pg.waitForTimeout(150); await pg.click('#aHits [data-a]'); await pg.waitForSelector('[data-lno]');
  const invD = '2026-10-01'; await pg.fill('#aInvD', invD); await pg.dispatchEvent('#aInvD', 'change'); await pg.waitForTimeout(200);
  const draw = await pg.$eval('#aDraw', e => e.value); log('draw for', invD, 'ACH 30 →', draw, '|', (await pg.textContent('.hint')).trim()); if (draw !== '2026-11-02') errs.push('draw date wrong ' + draw);  /* 10/31 토 → 11/2 월 */
  await pg.fill('[data-lno="0"]', 'A12345'); await pg.fill('[data-lamt="0"]', '750'); await pg.dispatchEvent('[data-lamt="0"]', 'input'); await pg.click('#aMore'); await pg.fill('[data-lno="1"]', 'P00012'); await pg.fill('[data-lamt="1"]', '50'); await pg.dispatchEvent('[data-lamt="1"]', 'input');
  log('total:', await pg.textContent('#aTot')); await shot('a1_new');
  await pg.click('#aSave'); await pg.waitForTimeout(400); log('after save click toast:', await pg.textContent('#toast')); await pg.waitForSelector('#cfOk', { timeout: 5000 }); log('confirm:', (await pg.textContent('#mbox')).replace(/\s+/g, ' ').slice(0, 120)); await pg.click('#cfOk'); await pg.waitForTimeout(700);
  log('toast:', await pg.textContent('#toast')); log('mine rows:', await pg.$$eval('#aMine .pr', e => e.length));
  /* 3. 할 일 — 셋업 필요 → 셋업 ☑ → 예약됨 */
  await pg.click('[data-at="job"]'); await pg.waitForSelector('.job'); await shot('a2_jobs');
  log('seg:', (await pg.textContent('.seg')).replace(/\s+/g, ' '));
  await pg.click('.job [data-det]'); await pg.waitForSelector('#dClose'); const det = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('detail:', det.slice(0, 200)); if (!/063100277/.test(det) || !/••••••••9012/.test(det)) errs.push('bank info missing in detail'); await shot('a3_detail'); await pg.click('#dClose');
  await pg.click('.job [data-setup$="|1"]'); await pg.waitForTimeout(600); log('after setup seg:', (await pg.textContent('.seg')).replace(/\s+/g, ' '));
  await pg.click('[data-seg="wait"]'); await pg.waitForTimeout(300); log('wait list:', await pg.$$eval('.job', e => e.length));
  /* 4. 인출 완료 → cod 에 ACH */
  await pg.click('.job [data-done]'); await pg.waitForSelector('#dOk'); await pg.click('#dOk'); await pg.waitForTimeout(700); log('toast:', await pg.textContent('#toast'));
  await pg.click('[data-seg="done"]'); await pg.waitForTimeout(500); log('done list:', await pg.$$eval('.job', e => e.length), (await pg.textContent('#jobList')).replace(/\s+/g, ' ').slice(0, 160));
  await pg.evaluate(() => { location.hash = '#/cod'; }); await pg.waitForTimeout(700); const cod = (await pg.textContent('#page')).replace(/\s+/g, ' '); log('cod page has ACH 800:', /ACH/.test(cod) && /\$800\.00/.test(cod)); if (!(/ACH/.test(cod) && /\$800\.00/.test(cod))) errs.push('cod ACH missing'); await shot('a4_cod');
  /* 5. 달력 · 현황 */
  await pg.evaluate(() => { location.hash = '#/ach/cal'; }); await pg.waitForSelector('.calg'); await pg.click('[data-cm]:nth-child(3)'); await pg.waitForTimeout(300);
  const cell = await pg.$('.cd[data-cday="2026-11-02"]'); log('cal cell 11/02:', cell ? (await cell.textContent()).trim() : 'none'); if (cell) { await cell.click(); await pg.waitForTimeout(200); log('cal day:', (await pg.textContent('#calDay')).replace(/\s+/g, ' ').slice(0, 100)); } await shot('a5_cal');
  await pg.click('[data-at="stat"]'); await pg.waitForSelector('.stats'); log('stats:', (await pg.textContent('.stats')).replace(/\s+/g, ' ').slice(0, 200)); await shot('a6_stat');
  /* 6. 거래처 이력 */
  await pg.click('[data-at="acct"]'); await pg.waitForSelector('[data-ah="1111"]'); await pg.click('[data-ah="1111"]'); await pg.waitForSelector('#hX'); log('hist:', (await pg.textContent('#mbox')).replace(/\s+/g, ' ').slice(0, 160)); await pg.click('#hX');
  log('errors:', errs.length ? errs : 'none');
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
