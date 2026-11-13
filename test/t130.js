/* v0.8.164 시험 — 📱💻 팝업 알림 · 사람끼리 메시지
 *   ① 알림 허락된 기기에서 ☰ 🔔 팝업 알림 → 이 기기 등록(pushTokens: 내 이메일 · 토큰)
 *   ② 💬 메시지 받는 곳에 다른 직원(👤)이 있고, 한 사람에게 보내면 대기열에 toUser(그 사람 기기 팝업 · 개인 방) · noMail
 *   ③ 창고 묶음에 보내면 toGroup g:wh (메일 없음) · 사무실 묶음은 toGroup g:office + toStaff
 *   ④ 로그아웃하면 이 기기 등록이 지워짐 (공용 컴퓨터에 남의 팝업이 안 뜨게) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8884', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  await ctx.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:8884' });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  /* 헤드리스 브라우저는 알림 허락을 '막힘'으로 답함 — 브라우저의 허락 답만 대신 (앱 로직은 그대로) */
  await pg.addInitScript(() => { try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); Notification.requestPermission = async () => 'granted'; if (!('PushManager' in window)) window.PushManager = function () {}; } catch (e) {} });
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = s => { s.users.forEach(u => { if (u.email === 'acct@theonefl.com') u.job = 'office'; }); s.users.push({ id: 'wh@x.com', email: 'wh@x.com', name: 'Warehouse Mgr', role: 'manager', job: 'whmgr', active: true }); }; });
  await pg.goto('http://127.0.0.1:8884/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(500);
  /* ① */
  await pg.click('#hMenu'); await pg.click('#drawer [data-dgo="settings"]'); await pg.waitForSelector('.stpage #mPush'); const lab = (await pg.textContent('.stpage #mPush')).trim(); log('drawer button:', lab); if (!/켜짐|on/i.test(lab)) errs.push('granted device should show 팝업 알림 켜짐');
  await pg.click('.stpage #mPush'); await pg.waitForTimeout(800);
  const toks = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.pushTokens || {}).map(t => t.email + '|' + t.token)); log('pushTokens:', toks);
  if (toks.length !== 1 || !/^acct@theonefl\.com\|mock-token-acct@theonefl\.com$/.test(toks[0])) errs.push('this device should be registered once for the signed-in user');
  /* ② 사람 한 명 */
  await pg.click('#hBell'); await pg.waitForSelector('#msgNew'); await pg.click('#msgNew'); await pg.waitForSelector('#msgTo', { timeout: 4000 });
  const tos = await pg.$$eval('[data-mto]', B => B.map(b => b.dataset.mto)); log('recipients:', tos.join(' '));
  if (!tos.includes('u:wh@x.com')) errs.push('staff should be able to pick an individual colleague');
  if (tos.some(t => t === 'u:acct@theonefl.com')) errs.push('should not list myself');
  if (tos.includes('u:wh@x.com')) {
    await pg.click('[data-mto="u:wh@x.com"]'); await pg.fill('#msgText', '3번 통로 박스 확인 부탁'); await pg.click('#msgSend'); await pg.waitForTimeout(900);
    const q = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'msg').map(n => ({ toUser: n.toUser, noMail: n.noMail, toStaff: !!n.toStaff, toGroup: n.toGroup || '', chat: n.chat })));
    log('queued:', JSON.stringify(q)); const u = q.find(x => x.toUser === 'wh@x.com');
    if (!u || !u.noMail || u.toStaff || !u.chat) errs.push('a message to one person should queue toUser with noMail (pop-up + personal room, no email)');
  }
  /* ③ 묶음 */
  const send = async (to, text) => { await pg.click('#hBell'); await pg.waitForSelector('#msgNew'); await pg.click('#msgNew'); await pg.waitForSelector('[data-mto="' + to + '"]'); await pg.click('[data-mto="' + to + '"]'); await pg.fill('#msgText', text); await pg.waitForTimeout(500); await pg.click('#msgSend'); await pg.waitForTimeout(800); };
  await send('g:wh', '오늘 UPS 늦게 옵니다'); await send('g:office', '체크 봉투 도착');
  const g = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'msg' && n.toGroup).map(n => n.toGroup + ':' + !!n.toStaff));
  log('groups:', g.join(' ')); if (!g.includes('g:wh:false') || !g.includes('g:office:true')) errs.push('warehouse group: no staff email; office group: staff email');
  /* ④ 로그아웃 */
  await pg.click('#hMenu'); await pg.waitForSelector('#drawer #mOut'); await pg.click('#drawer #mOut'); await pg.waitForTimeout(1000);
  const left = await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.pushTokens || {}).length); log('tokens after sign out:', left); if (left !== 0) errs.push('signing out should remove this device registration');
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
