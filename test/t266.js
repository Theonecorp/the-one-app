/* v0.8.227 시험 — ↩ 크레딧 요청 사무실 ✏️ 수정 · 🗑 삭제 · 📤 PDF 는 파일만 보내기 (2026-11-13 관리자: "디스카운트 백이 안 잡힌 경우나 중복 크레딧 — 수정 또는 삭제" · "보낼 때 app.theonefl.com 주소까지 같이 — 인보이스만")
 *   ① 사무실이 확인 대기 크레딧 요청을 열면 ✏️ 수정 · 🗑 삭제 · ✕ 취소 · 크레딧 확정
 *   ② ✏️ 수정 → 편집 화면에서 🏷 할인 백 20% → 저장 → 확인 화면 금액 −$4.50 → −$4.00 · 할인 백 20% 표시 · 여전히 확인 대기
 *   ③ 🗑 삭제 → 주문 · 줄 문서가 지워짐 (중복 요청)
 *   ④ 📤 PDF 보내기 (파일 공유가 되는 폰) → 공유 창에 PDF 파일 하나만 (url · text · title 없음) · 공유 안 되는 컴퓨터에서는 단추가 안 보임 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8958', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const SEED = () => { window.__AFTER_SEED__ = s => { const now = '2026-11-12T10:00:00Z';
    s.accounts.find(a => a.acct === '1111').disc = { A: 10 };
    const mk = id => ({ id, no: id, kind: 'credit', st: 'sent', d: '2026-11-12', ym: '2026-11', sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', why: '대미지', disc: { A: 10 }, n: 1, qty: 2, amt: -4.5, createdBy: 'brandon@x.com', createdAt: now, sentAt: now, updatedAt: now });
    s.orders.push(mk('O261112-CR66'), mk('O261112-DUP6'));
    s.orderLines.push({ id: 'O261112-CR66', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 2, p: 2.5, lp: 2.5, t: 'A' }] }, { id: 'O261112-DUP6', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 2, p: 2.5, lp: 2.5, t: 'A' }] });
    const d = new Date().toISOString().substring(0, 10); s.invoices = (s.invoices || []).concat([{ id: 'A-050500', no: 'A-050500', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', d, t: 'A', total: 100, bal: 100, st: 'open', src: 'app', terms: 'N30', lines: [{ c: 'AHG100', d: 'X', q: 2, p: 50, amt: 100, t: 'A' }] }]);
    s.users.push({ id: 'off@x.com', email: 'off@x.com', name: 'O', role: 'manager', job: 'office', active: true }); }; };
  const open = async (email, W, share) => { const pg = await (await br.newContext({ viewport: { width: W, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'U' }; }, email); await pg.addInitScript(SEED);
    if (share) await pg.addInitScript(() => { window.__SHARED__ = []; navigator.canShare = d => !!(d && d.files && d.files.length); navigator.share = async d => { window.__SHARED__.push({ keys: Object.keys(d).sort(), files: (d.files || []).map(f => f.name + '|' + f.type) }); };
      window.html2pdf = () => { const o = { set(x) { o.opt = x; return o; }, from() { return o; }, save: async () => {}, outputPdf: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }) }; return o; }; });
    await pg.goto('http://127.0.0.1:8958/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600); return pg; };
  const pg = await open('off@x.com', 1300);
  /* ① */
  await pg.evaluate(() => { location.hash = '#/order/O261112-CR66'; }); await pg.waitForSelector('#crrOk', { timeout: 8000 });
  const B = await pg.evaluate(() => ['crrEd', 'crrDel', 'crrX', 'crrOk'].filter(i => document.getElementById(i))); log('① buttons:', B.join());
  if (B.length !== 4) errs.push('① edit · delete · cancel · confirm on a credit request');
  const amt0 = (await pg.textContent('#page .hero')).trim(); if (!/4\.50/.test(amt0)) errs.push('① starts at −$4.50 (store 10%): ' + amt0);
  /* ② */
  await pg.click('#crrEd'); await pg.waitForSelector('[data-ev="memo"]', { timeout: 8000 }); await pg.click('[data-ev="memo"]'); await pg.waitForSelector('[data-ecd="20"]'); await pg.click('[data-ecd="20"]'); await pg.waitForTimeout(200);
  await pg.click('#eSave'); await pg.waitForSelector('#crrOk', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(500);
  const after = await pg.evaluate(() => ({ hero: (document.querySelector('#page .hero') || {}).textContent || '', sub: (document.querySelector('#page .heroSub') || {}).textContent || '', st: window.__MOCK_STORE__.orders['O261112-CR66'].st, db: window.__MOCK_STORE__.orders['O261112-CR66'].dback }));
  log('② after edit:', JSON.stringify(after));
  if (!/4\.00/.test(after.hero) || !/20%/.test(after.sub) || after.st !== 'sent' || after.db !== 20) errs.push('② edited credit: discount back 20% → −$4.00, still waiting for review');
  /* ③ */
  await pg.evaluate(() => { location.hash = '#/order/O261112-DUP6'; }); await pg.waitForSelector('#crrDel', { timeout: 8000 }); await pg.click('#crrDel'); await pg.click('#cfOk'); await pg.waitForTimeout(600);
  const gone = await pg.evaluate(() => ({ o: !!window.__MOCK_STORE__.orders['O261112-DUP6'], l: !!(window.__MOCK_STORE__.orderLines || {})['O261112-DUP6'], other: !!window.__MOCK_STORE__.orders['O261112-CR66'] }));
  log('③ after delete:', JSON.stringify(gone)); if (gone.o || gone.l || !gone.other) errs.push('③ delete removes only that request (order + lines)');
  /* ④ */
  const desk = await pg.evaluate(() => { const b = document.getElementById('prtShare'); return b ? b.hidden : 'none'; }); log('④ desktop share button hidden:', desk); if (desk !== true) errs.push('④ no share button where file sharing is not supported');
  const ph = await open('brandon@x.com', 390, true);
  await ph.evaluate(() => { location.hash = '#/invs'; }); await ph.waitForSelector('[data-ivm="store"]', { timeout: 8000 }); await ph.click('[data-ivm="store"]'); await ph.waitForSelector('[data-ia="1111"]', { timeout: 8000 }); await ph.click('[data-ia="1111"]');
  await ph.waitForSelector('#ssStmt', { timeout: 8000 }); await ph.click('[data-ss="inv"]'); await ph.waitForSelector('[data-si="A-050500"]', { timeout: 8000 }); await ph.click('[data-si="A-050500"]'); await ph.waitForSelector('#idPrint', { timeout: 8000 });
  await ph.click('#idPrint'); await ph.waitForSelector('#prt.on #prtbody .iv', { timeout: 8000 });
  if (!(await ph.isVisible('#prtShare'))) errs.push('④ phone: 📤 PDF send button in the print bar');
  else { await ph.click('#prtShare'); await ph.waitForTimeout(800); }
  const sh = await ph.evaluate(() => window.__SHARED__); log('④ shared:', JSON.stringify(sh));
  if (!sh || sh.length !== 1 || sh[0].keys.join() !== 'files' || !/^Invoice-A-050500\.pdf\|application\/pdf$/.test(sh[0].files[0] || '')) errs.push('④ share sends only the PDF file (no app address / text)');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
