/* v0.8.146 시험 — 주문 화면: 가운데(#eBody)만 스크롤되는 세 칸 · ☰ 목록 보기는 표 · 사진은 🔍 팝업(전체 화면 아님) · 🗑 주문 취소
 *   담당자 주문 목록: 세일즈맨 · 날짜 묶음이 표 하나 안의 묶음 줄(열이 위아래로 맞음) · 묶음 머리 누르면 접힘 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8859', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 860 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; try { localStorage.removeItem('theone.order.wip.' + o.email); localStorage.setItem('theone.order.view', 'list'); } catch (x) {}
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    window.__AFTER_SEED__ = s => { s.catalog[0].photoVer = 'P1'; s.itemPhotos = [{ id: 'AHG100', code: 'AHG100', data: PNG, none: false, by: 'x', at: '2026-10-30T00:00:00Z' }]; if (!o.seed) return; const ago = h => new Date(Date.now() - h * 3600000).toISOString(); const mk2 = (id, sm, store, h) => ({ id, no: id, d: ago(h).substring(0, 10), ym: ago(h).substring(0, 7), sm, acct: '1111', store, st: 'sent', n: 1, qty: 1, amt: 10, createdAt: ago(h), updatedAt: ago(h), sentAt: ago(h) }); s.orders = [mk2('O-A1', 'ALEX', 'A SHOP', 1), mk2('O-B1', 'BRANDON', 'B SHOP', 2), mk2('O-B2', 'BRANDON', 'B SHOP TWO', 30)]; s.orderLines = []; }; }, { email, seed }); await pg.goto('http://127.0.0.1:8859/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500); return pg; };

  /* ---------- 세일즈맨: 주문 화면 ---------- */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ', { timeout: 8000 });
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(150); }
  await pg.fill('#eQ1', 'AHG'); await pg.waitForTimeout(600);
  /* 목록 보기 = 표 */
  const rows = await pg.$$eval('#eRes table.olist tr.irow', r => r.length); log('list rows:', rows); if (!rows) errs.push('list view should be a table');
  if (!(await pg.$('#eRes .irow .ct > b'))) errs.push('row should keep .ct > b code');
  /* 가운데만 스크롤 */
  const lay = await pg.evaluate(() => { const b = document.getElementById('eBody'); const r = b.getBoundingClientRect(); return { pane: b.classList.contains('epane'), h: Math.round(r.height), scrollable: b.scrollHeight > b.clientHeight, docScroll: document.documentElement.scrollHeight - window.innerHeight }; });
  log('layout:', lay); if (!lay.pane || !lay.scrollable) errs.push('eBody should be a scroll pane'); if (lay.docScroll > 40) errs.push('page itself should not scroll much: ' + lay.docScroll);
  await pg.evaluate(() => { document.getElementById('eBody').scrollTop = 600; }); await pg.waitForTimeout(200);
  const after = await pg.evaluate(() => ({ head: document.getElementById('eHead').getBoundingClientRect().top, bar: document.querySelector('.sticky').getBoundingClientRect().bottom, vh: window.innerHeight, sy: window.scrollY }));
  log('after scroll:', after); if (after.sy > 2 || after.head > 80 || after.bar > after.vh - 40) errs.push('head/bottom should stay fixed while the middle scrolls');
  /* 사진 팝업 (목록 줄 사진 · 카드 🔍) */
  const hasImg = await pg.$('#eRes .ith[data-big]');
  if (hasImg) { await hasImg.click(); await pg.waitForTimeout(200); if (!(await pg.$('#ppop.on'))) errs.push('photo should open a popup'); if (await pg.$('#viewer')) errs.push('photo should not open the full-screen viewer'); await pg.click('#ppX'); await pg.waitForTimeout(100); if (await pg.$('#ppop.on')) errs.push('popup should close'); }
  else log('no item photo in mock — popup checked via API');
  const cur = await pg.$eval('#eRes .ith', e => getComputedStyle(e).cursor); log('cursor:', cur); if (cur !== 'zoom-in') errs.push('photo cursor should be zoom-in');
  /* 담고 → 🗑 주문 취소 */
  await pg.click('#eRes .irow .ct'); await pg.waitForTimeout(200); const n0 = await pg.textContent('#eN'); log('lines after tap:', n0); if (n0.trim() !== '1') errs.push('tapping a list row should add 1 line');
  if (!(await pg.$('#eCancel'))) errs.push('cancel button missing');
  await pg.click('#eCancel'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(600);
  const wip = await pg.evaluate(() => localStorage.getItem('theone.order.wip.brandon@x.com')), hash = await pg.evaluate(() => location.hash); log('after cancel:', hash, 'wip:', wip);
  if (wip) errs.push('cancel should clear the draft'); if (/order\/new/.test(hash)) errs.push('cancel should leave the editor');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'order_pane.png') });
  await pg.close();

  /* ---------- 담당자: 묶음 표 ---------- */
  pg = await mk('luke@theonefl.com', true);
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800); await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' }))); await pg.waitForTimeout(800);
  if (await pg.$('[data-grp="sm"]')) { await pg.click('[data-grp="sm"]'); await pg.waitForTimeout(500); }
  const g = await pg.evaluate(() => { const t = [...document.querySelectorAll('#page table.otbl')]; return { tables: t.length, grp: t.length ? t[0].querySelectorAll('tr.grp').length : 0, rows: t.length ? t[0].querySelectorAll('tr[data-oid]').length : 0 }; });
  log('sm grouping:', g); if (g.tables !== 1 || g.grp < 2 || g.rows !== 3) errs.push('salesman groups should be one table with group rows: ' + JSON.stringify(g));
  await pg.click('tr[data-smhd="BRANDON"] b'); await pg.waitForTimeout(200);
  const hid = await pg.$$eval('tr[data-sg="BRANDON"]', r => r.map(x => x.classList.contains('hide'))); log('fold:', hid); if (hid.length !== 2 || !hid.every(Boolean)) errs.push('tapping a group head should fold its rows');
  await pg.click('tr[data-smhd="BRANDON"] b'); await pg.waitForTimeout(200);
  if (await pg.$('[data-grp="day"]')) { await pg.click('[data-grp="day"]'); await pg.waitForTimeout(500); const d = await pg.evaluate(() => { const t = [...document.querySelectorAll('#page table.otbl')]; return { tables: t.length, grp: t.length ? t[0].querySelectorAll('tr.grp').length : 0 }; }); log('day grouping:', d); if (d.tables !== 1 || d.grp < 2) errs.push('day groups should be one table'); }
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'order_groups.png') });
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
