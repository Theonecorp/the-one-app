/* v0.8.196 시험 — 🔁 ① 수금 입력(_ENTRIES) 가져오기: 이미 있는 수금이 다른 ID 로 또 들어오지 않음 (2026-11-12 관리자: "체크 수령 · 마감까지 했는데 지난 것들이 또 살아나" — 11/7 가져오기 때 정산 · 수령된 수금 6건이 새 ID 로 다시 들어옴)
 *   ① 예전에 가져와 정산된 수금(OLD-SETTLED · 현금)과 세일즈맨 · 날짜 · 거래처 · 금액 · 결제가 같은 줄(NEW-ID-CASH)은 안 들어옴 · 정산 표시 그대로
 *   ② 파일에 달이 11개여도 11번째 달의 중복(NEW-ID-NOV · 수표)도 걸러짐 (전에는 처음 10개 달만 확인)
 *   ③ 금액이 다른 줄(NEW-REAL)은 들어옴
 *   ④ 이미 있는 같은 ID 줄은 적은 칸만 — 앱에서 한 ② 체크 수령 표시가 안 풀림 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8884', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const EH = ['ID', '입력시각', '세일즈맨', '이메일', '가게', '계정', '주소', 'Pay Type', 'Check#', '금액', '메모', 'Deposit', '신규', '리포트', '상태', 'Post', 'Invoices', '받은날짜', '모바일', '보관', '대체', '원래체크'];
  const er = (id, d, pay, ref, amt, memo) => [id, d, 'BRANDON', 'brandon@x.com', 'ALI B/S # 1', '1111', '', pay, ref, amt, memo, '', '', '', '', '', 'A10055:' + amt, d, '', '', '', ''];
  const fill = []; for (let m = 1; m <= 10; m++) fill.push(er('FILL-' + m, '2025-' + String(m).padStart(2, '0') + '-05', 'CHECK', '90' + m, 10 + m, 'filler month ' + m));
  const sheets = { _ENTRIES: [EH].concat(fill, [er('NEW-ID-CASH', '2026-10-15', 'CASH', '', 300, 'same cash as settled'), er('NEW-ID-NOV', '2026-11-03', 'CHECK', '4444', 250, 'same check as received'), er('NEW-REAL', '2026-11-03', 'CHECK', '4445', 99, 'really new'), er('OLD-RC', '2026-11-03', 'CHECK', '4444', 250, 'same id as received')]) };
  await pg.addInitScript(sh => {
    window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' };
    window.__AFTER_SEED__ = s => {
      const eb = s.entries.find(e => e.sm === 'BRANDON') || s.entries[0];
      const mk = (id, o) => Object.assign(JSON.parse(JSON.stringify(eb)), { id, sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', imported: true, void: false, sb: true, rc: true, v: false, settled: '' }, o);
      s.entries.push(mk('OLD-SETTLED', { d: '2026-10-15', ym: '2026-10', pays: [{ m: 'CASH', ref: '', amt: 300, dep: '', mob: false }], total: 300, settled: 'S1', settledAt: '2026-11-05' }),
        mk('OLD-RC', { d: '2026-11-03', ym: '2026-11', pays: [{ m: 'CHECK', ref: '4444', amt: 250, dep: '', mob: false }], total: 250, rcAt: '2026-11-05', sbAt: '2026-11-05' }));
    };
    window.__SHEETS = sh;
    window.XLSX = { read: () => { const S = window.__SHEETS; return { SheetNames: Object.keys(S), Sheets: Object.fromEntries(Object.keys(S).map(n => [n, { rows: S[n] }])) }; }, utils: { sheet_to_json: ws => ws.rows.map(r => r.slice()) } };
  }, sheets);
  await pg.goto('http://127.0.0.1:8884/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f1', { state: 'attached', timeout: 8000 }); await pg.evaluate(() => { const d = document.getElementById('impOld'); if (d) d.open = true; });
  await pg.setInputFiles('#f1', { name: 'THE ONE 수금 입력.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('import should finish'));
  const msg = await pg.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); log('msg:', msg.slice(0, 260));
  if (/a-red/.test(await pg.$eval('#impOut', e => e.innerHTML)) || !/저장 완료/.test(msg)) errs.push('import should succeed');
  const E = await pg.evaluate(() => { const M = window.__MOCK_STORE__.entries; const e = id => M[id] && { total: M[id].total, sb: !!M[id].sb, rc: !!M[id].rc, settled: M[id].settled || '' }; return { cash: e('NEW-ID-CASH'), nov: e('NEW-ID-NOV'), real: e('NEW-REAL'), old: e('OLD-SETTLED'), rc: e('OLD-RC'), fill: e('FILL-1') }; }); log('entries:', JSON.stringify(E));
  if (E.cash) errs.push('① same cash payment under a new ID is not imported');
  if (!E.old || E.old.settled !== 'S1') errs.push('① the settled one stays settled');
  if (E.nov) errs.push('② duplicate in the 11th month is caught too');
  if (!E.real || E.real.total !== 99) errs.push('③ a really new payment comes in');
  if (!E.fill) errs.push('③ other months come in');
  if (!E.rc || !E.rc.rc || !E.rc.sb) errs.push('④ same-ID row keeps the app received mark');
  if (!/🔁.*2건 건너뜀/.test(msg)) errs.push('message says 2 skipped');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
