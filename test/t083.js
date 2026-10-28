/* 전체 점검 — 모든 역할 × 아래 메뉴 전부 열어 보기: 페이지 오류 · 빈 화면 · "읽는 중" 에 멈춤 · 권한 안내만 뜨는 화면 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8819', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const ROLES = [['luke@theonefl.com', 'admin', ''], ['own@x.com', 'owner', ''], ['brandon@x.com', 'salesman', ''], ['acct@theonefl.com', 'manager', 'office'], ['acct@theonefl.com', 'manager', 'acct'], ['acct@theonefl.com', 'manager', 'pickinv'], ['acct@theonefl.com', 'manager', 'invoice'], ['acct@theonefl.com', 'manager', 'whmgr'], ['acct@theonefl.com', 'manager', 'pick'], ['acct@theonefl.com', 'manager', 'catalog']];
  const bad = [];
  for (const [email, role, job] of ROLES) {
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 160)));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'T' }; window.__AFTER_SEED__ = s => { if (o.role === 'owner') s.users.push({ id: o.email, email: o.email, name: 'Owner', role: 'owner', active: true }); s.users.forEach(u => { if (u.email === o.email && o.job) u.job = o.job; }); }; }, { email, role, job });
    pg.on('dialog', d => d.accept());
    await pg.goto('http://127.0.0.1:8819/test/demo.html'); const okNav = await pg.waitForSelector('#nav button', { timeout: 8000 }).then(() => true).catch(() => false);
    if (!okNav) { bad.push(role + (job ? '/' + job : '') + ': nav never appeared · ' + ((await pg.textContent('body')) || '').replace(/\s+/g, ' ').slice(0, 120)); await pg.close(); continue; }
    const navs = await pg.$$eval('#nav button', b => b.map(x => x.dataset.go));
    const lines = [];
    for (const go of navs) {
      errs.length = 0;
      await pg.evaluate(g => { location.hash = '#/' + g; }, go); await pg.waitForTimeout(1600);
      const t = ((await pg.textContent('#page').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const stuck = /읽는 중|Loading/.test(t) && t.length < 60, empty = t.length < 10, denied = /만 쓰는 화면|only|권한이 없|접근할 수 없/.test(t) && t.length < 120;
      if (errs.length || stuck || empty || denied) bad.push(role + (job ? '/' + job : '') + ' #/' + go + ': ' + (errs.length ? 'ERROR ' + errs.join(' | ') : stuck ? 'STUCK loading' : empty ? 'EMPTY' : 'DENIED') + ' · ' + t.slice(0, 100));
      lines.push(go + (errs.length ? '✗' : '✓'));
    }
    console.log(role + (job ? '/' + job : ''), lines.join(' '));
    await pg.close();
  }
  await br.close(); srv.kill();
  console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'PASS'); process.exit(bad.length ? 1 : 0);
})();
