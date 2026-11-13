/* v0.8.235 시험 — 🖨 관리 → 사용자에서 프린터 에이전트 계정을 만들 수 있음 (담당자 · 일 "프린터 에이전트" · job agente)
 *   ① 관리자: 담당자 → 일 "🖨 프린터 에이전트" 단추가 있음 → 고르면 👥 같이 하는 일에 에이전트가 없고 · 저장하면 users 문서 role manager · job agente · job2 []
 *   ② 목록에 "프린터 에이전트"
 *   ③ 다른 일의 👥 같이 하는 일에는 에이전트가 없음
 *   ④ 그 계정으로 열면 서랍에 홈만 · 주문 화면에 인보이스 · 피킹 단추 없음 (사람이 쓰는 화면을 열지 않음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8997', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, seed) => { const pg = await (await br.newContext({ viewport: { width: 1000, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed });
    await pg.goto('http://127.0.0.1:8997/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① ② ③ */
  const ad = await open('luke@theonefl.com', '');
  await ad.evaluate(() => { location.hash = '#/admin/users'; }); await ad.waitForSelector('#uNew', { timeout: 8000 });
  await ad.click('#uNew'); await ad.waitForTimeout(200);
  await ad.fill('#uEmail', 'impressora@x.com'); await ad.fill('#uName', 'Impressora');
  await ad.click('[data-ur="manager"]'); await ad.waitForTimeout(200);
  if (!(await ad.$('[data-uj="agente"]'))) errs.push('① job button "print agent" exists');
  await ad.click('[data-uj="whmgr"]'); await ad.waitForTimeout(150);
  if (await ad.$('[data-uj2="agente"]')) errs.push('③ print agent is not offered as "also does"');
  await ad.click('[data-uj2="pickinv"]'); await ad.waitForTimeout(100);
  await ad.click('[data-uj="agente"]'); await ad.waitForTimeout(150);
  await ad.click('#uSave'); await ad.waitForTimeout(900);
  const u = await ad.evaluate(() => { const d = window.__MOCK_STORE__.users['impressora@x.com']; return d && { role: d.role, job: d.job, job2: d.job2 }; }); log('① saved:', JSON.stringify(u));
  if (!u || u.role !== 'manager' || u.job !== 'agente' || JSON.stringify(u.job2) !== '[]') errs.push('① users doc role manager · job agente · job2 []');
  const row = (await ad.textContent('#adminBody')).replace(/\s+/g, ' '); if (!/프린터 에이전트/.test(row)) errs.push('② users list shows print agent');
  /* ④ */
  const a = await open('impressora@x.com', "s.users.push({ id: 'impressora@x.com', email: 'impressora@x.com', name: 'Impressora', role: 'manager', job: 'agente', active: true }); Object.assign(s.orders[0], { st: 'picked', cfOk: true });");
  const nav = await a.$$eval('#nav button[data-r], #nav button', b => b.map(x => x.textContent.trim()).filter(Boolean)); log('④ nav:', JSON.stringify(nav));
  if (nav.some(t => /세일|재고|수금|조회|Sale|Stock/.test(t))) errs.push('④ agent account has only home in the drawer');
  await a.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await a.waitForTimeout(1800);
  if (await a.$('#mInv')) errs.push('④ agent account has no invoice button');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
