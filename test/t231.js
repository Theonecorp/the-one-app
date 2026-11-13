/* v0.8.206 시험 — 🧮 AR 인보이스 대조 (2026-11-13 관리자: "예전 시스템에서 최근 인보이스까지 모두 넣었어 — AR 을 인보이스 날짜로부터 · 크로스 체크")
 *   archeck.crossCheck: AR 파일(기준일) ↔ 옛 시스템 인보이스(st · bal) ↔ 그 뒤 앱 수금
 *   ① 둘 다 미결 · 같은 금액 → ok · 새 AR = 옛 잔액
 *   ② 둘 다 미결 · 금액 다름 → diff (옛 시스템 잔액이 새 AR)
 *   ③ 파일엔 미결 · 옛 시스템 완납 → paid · 새 AR 0
 *   ④ 파일엔 있는데 인보이스 자료 없음 → noinv
 *   ⑤ 옛 시스템 미결 · 파일에 없음(기준일 전) → extra · 기준일 뒤 발행 → new
 *   ⑥ 옛 자료 끝(cut) 뒤 앱 수금은 새 AR 에서 뺌 · 그 전 수금은 안 뺌(옛 잔액에 이미 들어감) · 나이는 인보이스 날짜부터
 *   ⑦ 화면: 💰 미수금 → 🧮 인보이스 대조 칸에 숫자 · 분류 칩 · 세일즈맨 표 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8943', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 1300, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
    window.__AFTER_SEED__ = s => { const L = (no, d, bal, st, sm, acct) => ({ id: no, no, d, t: no[0], total: bal || 100, bal, st, src: 'legacy', sm: sm || 'BRANDON', acct: acct || '1111', store: 'S ' + acct }); s.invoices = (s.invoices || []).concat([L('A-010021', '2026-01-01', 1500, 'open'), L('A-010055', '2026-01-02', 700, 'open'), L('A-010030', '2026-01-03', 0, 'paid'), L('A-077777', '2026-01-04', 300, 'open', 'ALEX', '3001')]); }; });
  await pg.goto('http://127.0.0.1:8943/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const R = await pg.evaluate(async () => {
    const M = await import('/src/archeck.js');
    const file = { asOf: '2026-11-07', stores: [{ acct: '1', store: 'A', sm: 'X', invs: [{ inv: 'A1', d: '2026-10-01', bal: 100 }, { inv: 'A2', d: '2026-09-01', bal: 200 }, { inv: 'A3', d: '2026-08-01', bal: 300 }, { inv: 'CM-9', d: '2026-08-01', bal: -50 }] }] };
    const L = (no, d, bal, st) => ({ no, d, bal, st, src: 'legacy', sm: 'X', acct: '1', total: bal || 1 });
    const open = [L('A-000001', '2026-10-01', 100, 'open'), L('A-000002', '2026-09-01', 150, 'open'), L('A-000005', '2026-07-01', 80, 'open'), L('A-000006', '2026-11-10', 90, 'open'), L('A-000007', '2026-11-12', 500, 'open')];
    const closed = [L('A-000003', '2026-08-01', 0, 'paid')];
    const pays = [{ id: 'p1', d: '2026-11-13', invs: [{ no: 'A-000007', amt: 200 }] }, { id: 'p2', d: '2026-11-11', invs: [{ no: 'A-000002', amt: 50 }] }];
    const r = M.crossCheck(file, open, closed, pays, '2026-11-13'); const by = {}; r.rows.forEach(x => by[x.no] = x);
    return { cut: r.cut, cat: Object.fromEntries(r.rows.map(x => [x.no, x.cat])), nb: Object.fromEntries(r.rows.map(x => [x.no, x.newBal])), age: r.tot.age, now: r.tot.now };
  });
  log(JSON.stringify(R));
  const c = R.cat, n = R.nb;
  if (c['A-000001'] !== 'ok' || n['A-000001'] !== 100) errs.push('① same → ok');
  if (c['A-000002'] !== 'diff' || n['A-000002'] !== 150) errs.push('② different → diff, legacy balance (payment before cut not deducted)');
  if (c['A-000003'] !== 'paid' || n['A-000003'] !== 0) errs.push('③ paid in old system');
  if (c['CM-000009'] !== 'noinv') errs.push('④ no invoice record');
  if (c['A-000005'] !== 'extra' || c['A-000006'] !== 'new') errs.push('⑤ extra / new');
  if (R.cut !== '2026-11-12' || n['A-000007'] !== 300) errs.push('⑥ app payment after the cut is deducted');
  if (JSON.stringify(R.age) !== '[390,100,150,0,80]') errs.push('⑥ aging from invoice date (0-30 · 31-60 · 61-90 · 91-120 · 120+)');
  /* ⑦ */
  await pg.evaluate(() => { location.hash = '#/bossar'; }); await pg.waitForSelector('[data-av="chk"]', { timeout: 8000 }); await pg.click('[data-av="chk"]'); await pg.waitForSelector('#ckBox [data-ckc]', { timeout: 8000 }); await pg.waitForTimeout(400);
  const ui = (await pg.textContent('#ckBox')).replace(/\s+/g, ' '); log('⑦', ui.slice(0, 260));
  if (!/인보이스 대조/.test(ui) || !/새 AR/.test(ui) || !/BRANDON/.test(ui)) errs.push('⑦ check view renders with totals and salesman table');
  await pg.click('[data-ckc="paid"]'); await pg.waitForTimeout(300); if (!/A-010030/.test(await pg.textContent('#ckBox'))) errs.push('⑦ paid chip lists A-010030');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
