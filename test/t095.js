/* v0.8.117 시험 — 🧾 정산: 받은 돈·인보이스 $1~2 차이는 표시만(허용) · 한 체크 여러 가게 · 여러 체크 한 가게 자동 계산 · COD/ACH/카드 줄이 세일즈맨 코드 대소문자/빈칸이어도 보임 · 날짜별 ✓ 전부 · 엑셀 수식(SUMIF · D+E) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8836', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 }, acceptDownloads: true }); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seed = `const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); }; const ym = s => s.slice(0, 7);
    const E = (id, extra) => Object.assign({ id, d: day(1), ym: ym(day(1)), sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', addr: '', mismatch: '', memo: '', repl: false, orig: '', disc: '', sb: true, rc: true, v: false, vn: '', settled: '', void: false, createdBy: 'x', createdAt: day(1) + 'T12:00:00Z' }, extra);
    s.entries.push(E('TOL1', { pays: [{ m: 'CASH', amt: 101.5 }], invs: [{ no: 'A50001', t: 'A', amt: 100 }], total: 101.5, invTotal: 100 }));
    s.entries.push(E('BIG1', { d: day(2), ym: ym(day(2)), pays: [{ m: 'CASH', amt: 120 }], invs: [{ no: 'A50002', t: 'A', amt: 100 }], total: 120, invTotal: 100 }));
    s.entries.push(E('MUL1', { d: day(2), ym: ym(day(2)), pays: [{ m: 'CHECK', ref: '9001', amt: 500 }], invs: [{ no: 'A50003', t: 'A', amt: 300 }, { no: 'A50004', t: 'A', amt: 200, acct: '1111', store: 'ALI B/S # 1' }], total: 500, invTotal: 500 }));
    s.entries.push(E('TWO1', { d: day(3), ym: ym(day(3)), pays: [{ m: 'CHECK', ref: '9002', amt: 100 }, { m: 'CHECK', ref: '9003', amt: 150 }], invs: [{ no: 'A50005', t: 'A', amt: 250 }], total: 250, invTotal: 250 }));
    s.cod = (s.cod || []).concat([{ id: 'CL1', d: day(1), ym: ym(day(1)), sm: 'brandon', acct: '1271', store: 'BEAUTY 4U', method: 'COD', ref: 'UPS', amt: 55, invs: [{ no: 'A50010', t: 'A', amt: 55 }], disc: '', note: '', v: false, vn: '', settled: '', void: false },
      { id: 'CN1', d: day(1), ym: ym(day(1)), sm: '', acct: '1271', store: 'BEAUTY 4U', method: 'CREDIT CARD', ref: '123456', amt: 44, invs: [{ no: 'A50011', t: 'A', amt: 44 }], disc: '', note: '', v: false, vn: '', settled: '', void: false }]);`;
  await pg.addInitScript(sd => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', sd); }, seed);
  await pg.goto('http://127.0.0.1:8836/test/demo.html'); await pg.waitForSelector('#nav button');
  /* 계산 단위 시험 (comm.js) */
  const U = await pg.evaluate(async () => { const M = await import('/src/comm.js'); const cs = M.commSettings({ commTol: 2 }), rate = M.ratesOf({ rates: { a: 0.15 } });
    const tol = M.lineOfEntry({ id: 'T', d: '2026-10-28', sm: 'B', acct: '1', store: 'S', pays: [{ m: 'CASH', amt: 101.5 }], invs: [{ no: 'A1', t: 'A', amt: 100 }] });
    const c1 = M.computeComm([tol], rate, cs), c2 = M.computeComm([M.lineOfEntry({ id: 'T2', d: '2026-10-28', sm: 'B', acct: '1', store: 'S', pays: [{ m: 'CASH', amt: 120 }], invs: [{ no: 'A1', t: 'A', amt: 100 }] })], rate, cs), c3 = M.computeComm([tol], rate, M.commSettings({ commTol: 1 }));
    const mul = M.linesOfEntry({ id: 'M', d: '2026-10-28', sm: 'B', acct: '1', store: 'HOME', pays: [{ m: 'CHECK', ref: '9001', amt: 500 }], invs: [{ no: 'A3', t: 'A', amt: 300 }, { no: 'A4', t: 'A', amt: 200, acct: '2', store: 'OTHER' }] }), cm = M.computeComm(mul, rate, cs);
    const two = M.computeComm([M.lineOfEntry({ id: 'W', d: '2026-10-28', sm: 'B', acct: '1', store: 'S', pays: [{ m: 'CHECK', ref: '1', amt: 100 }, { m: 'CHECK', ref: '2', amt: 150 }], invs: [{ no: 'A5', t: 'A', amt: 250 }] })], rate, cs);
    return { tol: { bad: c1.bad.map(b => [b.tol, b.blocked, b.diff]), lines: c1.lines.length, total: c1.totals.total, net: c1.net }, big: { blocked: c2.bad[0] && c2.bad[0].blocked, skipped: c2.skipped.length }, tol1: { blocked: c3.bad[0] && c3.bad[0].blocked }, mul: { n: mul.length, stores: mul.map(l => l.store + ':' + (l.e + l.f)), bad: cm.bad.length, total: cm.totals.total }, two: { bad: two.bad.length, total: two.totals.total, check: two.totals.check } }; });
  log('units:', JSON.stringify(U));
  if (!U.tol.bad.length || U.tol.bad[0][0] !== true || U.tol.bad[0][1] !== false || U.tol.bad[0][2] !== 1.5 || U.tol.lines !== 1 || U.tol.total !== 101.5) errs.push('$1.50 difference should be tolerated and counted');
  if (!U.big.blocked || U.big.skipped !== 1) errs.push('$20 difference should still be blocked'); if (!U.tol1.blocked) errs.push('tolerance $1 should block a $1.50 difference');
  if (U.mul.n !== 2 || U.mul.bad !== 0 || U.mul.total !== 500 || U.mul.stores.join() !== 'HOME:300,OTHER:200') errs.push('one check · two stores should split into two clean lines');
  if (U.two.bad !== 0 || U.two.total !== 250 || U.two.check !== 250) errs.push('two checks · one store should compute cleanly');
  /* 화면 */
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pSm', { timeout: 8000 }); await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('[data-pl]', { timeout: 8000 });
  const cods = await pg.$$eval('[data-pl^="o|"]', e => e.map(x => x.dataset.pl)); log('cod lines:', cods); if (!cods.includes('o|CL1') || !cods.includes('o|CN1')) errs.push('COD with lowercase/blank salesman should appear');
  const tolRow = await pg.$eval('[data-pl="f|TOL1"]', e => e.textContent.replace(/\s+/g, ' ')); log('tol row:', tolRow.slice(0, 160)); if (!/허용 범위/.test(tolRow) || /이번 정산 제외/.test(tolRow)) errs.push('tolerated line should show a soft warning only');
  const bigRow = await pg.$eval('[data-pl="f|BIG1"]', e => e.textContent.replace(/\s+/g, ' ')); if (!/이번 정산 제외/.test(bigRow)) errs.push('$20 mismatch should still be excluded');
  const days = await pg.$$eval('[data-dayall]', e => e.map(x => x.dataset.dayall)); log('day buttons:', days); if (days.length < 2) errs.push('per-day ✓ buttons expected');
  for (const d of days) { await pg.click('[data-dayall="' + d + '"]'); await pg.waitForTimeout(600); }
  const st = await pg.$$eval('[data-pl]', e => e.map(x => x.dataset.pl + ':' + (x.classList.contains('ok') ? 'ok' : x.classList.contains('bad') ? 'bad' : 'pend'))); log('after day ✓:', st.join(' '));
  if (st.some(x => /:pend$/.test(x))) errs.push('all lines should be ✓ after per-day buttons'); if (await pg.$('[data-dayall]')) errs.push('day buttons should disappear once the day is all ✓');
  const sum = await pg.evaluate(() => document.querySelectorAll('#pOut .heroSub')[1].textContent.replace(/\s+/g, ' ')); log('summary:', sum); if (!/지급액 \$/.test(sum)) errs.push('pay should be computed');
  const whole = await pg.evaluate(() => document.getElementById('pOut').textContent.replace(/\s+/g, ' ')); if (!/조금 다른 줄 1건/.test(whole)) errs.push('tolerance summary line expected');
  /* 📊 엑셀 — 수식 포함 */
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }).catch(() => null), pg.click('#pXlsx')]);
  if (!dl) errs.push('xlsx download did not start'); else {
    const f = '/tmp/claude-0/-home-user-the-one-app/0122b542-b06a-5324-a2de-0d5e152b0fc5/scratchpad/t095.xlsx'; await dl.saveAs(f);
    const xml = execSync('python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.read(\'xl/worksheets/sheet1.xml\').decode())" ' + f).toString();
    const fs_ = (xml.match(/<f>[^<]*<\/f>/g) || []); log('formulas:', fs_.length, fs_.slice(0, 4).join(' '));
    if (!fs_.some(x => /SUMIF/.test(x))) errs.push('bucket base should be a SUMIF formula'); if (!fs_.some(x => /^<f>D\d+\+E\d+<\/f>$/.test(x))) errs.push('line TOTAL should be D+E formula'); if (!fs_.some(x => /SUM\(K/.test(x))) errs.push('TOTAL column sum expected');
    if (!/조금 다른 줄/.test(xml)) errs.push('xlsx should list tolerated differences');
  }
  /* 설정 */
  await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForSelector('#stTol', { timeout: 8000 }).catch(() => errs.push('tolerance setting missing'));
  if (await pg.$('#stTol')) { await pg.fill('#stTol', '1'); await pg.click('#stSave'); await pg.waitForTimeout(1000); const v = await pg.evaluate(() => window.__MOCK_STORE__.settings.app.commTol); if (v !== 1) errs.push('commTol should save, got ' + v); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
