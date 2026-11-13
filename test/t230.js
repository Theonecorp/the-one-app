/* v0.8.204 시험 — 📧 앱을 안 닫고 다음 날 넣은 수금도 Daily Report 에 (2026-11-13 관리자: "세일즈맨이 주문 확인 뒤 수금 입력에서 넣은 수금이 Daily Report 에 안 나옴")
 *   원인: 오늘 내역의 날짜(TODAY_D)가 앱을 처음 연 날로 멈춰 있어서, 폰에서 앱을 켜 둔 채 다음 날 넣은 수금이 "오늘"도 "지난 건"도 아니어서 빠졌음
 *   ① 어제 앱을 엶 → 오늘이 됨 → 오늘 넣은 수금(아직 안 보냄)이 📋 오늘 내역 · 📧 전송 대상에 나옴
 *   ② 다른 날짜를 보고 있어도 안 보낸 수금은 날짜 상관없이 전송 대상 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8916', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ds = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const now = new Date(), td = ds(now), yd = ds(new Date(now - 864e5));
  const pg = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.clock.install({ time: new Date(yd + 'T10:00:00') });
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' };
    window.__AFTER_SEED__ = s => { s.entries.push({ id: 'NEXTDAY', d: o.td, ym: o.td.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'NEXT DAY STORE', addr: '', pays: [{ m: 'CHECK', ref: '7001', amt: 250, dep: o.td, mob: false }], invs: [{ no: 'A10055', t: 'A', amt: 250 }], total: 250, invTotal: 250, sb: false, rc: false, v: false, vn: '', settled: '', void: false, rep: false, createdBy: 'brandon@x.com', createdAt: o.td + 'T20:00:00Z' }); }; }, { td });
  await pg.goto('http://127.0.0.1:8916/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/mine'; }); await pg.waitForSelector('#btnSend', { timeout: 8000 }); await pg.waitForTimeout(500);
  /* ① 하루가 지남 (앱은 그대로) */
  await pg.clock.setSystemTime(new Date(td + 'T10:00:00'));
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(600); await pg.evaluate(() => { location.hash = '#/mine'; }); await pg.waitForSelector('#btnSend', { timeout: 8000 }); await pg.waitForTimeout(600);
  let page = (await pg.textContent('#hubBody')).replace(/\s+/g, ' '), prev = (await pg.textContent('#rPreview')).replace(/\s+/g, ' ');
  log('① next day:', /NEXT DAY STORE/.test(page), prev.slice(0, 60));
  if (!/NEXT DAY STORE/.test(page) || !/1건/.test(prev)) errs.push('① today\'s unsent entry shows after the day changes');
  /* ② 어제 날짜를 골라도 안 보낸 것은 전송 대상 */
  await pg.fill('#rDate', yd); await pg.dispatchEvent('#rDate', 'change'); await pg.waitForTimeout(600);
  prev = (await pg.textContent('#rPreview')).replace(/\s+/g, ' '); log('② other day:', prev.slice(0, 60));
  if (!/1건/.test(prev)) errs.push('② unsent entries are always in the report');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
