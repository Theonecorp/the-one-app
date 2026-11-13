/* v0.8.223 시험 (v0.8.224 PDF 모양 보강) — 📄 세일즈맨이 폰에서 인보이스 · 스테이트먼트를 보고 인쇄 · PDF 저장 · 폰 인쇄 화면은 종이 크기 그대로 줄여서 (2026-11-13 관리자: "폰에서는 글씨가 겹쳐 보이고 규격에 안 맞음 · PDF 로 다운")
 *   ① 세일즈맨(폰 390px) · 거래처 → 인보이스 상세: 🖨 인쇄 · 📄 PDF 단추
 *   ② 🖨 인쇄 창: 폰에서는 인보이스 장이 종이 폭(7.7in)으로 그려지고 화면에 맞게 줄어듦 (가로로 넘치지 않음 · 글씨 줄바꿈으로 겹치지 않음)
 *   ③ 📄 PDF: 종이(letter) 크기 · 파일 이름 Invoice-번호.pdf (PDF 도구는 시험에서 가짜)
 *   ④ 손님용 스테이트먼트도 인쇄 창 → 📄 PDF 저장 → Statement-계정-날짜.pdf
 *   ⑤ 넓은 화면(데스크탑)은 예전 그대로 (줄이지 않음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8954', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async W => { const pg = await (await br.newContext({ viewport: { width: W, height: 844 } })).newPage(); pg.on('pageerror', e => errs.push(W + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' };
      window.__PDF__ = []; window.html2pdf = () => { const o = { opt: null, set(x) { o.opt = x; return o; }, from(el) { o.el = el; return o; }, save() { window.__PDF__.push({ name: o.opt.filename, fmt: o.opt.jsPDF.format, w: Math.round(o.el.getBoundingClientRect().width), n: o.el.querySelectorAll('.iv').length, id: o.el.id, logo: Math.round((o.el.querySelector('.ivlogo') || { getBoundingClientRect: () => ({ width: -1 }) }).getBoundingClientRect().width), flex: getComputedStyle(o.el.querySelector('.ivh') || o.el).display, txt: o.el.textContent.slice(0, 200) }); return Promise.resolve(); } }; return o; };
      window.__AFTER_SEED__ = s => { const d = new Date().toISOString().substring(0, 10); s.invoices = (s.invoices || []).concat([{ id: 'A-050500', no: 'A-050500', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', d, t: 'A', total: 100, bal: 100, st: 'open', src: 'app', terms: 'N30',
        lines: [{ c: 'AHG100', d: 'LONG DESCRIPTION OF A JEWELRY ITEM THAT WRAPS ON A PHONE', q: 2, p: 50, amt: 100, t: 'A' }] }]); }; });
    await pg.goto('http://127.0.0.1:8954/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(800); return pg; };
  /* ① */
  const pg = await open(390);
  const toInv = async p => { await p.evaluate(() => { location.hash = '#/invs'; }); await p.waitForSelector('[data-ivm="store"]', { timeout: 8000 }); await p.click('[data-ivm="store"]'); await p.waitForSelector('[data-ia="1111"]', { timeout: 8000 }); await p.click('[data-ia="1111"]');
    await p.waitForSelector('#ssStmt', { timeout: 8000 }); await p.click('[data-ss="inv"]'); await p.waitForSelector('[data-si="A-050500"]', { timeout: 8000 }); await p.click('[data-si="A-050500"]'); await p.waitForSelector('#idPrint', { timeout: 8000 }); };
  await toInv(pg).catch(e => errs.push('① 🖨 print button on the invoice (store → invoices → invoice): ' + e.message.slice(0, 80)));
  if (!(await pg.$('#idPdf'))) errs.push('① 📄 PDF button on the invoice');
  /* ② */
  await pg.click('#idPrint'); await pg.waitForSelector('#prt.on #prtbody .iv', { timeout: 8000 });
  const F = await pg.evaluate(() => { const iv = document.querySelector('#prtbody .iv'), r = iv.getBoundingClientRect(), P = document.getElementById('prt'); return { pz: P.classList.contains('pz'), zoom: getComputedStyle(iv).zoom, w: Math.round(r.width), cssW: Math.round(parseFloat(getComputedStyle(iv).width)), over: P.scrollWidth - P.clientWidth, pdfBtn: !!document.getElementById('prtPdf') }; });
  log('② phone print view:', JSON.stringify(F));
  if (!F.pz || !(Number(F.zoom) < 1) || F.w > 390 || F.over > 2) errs.push('② phone: the page is scaled to fit (no sideways overflow)');
  if (F.cssW < 700) errs.push('② phone: drawn at paper width 7.7in, not squeezed');
  if (!F.pdfBtn) errs.push('② 📄 PDF in the print bar');
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT });
  /* ③ */
  await pg.click('#prtPdf'); await pg.waitForTimeout(800);
  let P = await pg.evaluate(() => window.__PDF__); log('③ pdf:', JSON.stringify(P));
  /* v0.8.224: PDF 로 넘기는 장도 인보이스 모양(#prtbody 아래 CSS)이 걸려 있어야 — 로고 58px · 머리 줄 flex (예전: 로고가 장 전체 크기 · 칸이 풀림) */
  if (!P.length || P[0].id !== 'prtbody' || P[0].logo < 40 || P[0].logo > 80 || P[0].flex !== 'flex') errs.push('③ PDF keeps the invoice styling (logo ' + (P[0] || {}).logo + 'px · header ' + (P[0] || {}).flex + ')');
  if (!P.length || P[0].name !== 'Invoice-A-050500.pdf' || P[0].fmt !== 'letter' || P[0].n !== 1 || P[0].w < 700) errs.push('③ PDF: letter · Invoice-A-050500.pdf · one page at paper width');
  /* ④ */
  await pg.click('#prtClose'); await pg.waitForTimeout(300); await pg.click('#idStore2'); await pg.waitForSelector('#ssStmt', { timeout: 8000 }); await pg.click('#ssStmt'); await pg.waitForSelector('#stGo', { timeout: 8000 });
  await pg.click('#stGo'); await pg.waitForSelector('#prt.on #prtbody .iv', { timeout: 8000 }); await pg.click('#prtPdf'); await pg.waitForTimeout(800);
  P = await pg.evaluate(() => window.__PDF__); log('④ statement pdf:', JSON.stringify(P[P.length - 1]));
  if (!/^Statement-1111-\d{4}-\d{2}-\d{2}\.pdf$/.test((P[P.length - 1] || {}).name || '')) errs.push('④ statement PDF named Statement-1111-date.pdf');
  /* ⑤ */
  const dk = await open(1300);
  await toInv(dk); await dk.click('#idPrint'); await dk.waitForSelector('#prt.on #prtbody .iv');
  const D = await dk.evaluate(() => ({ pz: document.getElementById('prt').classList.contains('pz'), zoom: getComputedStyle(document.querySelector('#prtbody .iv')).zoom })); log('⑤ desktop:', JSON.stringify(D));
  if (D.pz || Number(D.zoom) !== 1) errs.push('⑤ desktop print view unchanged');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
