/* v0.8.243 시험 — 🏠 홈 = 내 역할의 대시보드 · 회계 담당 대시보드 (2026-11-14 관리자: "모든 화면에서 홈을 누르면 각자의 대시보드 · 회계도 대시보드 · 지금 홈은 '회계' 로")
 *   ① 관리자: 주문 목록 위 탭의 🏠 홈 · 머리띠 로고 → 관리자 대시보드(#/own) (예전: 담당자 홈으로 감)
 *   ② 오피스 매니저: 같은 🏠 홈 → 담당자 대시보드(#/shome)
 *   ③ 회계 담당: 처음 화면 = 회계 대시보드(#/adash) — 숫자 4칸(① 접수 확인 대기 · ② 체크 수령 대기 · 금액 다름 · 오늘 들어온 수금) · 할 일 · 빠른 작업 · 세일즈맨별 대기
 *      아래 메뉴: 🏠 홈(adash) 다음에 💵 회계(#/verify · 예전 홈) · 서랍 메인에 홈 · 숫자 칸 ① 을 누르면 수금 확인이 ① 칸으로 · 다른 화면에서 로고 → 다시 대시보드 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8974', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const admin = require('fs').readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8').match(/ADMIN_EMAILS\s*=\s*\[\s*'([^']+)'/)[1];
  const open = async (email, job, w) => { const pg = await (await br.newContext({ viewport: { width: w || 430, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.job) window.__AFTER_SEED__ = s => { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; }; }, { email, job });
    await pg.goto('http://127.0.0.1:8974/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(700); return pg; };
  const hash = pg => pg.evaluate(() => location.hash);
  const toList = async pg => { await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800); await pg.evaluate(() => document.querySelectorAll('.hgrp').forEach(g => g.classList.add('open'))); await pg.click('[data-hg="pick"]'); await pg.waitForTimeout(800); };
  /* ① 관리자 */
  let pg = await open(admin, ''); const h0 = await hash(pg); log('① admin start:', h0);
  await toList(pg); if (!(await pg.$('.omenu [data-lf="home"]'))) errs.push('① admin sees the staff tab bar in the order list'); else { await pg.click('.omenu [data-lf="home"]'); await pg.waitForTimeout(800); const h = await hash(pg); log('① admin home chip →', h); if (h !== '#/own') errs.push('① admin 🏠 → admin dashboard #/own (got ' + h + ')'); }
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForTimeout(600); await pg.click('header .hlogo'); await pg.waitForTimeout(700); if ((await hash(pg)) !== '#/own') errs.push('① admin logo → #/own (got ' + (await hash(pg)) + ')');
  await pg.context().close();
  /* ② 오피스 매니저 */
  pg = await open('office@theonefl.com', 'office'); await toList(pg); await pg.click('.omenu [data-lf="home"]'); await pg.waitForTimeout(800); let h = await hash(pg); log('② office home chip →', h);
  if (!/^#\/(shome|order)$/.test(h) || !(await pg.$('#page .wd-hd'))) errs.push('② office 🏠 → staff dashboard (got ' + h + ')');
  await pg.context().close();
  /* ③ 회계 담당 */
  for (const w of [430, 1440]) {
    pg = await open('acct@example.com', 'acct', w); await pg.waitForSelector('#adash .wd-kpi', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(600);
    const A = await pg.evaluate(() => ({ hash: location.hash, nav: [...document.querySelectorAll('#nav button[data-go]')].map(b => b.dataset.go + ':' + b.textContent.trim().replace(/\s+/g, ' ')), kpi: [...document.querySelectorAll('#adash .wd-kpi')].map(k => k.dataset.ak + '=' + (k.querySelector('b') || {}).textContent),
      al: [...document.querySelectorAll('#adAl [data-aa]')].map(b => b.dataset.aa), qa: [...document.querySelectorAll('#adash [data-ag]')].map(b => b.dataset.ag), sm: [...document.querySelectorAll('#adSm [data-asm]')].length,
      drawer: [...document.querySelectorAll('#drawer [data-dgo]')].map(b => b.dataset.dgo) }));
    log('③', w, JSON.stringify(A));
    if (A.hash !== '#/adash') errs.push('③ ' + w + ': accounting starts on #/adash (got ' + A.hash + ')');
    if (A.kpi.length !== 4 || A.kpi.some(k => /…|—/.test(k))) errs.push('③ ' + w + ': 4 numbers filled (' + A.kpi.join() + ')');
    if (!A.al.length) errs.push('③ ' + w + ': to-do list shows what to do'); if (A.qa.length < 6) errs.push('③ ' + w + ': quick actions');
    if (!A.sm) errs.push('③ ' + w + ': waiting by salesman table');
    if (w === 430) { if (!/^adash:/.test(A.nav[0] || '') || !/^verify:.*회계/.test(A.nav[1] || '')) errs.push('③ bottom menu: 🏠 홈(adash) then 💵 회계(verify) — ' + A.nav.join(' | ')); }
    else if (!A.drawer.includes('adash')) errs.push('③ drawer main group has the accounting home');
    if (w === 430) {
      await pg.click('#adash [data-ak="verify/todo"]'); await pg.waitForTimeout(1200); h = await hash(pg); const on = await pg.evaluate(() => { const b = [...document.querySelectorAll('.vkpi [data-vf], .vkpi > div')].find(x => x.classList.contains('on')); return b ? b.textContent.replace(/\s+/g, ' ').trim() : ''; });
      log('③ ① card →', h, on); if (h !== '#/verify') errs.push('③ tapping ① opens 수금 확인 (got ' + h + ')'); if (on && !/접수/.test(on)) errs.push('③ ... filtered to ① (' + on + ')');
      await pg.click('header .hlogo'); await pg.waitForTimeout(800); if ((await hash(pg)) !== '#/adash') errs.push('③ logo → accounting dashboard');
    }
    await pg.context().close();
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
