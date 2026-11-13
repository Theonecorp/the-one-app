/* v0.8.238 시험 — ✏️ 인보이스 수정에서 아이템 추가해도 창이 위로 튀지 않음 · 🅱 서류의 회사 · 손님 이름 굵게 (2026-11-13 관리자: "하나 넣고 다시 위로 튀어 올라가고 다시 스크롤" · "픽킹 · 인보이스 · 스테이트먼트 · 크레딧 메모 — 회사 이름 · 손님 이름 Bold")
 *   ① 폰(390×640): 인보이스 수정 창을 아래(아이템 추가 칸)까지 내린 뒤 아이템을 세 번 넣어도 창 스크롤이 그 자리 · 추가 칸이 화면 안 · 줄 목록은 맨 아래(방금 넣은 줄 보임)
 *      · 아이템 칸이 새로 만들어지지 않음(같은 칸 — 폰 키보드가 닫히지 않음) · 칸은 비워져 다음 아이템 바로
 *   ② 인보이스 인쇄: 회사 이름(.ivco) · Bill To/Ship To 손님 이름(.ivpn) 굵기 900 · 손님 이름 15px
 *   ③ 피킹 리스트 · 크레딧 메모의 손님 이름(.docnm) · 크레딧 메모 회사 이름(.doccn) 도 900 · 서류 틀에 그 이름표가 들어 있음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8998', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 390, height: 640 }, isMobile: true, hasTouch: true })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => { Object.assign(s.orders[0], { st: 'picked', cfOk: true, picker: 'luke@theonefl.com', pickerName: 'L' }); s.stock = ['AHG100', 'AHG101', 'AHG102', 'AHG103', 'AHG104'].map(c => ({ id: c, code: c, qty: 100 })); }; });
  await pg.goto('http://127.0.0.1:8998/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mInv', { timeout: 8000 });
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForSelector('#prt.on #prtbody .iv', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(500);
  /* ② */
  const w = await pg.evaluate(() => { const g = s => { const e = document.querySelector('#prtbody ' + s); if (!e) return null; const c = getComputedStyle(e); return c.fontWeight + '/' + c.fontSize; }; return { co: g('.ivco'), pn: g('.ivpn') }; });
  log('② invoice print:', JSON.stringify(w)); if (!w.co || !/^900\//.test(w.co) || !w.pn || w.pn !== '900/15px') errs.push('② company + customer names bold (900) on the invoice');
  if (await pg.$('#prt.on')) await pg.click('#prtClose');
  /* ③ */
  const w3 = await pg.evaluate(() => { const b = document.getElementById('prtbody'); b.innerHTML = '<div class="pk"><b class="docnm">STORE</b> <b class="doccn">CO</b></div>'; const c = s => { const x = getComputedStyle(b.querySelector(s)); return x.fontWeight + '/' + x.fontSize; }; const r = { nm: c('.docnm'), cn: c('.doccn') }; b.innerHTML = ''; return r; });
  const src = ['fulfill.js', 'credit.js'].map(f => fs.readFileSync(path.resolve(__dirname, '../src', f), 'utf8'));
  log('③ docnm/doccn:', JSON.stringify(w3)); if (w3.nm !== '900/15px' || !/^900/.test(w3.cn)) errs.push('③ picking / credit memo name style');
  if (!/class="docnm">' \+ esc\(o\.store\)/.test(src[0]) || !/class="docnm">' \+ esc\(x\.store\)/.test(src[1]) || !/class="doccn">' \+ esc\(co\.name\)/.test(src[1])) errs.push('③ picking list and credit memo templates carry the name classes');
  /* ① */
  const no = await pg.evaluate(() => { const v = Object.values(window.__MOCK_STORE__.invoices).find(v => v.orderId === 'O261014-AAAA'); return v.no; });
  await pg.evaluate(() => { location.hash = '#/order/x'; }); await pg.waitForTimeout(200); await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; });
  await pg.waitForSelector('[data-mie]', { timeout: 8000 }); await pg.click('[data-mie="' + no + '"]'); await pg.waitForSelector('#ieOk', { timeout: 6000 });
  const scroller = () => pg.evaluate(() => { const c = [document.getElementById('modal'), document.querySelector('#modal .bwrap'), document.getElementById('mbox')].find(e => e && e.scrollHeight > e.clientHeight + 4); return c ? (c.id || c.className) : null; });
  const sel = await scroller(); log('① scrolling element:', sel);
  const st = () => pg.evaluate(s => { const c = s === 'modal' || s === 'mbox' ? document.getElementById(s) : document.querySelector('#modal .bwrap'); const a = document.getElementById('ieAdd').getBoundingClientRect(), L = document.getElementById('ieList'); return { top: c ? Math.round(c.scrollTop) : 0, max: c ? Math.round(c.scrollHeight - c.clientHeight) : 0, addIn: a.top >= 0 && a.bottom <= innerHeight, listEnd: L ? Math.round(L.scrollHeight - L.clientHeight - L.scrollTop) : 0, rows: document.querySelectorAll('[data-ieq]').length }; }, sel);
  await pg.evaluate(s => { const c = s === 'modal' || s === 'mbox' ? document.getElementById(s) : document.querySelector('#modal .bwrap'); if (c) c.scrollTop = c.scrollHeight; }, sel); await pg.waitForTimeout(100);
  const s0 = await st(); log('① before add:', JSON.stringify(s0)); await pg.evaluate(() => { document.getElementById('ieAdd').__keep = 1; });
  for (const c of ['AHG102', 'AHG103', 'AHG104']) { await pg.fill('#ieAdd', c); const sb = await st(); await pg.press('#ieAdd', 'Enter'); await pg.waitForTimeout(250); const s1 = await st(); log('① after add', c, JSON.stringify(s1));
    if (sel && sb.top > 0 && s1.top < Math.min(sb.top, s1.max) - 4) errs.push('① window jumped up after adding ' + c + ' (' + sb.top + ' → ' + s1.top + ')');   // 넣기 직전 자리 그대로 (칸을 누르면 키보드 모드로 창이 커져 자리가 한 번 바뀜 — 그 뒤 기준)
    if (!s1.addIn) errs.push('① add field stays on screen after ' + c);
    if (s1.listEnd > 4) errs.push('① line list shows the newly added line (' + c + ')'); }
  const rows = (await st()).rows; if (rows !== 5) errs.push('① three items added (rows ' + rows + ')');
  const same = await pg.evaluate(() => ({ keep: document.getElementById('ieAdd').__keep === 1, val: document.getElementById('ieAdd').value })); log('① same add field (keyboard stays):', JSON.stringify(same));
  if (!same.keep) errs.push('① the add field is not re-created (phone keyboard would close)'); if (same.val) errs.push('① add field cleared for the next item');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
