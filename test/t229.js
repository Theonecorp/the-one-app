/* v0.8.204 시험 — 🧾 한 인보이스를 체크 여러 장으로 받은 실제 줄 (2026-11-13 관리자: "#1 B/S A-042219 $1,406.82 를 체크 두 장 $706.82 · $700 으로 받았는데 계산이 안 됨")
 *   수금마다 인보이스 금액 칸에 인보이스 전체 금액($1,406.82)이 적혀 있어도 → 받은 돈만큼 A 로 (금액 오류 아님)
 *   ① #1 B/S (ORLANDO) A-042219 $1,406.82 · 체크 $706.82 / $700 → 각각 A $706.82 · A $700
 *   ② K&S TALLAHASSEE ACH $412.26 · A-041895 · P-008289 금액 둘 다 0 → 인보이스 기록대로 A $352.50 · P $59.76
 *   ③ #1 B/S (COLONIAL) $861.90 · P-008519 0 · A-042671 $861.90 (할인 20%) → P $126 · 나머지 A $735.90
 *   ④ 인보이스를 앱에서 못 찾아도 한 종류(A 하나)면 받은 돈만큼 A — 적힌 금액이 받은 돈보다 크면 일부 수금 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8915', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; });
  await pg.goto('http://127.0.0.1:8915/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const R = await pg.evaluate(async () => {
    const M = await import('/src/comm.js');
    const cs = M.commSettings({ discLimit: 0.2 }), rate = M.ratesOf({});
    M.setInvoiceInfo({ [M.invKey('A-042219')]: { t: 'A', pct: 0, amt: 1406.82, d: '2026-09-23' }, [M.invKey('A-041895')]: { t: 'A', pct: 0, amt: 352.5, d: '2026-09-11' }, [M.invKey('P-008289')]: { t: 'P', pct: 0, amt: 59.76, d: '2026-09-11' }, [M.invKey('P-008519')]: { t: 'P', pct: 0, amt: 126, d: '2026-10-07' } });
    const ent = (id, amt, invs, disc) => M.lineOfEntry({ id, d: '2026-09-29', store: 'S ' + id, acct: '1008', disc: disc == null ? '' : disc, pays: [{ m: 'CHECK', ref: id, amt }], invs });
    const run = L => { const c = M.computeComm(M.byInvoice(L, cs), rate, cs); const b = {}; c.buckets.forEach(x => { if (x.base) b[x.k] = x.base; }); return { b, skipped: c.skipped.length, bad: c.bad.filter(x => x.blocked).length }; };
    return {
      a1: run(ent('1337', 706.82, [{ no: 'A-042219', t: 'A', amt: 1406.82 }])), a2: run(ent('1336', 700, [{ no: 'A-042219', t: 'A', amt: 1406.82 }])),
      ks: run(M.lineOfOther({ id: 'ACH-1', d: '2026-10-12', store: 'K&S', acct: '4072', amt: 412.26, method: 'ACH', disc: 0, invs: [{ no: 'A-041895', t: 'A', amt: 0 }, { no: 'P-008289', t: 'P', amt: 0 }] })),
      col: run(ent('30212', 861.9, [{ no: 'P-008519', t: 'P', amt: 0 }, { no: 'A-042671', t: 'A', amt: 861.9 }], 20)),
      unk: run(ent('9', 500, [{ no: 'A-099998', t: 'A', amt: 1200 }]))
    };
  });
  for (const k of Object.keys(R)) log(k, JSON.stringify(R[k]));
  if (R.a1.b.a !== 706.82 || R.a1.skipped || R.a2.b.a !== 700 || R.a2.skipped) errs.push('① each check counts as A for what was received');
  if (R.ks.b.a !== 352.5 || R.ks.b.p !== 59.76 || R.ks.skipped) errs.push('② blank A · P split by invoice amounts');
  if (R.col.b.p !== 126 || Math.abs((R.col.b.a || 0) - 735.9) > 0.005 || R.col.skipped) errs.push('③ P from its invoice, rest A');
  if (R.unk.b.a !== 500 || R.unk.skipped) errs.push('④ unknown single-type invoice: partial payment is fine');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
