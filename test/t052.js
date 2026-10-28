/* v0.8.7 시험 — 루크 대시보드: 현황 · 정산(✓ ! 고치기 공제 확정) · 정산 완료 · 미수금 · 찾기 · 경영(공장 · 1099 · 보너스 · 매출) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8775', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 1100, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  const txt = async sel => ((await pg.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; window.__AFTER_SEED__ = s => { /* 6개월+ 미수 후보: BRANDON 의 JIM DANDY A8800 (200일) */ s.deductions = []; }; });
  await pg.goto('http://127.0.0.1:8775/test/demo.html'); await pg.waitForSelector('#nav button');
  /* 1. 현황 */
  await pg.evaluate(() => { location.hash = '#/now'; }); await pg.waitForSelector('#estBox .hero, #estBox .none'); await shot('b0_now');
  log('now:', (await txt('#page')).slice(0, 160)); log('est:', (await txt('#estBox')).slice(0, 120));
  /* 2. 정산 — BRANDON (전체 → 카드) */
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pOut .card'); await shot('b1_pay_all');
  log('overview:', (await txt('#pOut')).slice(0, 160));
  /* 기간을 넓게 (seed 는 최근 10일) */
  const d0 = new Date(), from = new Date(d0 - 20 * 86400000).toISOString().substring(0, 10), to = d0.toISOString().substring(0, 10);
  await pg.fill('#pFrom', from); await pg.dispatchEvent('#pFrom', 'change'); await pg.waitForTimeout(300); await pg.fill('#pTo', to); await pg.dispatchEvent('#pTo', 'change'); await pg.waitForTimeout(300);
  await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('.pr.pl'); await pg.waitForTimeout(600); await shot('b2_pay_brandon');
  const lines = await pg.$$eval('.pr.pl', e => e.map(x => x.className.replace('pr tap pl ', '') + ':' + x.querySelector('.ct b').textContent.trim())); log('lines:', lines.join(' | '));
  log('fixbox present (E3 mismatch):', !!(await pg.$('.fixbox'))); if (!(await pg.$('.fixbox'))) errs.push('fixbox should show for E3 before ✓');
  /* ✓ 하나 → 문제(!) → 해제 */
  const first = await pg.$('.pr.pl.pend'); await first.click(); await pg.waitForTimeout(500); log('after tap1:', await pg.$$eval('.pr.pl.ok', e => e.length), 'ok');
  /* 금액 고치기 — E3: A10011 1000 → 980 */
  if (await pg.$('.fixbox')) { await pg.fill('.fixbox [data-fxin]', '980'); await pg.dispatchEvent('.fixbox [data-fxin]', 'input'); log('fix sum:', await txt('.fixbox [id^=fxs_]')); await pg.click('[data-fxsave]'); await pg.waitForTimeout(600); log('toast:', await txt('#toast')); log('fixbox gone:', !(await pg.$('.fixbox'))); }
  /* 전부 ✓ */
  await pg.click('#pAll'); await pg.waitForTimeout(700); log('all ok:', await pg.$$eval('.pr.pl.ok', e => e.length), '/', await pg.$$eval('.pr.pl', e => e.length));
  /* 공제: 6개월+ 후보 등록 */
  await pg.waitForSelector('#dedBox .dedSub'); log('ded:', (await txt('#dedBox')).slice(0, 200)); await shot('b3_ded');
  if (await pg.$('[data-dmk]')) { await pg.click('[data-dmk]'); await pg.waitForTimeout(800); log('ded active:', await pg.$$eval('.dedCard', e => e.length), '|', await txt('.dedTotBar')); }
  /* 캐쉬 보관 */
  await pg.click('#dedCash'); await pg.waitForTimeout(600); log('cash keep confirm text:', (await txt('#pConfirm')));
  /* 정산서 */
  await pg.click('#pPrint'); await pg.waitForSelector('#prt.on'); const st = await txt('#prtbody'); log('stmt:', st.slice(0, 200)); if (!/DEDUCTION/.test(st) || !/NET PAYMENT/.test(st)) errs.push('statement missing deduction'); await shot('b4_stmt'); await pg.click('#prtClose');
  /* 확정 */
  await pg.click('#pConfirm'); await pg.waitForSelector('#cfGo'); log('confirm:', (await txt('#mbox')).slice(0, 220)); if (await pg.$('#cfAck')) await pg.click('#cfAck'); /* v0.8.86: 걸리는 것이 있으면 확인 체크 후 확정 */ await pg.click('#cfGo'); await pg.waitForTimeout(1200);
  log('toast:', await txt('#toast')); log('after confirm print:', !!(await pg.$('#prt.on'))); await pg.click('#prtClose');
  const db = await pg.evaluate(() => null); 
  /* 정산 완료 */
  await pg.click('#pHist'); await pg.waitForSelector('[data-sh]'); log('history rows:', await pg.$$eval('[data-sh]', e => e.length), (await txt('#pOut')).slice(0, 120)); await shot('b5_hist');
  /* 3. 미수금 */
  await pg.evaluate(() => { location.hash = '#/bossar'; }); await pg.waitForSelector('.stack'); log('ar:', (await txt('#page')).slice(0, 160)); await pg.click('[data-av="top"]'); await pg.waitForTimeout(300); log('top:', await pg.$$eval('[data-fs]', e => e.length)); await pg.click('[data-av="old"]'); await pg.waitForSelector('#oldBox table'); await shot('b6_ar');
  /* 4. 찾기 */
  await pg.click('#oldBox [data-fs]'); await pg.waitForSelector('#fOut .hero'); log('find:', (await txt('#fOut')).slice(0, 140)); await shot('b7_find');
  /* 5. 경영 */
  await pg.evaluate(() => { location.hash = '#/mg'; }); await pg.waitForSelector('#mgBody .card'); log('mg home:', (await txt('#mgBody')).slice(0, 120));
  await pg.click('[data-mt="fac"]'); await pg.waitForSelector('#facNew'); await pg.click('#facNew'); await pg.waitForSelector('#ncC'); await pg.fill('#ncC', 'SX'); await pg.fill('#ncN', 'SHENZHEN XING'); await pg.click('#mOk'); await pg.waitForSelector('#facInv');
  await pg.click('#facInv'); await pg.waitForSelector('#fI'); await pg.fill('#fI', '10000'); await pg.fill('#fR', '1500'); await pg.dispatchEvent('#fR', 'input'); log('inv sum:', await txt('#fSum')); await pg.click('#fOk'); await pg.waitForTimeout(600);
  await pg.click('#facPay'); await pg.waitForSelector('#pA'); await pg.fill('#pA', '4000'); await pg.click('#pOk'); await pg.waitForTimeout(600); log('fac:', (await txt('#mgBody .card .hero')), '|', (await txt('#mgBody .heroSub')).slice(0, 100)); await shot('b8_fac');
  if ((await txt('#mgBody .card .hero')) !== '$7,500.00') errs.push('factory balance wrong');
  await pg.click('[data-mt="p99"]'); await pg.waitForSelector('#p99Batch'); log('1099:', (await txt('#mgBody')).slice(0, 160)); if (!/BRANDON/.test(await txt('#mgBody'))) errs.push('1099 missing BRANDON commission');
  await pg.click('[data-mt="bon"]'); await pg.waitForSelector('#boDist'); log('bonus:', (await txt('#mgBody .hero')), (await txt('#mgBody .heroSub')).slice(0, 80)); await shot('b9_bonus');
  await pg.click('[data-mt="sales"]'); await pg.waitForSelector('#slEdit'); await pg.click('#slEdit'); await pg.waitForSelector('[data-se]'); await pg.fill('[data-se="total|TOTAL SALES"]', '250000'); await pg.fill('[data-se="sm|BRANDON"]', '80000'); await pg.fill('#naL', 'WAX'); await pg.click('#mOk'); await pg.waitForTimeout(600); log('sales:', (await txt('#mgBody .hero'))); await shot('b10_sales');
  log('errors:', errs.length ? errs : 'none');
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
