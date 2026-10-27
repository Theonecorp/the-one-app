/* v0.8.75 시험 — 🔢 인보이스 번호 형식 (글자-6자리, 999999 다음 AA-000001) · 번호 형식 통일 도구 · 인보이스 목록은 번호 순 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8796', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) errs.push(m + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
    const inv = (no, d, acct) => ({ id: no, no, t: no.replace(/[-\d].*/, ''), d, ym: d.substring(0, 7), acct, store: 'ALI B/S # 1', sm: 'BRANDON', total: 10, bal: 10, st: 'open', src: 'legacy', lines: [] });
    window.__AFTER_SEED__ = s => {
      s.invoices = [inv('A43350', '2026-10-20', '1111'), inv('A43301', '2026-10-25', '1111'), inv('P007803', '2026-10-21', '1111'), inv('P-008834', '2026-10-22', '1111'), inv('CM161', '2026-10-23', '1111')];
      s.cod = [{ id: 'C1', d: '2026-10-24', sm: 'BRANDON', acct: '1111', method: 'ACH', amt: 10, invs: [{ no: 'A43350', amt: 10 }] }];
      s.orders = [{ id: 'O261020-AAAA', no: 'O261020-AAAA', st: 'done', sm: 'BRANDON', acct: '1111', store: 'X', d: '2026-10-20', invs: ['A43301'] }];
    }; });
  await pg.goto('http://127.0.0.1:8796/test/demo.html'); await pg.waitForSelector('#nav button');
  /* 1. 번호 만들기 · 맞추기 */
  const r = await pg.evaluate(async () => { const I = await import('/src/invoicing.js'), U = await import('/src/ui.js');
    return { fmt: [1, 43107, 999999, 1000000, 1999998, 1999999].map(n => I.fmtNo({ c: 'A' }, n)), norm: ['A43350', 'a 43350', 'P007803', 'P-008834', 'CM161', 'W612', 'A-043350', 'O261020-AAAA', 'AA12'].map(U.invNo),
      sort: U.sortInv(['P-008834', 'A-043350', 'CM-000161', 'A-043301', 'P-007803'], x => x).join(' ') }; });
  log(r);
  eq(r.fmt, ['A-000001', 'A-043107', 'A-999999', 'AA-000001', 'AA-999999', 'AB-000001'], 'fmtNo');
  eq(r.norm, ['A-043350', 'A-043350', 'P-007803', 'P-008834', 'CM-000161', 'W-000612', 'A-043350', 'O261020-AAAA', 'AA-000012'], 'invNo');
  eq(r.sort, 'A-043301 A-043350 CM-000161 P-007803 P-008834', 'sortInv');
  /* 2. 통일 전에도 새 번호(A-043350)로 옛 인보이스(A43350)가 찾아짐 */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iqQ'); await pg.fill('#iqQ', 'A-043350'); await pg.press('#iqQ', 'Enter'); await pg.waitForTimeout(1500);
  const f1 = await pg.$$eval('#iList [data-go^="inv:"]', e => e.map(x => x.dataset.go)); log('find before convert:', f1); if (f1.length !== 1) errs.push('old invoice should be found by new number');
  /* 3. 통일 도구 */
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#fmtScan'); await pg.waitForTimeout(800); await pg.click('#fmtScan'); await pg.waitForSelector('#fmtGo', { timeout: 8000 }).catch(async () => errs.push('scan: ' + await pg.textContent('#fmtOut')));
  log('scan:', (await pg.textContent('#fmtOut')).replace(/\s+/g, ' ')); await pg.click('#fmtGo'); await pg.waitForSelector('#cfOk').catch(() => {}); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => { const M = window.__MOCK_STORE__; return { inv: Object.keys(M.invoices).sort(), cod: M.cod.C1.invs[0].no, ord: M.orders['O261020-AAAA'].invs, ordNo: M.orders['O261020-AAAA'].no, ar: JSON.stringify(Object.values(M.ar || {})).match(/"inv":"[^"]+"/g) }; });
  log(st);
  eq(st.inv, ['A-043301', 'A-043350', 'CM-000161', 'P-007803', 'P-008834'], 'invoice ids after convert'); eq(st.cod, 'A-043350', 'cod ref'); eq(st.ord, ['A-043301'], 'order invs'); eq(st.ordNo, 'O261020-AAAA', 'order no untouched');
  if ((st.ar || []).some(x => !/"inv":"[A-Z]+-\d{6}"/.test(x))) errs.push('AR refs not converted');
  /* 4. 인보이스 조회는 번호 순 (종류별) */
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForTimeout(300); await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForTimeout(1200);
  if (await pg.$('#iqBackA')) { await pg.click('#iqBackA'); await pg.waitForTimeout(800); }
  if (await pg.$('#iqX')) { await pg.click('#iqX'); await pg.waitForTimeout(800); }
  if (await pg.$('[data-ia="1111"]')) { await pg.click('[data-ia="1111"]'); await pg.waitForTimeout(1200); }
  const nos = await pg.$$eval('#iList [data-go^="inv:"]', e => e.map(x => x.dataset.go.substring(4))); log('list:', nos.join(' '));
  eq(nos, ['A-043301', 'A-043350', 'CM-000161', 'P-007803', 'P-008834'], 'invoice list order');
  await pg.click('#iSort').catch(() => errs.push('no sort toggle')); await pg.waitForSelector('#iList [data-go^="inv:"]').catch(() => {}); await pg.waitForTimeout(500);
  console.log('after sort page:', (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 300));
  const nos2 = await pg.$$eval('#iList [data-go^="inv:"]', e => e.map(x => x.dataset.go.substring(4))); eq(nos2, ['A-043350', 'A-043301', 'CM-000161', 'P-008834', 'P-007803'], 'desc order');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
