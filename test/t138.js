/* v0.8.166 시험 — 🧾 정산서는 단순하게: 확정 완료 · 급여제 · 정산 대조 · 걸린 것 · 제외된 줄 · 대기 건 · W 오타 같은 내부 사정은 정산서(인쇄 · PDF)에 안 나옴 — 수금 합계 · 커미션 · 공제 · 줄 목록 · 서명만
 *   ① 커미션 정산서: 내부 상자 · 안내 문구 없음, 합계 · 요율표 · DEDUCTION · 줄 목록 · 서명은 있음
 *   ② 급여제 정산서: 제목 '수금 기록', 급여제 · 커미션 표 없음, 수금 합계 · 줄 목록은 있음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8890', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8890/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  const R = await pg.evaluate(async () => {
    const M = await import('/src/sales.js');
    const lines = [{ d: '2026-10-20', store: 'ALI B/S # 1', methods: 'CHECK #7001', e: 800, f: 0, invs: 'A-010055', P: 0, W: 0, disc: 0, sec: 'REG', src: 'FIELD', mismatch: 'W fixed' }, { d: '2026-10-21', store: 'BEAUTY 4U', methods: 'COD', e: 120, f: 0, invs: 'P-008700', P: 120, W: 0, disc: 0, sec: 'REG', src: 'COD' }];
    const comm = { lines, buckets: [{ k: 'a', label: 'REGULAR', base: 920, rate: 0.15, amt: 138 }], totals: { check: 920, cash: 0, total: 920 }, net: 138, netPay: 118, dp: { rate: 0.01, amt: 9.2 }, office: { rate: 0.005, amt: 4.6 }, pay: 104.2, cashKeep: 0, finalPay: 104.2,
      ded: { list: [{ id: 'D1', acct: '2222', store: 'OLD STORE', why: '6개월 미수', total: 100, used: 80, per: 20, remaining: 20, apply: 20, start: '2026-05-01', invs: [] }], amt: 20 },
      blockers: [{ k: 'miss', d: '2026-10-19', store: 'LOST CHECK STORE', ref: '9999', amt: 55 }], rec: { filled: true, ok: false, n: 3, amt: 1000, sysN: 2, sysAmt: 920 },
      skipped: [{ d: '2026-10-18', store: 'BAD AMOUNT STORE', got: 50, alloc: 60, why: '배분 ≠' }], skippedAmt: 50, warn: [{ d: '2026-10-20', store: 'ALI B/S # 1', W: 1, fixed: 0 }], waitN: 2, waitAmt: 300, pending: 1, pendBad: 1, pendOther: 1, pendOtherAmt: 77,
      arWarn: { six: [{ acct: '2222', store: 'OLD STORE', amt: 100, has: true }], four: [{ store: 'SLOW STORE', storeTot: 40 }] } };
    const a = M.settlementHtml({ sm: 'BRANDON', from: '2026-10-19', to: '2026-10-25', day: '2026-10-26', comm, conf: { day: '2026-10-26', id: 'SET-TEST-1' } });
    const b = M.settlementHtml({ sm: 'KAEL', from: '2026-10-19', to: '2026-10-25', day: '2026-10-26', comm: Object.assign({}, comm, { salaried: true, net: 0, netPay: 0, pay: 0, finalPay: 0, ded: { list: [], amt: 0 }, buckets: comm.buckets.map(x => Object.assign({}, x, { amt: 0 })) }) });
    const t = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
    return { a: t(a), b: t(b) };
  });
  log('① commission stmt:', R.a.slice(0, 220)); log('② salaried stmt:', R.b.slice(0, 160));
  const internal = ['확정 완료', 'SET-TEST-1', '급여제', '정산 대조', '걸린 것', 'LOST CHECK STORE', '미도착', '제외된 줄', 'BAD AMOUNT STORE', 'W 금액 오타', '수령 확인 대기', '빠져 있습니다', '6개월 넘은 미수', 'SLOW STORE', '정리 부탁', '최종 확인(✓)', '⚠︎'];
  internal.forEach(w => { if (R.a.includes(w)) errs.push('① statement must not show internal detail: ' + w); if (R.b.includes(w)) errs.push('② salaried statement must not show: ' + w); });
  ['커미션 정산서', 'BRANDON', '2026-10-19 ~ 2026-10-25', '2026-10-26', 'TOTAL 수금', '$920.00', 'REGULAR', '15%', '$138.00', 'DEDUCTION', 'NET PAYMENT', '$118.00', 'OLD STORE', 'ALI B/S # 1', 'CHECK #7001', 'A-010055', 'BEAUTY 4U', 'TOTAL', '$104.20', '세일즈맨 확인', '회사 확인'].forEach(w => { if (!R.a.includes(w)) errs.push('① statement should keep: ' + w); });
  if (!R.b.includes('수금 기록') || !R.b.includes('KAEL') || !R.b.includes('$920.00') || !R.b.includes('ALI B/S # 1') || !R.b.includes('세일즈맨 확인')) errs.push('② salaried statement keeps title 수금 기록 · totals · lines · signature');
  if (R.b.includes('대상 금액') || R.b.includes('NET')) errs.push('② salaried statement has no commission table');   /* 줄 목록의 '요율' 열은 남음 */
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
