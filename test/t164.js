/* v0.8.174 시험 — 📅 세일즈맨 수금 기록의 기간별 조회 (v0.8.131 에 뺐던 기간 보기를 다시): 받은 날짜 기준 · 빠른 기간(이번 주 · 이번 달 · 지난 달 · 최근 30일) · 날짜별 소계 · CHECK · CASH · ZELLE 합계 · 🖨 인쇄 · 📧 메일 단추
 *   ① 🗂 수금 기록 탭에 📅 기간 카드(시작 · 끝 · 조회 · 인쇄 · 메일) 가 있음
 *   ② 최근 7일로 조회 → BRANDON 의 수금 4건(오늘 1,500 · 1일 전 2,400 · 3일 전 980 · 4일 전 650) + COD 450(2일 전) = $5,980 · 40일 전 900 은 빠짐 · 날짜 머리(.hday) 5개 · CHECK/CASH/ZELLE/COD 합계 · COD 체크를 끄면 4건 $5,530
 *   ③ '최근 30일' 빠른 단추 → 같은 5건 · 시작 날짜가 29일 전 · 기록 없는 기간은 "기록 없음" */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8829', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); };
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' }; });
  await pg.goto('http://127.0.0.1:8829/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300);
  await pg.evaluate(() => { location.hash = '#/hist'; }); await pg.waitForSelector('#pFrom', { timeout: 8000 }).catch(() => errs.push('① period card missing'));
  if (await pg.$('#pFrom')) {
    for (const id of ['pTo', 'pGo', 'pPrev', 'pMail']) if (!(await pg.$('#' + id))) errs.push('① #' + id + ' missing');
    const chips = await pg.$$eval('[data-pq]', e => e.map(x => x.dataset.pq)); if (chips.join() !== 'week,month,lastm,d30') errs.push('① quick ranges: ' + chips.join());
    /* ② 최근 7일 */
    await pg.fill('#pFrom', day(7)); await pg.fill('#pTo', day(0)); await pg.click('#pGo'); await pg.waitForSelector('.hent', { timeout: 5000 }).catch(() => errs.push('② no rows'));
    const sum = await pg.$eval('#hSum', e => e.textContent.replace(/\s+/g, ' ')); log('② sum:', sum.slice(0, 200));
    const n = await pg.$$eval('.hent', e => e.length), days = await pg.$$eval('.hday', e => e.map(x => x.textContent.replace(/\s+/g, ' '))); log('② rows', n, '· days', days.join(' | '));
    if (n !== 5) errs.push('② 5 entries (4 field + 1 COD) in the last 7 days, got ' + n); if (days.length !== 5) errs.push('② one day header per day, got ' + days.length);
    if (!/5건/.test(sum) || !/\$5,980\.00/.test(sum) || !/\$450\.00COD/.test(sum)) errs.push('② summary 5건 · $5,980.00 · COD 450');
    if (!/\$4,580\.00/.test(sum) || !/\$300\.00/.test(sum) || !/\$650\.00/.test(sum)) errs.push('② CHECK 4,580 · CASH 300 · ZELLE 650 totals');
    const stores = await pg.$$eval('.hent', e => e.map(x => x.textContent)); if (stores.some(s => /#1001\b/.test(s))) errs.push('② the 40-day-old check 1001 must not appear');
    await pg.waitForTimeout(700); await pg.uncheck('#hOther'); await pg.waitForTimeout(200); await pg.click('#pGo'); await pg.waitForTimeout(800); const n4 = await pg.$$eval('.hent', e => e.length), s4 = await pg.$eval('#hSum', e => e.textContent); log('② field only:', n4, s4.slice(0, 80)); if (n4 !== 4 || !/\$5,530\.00/.test(s4)) errs.push('② without COD: 4 entries · $5,530.00'); await pg.check('#hOther');
    /* ③ 빠른 단추 · 빈 기간 */
    await pg.click('[data-pq="d30"]'); await pg.waitForTimeout(700); const f = await pg.inputValue('#pFrom'), n30 = await pg.$$eval('.hent', e => e.length); log('③ d30 from', f, 'rows', n30);
    if (f !== day(29)) errs.push('③ last-30-days starts 29 days ago (got ' + f + ')'); if (n30 !== 5) errs.push('③ 5 rows in the last 30 days, got ' + n30);
    await pg.fill('#pFrom', day(200)); await pg.fill('#pTo', day(100)); await pg.click('#pGo'); await pg.waitForTimeout(600); const none = await pg.$eval('#hSum', e => e.textContent); if (!/기록 없음/.test(none)) errs.push('③ empty range says 기록 없음');
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
