/* v0.8.166 시험 — 🏦 ACH 시트 가져오기 (옛 "The One ACH" 시트: 'ACH 목록' · 'ACH 거래처' 탭) → ach 허브 · achBank · 거래처 ACH 표시
 *   ① 'ACH 목록': 셋업 ☑ · 인출 완료 ☑ · 상태(NSF · 취소) · A/P/W 줄 · 조건 · 인출 예정일 · 셋업 기록 · 실제 인출일 · 커미션 정산 · ID → ach/{SH-ID} · 같은 파일을 다시 올려도 두 번 안 들어감 · 앱에서 ☑ 한 것은 파일이 되돌리지 않음
 *   ② 'ACH 거래처': 은행 · 라우팅 · 계좌 → achBank/{계정코드} · accounts 에 ach · achReady · achCashPro · achBank · achLast4 · achEm 표시 (적은 칸만) · 거래처 목록에 없는 코드는 표시만 건너뜀
 *   (XLSX 는 CDN 이라 window.XLSX 를 가짜로) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8895', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const LH = ['Cash Pro 셋업 ☑', '인출 완료 ☑', '상태 (Status)', '입력일', '계정코드 *', '가게 이름', '주소', 'City', 'State', 'Zip', '인보이스 # *', '인보이스 날짜 *', '금액 *', 'A 인보이스', 'A 금액', 'P 인보이스', 'P 금액', 'W 인보이스', 'W 금액', '조건 (Terms) *', '인출 예정일', '세일즈맨', '고객 이메일', '담당자 이메일', '셋업 기록', '실제 인출일', '실제 금액', '안내 발송', '커미션 정산', '메모', 'ID'];
  const row = (setup, done, st, acct, inv, invD, amt, A, Aa, P, Pa, terms, draw, sm, log, doneOn, doneAmt, comm, note, id) => [setup, done, st, '2026-10-20', acct, 'STORE ' + acct, '', '', '', '', inv, invD, amt, A, Aa, P, Pa, '', '', terms, draw, sm, '', '', log, doneOn, doneAmt, '', comm, note, id];
  const AH = ['Application ☑', 'Cash Pro 등록 ☑', '계정코드 *', '가게 이름', '은행 이름', '라우팅 번호 (Routing) *', '계좌번호 (Account #) *', '계좌 종류', '끝 4자리', '번호 확인', '기본 조건', '상태', '고객 이메일 *', '담당자 이메일', '세일즈맨', 'Application 받은 날', 'Application 파일 링크', '한도 (선택)', '메모'];
  const sheets = {
    'ACH 목록': [LH,
      row(true, true, '인출완료 · Drawn', '1111', 'A42166', '2026-09-21', 632.25, 'A42166', 632.25, '', '', 'ACH 30', '2026-10-22', 'ACE', 'office@x.com · 10/21 15:48', '2026-10-27', 632.25, '2026-10-31', '날짜 고정', 'A261020-5508E'),
      row(true, false, '셋업완료 · Set up', '1271', 'A43001 & P-008700', '2026-10-20', 240, 'A43001', 180, 'P-008700', 60, 'ACH 60', '2026-12-19', 'BRANDON', 'office@x.com · 10/22 09:00', '', '', '', '', 'A261022-AB001'),
      row(false, false, '대기 · To set up', '3001', 'A43500', '2026-11-03', 500, 'A43500', 500, '', '', '직접 입력 · Manual', '2026-11-20', 'ALEX', '', '', '', '', '', 'A261103-C5A85'),
      row(false, false, '반송 NSF', '1111', 'A42000', '2026-08-01', 100, 'A42000', 100, '', '', 'ACH 30', '2026-09-01', 'ACE', '', '', '', '', '', 'A260801-NSF01'),
      row(false, false, '대기 · To set up', '1111', 'APPSET1', '2026-11-01', 75, 'APPSET1', 75, '', '', 'ACH 30', '2026-12-01', 'ACE', '', '', '', '', 'file says not set up', 'APPSET1')],
    'ACH 거래처': [AH,
      [true, true, '1111', 'ALI B/S # 1', 'FIRST CITIZENS BANK', '053906041', '009163155489', '', '5489', '✓', 'ACH 60', '승인 · Approved', 'owner@ali.com', 'ace@theonefl.com', 'ACE', '2026-05-01', '', '', '옛 리스트'],
      [false, false, '1271', 'BEAUTY 4U', 'CHASE', '', '', '', '', '', 'ACH 30', '신청대기 · Application pending', '', 'brandon@theonefl.com', 'BRANDON', '', '', '', ''],
      [true, true, '9999', 'NOT IN LIST', 'X BANK', '111000025', '12345678', '', '5678', '', 'ACH 30', '승인 · Approved', '', '', 'ACE', '', '', '', '']] };
  await pg.addInitScript(sh => {
    window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' };
    window.__AFTER_SEED__ = s => { s.ach = (s.ach || []).concat([{ id: 'SH-APPSET1', acct: '1111', store: 'ALI B/S # 1', sm: 'ACE', lines: [{ no: 'APPSET1', t: 'A', amt: 75 }], inv: 'APPSET1', amt: 75, invDate: '2026-11-01', terms: 'ACH 30', drawOn: '2026-12-01', drawYm: '2026-12', setup: true, setupBy: 'app@x.com', setupAt: '2026-11-04', mail: '', st: '', open: true, done: false, doneOn: '', doneYm: '', doneAmt: 0, auto: false, codId: '', note: 'set up in the app', void: false, createdBy: 'app@x.com', createdAt: '2026-11-01T10:00:00Z' }]); };
    window.__SHEETS = sh;
    window.XLSX = { read: () => { const S = window.__SHEETS; return { SheetNames: Object.keys(S), Sheets: Object.fromEntries(Object.keys(S).map(n => [n, { rows: S[n] }])) }; }, utils: { sheet_to_json: ws => ws.rows.map(r => r.slice()) } };
  }, sheets);
  await pg.goto('http://127.0.0.1:8895/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#fAny', { state: 'attached', timeout: 8000 });
  const upload = async () => { await pg.evaluate(() => { document.getElementById('anyOut').innerHTML = ''; }); await pg.setInputFiles('#fAny', { name: 'The_One_ACH_3.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') }); await pg.waitForFunction(() => /저장 완료|a-red/.test(document.getElementById('anyOut').innerHTML) && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('import should finish')); return (await pg.$$eval('#anyOut .alert', e => e.map(x => x.textContent).join(' | '))).replace(/\s+/g, ' '); };
  const msg = await upload(); log('msg:', msg.slice(0, 320));
  if (!/ACH 5건/.test(msg) || !/새로 4/.test(msg) || !/있던 1건/.test(msg) || !/셋업 ☑ 2/.test(msg) || !/인출 완료 ☑ 1/.test(msg)) errs.push('① message: 5 rows · 4 new · 1 existing · 2 set up (file) · 1 drawn');
  if (!/거래처 ACH 정보 2곳/.test(msg) || !/은행 정보 1곳/.test(msg) || !/9999/.test(msg)) errs.push('② message: 2 accounts · 1 bank · 9999 not in list');
  const R = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const a = id => M.ach[id]; const k = ['SH-A261020-5508E', 'SH-A261022-AB001', 'SH-A261103-C5A85', 'SH-A260801-NSF01', 'SH-APPSET1']; return { n: Object.keys(M.ach).filter(x => x.startsWith('SH-')).length, d: k.map(id => a(id) && { setup: a(id).setup, done: a(id).done, st: a(id).st, open: a(id).open, lines: a(id).lines.map(l => l.no + ':' + l.t + ':' + l.amt).join(' '), amt: a(id).amt, terms: a(id).terms, drawOn: a(id).drawOn, drawYm: a(id).drawYm, fixed: a(id).fixed, setupBy: a(id).setupBy, doneOn: a(id).doneOn, doneAmt: a(id).doneAmt, settled: a(id).settled, note: a(id).note, sm: a(id).sm, src: a(id).src }), bank: M.achBank && M.achBank['1111'] && { bank: M.achBank['1111'].bank, routing: M.achBank['1111'].routing, last: M.achBank['1111'].acctNo.slice(-4), terms: M.achBank['1111'].terms }, acc: ['1111', '1271'].map(c => { const x = M.accounts[c]; return x && { ach: x.ach, achReady: x.achReady, achCashPro: x.achCashPro, achBank: x.achBank, achLast4: x.achLast4, achEm: x.achEm, achRepEm: x.achRepEm, achTerms: x.achTerms, store: x.store }; }), acc9999: !!M.accounts['9999'] }; });
  log('ach docs:', JSON.stringify(R.d)); log('bank:', JSON.stringify(R.bank)); log('accounts:', JSON.stringify(R.acc));
  const [drawn, setup, wait, nsf, kept] = R.d;
  if (R.n !== 5) errs.push('① five sheet rows → five ach docs (got ' + R.n + ')');
  if (!drawn || !drawn.setup || !drawn.done || drawn.open || drawn.doneOn !== '2026-10-27' || drawn.doneAmt !== 632.25 || drawn.settled !== 'sheet:2026-10-31' || drawn.setupBy !== 'office@x.com' || drawn.lines !== 'A-042166:A:632.25' || drawn.drawYm !== '2026-10' || drawn.note !== '날짜 고정' || drawn.src !== 'sheet') errs.push('① drawn row: setup · done · doneOn · doneAmt · settled · setupBy · lines · note');
  if (!setup || !setup.setup || setup.done || !setup.open || setup.lines !== 'A-043001:A:180 P-008700:P:60' || setup.amt !== 240 || setup.terms !== 'ACH 60' || setup.drawOn !== '2026-12-19' || setup.sm !== 'BRANDON') errs.push('① set-up row: A + P lines · terms · draw date · salesman');
  if (!wait || wait.setup || wait.done || !wait.open || wait.terms !== 'Manual' || !wait.fixed || wait.lines !== 'A-043500:A:500') errs.push('① waiting row: Manual terms → fixed date');
  if (!nsf || nsf.st !== 'NSF' || !nsf.open) errs.push('① 반송 NSF row → st NSF');
  if (!kept || !kept.setup || kept.setupBy !== 'app@x.com' || kept.note !== 'file says not set up') errs.push('① app-made ☑ must survive the file (merge keeps setup, other cells update)');
  if (!R.bank || R.bank.routing !== '053906041' || R.bank.last !== '5489' || R.bank.bank !== 'FIRST CITIZENS BANK' || R.bank.terms !== 'ACH 60') errs.push('② achBank/1111 from the sheet');
  const [a1, a2] = R.acc;
  if (!a1 || !a1.ach || !a1.achReady || !a1.achCashPro || a1.achBank !== 'FIRST CITIZENS BANK' || a1.achLast4 !== '5489' || a1.achEm !== 'owner@ali.com' || a1.achRepEm !== 'ace@theonefl.com' || a1.achTerms !== 'ACH 60' || a1.store !== 'ALI B/S # 1') errs.push('② account 1111 flags set, store name untouched');
  if (!a2 || a2.ach || a2.achReady || a2.achCashPro || a2.achRepEm !== 'brandon@theonefl.com') errs.push('② pending account 1271: no approval flags, rep email kept');
  if (R.acc9999) errs.push('② unknown account must not be created');
  /* 다시 올려도 두 번 안 들어감 */
  const msg2 = await upload(); const n2 = await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.ach).filter(x => x.startsWith('SH-')).length); log('re-upload:', msg2.slice(0, 80), '| docs:', n2);
  if (n2 !== 5 || !/있던 5건/.test(msg2)) errs.push('① re-upload merges, no duplicates');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
