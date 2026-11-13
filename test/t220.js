/* v0.8.199 시험 — 📱 모바일 디파짓이 수금 확인 · 수금 수령(봉투) · 정산에서 보임 (2026-11-12 관리자: "수금확인, 수금 수령, 수금 정산에는 모바일 디파짓은 안 보이는 것 같은데")
 *   ① 수금 확인 목록 줄에 📱 모바일 디파짓 표시
 *   ② 정산 줄에 📱 표시 · 확정 창 걸리는 것이 "아직 회사로 안 보낸 체크"가 아니라 "📱 모바일 디파짓 — 은행 입금 확인 전"
 *   ③ 세일즈맨 📦 체크 보내기 목록의 그 체크에 📱 표시 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8904', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const d2 = new Date(Date.now() - 2 * 86400000), D = d2.getFullYear() + '-' + String(d2.getMonth() + 1).padStart(2, '0') + '-' + String(d2.getDate()).padStart(2, '0');
  const open = async (email) => { const pg = await (await br.newContext({ viewport: { width: 1200, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' };
      window.__AFTER_SEED__ = s => { s.entries.push({ id: 'E-MOB1', d: o.D, ym: o.D.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'MOBILE DEP STORE', addr: '', pays: [{ m: 'CHECK', ref: '5551', amt: 640, dep: o.D, mob: true }], invs: [{ no: 'A10091', t: 'A', amt: 640 }], total: 640, invTotal: 640, sb: false, rc: false, v: true, vn: '', settled: '', void: false, createdBy: 'brandon@x.com', createdAt: o.D, rep: true });
        s.entries.push({ id: 'E-MOB2', d: o.D, ym: o.D.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'MOBILE DEP TWO', addr: '', pays: [{ m: 'CHECK', ref: '5552', amt: 300, dep: o.D, mob: true }], invs: [{ no: 'A10092', t: 'A', amt: 300 }], total: 300, invTotal: 300, sb: true, rc: true, v: true, vn: '', settled: '', void: false, createdBy: 'brandon@x.com', createdAt: o.D, rep: true }); }; }, { email, D });
    await pg.goto('http://127.0.0.1:8904/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① */
  const a = await open('luke@theonefl.com');
  await a.evaluate(() => { location.hash = '#/verify'; }); await a.waitForSelector('[data-vid="E-MOB1"]', { state: 'attached', timeout: 8000 }).catch(() => {});
  const r1 = await a.evaluate(() => { const r = document.querySelector('[data-vid="E-MOB1"]'); return r ? r.textContent.replace(/\s+/g, ' ') : ''; }); log('① verify row:', r1.slice(0, 120), await a.evaluate(() => [...document.querySelectorAll('[data-vid]')].map(x => x.dataset.vid).join(' ')));
  if (!/📱 모바일 디파짓/.test(r1)) errs.push('① verify row shows 📱 mobile deposit');
  /* ② */
  await a.evaluate(() => { location.hash = '#/pay'; }); await a.waitForSelector('#pOut .card', { timeout: 8000 });
  const from = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date(Date.now() - 20 * 86400000))), to = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date()));
  await a.fill('#pFrom', from); await a.dispatchEvent('#pFrom', 'change'); await a.waitForTimeout(300); await a.fill('#pTo', to); await a.dispatchEvent('#pTo', 'change'); await a.waitForTimeout(300);
  await a.selectOption('#pSm', 'BRANDON'); await a.waitForSelector('.pr.pl'); await a.waitForTimeout(600);
  const r2 = await a.evaluate(() => { const r = document.querySelector('[data-pl="f|E-MOB2"]'); return r ? r.textContent.replace(/\s+/g, ' ') : ''; }); log('② settlement line:', r2.slice(0, 100), await a.evaluate(() => [...document.querySelectorAll('[data-pl]')].map(x => x.dataset.pl).join(' ')));
  if (!/📱/.test(r2)) errs.push('② settlement line shows 📱');
  await a.click('#pAll'); await a.waitForTimeout(600); await a.click('#pConfirm'); await a.waitForSelector('#cfGo');
  const m = (await a.textContent('#mbox')).replace(/\s+/g, ' '); log('② confirm has mobdep:', /📱 모바일 디파짓 — 은행 입금 확인 전/.test(m));
  if (!/📱 모바일 디파짓 — 은행 입금 확인 전/.test(m)) errs.push('② blocker labelled as mobile deposit (bank check), not "not sent"');
  /* ③ */
  const b = await open('brandon@x.com');
  await b.evaluate(() => { location.hash = '#/send'; }); await b.waitForTimeout(1800);
  const r3 = await b.evaluate(() => { const L = [...document.querySelectorAll('#page .pr')].map(x => x.textContent.replace(/\s+/g, ' ')).filter(t => /MOBILE DEP STORE/.test(t)); return L.join(' | '); }); log('③ send list:', r3.slice(0, 120));
  if (!/📱/.test(r3)) errs.push('③ send-checks row shows 📱');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
