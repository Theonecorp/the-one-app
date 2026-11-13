/* v0.8.214 시험 — ⚙️ 설정 화면에서 👤 사용자 만들기 · 사용자 관리 (관리자만) — 관리 화면의 사용자 창을 그대로 씀
 *   ① 관리자 · #/settings → "사용자" 묶음 · [사용자 만들기] · [사용자 관리]
 *   ② 사용자 만들기 → 같은 창(이메일 · 이름 · 역할) → 저장 → users/{이메일} 생김 · 설정 화면 그대로 (오류 없음)
 *   ③ 사용자 관리 → #/admin/users (목록에 새 사용자)
 *   ④ 세일즈맨 · #/settings → "사용자" 묶음 없음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8953', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async email => { const ctx = await br.newContext({ viewport: { width: 1440, height: 1000 } }); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o, name: 'X' }; }, email); await pg.goto('http://127.0.0.1:8953/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① */
  let pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/settings'; }); await pg.waitForSelector('.stpage', { timeout: 8000 });
  if (!(await pg.$('#stUserNew')) || !(await pg.$('#stUsers'))) errs.push('① admin sees Create user · Manage users in Settings');
  /* ② */
  await pg.click('#stUserNew'); await pg.waitForSelector('#uEmail', { timeout: 4000 }).catch(() => errs.push('② user form opens'));
  await pg.fill('#uEmail', 'novo.funcionario@theonefl.com'); await pg.fill('#uName', 'NOVO TESTE');
  await pg.click('#uSave'); await pg.waitForTimeout(1200);
  const u = await pg.evaluate(() => (window.__MOCK_STORE__.users || {})['novo.funcionario@theonefl.com'] || null);
  log('② saved:', JSON.stringify(u && { name: u.name, role: u.role }));
  if (!u || u.name !== 'NOVO TESTE') errs.push('② users/{email} created');
  if (!(await pg.$('.stpage'))) errs.push('② stays on Settings after saving');
  /* ③ */
  await pg.click('#stUsers'); await pg.waitForTimeout(1500);
  const h = await pg.evaluate(() => location.hash); const txt = await pg.evaluate(() => document.getElementById('page').innerText);
  if (!/#\/admin\/users/.test(h) || !/novo\.funcionario@theonefl\.com|NOVO TESTE/.test(txt)) errs.push('③ Manage users opens the users list with the new user :: ' + h);
  await pg.context().close();
  /* ④ */
  pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/settings'; }); await pg.waitForSelector('.stpage', { timeout: 8000 }).catch(() => {});
  if (await pg.$('#stUserNew')) errs.push('④ salesman does not see Create user');
  await pg.context().close();
  log(errs.length ? 'FAIL' : 'PASS'); if (errs.length) console.log(errs);
  await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
