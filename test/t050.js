/* v0.8.5 시험 — 수금 허브 (옛 수금 앱 흐름): 입력 · 오늘 내역 · Daily Report · 기록 · 미수금 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8771', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' }; window.open = () => null; });
  await pg.goto('http://127.0.0.1:8771/test/demo.html'); await pg.waitForSelector('#nav button');
  /* 1. 수금 입력 — 계정코드 4자리 */
  await pg.evaluate(() => { location.hash = '#/entry/new'; }); await pg.waitForSelector('#fAcct');
  await shot('c0_entry');
  await pg.fill('#fAcct', '1111'); await pg.waitForTimeout(400);
  await pg.waitForSelector('.info .nm'); log('store card:', (await pg.textContent('.info .nm')).trim());
  await pg.waitForSelector('.apr', { timeout: 4000 }); const picks = await pg.$$eval('.apr', e => e.map(x => x.querySelector('b').textContent.trim())); log('AR picks:', picks.join(' '));
  if (picks.includes('A10021') || !picks.includes('A10055')) errs.push('ar pick wrong (A10021 already paid by E1)');
  await pg.waitForTimeout(500); log('recent:', (await pg.textContent('#histBox')).replace(/\s+/g, ' ').slice(0, 120));
  /* 금액 2000 (센트 자동) → A10021 1500 + A10055 파샬 500 */
  await pg.fill('[data-pref="0"]', '5500'); await pg.fill('[data-pamt="0"]', '50000'); await pg.dispatchEvent('[data-pamt="0"]', 'input'); await pg.dispatchEvent('[data-pamt="0"]', 'change');
  log('amt fmt:', await pg.$eval('[data-pamt="0"]', e => e.value));
  await pg.click('.apr'); await pg.waitForTimeout(300);
  const amts = await pg.$$eval('[data-iamt]', e => e.map(x => x.value)); log('alloc:', amts.join(' | '), '|', (await pg.textContent('#invSum')).trim());
  if (amts.join('|') !== '500.00' || !(await pg.$('.part'))) errs.push('alloc/partial wrong ' + amts.join('|'));
  await pg.click('[data-pmob="0"]'); await shot('c1_filled');
  await pg.click('#btnSave'); await pg.waitForSelector('#cfOk'); log('confirm:', (await pg.textContent('#mbox')).replace(/\s+/g, ' ').slice(0, 160)); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  log('toast:', await pg.textContent('#toast'));
  /* 2. 오늘 내역 */
  await pg.waitForSelector('.sumcard'); await shot('c2_today');
  log('today sum:', (await pg.textContent('.sumcard .big')).trim(), '| ents:', await pg.$$eval('.ent', e => e.length), '| badge:', await pg.textContent('#bTd'));
  const pend = await pg.textContent('.pendbar'); log('pend:', pend.replace(/\s+/g, ' ').slice(0, 80));
  /* Daily Report 전송 */
  await pg.click('#btnSend'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(900); await shot('c3_report');
  const modalOn = await pg.evaluate(() => document.getElementById('modal').classList.contains('on')); log('modal after send (want false):', modalOn); if (modalOn) errs.push('email modal still shown');
  /* v0.8.59: 리포트를 보낸 뒤 체크 사진만 따로 */
  const jpg = path.resolve(__dirname, 'fixtures', 'check.png');
  if (fs.existsSync(jpg)) {
    await pg.setInputFiles('#rPhotoLib', jpg); await pg.waitForSelector('#phGrid img', { timeout: 20000 }); await pg.waitForTimeout(300);
    const bt = (await pg.textContent('#btnSend')).trim(), dis = await pg.$eval('#btnSend', b => b.disabled); log('photo-only button:', bt, dis); if (dis || !/사진만/.test(bt)) errs.push('photo-only button not enabled');
    await pg.click('#btnSend'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(900);
    const po = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.reports).filter(r => r.photoOnly).map(r => [r.photos.length, r.photos[0].slice(0, 23), r.photos[0].length > 3000, r.mail])); log('photo-only report:', JSON.stringify(po)); if (!po.length || !po[0][2]) errs.push('photo-only report missing');
  }
  const sentPills = await pg.$$eval('.pill.sent', e => e.length); log('sent pills:', sentPills); if (!sentPills) errs.push('no sent pill');
  /* 3. 기록 */
  await pg.click('[data-ct="hist"]'); await pg.waitForSelector('#hQ'); await pg.fill('#hQ', '1111'); await pg.click('#hGo'); await pg.waitForSelector('.hent'); await shot('c4_hist');
  log('hist:', (await pg.textContent('#hSum')).replace(/\s+/g, ' ').slice(0, 120), '| rows', await pg.$$eval('.hent', e => e.length));
  await pg.fill('#hQ', 'ali'); await pg.click('#hGo'); await pg.waitForTimeout(400); log('hist ali:', (await pg.textContent('#hSum')).replace(/\s+/g, ' ').slice(0, 90));
  /* 📧 보낸 Daily Report — 실패한 메일 다시 보내기 */
  await pg.evaluate(() => { const M = window.__MOCK_STORE__.reports; Object.values(M).forEach(r => { r.mail = 'error'; r.mailErr = 'TEST quota'; }); });
  await pg.click('#rpBox summary'); await pg.waitForSelector('[data-rsend]'); log('reports:', (await pg.textContent('#rpList')).replace(/\s+/g, ' ').slice(0, 140)); await shot('c4b_reports');
  await pg.click('[data-rsend]'); await pg.waitForTimeout(700);
  const mails = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.reports).map(r => r.mail)); log('mail after resend:', mails); if (!mails.includes('wait')) errs.push('resend did not set wait');
  if (await pg.$('#pPrev')) errs.push('v0.8.131: period report card should be gone from 기록 (📦 체크 보내기 covers it)');   // 기간 리포트는 화면에서 뺌
  /* 4. 미수금 */
  await pg.click('[data-ct="ar"]'); await pg.waitForSelector('.arbk'); await shot('c5_ar');
  log('AR hero:', (await pg.textContent('.hero')).trim(), '|', (await pg.textContent('.heroSub')).replace(/\s+/g, ' ').trim(), '| stores', await pg.$$eval('[data-ars]', e => e.length));
  await pg.click('[data-ars="1111"]'); await pg.waitForSelector('#arGo'); log('ar store:', (await pg.textContent('#modal')).replace(/\s+/g, ' ').slice(0, 140));
  await pg.click('#arGo'); await pg.waitForSelector('.info .nm'); log('→ entry prefilled:', (await pg.textContent('.info .nm')).trim()); await shot('c6_ar_to_entry');
  /* 5. 수정 흐름: 오늘 내역에서 수정 → 저장 */
  await pg.click('[data-ct="today"]'); await pg.waitForSelector('.sumcard'); const ed = await pg.$('[data-ed]'); log('edit btn (sent → none expected):', !!ed);
  log('errors:', errs.length ? errs : 'none');
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
