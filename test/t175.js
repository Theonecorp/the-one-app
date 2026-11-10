/* v0.8.181 시험 — 📦 오프라인 자동 준비 (2026-11-10 관리자)
 *   ① 세일즈맨이 인터넷이 되는 곳에서 앱을 열면 (마지막 준비가 1시간 전이어도) 자동으로 다시 준비 — 마지막 시각이 바뀜
 *   ② 5분 안에 다시 열면 건너뜀 · ③ 끊겼다 다시 연결되면(online) 준비 · ④ 돌아올 때는 30분 넘었을 때만
 *   ⑤ 데이터 절약 · 2G 면 자동 준비 안 함 · ⑥ 담당자 · 관리자는 자동 준비 안 함
 *   ⑦ 사진: 와이파이면 자동으로 받음 (카탈로그 버전 기록) · 휴대폰 데이터면 안 받음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8840', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  /* o: { email, agoMin (마지막 준비 몇 분 전), conn: { saveData, effectiveType, type } } */
  const open = async o => { const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } }); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(o.email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.route(/drive\.google\.com|googleusercontent\.com/, r => r.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }));
    await pg.addInitScript(x => { window.__MOCK_USER__ = { email: x.email, name: 'X' };
      try { if (!sessionStorage.getItem('t175')) { sessionStorage.setItem('t175', '1'); localStorage.removeItem('theone.offline.photos'); if (x.agoMin == null) localStorage.removeItem('theone.offline.at'); else localStorage.setItem('theone.offline.at', new Date(Date.now() - x.agoMin * 60000).toISOString()); } } catch (e) {}
      if (x.conn) Object.defineProperty(navigator, 'connection', { get: () => Object.assign({ effectiveType: '4g', addEventListener() {} }, x.conn) }); }, o);
    await pg.goto('http://127.0.0.1:8840/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const stamp = pg => pg.evaluate(() => localStorage.getItem('theone.offline.at'));
  const age = s => s ? Math.round((Date.now() - new Date(s).getTime()) / 60000) : null;
  /* ① 앱을 열 때 */
  let pg = await open({ email: 'brandon@x.com', agoMin: 60, conn: { type: 'cellular' } });
  await pg.waitForTimeout(7000); let a = await stamp(pg); log('① open (60분 전) → 지금부터', age(a), '분 전');
  if (age(a) !== 0) errs.push('① opening the app online prepares again even though the last prepare was 1h ago');
  const ph = await pg.evaluate(() => localStorage.getItem('theone.offline.photos')); log('⑦ cellular photos:', ph); if (ph) errs.push('⑦ no automatic photos on mobile data');
  /* ② 5분 안에 다시 열기 */
  await pg.evaluate(() => localStorage.setItem('theone.offline.at', new Date(Date.now() - 2 * 60000).toISOString()));
  await pg.reload(); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(6000); a = await stamp(pg); log('② reopen (2분 전):', age(a)); if (age(a) !== 2) errs.push('② reopening within 5 minutes skips');
  /* ③ 다시 연결 */
  await pg.evaluate(() => { localStorage.setItem('theone.offline.at', new Date(Date.now() - 10 * 60000).toISOString()); window.dispatchEvent(new Event('online')); });
  await pg.waitForTimeout(5000); a = await stamp(pg); log('③ online (10분 전):', age(a)); if (age(a) !== 0) errs.push('③ coming back online prepares');
  /* ④ 돌아올 때 — 30분 기준 */
  await pg.evaluate(() => { localStorage.setItem('theone.offline.at', new Date(Date.now() - 10 * 60000).toISOString()); document.dispatchEvent(new Event('visibilitychange')); });
  await pg.waitForTimeout(4000); a = await stamp(pg); log('④ resume (10분 전):', age(a)); if (age(a) !== 10) errs.push('④ returning within 30 minutes skips');
  await pg.evaluate(() => { localStorage.setItem('theone.offline.at', new Date(Date.now() - 40 * 60000).toISOString()); document.dispatchEvent(new Event('visibilitychange')); });
  await pg.waitForTimeout(4500); a = await stamp(pg); log('④ resume (40분 전):', age(a)); if (age(a) !== 0) errs.push('④ returning after 30+ minutes prepares');
  await pg.context().close();
  /* ⑤ 데이터 절약 · 2G */
  for (const c of [{ saveData: true }, { effectiveType: '2g' }]) { pg = await open({ email: 'brandon@x.com', agoMin: 60, conn: c }); await pg.waitForTimeout(6500); a = await stamp(pg); log('⑤', JSON.stringify(c), age(a)); if (age(a) !== 60) errs.push('⑤ no auto prepare with ' + JSON.stringify(c)); await pg.context().close(); }
  /* ⑥ 관리자 */
  pg = await open({ email: 'luke@theonefl.com', agoMin: 60, conn: { type: 'wifi' } }); await pg.waitForTimeout(6500); a = await stamp(pg); log('⑥ admin:', age(a)); if (age(a) !== 60) errs.push('⑥ staff/admin do not auto prepare'); await pg.context().close();
  /* ⑦ 와이파이 — 사진도 */
  pg = await open({ email: 'brandon@x.com', agoMin: null, conn: { type: 'wifi' } });
  await pg.waitForFunction(() => !!localStorage.getItem('theone.offline.photos'), null, { timeout: 40000 }).catch(() => {});
  const p2 = await pg.evaluate(() => JSON.parse(localStorage.getItem('theone.offline.photos') || 'null')); log('⑦ wifi photos:', JSON.stringify(p2));
  if (!p2 || !('ver' in p2))   /* 데모 카탈로그에는 사진 주소가 없어 n 은 0 일 수 있음 */ errs.push('⑦ on Wi-Fi photos are fetched automatically and the catalog version is stamped');
  const card = await pg.$eval('#offCard', e => e.textContent).catch(() => ''); if (!/자동으로 준비/.test(card)) errs.push('⑦ home card explains automatic preparing');
  await pg.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
