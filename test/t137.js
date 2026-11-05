/* v0.8.166 시험 — 🔒 ② SALES(수금) · ① 수금 입력 파일을 다시 올려도 앱에서 이미 정산한 건은 그대로: 정산이 풀려 또 정산하는 일이 없음
 *   ① COD 입력 탭: 정산된 건(settled)은 파일 내용이 달라도 건드리지 않음 · 있는 건은 통째로 바꾸지 않고 적은 칸만(createdAt · 취소 표시 유지) · 앱에서 한 ✓ 를 파일의 빈칸이 되돌리지 않음 · 새 줄은 들어옴
 *   ② 세일즈맨 탭: 정산된 수금은 그대로 · ① 접수 확인 · ② 수령 · ✓ 는 파일로 올리기만(TRUE → 반영, 빈칸 → 그대로)
 *   ③ ① 수금 입력(_ENTRIES) 파일: 정산된 수금은 그대로 · 있는 수금은 적은 칸만(① ② ✓ 유지) · 새 수금은 들어옴
 *   ④ 📌 정산 마감일을 주고 다시 올리면 그 날짜까지의 수금 · COD 는 정산 완료(sheet:날짜)로, 그 뒤 것은 그대로 미정산 · 이미 정산한 것은 그대로
 *   (XLSX 라이브러리는 CDN 이라 시험에서는 window.XLSX 를 가짜로 — 시트 → 표 변환만 흉내) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8889', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const COD_H = ['세일즈맨', '날짜', '계정코드', '가게', '결제 방법', '참조', '금액', 'A 인보이스', 'A 금액', 'P 인보이스', 'P 금액', 'CM 인보이스', 'CM 금액', 'W 인보이스', 'W 금액', '디스카운트 %', '메모', 'ID', '정산 확인', '확인 메모'];
  const codRow = (id, amt, v, note) => ['BRANDON', '2026-10-20', '1111', 'ALI B/S # 1', 'COD', '', amt, 'A10055', amt, '', '', '', '', '', '', '', note, id, v, ''];
  const SM_H = ['ID', 'SmartBee', '체크 수령', '정산 확인', '확인 메모', '커미션 정산', 'A 인보이스', 'A 금액'];
  const sheets = { 'COD 입력': [COD_H, codRow('CS1', 999, false, 'file says 999'), codRow('CS2', 100, false, 'from file'), codRow('CS3', 100, true, ''), codRow('CS4', 50, true, 'new one')], 'BRANDON': [SM_H, ['ES1', false, false, false, '', '', '', ''], ['ES2', false, false, false, '', '', '', ''], ['ES3', true, false, false, '', '', '', '']] };
  await pg.addInitScript(sh => {
    window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' };
    window.__AFTER_SEED__ = s => {
      const base = { d: '2026-10-20', ym: '2026-10', sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', method: 'COD', ref: '', invs: [{ no: 'A-010055', t: 'A', amt: 100 }], disc: '', note: '', imported: true, createdAt: '2026-10-20T10:00:00Z', createdBy: 'x' };
      s.cod = (s.cod || []).concat([Object.assign({}, base, { id: 'CS1', amt: 100, v: true, vn: 'ok', settled: 'SET1', settledAt: '2026-10-25', void: false }), Object.assign({}, base, { id: 'CS2', amt: 100, v: true, vn: 'app ok', settled: '', void: false }), Object.assign({}, base, { id: 'CS3', amt: 100, v: false, vn: '', settled: '', void: true })]);
      const eb = s.entries.find(e => e.sm === 'BRANDON') || s.entries[0];
      const mk = (id, o) => Object.assign(JSON.parse(JSON.stringify(eb)), { id, imported: true, void: false }, o);
      s.entries.push(mk('ES1', { sb: true, rc: true, v: true, settled: 'SET1' }), mk('ES2', { sb: true, rc: true, v: true, settled: '' }), mk('ES3', { sb: false, rc: false, v: false, settled: '', d: '2026-10-20', ym: '2026-10' }));   /* ④ 마감일(10-21) 전 날짜 */
    };
    /* 가짜 XLSX — read() 는 위 표를, sheet_to_json(header:1) 은 그 표 그대로 */
    window.__SHEETS = sh;
    window.XLSX = { read: () => { const S = window.__SHEETS; return { SheetNames: Object.keys(S), Sheets: Object.fromEntries(Object.keys(S).map(n => [n, { rows: S[n] }])) }; }, utils: { sheet_to_json: ws => ws.rows.map(r => r.slice()) } };
  }, sheets);
  await pg.goto('http://127.0.0.1:8889/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f2', { state: 'attached', timeout: 8000 }); await pg.evaluate(() => { const d = document.getElementById('impOld'); if (d) d.open = true; });   /* ② 파일 칸은 접힌 '종류별로 따로 올리기' 안 */
  await pg.setInputFiles('#f2', { name: 'THE ONE 수금 (SALES).xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('import should finish'));
  const msg = await pg.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); log('msg:', msg.slice(0, 300));
  if (/a-red/.test(await pg.$eval('#impOut', e => e.innerHTML)) || !/저장 완료/.test(msg)) errs.push('import should succeed');
  if (!/🔒.*2건/.test(msg)) errs.push('message should say 2 settled rows were left alone');
  const S = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const c = id => M.cod[id] && { amt: M.cod[id].amt, v: M.cod[id].v, vn: M.cod[id].vn, settled: M.cod[id].settled, void: M.cod[id].void, note: M.cod[id].note, createdAt: M.cod[id].createdAt, imported: M.cod[id].imported }; const e = id => M.entries[id] && { sb: M.entries[id].sb, rc: M.entries[id].rc, v: M.entries[id].v, settled: M.entries[id].settled }; return { CS1: c('CS1'), CS2: c('CS2'), CS3: c('CS3'), CS4: c('CS4'), ES1: e('ES1'), ES2: e('ES2'), ES3: e('ES3') }; });
  log('cod:', JSON.stringify([S.CS1, S.CS2, S.CS3, S.CS4])); log('entries:', JSON.stringify([S.ES1, S.ES2, S.ES3]));
  /* ① COD */
  if (!S.CS1 || S.CS1.settled !== 'SET1' || S.CS1.amt !== 100 || S.CS1.v !== true || S.CS1.note !== '') errs.push('① settled COD row must stay exactly as it was (file had 999 · no ✓ · a note)');
  if (!S.CS2 || S.CS2.v !== true || S.CS2.vn !== 'app ok' || S.CS2.note !== 'from file' || S.CS2.createdAt !== '2026-10-20T10:00:00Z' || S.CS2.settled) errs.push('① open COD row: note merged from the file, app ✓ kept (file blank), createdAt kept, still unsettled');
  if (!S.CS3 || S.CS3.void !== true || S.CS3.v !== true) errs.push('① voided COD row stays voided (merge), ✓ from the file applied');
  if (!S.CS4 || S.CS4.amt !== 50 || S.CS4.note !== 'new one' || S.CS4.v !== true || !S.CS4.imported) errs.push('① new COD row comes in');
  /* ② entries */
  if (!S.ES1 || S.ES1.settled !== 'SET1' || !S.ES1.sb || !S.ES1.rc || !S.ES1.v) errs.push('② settled entry must stay as it was');
  if (!S.ES2 || !S.ES2.sb || !S.ES2.rc || !S.ES2.v || S.ES2.settled) errs.push('② blank cells in the file must not clear ① · ② · ✓ made in the app');
  if (!S.ES3 || !S.ES3.sb || S.ES3.rc || S.ES3.v) errs.push('② TRUE in the file still marks (SmartBee → sb), others untouched');
  /* ---------- ③ ① 수금 입력 파일 (_ENTRIES 22칸) ---------- */
  const EH = ['ID', '입력시각', '세일즈맨', '이메일', '가게', '계정', '주소', 'Pay Type', 'Check#', '금액', '메모', 'Deposit', '신규', '리포트', '상태', 'Post', 'Invoices', '받은날짜', '모바일', '보관', '대체', '원래체크'];
  const er = (id, amt, memo) => [id, '2026-10-20', 'BRANDON', 'brandon@x.com', 'ALI B/S # 1', '1111', '', 'CHECK', '7777', amt, memo, '', '', '', '', '', 'A10055:' + amt, '2026-10-20', '', '', '', ''];
  await pg.evaluate(sh => { window.__SHEETS = sh; document.getElementById('impOut').innerHTML = ''; }, { _ENTRIES: [EH, er('ES1', 999, 'file 999'), er('ES2', 123, 'memo from file'), er('ES4', 55, 'brand new')] });
  await pg.setInputFiles('#f1', { name: 'THE ONE 수금 입력.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('③ import should finish'));
  const msg3 = await pg.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); log('③ msg:', msg3.slice(0, 240));
  if (!/🔒.*1건/.test(msg3)) errs.push('③ message should say 1 settled entry was left alone');
  const E = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const e = id => M.entries[id] && { total: M.entries[id].total, memo: M.entries[id].memo, sb: M.entries[id].sb, rc: M.entries[id].rc, v: M.entries[id].v, settled: M.entries[id].settled }; return { ES1: e('ES1'), ES2: e('ES2'), ES4: e('ES4') }; }); log('③ entries:', JSON.stringify(E));
  if (!E.ES1 || E.ES1.settled !== 'SET1' || E.ES1.total === 999 || E.ES1.memo === 'file 999') errs.push('③ settled entry must stay exactly as it was');
  if (!E.ES2 || E.ES2.total !== 123 || E.ES2.memo !== 'memo from file' || !E.ES2.sb || !E.ES2.rc || !E.ES2.v || E.ES2.settled) errs.push('③ open entry: amount · memo from the file, app ① ② ✓ kept, still unsettled');
  if (!E.ES4 || E.ES4.total !== 55 || E.ES4.sb || E.ES4.v) errs.push('③ new entry comes in fresh');
  /* ---------- ④ 📌 정산 마감일 ---------- */
  await pg.fill('#allSettle', '2026-10-21');
  const codRowD = (id, d, amt) => ['BRANDON', d, '1111', 'ALI B/S # 1', 'COD', '', amt, 'A10055', amt, '', '', '', '', '', '', '', '', id, false, ''];
  await pg.evaluate(sh => { window.__SHEETS = sh; document.getElementById('impOut').innerHTML = ''; }, { 'COD 입력': [COD_H, codRowD('CS1', '2026-10-20', 100), codRowD('CS2', '2026-10-20', 100), codRowD('CS5', '2026-10-25', 70)], 'BRANDON': [SM_H, ['ES1', false, false, false, '', '', '', ''], ['ES3', false, false, false, '', '', '', '']] });
  await pg.setInputFiles('#f2', { name: 'THE ONE 수금 (SALES).xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('④ import should finish'));
  const msg4 = await pg.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); log('④ msg:', msg4.slice(0, 240));
  if (!/📌 2026-10-21 까지 .*건 정산 완료로/.test(msg4)) errs.push('④ message should say rows up to the cutoff were settled');
  const C4 = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const c = id => M.cod[id] && { settled: M.cod[id].settled, v: M.cod[id].v, amt: M.cod[id].amt }; const e = id => M.entries[id] && { settled: M.entries[id].settled, sb: M.entries[id].sb, rc: M.entries[id].rc, v: M.entries[id].v }; return { CS1: c('CS1'), CS2: c('CS2'), CS5: c('CS5'), ES1: e('ES1'), ES3: e('ES3') }; }); log('④:', JSON.stringify(C4));
  if (!C4.CS1 || C4.CS1.settled !== 'SET1') errs.push('④ app-settled COD stays SET1');
  if (!C4.CS2 || C4.CS2.settled !== 'sheet:2026-10-21' || !C4.CS2.v) errs.push('④ COD on/before the cutoff → settled sheet:cutoff');
  if (!C4.CS5 || C4.CS5.settled || C4.CS5.amt !== 70) errs.push('④ COD after the cutoff stays open');
  if (!C4.ES1 || C4.ES1.settled !== 'SET1') errs.push('④ app-settled entry stays SET1');
  if (!C4.ES3 || C4.ES3.settled !== 'sheet:2026-10-21' || !C4.ES3.sb || !C4.ES3.rc || !C4.ES3.v) errs.push('④ entry on/before the cutoff → settled, ① ② ✓ done');
  /* ① 수금 입력 파일에도 같은 마감일 */
  await pg.evaluate(sh => { window.__SHEETS = sh; document.getElementById('impOut').innerHTML = ''; }, { _ENTRIES: [EH, er('ES4', 55, 'brand new'), Object.assign(er('ES5', 60, 'after cutoff'), { 1: '2026-10-25', 17: '2026-10-25' })] });
  await pg.setInputFiles('#f1', { name: 'THE ONE 수금 입력.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('④ main import should finish'));
  const E4 = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const e = id => M.entries[id] && { d: M.entries[id].d, settled: M.entries[id].settled, v: M.entries[id].v }; return { ES4: e('ES4'), ES5: e('ES5') }; }); log('④ main:', JSON.stringify(E4));
  if (!E4.ES4 || E4.ES4.settled !== 'sheet:2026-10-21' || !E4.ES4.v) errs.push('④ _ENTRIES on/before the cutoff → settled');
  if (!E4.ES5 || E4.ES5.settled || E4.ES5.d !== '2026-10-25') errs.push('④ _ENTRIES after the cutoff stays open');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
