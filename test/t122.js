/* v0.8.158 시험 — 관리자 이메일의 사용자 문서가 role 'salesman' 으로 덮어써져도 로그인하면 관리자로 되돌아옴
 *   ① 서버 경로(폰 캐시 없음): 문서 role salesman → 로그인 뒤 역할 admin · users 문서도 admin 으로 고쳐짐 · 모드 바꾸기에 관리자 단추
 *   ② 빠른 시작 경로(폰 캐시 theone.boot.*에 salesman 으로 남아 있음): 서버 비교 뒤 똑같이 admin 으로 복구 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8876', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch();
  const errs = [], log = (...a) => console.log(...a);
  const seed = s => { const u = s.users.find(x => x.id === 'luke@theonefl.com'); u.role = 'salesman'; u.sm = 'LUKE'; u.active = true; };
  const check = async (pg, tag) => {
    await pg.waitForSelector('#nav button', { timeout: 15000 }); await pg.waitForTimeout(1200);
    const doc = await pg.evaluate(() => window.__MOCK_STORE__.users['luke@theonefl.com']);
    log(tag, 'users doc:', doc.role, doc.active, doc.sm);
    if (doc.role !== 'admin' || doc.active !== true) errs.push(tag + ': users doc should be healed to admin/active');
    if (doc.sm !== 'LUKE') errs.push(tag + ': salesman code must be kept');
    await pg.evaluate(() => { location.hash = '#/settings'; }); await pg.waitForSelector('.stpage', { timeout: 5000 });
    const roles = await pg.$$eval('.stpage [data-r]', L => L.map(b => b.dataset.r));
    log(tag, 'switchable views:', roles.join(','));
    if (!roles.includes('admin')) errs.push(tag + ': drawer should offer the admin view');
    await pg.click('#hMenu'); await pg.waitForTimeout(300);
    const who = await pg.textContent('#drawer .dwho').catch(() => ''); log(tag, 'who:', who.replace(/\s+/g, ' ').slice(0, 60));
  };
  /* ① 서버 경로 */
  const pg = await br.newPage({ viewport: { width: 420, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(f => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f); }, '(' + seed.toString() + ')(s)');
  await pg.goto('http://127.0.0.1:8876/test/demo.html'); await check(pg, '① server');
  /* ② 빠른 시작 경로 — 폰 캐시에 salesman 으로 남아 있음 */
  const pg2 = await br.newPage({ viewport: { width: 420, height: 900 } }); pg2.on('pageerror', e => errs.push(e.message)); pg2.on('dialog', d => d.accept());
  await pg2.addInitScript(f => {
    window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f);
    localStorage.setItem('theone.boot.luke@theonefl.com', JSON.stringify({ me: { id: 'luke@theonefl.com', email: 'luke@theonefl.com', name: 'X', role: 'salesman', sm: 'LUKE', active: true }, sms: [{ code: 'LUKE', name: 'LUKE', active: true }], settings: { accountsVer: '0' }, at: Date.now() }));
    localStorage.removeItem('theone.view.luke@theonefl.com');
  }, '(' + seed.toString() + ')(s)');
  await pg2.goto('http://127.0.0.1:8876/test/demo.html'); await check(pg2, '② cached');
  const role2 = await pg2.evaluate(() => document.querySelector('.stpage [data-r].on') ? document.querySelector('.stpage [data-r].on').dataset.r : '');
  log('② current view after heal:', role2 || '(not marked)');
  await pg2.screenshot({ path: path.resolve(__dirname, 'out', 'admin_heal.png') });
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
