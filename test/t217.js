/* v0.8.198 시험 — 💰 커미션: 할인 20.01% 부터만 DISC(10%) — 10% · 15% · 20% 할인은 A(15%) (2026-11-12 관리자: "디스카운트 20.01% 이상부터 커미션 10% 인데 계산이 제대로 안 됨 · 엑셀 sumif 도")
 *   원인: 수금의 할인 칸은 % 숫자(10 · 20 · 25), 설정 discLimit 는 비율(0.20) — 그대로 비교해서 1% 넘는 할인은 모두 DISC 였음
 *   ① 할인 10 · 15 · 20 · 빈칸 · 0 → REG(A) · 20.01 · 25 · 40 → DISC · 0.25(비율로 적힌 값) → DISC
 *   ② 정산: $1,000 (10% 할인) + $1,000 (25% 할인) → A 기준 $1,000 × 15% = $150 · DISC 기준 $1,000 × 10% = $100
 *   ③ 정산 엑셀(stmtRows): DISC 구역 SUMIF 기준이 $1,000 (10% 할인 줄은 A) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8901', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; });
  await pg.goto('http://127.0.0.1:8901/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const R = await pg.evaluate(async () => {
    const M = await import('/src/comm.js'), B = await import('/src/boss.js');
    const cs = M.commSettings({ discLimit: 0.2 }), rate = M.ratesOf({});
    const mk = (id, disc, amt) => M.lineOfEntry({ id, d: '2026-11-01', store: 'STORE ' + id, acct: '1111', disc, pays: [{ m: 'CHECK', ref: id, amt }], invs: [{ no: 'A0' + id, t: 'A', amt }] });
    const secs = [10, 15, 20, '', 0, 20.01, 25, 40, 0.25].map(d => String(d) + ':' + M.secOf(mk('1', d, 100), cs));
    const c = M.computeComm([mk('10', 10, 1000), mk('25', 25, 1000)], rate, cs);
    const b = {}; c.buckets.forEach(x => { b[x.k] = { base: x.base, amt: x.amt }; });
    let disc = null; try { const rows = B.stmtRows(Object.assign({ sm: 'X', day: '2026-11-12', from: '2026-11-01', to: '2026-11-12' }, c)); const r = rows.find(x => x && x[1] && /^DISCOUNT/.test(x[1])); disc = r && r[5]; } catch (e) { disc = 'ERR ' + e.message; }
    return { secs, b, disc };
  });
  log('① sections:', R.secs.join(' '));
  const want = '10:REG 15:REG 20:REG :REG 0:REG 20.01:DISC 25:DISC 40:DISC 0.25:DISC';
  if (R.secs.join(' ') !== want) errs.push('① 10 · 15 · 20 % stay A; 20.01 % and up are DISC');
  log('② buckets:', JSON.stringify(R.b));
  if (!R.b.a || R.b.a.base !== 1000 || R.b.a.amt !== 150) errs.push('② A base $1,000 → $150');
  if (!R.b.disc || R.b.disc.base !== 1000 || R.b.disc.amt !== 100) errs.push('② DISC base $1,000 → $100');
  log('③ excel DISC base:', JSON.stringify(R.disc));
  if (!R.disc || R.disc.v !== 1000 || !/SUMIF/.test(R.disc.f || '')) errs.push('③ excel DISC row = SUMIF … $1,000');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
