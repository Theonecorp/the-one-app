/* v0.8.123 시험 — 🖨 손님용 스테이트먼트 옵션: 미결 전체 · 부분 결제만 · 기간 안 인보이스 전부 · 기간 · 입금 기록(현장 + COD/카드) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8844', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seed = `const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    s.entries.push({ id: 'PP1', d: day(2), ym: day(2).slice(0, 7), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', pays: [{ m: 'CHECK', ref: '5555', amt: 300 }], invs: [{ no: 'A10055', t: 'A', amt: 300, ar: true }], total: 300, invTotal: 300, sb: true, rc: true, v: false, settled: '', void: false, repl: false });
    s.cod = (s.cod || []).concat([{ id: 'CC1', d: day(3), ym: day(3).slice(0, 7), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', method: 'CREDIT CARD', ref: '778899', amt: 75, invs: [], v: false, settled: '', void: false }]);
    s.invoices = (s.invoices || []).concat([{ id: 'A10021', no: 'A10021', t: 'A', d: day(50), ym: day(50).slice(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 1500, bal: 1500, st: 'open', src: 'legacy', lines: [] }, { id: 'A10055', no: 'A10055', t: 'A', d: day(10), ym: day(10).slice(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 800, bal: 800, st: 'open', src: 'legacy', lines: [] }, { id: 'A09000', no: 'A09000', t: 'A', d: day(30), ym: day(30).slice(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 420, bal: 0, st: 'paid', src: 'legacy', lines: [] }]);`;
  await pg.addInitScript(sd => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', sd); }, seed);
  await pg.goto('http://127.0.0.1:8844/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('[data-ivm="store"]', { timeout: 8000 }); await pg.click('[data-ivm="store"]'); await pg.waitForSelector('[data-ia="1111"]', { timeout: 8000 }); await pg.click('[data-ia="1111"]');
  await pg.waitForSelector('#ssStmt', { timeout: 8000 }).catch(() => errs.push('store window missing'));
  const prt = async (mode, period, pays) => {
    await pg.click('#ssStmt'); await pg.waitForSelector('[data-stm]', { timeout: 5000 });
    await pg.click('[data-stm="' + mode + '"]'); await pg.click('[data-stp="' + period + '"]'); await pg.waitForTimeout(150);
    if ((await pg.isChecked('#stPay')) !== pays) await pg.click('#stPay');
    await pg.click('#stGo'); await pg.waitForSelector('#prt.on .iv', { timeout: 8000 }).catch(() => errs.push(mode + ': statement did not open'));
    const t = (await pg.textContent('#prtbody')).replace(/\s+/g, ' '); await pg.evaluate(() => document.getElementById('prt').classList.remove('on')); await pg.waitForTimeout(200);
    if (await pg.$('#stBack')) { await pg.click('#stBack'); await pg.waitForSelector('#ssStmt', { timeout: 5000 }).catch(() => errs.push('‹ back to the store window failed')); }   // 옵션 창 ‹ 가게 창
    await pg.waitForTimeout(1000);
    return t;
  };
  let t = await prt('open', 'all', true); log('open:', t.slice(0, 40), '…', (t.match(/A1\d{4}/g) || []).join(','));
  if (!/A10021/.test(t) || !/A10055/.test(t) || /A09000/.test(t)) errs.push('open statement should list open invoices only');
  if (!/500\.00/.test(t) || !/300\.00/.test(t)) errs.push('A10055 should show paid 300 and balance 500');
  if (!/Check #5555/.test(t) || !/CREDIT CARD 778899/.test(t)) errs.push('payments should include field check and card'); if (!/Total received/.test(t)) errs.push('payments total missing');
  t = await prt('partial', 'all', false); log('partial:', (t.match(/A\d{5}/g) || []).join(','), /Payments received/.test(t));
  if (!/A10055/.test(t) || /A10021/.test(t)) errs.push('partial statement should list only partially paid A10055'); if (/Payments received/.test(t)) errs.push('payments should be off'); if (!/PARTIALLY PAID/.test(t)) errs.push('partial title missing');
  t = await prt('all', 'm1', true); const tbl = t.split('Days past due')[1].split('Payments received')[0]; log('all m1 invoices:', (tbl.match(/A\d{5}/g) || []).join(','), (t.match(/Period [^ ]+ ~ [^ ]+/) || [''])[0]);
  if (!/A10055/.test(tbl) || !/A09000/.test(tbl) || /A10021/.test(tbl)) errs.push('period statement (1 month) should list A10055 and paid A09000, not 50-day-old A10021');
  if (!/PAID/.test(t)) errs.push('paid invoice should show PAID'); if (!/Period/.test(t)) errs.push('period line missing');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
