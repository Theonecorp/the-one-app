/* v0.8.121 시험 — ⚡ 빠른 시작: 서버가 느려도(읽기마다 0.7초) 두 번째부터는 폰에 둔 내 기록 · 설정 · 세일즈맨으로 바로 메뉴가 뜨고,
 *   경영 대시보드는 지난번 화면(📸)을 바로 보여 준 뒤 새 숫자로 바꿈 · 서버에서 역할이 바뀌면 뒤에서 반영 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8841', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
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
  /* 서버에서 역할이 바뀌면 — 뒤에서 반영 (관리자 → 오너로 바꿔 봄: 메뉴에 ⚙️ 관리 가 빠져야) */
  await b.pg.close();
  const c = await ctx.newPage(); c.on('pageerror', e => errs.push(e.message));
  await c.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = s => { s.users.forEach(u => { if (u.email === 'luke@theonefl.com') u.role = 'owner'; }); }; });
  await c.evaluate(() => {}).catch(() => {});
  await c.goto('http://127.0.0.1:8841/test/demo.html#/own'); await c.waitForSelector('#nav button');
  const nav1 = await c.$$eval('#nav button', b => b.map(x => x.dataset.go).join(' ')); await c.waitForTimeout(3500); const nav2 = await c.$$eval('#nav button', b => b.map(x => x.dataset.go).join(' '));
  log('nav (snapshot):', nav1); log('nav (after refresh):', nav2);
  if (!/admin/.test(nav1)) errs.push('snapshot nav should start as admin'); if (/\badmin\b/.test(nav2)) errs.push('role change on the server should update the menu');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
