/* v0.8.121 시험 — ⚡ 빠른 시작: 서버가 느려도(읽기마다 0.7초) 두 번째부터는 폰에 둔 내 기록 · 설정 · 세일즈맨으로 바로 메뉴가 뜨고,
 *   경영 대시보드는 지난번 화면(📸)을 바로 보여 준 뒤 새 숫자로 바꿈 · 서버에서 역할이 바뀌면 뒤에서 반영 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8841', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__MOCK_DELAY__ = 700; });
  const open = async (label) => {
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    const t0 = Date.now(); await pg.goto('http://127.0.0.1:8841/test/demo.html#/own'); await pg.waitForSelector('#nav button', { timeout: 20000 }); const tNav = Date.now() - t0;
    await pg.waitForFunction(() => /경영 대시보드/.test(document.getElementById('page').textContent), null, { timeout: 30000 }).catch(() => errs.push(label + ': dashboard never appeared')); const tDash = Date.now() - t0;
    const snapbar = await pg.$('.snapbar'); log(label, 'nav', tNav + 'ms', 'dashboard', tDash + 'ms', 'snapbar', !!snapbar);
    return { pg, tNav, tDash, snapbar: !!snapbar };
  };
  const a = await open('first'); await a.pg.waitForFunction(() => !document.querySelector('.snapbar') && /매출/.test(document.getElementById('page').textContent), null, { timeout: 30000 }).catch(() => {}); await a.pg.waitForTimeout(500);
  const keys = await a.pg.evaluate(() => Object.keys(localStorage).filter(k => /theone\.(boot|snap)\./.test(k))); log('saved:', keys);
  if (!keys.some(k => /theone\.boot\./.test(k)) || !keys.some(k => /theone\.snap\.own\./.test(k))) errs.push('boot snapshot and dashboard snapshot should be saved');
  await a.pg.close();
  const b = await open('second');
  if (b.tNav > a.tNav - 900) errs.push('second start should skip server round trips (first ' + a.tNav + 'ms, second ' + b.tNav + 'ms)');
  if (!b.snapbar) errs.push('dashboard should show the last view right away');
  if (b.tDash > 2500) errs.push('dashboard (snapshot) should appear quickly, took ' + b.tDash + 'ms');
  await b.pg.waitForFunction(() => !document.querySelector('.snapbar'), null, { timeout: 30000 }).catch(() => errs.push('fresh dashboard should replace the snapshot'));
  /* 서버에서 역할이 바뀌면 — 뒤에서 반영 (담당자 → 오너로 바꿔 봄: 메뉴에 경영(own) 이 들어와야)
   *   관리자 이메일(luke)은 v0.8.158 부터 역할이 지워져도 로그인 때 관리자로 되돌리므로, 역할 바뀜 시험은 담당자 계정으로 */
  await b.pg.close();
  const d = await ctx.newPage(); d.on('pageerror', e => errs.push(e.message));
  await d.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'A' }; });
  await d.goto('http://127.0.0.1:8841/test/demo.html'); await d.waitForSelector('#nav button', { state: 'attached' }); await d.waitForTimeout(2500); await d.close();   // 담당자 폰 캐시 만들기
  const c = await ctx.newPage(); c.on('pageerror', e => errs.push(e.message));
  await c.addInitScript(() => { window.__MOCK_USER__ = { email: 'acct@theonefl.com', name: 'A' }; window.__AFTER_SEED__ = s => { s.users.forEach(u => { if (u.email === 'acct@theonefl.com') u.role = 'owner'; }); }; });
  await c.goto('http://127.0.0.1:8841/test/demo.html'); await c.waitForSelector('#nav button', { state: 'attached' });
  const nav1 = await c.$$eval('#nav button', b => b.map(x => x.dataset.go).join(' ')); await c.waitForTimeout(3500); const nav2 = await c.$$eval('#nav button', b => b.map(x => x.dataset.go).join(' '));
  log('nav (snapshot):', nav1); log('nav (after refresh):', nav2);
  if (/\bown\b/.test(nav1)) errs.push('snapshot nav should start as the cached staff menu'); if (!/\bown\b/.test(nav2)) errs.push('role change on the server should update the menu');
  /* 관리자 이메일은 서버에서 역할이 바뀌어도(owner) 관리자로 되돌아옴 — t122 가 자세히 봄 */
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
