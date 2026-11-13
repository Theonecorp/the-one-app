/* v0.8.179 시험 — 🔔 알림 항상 켜짐 · ⏰ 안 보낸 주문 · 수금 팝업 (2026-11-10 관리자)
 *   ① 알림 켜기 단추가 없음 — 아직 안 물어본 기기는 처음 화면을 누를 때 자동으로 물어보고, 허락하면 이 기기를 등록(pushTokens)
 *      · ☰ 메뉴에는 "팝업 알림 항상 켜짐" (끄는 단추 없음)
 *   ② 알림이 막힌 기기는 홈에 허용하는 법 (🔕)
 *   ③ 관리 → 설정: ⏰ 팝업 시각 (기본 11, 15, 18) 저장 → settings.app.remindHours · 비우면 []
 *   ④ Apps Script remindUnsent_: 정한 시각에 1시간 넘은 임시 저장 주문 · 안 보낸 수금이 있는 세일즈맨에게 하나로 묶어 팝업 · 같은 시각에 두 번 안 보냄 · 일요일 · 다른 시각 · 1시간 안 된 것은 안 보냄 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), vm = require('vm');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8838', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  /* 헤드리스 브라우저의 알림 허락만 대신 (앱 로직은 그대로) — perm: 'default' 이면 물어볼 때 'granted' 로 답함 */
  const mk = async (email, perm, w) => { const ctx = await br.newContext({ viewport: { width: w || 430, height: 1000 } }); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(p => { try { window.__PERM__ = p; window.__ASKED__ = 0; Object.defineProperty(Notification, 'permission', { get: () => window.__PERM__ }); Notification.requestPermission = async () => { window.__ASKED__++; if (window.__PERM__ === 'default') window.__PERM__ = 'granted'; return window.__PERM__; }; if (!('PushManager' in window)) window.PushManager = function () {}; } catch (e) {} }, perm);
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o, name: 'X' }; }, email);
    await pg.goto('http://127.0.0.1:8838/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg; };
  /* ① */
  let pg = await mk('brandon@x.com', 'default');
  const btn = await pg.$('#hNotif'); if (btn) errs.push('① no "turn on notifications" button on home');
  await pg.waitForTimeout(4300);   // 로그인 4초 뒤 autoOn
  await pg.click('#page', { position: { x: 5, y: 5 } }).catch(() => {}); await pg.waitForTimeout(900);
  const r1 = await pg.evaluate(() => ({ asked: window.__ASKED__, perm: Notification.permission, toks: Object.values(window.__MOCK_STORE__.pushTokens || {}).map(t => t.email) }));
  log('① first tap:', JSON.stringify(r1)); if (r1.asked !== 1 || r1.toks.join() !== 'brandon@x.com') errs.push('① first tap asks once and registers this device');
  await pg.click('#page', { position: { x: 5, y: 5 } }).catch(() => {}); await pg.waitForTimeout(300);
  if ((await pg.evaluate(() => window.__ASKED__)) !== 1) errs.push('① asks only once');
  await pg.click('#hMenu'); await pg.click('#drawer [data-dgo="settings"]'); await pg.waitForSelector('.stpage #mPush'); const lab = (await pg.textContent('.stpage #mPush')).trim(); log('① drawer:', lab); if (!/항상 켜짐/.test(lab)) errs.push('① drawer shows pop-ups always on');
  await pg.context().close();
  /* ② 막힌 기기 */
  pg = await mk('brandon@x.com', 'denied');
  await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForTimeout(800);
  const blk = await pg.$eval('#notifBlocked', e => e.textContent).catch(() => ''); log('② blocked:', blk.slice(0, 60)); if (!/막혀/.test(blk)) errs.push('② blocked device shows how to allow notifications on home');
  await pg.context().close();
  /* ③ 관리 설정 */
  pg = await mk('luke@theonefl.com', 'granted', 1200);
  await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForSelector('#stRemind', { timeout: 8000 });
  const v0 = await pg.inputValue('#stRemind'); log('③ default:', v0); if (v0 !== '11, 15, 18') errs.push('③ default pop-up hours 11, 15, 18');
  await pg.fill('#stRemind', '17, 9, 9, 25'); await pg.click('#stSave'); await pg.waitForTimeout(700);
  const h1 = await pg.evaluate(() => window.__MOCK_STORE__.settings.app.remindHours); log('③ saved:', JSON.stringify(h1)); if (JSON.stringify(h1) !== '[9,17]') errs.push('③ saves sorted unique valid hours [9,17]');
  await pg.evaluate(() => { location.hash = '#/admin'; }); await pg.waitForTimeout(300); await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForSelector('#stRemind');
  await pg.fill('#stRemind', ''); await pg.click('#stSave'); await pg.waitForTimeout(700);
  const h2 = await pg.evaluate(() => window.__MOCK_STORE__.settings.app.remindHours); log('③ empty:', JSON.stringify(h2)); if (JSON.stringify(h2) !== '[]') errs.push('③ empty = off ([])');
  await pg.context().close();
  await br.close(); srv.kill();
  /* ④ Apps Script — 시각 · 데이터를 바꿔 가며 remindUnsent_ 를 돌림 */
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script/Code.gs'), 'utf8');
  const runAt = (nyDate, data, props) => {
    const sent = [], P = props || {};
    const ctx = { Logger: { log: () => {} }, console, Date,
      Utilities: { formatDate: (d, tz, f) => ({ H: String(nyDate.H), u: String(nyDate.u), m: String(nyDate.m || 2), 'yyyy-MM-dd': nyDate.day })[f] },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => P[k] || null, setProperty: (k, v) => { P[k] = v; }, deleteProperty: k => { delete P[k]; } }) } };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    ctx.getDoc_ = () => data.settings || {};
    ctx.queryVal_ = (col, f, v) => col === 'orders' ? data.orders.filter(o => o.st === v.stringValue) : data.entries.filter(e => e.rep === v.booleanValue);
    ctx.query_ = (col, f, v) => (data.users || []).filter(u => u.sm === v);
    ctx.pushTo_ = (to, title, body, url, tag) => { sent.push({ to: to.join(), title, body, url, tag }); return 1; };
    ctx.remindUnsent_(); return { sent, P };
  };
  const old = new Date(Date.now() - 3 * 3600000).toISOString(), fresh = new Date(Date.now() - 10 * 60000).toISOString();
  const data = { users: [{ sm: 'BRANDON', email: 'brandon@x.com' }, { sm: 'SOO', email: 'soo@x.com' }],
    orders: [{ st: 'draft', sm: 'BRANDON', store: 'ALI B/S # 1', amt: 120, updatedAt: old }, { st: 'draft', sm: 'SOO', store: 'NEW', amt: 50, updatedAt: fresh }, { st: 'sent', sm: 'SOO', store: 'X', amt: 9, updatedAt: old }],
    entries: [{ rep: false, sm: 'BRANDON', store: 'BEAUTY 4U', total: 300, createdAt: old }, { rep: false, sm: 'SOO', store: 'Y', total: 70, createdAt: old, sb: true }, { rep: false, sm: 'SOO', store: 'Z', total: 80, createdAt: old }] };
  let r = runAt({ H: 15, u: 4, day: '2026-11-12' }, data);
  log('④ 15:00 Thu:', JSON.stringify(r.sent.map(x => x.to + ' | ' + x.title + ' | ' + x.body.replace(/\n/g, ' / ') + ' | ' + x.url)));
  const b = r.sent.find(x => x.to === 'brandon@x.com'), s = r.sent.find(x => x.to === 'soo@x.com');
  if (r.sent.length !== 2 || !b || !/주문 1건 \$120\.00/.test(b.body) || !/수금 1건 \$300\.00/.test(b.body) || b.url !== './#/order') errs.push('④ BRANDON gets one pop-up with 1 unsent order and 1 unsent collection');
  if (!s || /주문/.test(s.body) || !/수금 1건 \$80\.00/.test(s.body) || s.url !== './#/mine') errs.push('④ SOO: fresh draft (<1h) and office-checked entry are skipped → only collection $80');
  const again = runAt({ H: 15, u: 4, day: '2026-11-12', m: 7 }, data, r.P); if (again.sent.length) errs.push('④ not twice in the same hour');
  if (runAt({ H: 15, u: 7, day: '2026-11-15' }, data).sent.length) errs.push('④ not on Sunday');
  if (runAt({ H: 15, u: 3, day: '2026-11-11' }, data).sent.length) errs.push('④ not on a holiday (Veterans Day · v0.8.180 영업일)');
  if (runAt({ H: 15, u: 6, day: '2026-11-14' }, data).sent.length) errs.push('④ not on Saturday (v0.8.180 영업일)');
  if (runAt({ H: 14, u: 4, day: '2026-11-12' }, data).sent.length) errs.push('④ not at other hours');
  if (runAt({ H: 9, u: 4, day: '2026-11-12' }, Object.assign({}, data, { settings: { remindHours: [9] } })).sent.length !== 2) errs.push('④ settings.remindHours changes the hours');
  if (runAt({ H: 15, u: 4, day: '2026-11-12' }, Object.assign({}, data, { settings: { remindHours: [] } })).sent.length) errs.push('④ empty remindHours = off');
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
