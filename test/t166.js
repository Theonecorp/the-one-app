/* v0.8.175 시험 — 🔒 Item Master 엑셀 "전체 바꾸기" 는 관리자만 (2026-11-09 디자인 담당이 옛 파일로 올려 관리자 분류 작업 · 세트 코드 · 새 아이템이 통째로 되돌아간 일)
 *   ① 디자인 · 카탈로그 담당(catalog job): 📥 올리기 탭에 SmartBee 맞추기(#sbFile) · Item Master(#catFile) 파일 칸이 없고 🔒 안내만 · 🗂 분류 탭도 없음
 *   ② 관리자: #catFile 이 있음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8831', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, job) => { const pg = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.job) window.__AFTER_SEED__ = s => { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; }; }, { email, job });
    await pg.goto('http://127.0.0.1:8831/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300);
    await pg.evaluate(() => { location.hash = '#/catmg/cat'; }); await pg.waitForSelector('#sbFile, #catFile, .none', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(500); return pg; };
  const jn = await open('jenny@theonefl.com', 'catalog');
  const a = await jn.evaluate(() => ({ sb: !!document.getElementById('sbFile'), cat: !!document.getElementById('catFile'), lock: /관리자만 올릴 수 있습니다/.test(document.body.textContent) })); log('① catalog job:', JSON.stringify(a));
  if (a.sb) errs.push('① catalog job must not get the SmartBee bulk sync either'); if (await jn.$('[data-ct2="tree"]')) errs.push('① catalog job must not see the 🗂 분류 tab'); if (a.cat) errs.push('① catalog job must not get the Item Master full-replace upload'); if (!a.lock) errs.push('① the admin-only notice is shown');
  await jn.context().close();
  const ad = await open('luke@theonefl.com', '');
  const b = await ad.evaluate(() => ({ sb: !!document.getElementById('sbFile'), cat: !!document.getElementById('catFile') })); log('② admin:', JSON.stringify(b));
  if (!b.cat || !b.sb) errs.push('② admin has both uploads');
  await ad.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
