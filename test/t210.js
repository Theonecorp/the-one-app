/* v0.8.194 시험 — 👥 한 사람에게 일 여럿 (users.job2 · 2026-11-12 관리자: "Pick & 출고가 같이 되도록")
 *   ① 관리 → 사용자: 담당자 · 일 "창고 직원" + 👥 같이 하는 일 "출고 · 인보이스" → users 문서 job pick · job2 [pickinv] · 목록에 "창고 직원 + 출고 · 인보이스"
 *   ② 그 사람으로 로그인: 피킹 끝난 주문에 🧾 인보이스 발행 단추가 보임 (출고 · 인보이스의 일) · 작업 완료 단추도 (창고 직원의 일) · 위 이름표에 두 일
 *   ③ 같이 하는 일이 없는 창고 직원은 인보이스 발행 단추가 없음
 *   ④ 주된 일을 같이 하는 일과 같게 고르면 같이 하는 일에서 빠짐 (겹치지 않게) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8880', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, seed) => { const pg = await (await br.newContext({ viewport: { width: 1000, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed });
    await pg.goto('http://127.0.0.1:8880/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① */
  const ad = await open('luke@theonefl.com', '');
  await ad.evaluate(() => { location.hash = '#/admin/users'; }); await ad.waitForSelector('#uNew', { timeout: 8000 });
  await ad.click('#uNew'); await ad.waitForTimeout(200);
  await ad.fill('#uEmail', 'wh2@x.com'); await ad.fill('#uName', 'WH2');
  await ad.click('[data-ur="manager"]'); await ad.waitForTimeout(200);
  await ad.click('[data-uj="pick"]'); await ad.waitForTimeout(150);
  if (!(await ad.$('[data-uj2="pickinv"]'))) errs.push('① "also does" chips appear');
  if (await ad.$('[data-uj2="pick"]')) errs.push('① the main job is not offered again');
  await ad.click('[data-uj2="pickinv"]'); await ad.waitForTimeout(100);
  /* ④ 주된 일을 pickinv 로 바꾸면 같이 하는 일에서 빠짐 → 다시 pick 으로 */
  await ad.click('[data-uj="pickinv"]'); await ad.waitForTimeout(100); if (await ad.$('[data-uj2="pickinv"]')) errs.push('④ the main job leaves the "also does" list');
  await ad.click('[data-uj="pick"]'); await ad.waitForTimeout(100); await ad.click('[data-uj2="pickinv"]'); await ad.waitForTimeout(100);
  await ad.click('#uSave'); await ad.waitForTimeout(900);
  const u = await ad.evaluate(() => { const d = window.__MOCK_STORE__.users['wh2@x.com']; return d && { role: d.role, job: d.job, job2: d.job2 }; }); log('① saved:', JSON.stringify(u));
  if (!u || u.role !== 'manager' || u.job !== 'pick' || JSON.stringify(u.job2) !== '["pickinv"]') errs.push('① users doc job pick · job2 [pickinv]');
  const row = (await ad.textContent('#adminBody')).replace(/\s+/g, ' '); if (!/창고 직원 \+ 출고/.test(row)) errs.push('① users list shows both jobs');
  /* ② ③ */
  const SEED = j2 => "s.users.push({ id: 'wh2@x.com', email: 'wh2@x.com', name: 'WH2', role: 'manager', job: 'pick'" + (j2 ? ", job2: ['pickinv']" : '') + ", active: true }); Object.assign(s.orders[0], { st: 'picked', picker: 'wh2@x.com', pickerName: 'WH2', cfOk: true });";
  const a = await open('wh2@x.com', SEED(true));
  const who = await a.textContent('#hWho'); log('② name tag:', who); if (!/창고 직원/.test(who) || !/출고/.test(who)) errs.push('② name tag shows both jobs');
  await a.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await a.waitForTimeout(1800);
  const hasInv = !!(await a.$('#mInv')); log('② invoice button (pick + pickinv):', hasInv); if (!hasInv) errs.push('② picked order shows 🧾 Issue invoice for pick + pickinv');
  const b = await open('wh2@x.com', SEED(false));
  await b.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await b.waitForTimeout(1800);
  const hasInvB = !!(await b.$('#mInv')); log('③ invoice button (pick only):', hasInvB); if (hasInvB) errs.push('③ plain warehouse staff has no invoice button');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
