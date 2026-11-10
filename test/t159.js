/* v0.8.174 시험 — 🔁 ① 수금 입력(_ENTRIES) 가져오기: 세일즈맨이 앱에서 이미 보낸 수금(같은 거래처 + 수표번호)이 파일에 또 있으면 건너뜀 (11/5 가져오기 때 17건이 두 번 잡혀 "보낸 수금이 다시 살아난" 일)
 *   ① 앱 수금(imported 아님) BRANDON · 1111 · 수표 #7777 이 있을 때, 파일에 같은 거래처 · 같은 수표번호 줄(ES-DUP)이 있으면 안 들어오고 메시지에 "🔁 … 1건 건너뜀"
 *   ② 다른 수표번호 줄(ES-NEW)은 들어옴 · 앱 수금은 그대로
 *   ③ 앱에서 취소(void)된 수금과 같은 수표는 건너뛰지 않음 (다시 들어올 수 있어야 함) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8824', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const EH = ['ID', '입력시각', '세일즈맨', '이메일', '가게', '계정', '주소', 'Pay Type', 'Check#', '금액', '메모', 'Deposit', '신규', '리포트', '상태', 'Post', 'Invoices', '받은날짜', '모바일', '보관', '대체', '원래체크'];
  const er = (id, ref, amt, memo) => [id, '2026-10-21', 'BRANDON', 'brandon@x.com', 'ALI B/S # 1', '1111', '', 'CHECK', ref, amt, memo, '', '', '', '', '', 'A10055:' + amt, '2026-10-21', '', '', '', ''];
  const sheets = { _ENTRIES: [EH, er('ES-DUP', '7777', 500, 'same check as the app entry'), er('ES-NEW', '7778', 60, 'new check'), er('ES-VOIDED', '7779', 70, 'same check as a voided app entry')] };
  await pg.addInitScript(sh => {
    window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' };
    window.__AFTER_SEED__ = s => {
      const eb = s.entries.find(e => e.sm === 'BRANDON') || s.entries[0];
      const mk = (id, o) => { const e = JSON.parse(JSON.stringify(eb)); delete e.imported; return Object.assign(e, { id, d: '2026-10-20', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', rep: true, sb: false, void: false }, o); };
      s.entries.push(mk('APP-7777', { pays: [{ m: 'CHECK', ref: '7777', amt: 500, dep: '', mob: false }], total: 500 }), mk('APP-7779', { pays: [{ m: 'CHECK', ref: '7779', amt: 70, dep: '', mob: false }], total: 70, void: true, vn: 'wrong store' }));
    };
    window.__SHEETS = sh;
    window.XLSX = { read: () => { const S = window.__SHEETS; return { SheetNames: Object.keys(S), Sheets: Object.fromEntries(Object.keys(S).map(n => [n, { rows: S[n] }])) }; }, utils: { sheet_to_json: ws => ws.rows.map(r => r.slice()) } };
  }, sheets);
  await pg.goto('http://127.0.0.1:8824/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#f1', { state: 'attached', timeout: 8000 }); await pg.evaluate(() => { const d = document.getElementById('impOld'); if (d) d.open = true; });
  await pg.setInputFiles('#f1', { name: 'THE ONE 수금 입력.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fake') });
  await pg.waitForFunction(() => document.querySelectorAll('#impOut .alert').length >= 1 && !document.getElementById('busy').classList.contains('on'), null, { timeout: 30000 }).catch(() => errs.push('import should finish'));
  const msg = await pg.$$eval('#impOut .alert', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); log('msg:', msg.slice(0, 260));
  if (/a-red/.test(await pg.$eval('#impOut', e => e.innerHTML)) || !/저장 완료/.test(msg)) errs.push('import should succeed');
  if (!/🔁.*1건 건너뜀/.test(msg)) errs.push('① message should say 1 duplicate check was skipped');
  const E = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const e = id => M.entries[id] && { total: M.entries[id].total, imported: !!M.entries[id].imported, rep: M.entries[id].rep, void: M.entries[id].void }; return { dup: e('ES-DUP'), nw: e('ES-NEW'), vd: e('ES-VOIDED'), app: e('APP-7777'), appV: e('APP-7779') }; }); log('entries:', JSON.stringify(E));
  if (E.dup) errs.push('① the duplicate check must not be imported');
  if (!E.nw || E.nw.total !== 60 || !E.nw.imported) errs.push('② the other check comes in');
  if (!E.app || E.app.total !== 500 || E.app.rep !== true || E.app.imported) errs.push('② the app entry stays as it was');
  if (!E.vd || E.vd.total !== 70) errs.push('③ a check matching only a voided app entry is not skipped');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
