/* v0.8.204 시험 — 📌 수금 확인 맨 위 숫자 칸(① 접수 확인 대기 · ② 체크 수령 대기 · 차액 · 오늘 수금)이 스크롤해도 위에 붙음 (2026-11-13 관리자)
 *   ① 넓은 화면 · 폰 모두: 아래로 많이 내려도 숫자 칸이 화면 위(머리 바로 아래)에 보이고 · 누르면 그 목록으로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8913', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  for (const w of [1400, 420]) {
    const pg = await (await br.newContext({ viewport: { width: w, height: 700 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { const d = new Date().toISOString().substring(0, 10); for (let i = 0; i < 40; i++) s.entries.push({ id: 'VK' + i, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'STORE ' + i, pays: [{ m: 'CHECK', ref: String(9000 + i), amt: 10 }], invs: [], total: 10, sb: false, rc: false, v: false, settled: '', void: false, createdAt: d }); }; });
    await pg.goto('http://127.0.0.1:8913/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/verify'; }); await pg.waitForSelector('.vkpi', { timeout: 8000 }); await pg.waitForTimeout(500);
    await pg.evaluate(() => window.scrollTo(0, 3000)); await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => { const k = document.querySelector('.vkpi').getBoundingClientRect(); return { top: Math.round(k.top), bottom: Math.round(k.bottom), scrolled: Math.round(window.scrollY) }; });
    log(w + 'px after scroll:', JSON.stringify(r));
    if (r.scrolled < 300) errs.push(w + 'px page should scroll in the test');
    if (r.top < 0 || r.top > 160) errs.push(w + 'px KPI bar stays near the top while scrolling');
    await pg.click('.vkpi [data-vf="wait"]'); await pg.waitForTimeout(400); const on = await pg.$eval('.vkpi [data-vf="wait"]', x => x.classList.contains('on')).catch(() => false); if (!on) errs.push(w + 'px tapping a sticky tile still switches the list');
    await pg.close();
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
