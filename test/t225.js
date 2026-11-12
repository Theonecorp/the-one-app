/* v0.8.204 시험 — 🧾 인보이스 기준 정산 (2026-11-12 관리자: "P · W · 20% 넘는 디스카운트 계산이 하나도 안 맞음 · 수금 입력의 인보이스가 제대로 안 들어감 · 추천대로")
 *   comm.byInvoice: 인보이스 기록의 종류 · 할인 % · 금액으로 받은 돈을 나눔
 *   ① P 금액이 빈칸(0) → 오래된 인보이스부터 인보이스 금액만큼: A $1,108 · P $500 → P 기준 $500 (전에는 전부 A)
 *   ② W 를 여러 체크로: 체크 $1,000 인데 W 잔액 $10,493.70 이 적힘 → W $1,000 (NEW DP 기준 $1,000)
 *   ③ 할인은 인보이스에서: 수금 할인 칸은 비었지만 A 인보이스 25% → DISC · 한 수금에 10% 인보이스와 25% 인보이스가 섞이면 두 줄(A · DISC)로
 *   ④ 손으로 나눈 금액이 받은 돈과 맞고 빈칸이 없으면 그대로 (A $300 · P $200)
 *   ⑤ 인보이스를 앱에서 못 찾으면 예전 그대로
 *   ⑥ 크레딧(CM −$50)은 적힌 대로 빼고 나머지를 A 에
 *   ⑦ 인보이스를 모르는데 종류가 섞이고 금액이 안 맞으면(A $500 + P 빈칸, 받은 돈 $700) 자동으로 안 나눔 → 예전처럼 금액 오류(고치기) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8910', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; });
  await pg.goto('http://127.0.0.1:8910/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const R = await pg.evaluate(async () => {
    const M = await import('/src/comm.js');
    const cs = M.commSettings({ discLimit: 0.2 }), rate = M.ratesOf({});
    M.setInvoiceInfo({ [M.invKey('A-041001')]: { t: 'A', pct: 0, amt: 1108, d: '2026-10-01' }, [M.invKey('P-008001')]: { t: 'P', pct: 0, amt: 500, d: '2026-10-02' },
      [M.invKey('W-000487')]: { t: 'W', pct: 0, amt: 11493.7, d: '2026-09-20' }, [M.invKey('A-042010')]: { t: 'A', pct: 10, amt: 600, d: '2026-10-05' }, [M.invKey('A-042025')]: { t: 'A', pct: 25, amt: 400, d: '2026-10-06' },
      [M.invKey('A-042300')]: { t: 'A', pct: 0, amt: 999, d: '2026-10-07' }, [M.invKey('P-008300')]: { t: 'P', pct: 0, amt: 999, d: '2026-10-07' }, [M.invKey('A-043000')]: { t: 'A', pct: 0, amt: 1000, d: '2026-10-08' }, [M.invKey('CM-000050')]: { t: 'CM', pct: 0, amt: -50, d: '2026-10-09' } });
    const ent = (id, amt, invs, disc) => M.lineOfEntry({ id, d: '2026-11-01', store: 'S ' + id, acct: '1111', disc: disc == null ? '' : disc, pays: [{ m: 'CHECK', ref: id, amt }], invs });
    const sum = Ls => { const c = M.computeComm(Ls, rate, cs); const b = {}; c.buckets.forEach(x => { if (x.base) b[x.k] = x.base; }); return { b, n: c.lines.length, auto: Ls.some(L => L.auto) }; };
    const run = L => sum(M.byInvoice(L, cs));
    return {
      one: run(ent('1', 1608, [{ no: 'A-041001', t: 'A', amt: 1108 }, { no: 'P-008001', t: 'P', amt: 0 }])),
      two: run(ent('2', 1000, [{ no: 'W-000487', t: 'W', amt: 10493.7 }])),
      three: run(ent('3', 1000, [{ no: 'A-042010', t: 'A', amt: 600 }, { no: 'A-042025', t: 'A', amt: 400 }], '')),
      four: run(ent('4', 500, [{ no: 'A-042300', t: 'A', amt: 300 }, { no: 'P-008300', t: 'P', amt: 200 }])),
      five: run(ent('5', 700, [{ no: 'A-099999', t: 'A', amt: 700 }])),
      six: run(ent('6', 950, [{ no: 'A-043000', t: 'A', amt: 0 }, { no: 'CM-000050', t: 'CM', amt: -50 }])),
      seven: (() => { const Ls = M.byInvoice(ent('7', 700, [{ no: 'A-077777', t: 'A', amt: 500 }, { no: 'P-077777', t: 'P', amt: 0 }]), cs); const c = M.computeComm(Ls, rate, cs); return { auto: Ls.some(L => L.auto), skipped: c.skipped.length }; })()
    };
  });
  for (const k of Object.keys(R)) log(k, JSON.stringify(R[k]));
  if (R.one.b.p !== 500 || R.one.b.a !== 1108 || !R.one.auto) errs.push('① blank P gets its invoice amount ($500 P · $1,108 A)');
  if (R.two.b.w !== 1000 || R.two.b.a) errs.push('② W across checks: this check is $1,000 W');
  if (R.three.b.a !== 600 || R.three.b.disc !== 400 || R.three.n !== 2) errs.push('③ per-invoice discount: $600 A (10%) + $400 DISC (25%) as two lines');
  if (R.four.b.a !== 300 || R.four.b.p !== 200 || R.four.auto) errs.push('④ correct manual split is kept');
  if (R.five.b.a !== 700 || R.five.auto) errs.push('⑤ unknown invoice → unchanged');
  if (R.six.b.a !== 950 || R.six.n !== 1) errs.push('⑥ credit −$50 is applied, A gets the rest (net $950)');
  if (R.seven.auto || R.seven.skipped !== 1) errs.push('⑦ unknown mixed types are not auto-split (amount error as before)');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
