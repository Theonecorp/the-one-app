/* v0.8.174 시험 — 🖥 넓은 화면 정리: 아래 메뉴(홈 · 세일 · 수금 …)가 왼쪽 기둥 대신 머리띠 안 가로 메뉴로 · 담당자 주문 메뉴만 왼쪽 기둥 · 아이템 줄은 한 줄로 · 사진 크게 보기 확대 · 축소 · 이동
 *   ① 900px 이상: #nav 가 header 안(position static)에 있고 단추가 눌림 · 430px: 다시 body 끝의 아래 고정 메뉴
 *   ② 담당자 주문 화면(홈 · 목록)에서만 body.omenu-on → 본문이 210px 오른쪽 · 주문 편집 화면에서는 아님 · .omenu 는 머리띠 바로 아래부터
 *   ③ 1200px 이상 목록 보기: 아이템 줄의 코드 · 이름 · 재고가 한 줄(flex) · 줄 높이 60px 미만
 *   ④ 사진 팝업: 휠로 확대(배율 표시) · 끌어서 이동(translate) · ↺ 100% · 사진을 눌러도 안 닫힘 · 바깥을 누르면 닫힘 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8827', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); rows.forEach(r => { if (r[0] === 'AHG100' || r[0] === 'AHG105') r[9] = 'logo.png'; }); c0.j = JSON.stringify(rows);";
  const open = async (w, h) => { const pg = await (await br.newContext({ viewport: { width: w, height: h } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
    await pg.goto('http://127.0.0.1:8827/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(400); return pg; };
  const navInfo = pg => pg.evaluate(() => { const n = document.getElementById('nav'); return { parent: n.parentNode.tagName, pos: getComputedStyle(n).position, top: Math.round(n.getBoundingClientRect().top), btns: n.querySelectorAll('button').length }; });
  /* ① ② 컴퓨터 */
  const pc = await open(1600, 900); let nv = await navInfo(pc); log('① pc nav:', JSON.stringify(nv));
  if (nv.parent !== 'HEADER' || nv.pos !== 'static' || nv.top > 60) errs.push('① wide: nav lives inside the header bar');
  await pc.click('#nav button[data-go="hub/look"]'); await pc.waitForTimeout(400); if (!/#\/hub\/look/.test(await pc.evaluate(() => location.hash))) errs.push('① nav buttons in the header still navigate');
  await pc.evaluate(() => { location.hash = '#/order'; }); await pc.waitForTimeout(900);
  const dkw = () => document.body.classList.contains('dock') ? Math.round(document.getElementById('drawer').getBoundingClientRect().width) : 0;
  let st = await pc.evaluate(() => ({ dock: document.body.classList.contains('dock') ? Math.round(document.getElementById('drawer').getBoundingClientRect().width) : 0, on: document.body.classList.contains('omenu-on'), left: Math.round(document.getElementById('page').getBoundingClientRect().left), mtop: Math.round((document.querySelector('.omenu') || { getBoundingClientRect: () => ({ top: -1 }) }).getBoundingClientRect().top), hdr: Math.round(document.querySelector('header').getBoundingClientRect().bottom) })); log('② order home:', JSON.stringify(st));
  if (!st.on || st.left < st.dock + 210) errs.push('② staff order home: body.omenu-on and the page shifted right of the 210px column (+ docked drawer ' + st.dock + ') — got ' + st.left);
  if (st.mtop < st.hdr - 2 || st.mtop > st.hdr + 4) errs.push('② the staff menu column starts right under the header (menu top ' + st.mtop + ', header bottom ' + st.hdr + ')');
  await pc.evaluate(() => { location.hash = '#/order/new'; }); await pc.waitForSelector('#eStoreQ'); await pc.waitForTimeout(400);
  st = await pc.evaluate(() => ({ dock: document.body.classList.contains('dock') ? Math.round(document.getElementById('drawer').getBoundingClientRect().width) : 0, on: document.body.classList.contains('omenu-on'), left: Math.round(document.getElementById('page').getBoundingClientRect().left) })); log('② editor:', JSON.stringify(st));
  if (st.on || st.left !== st.dock) errs.push('② the order editor has no staff column (omenu-on off) — page starts right after the docked drawer, got ' + st.left + ' vs ' + st.dock);
  /* ③ 목록 보기 한 줄 */
  await pc.fill('#eStoreQ', 'ali'); await pc.waitForTimeout(250); await pc.click('#eStoreHits [data-ac]'); await pc.waitForTimeout(900); if (await pc.$('#modal.on')) { await pc.click('#modal .mclose'); await pc.waitForTimeout(200); }
  await pc.click('[data-ck="Earrings · Hoops & Pincatch"]'); await pc.waitForTimeout(200); await pc.click('[data-ck="Aluminum"]'); await pc.waitForTimeout(150); await pc.click('[data-ck="Gold"]'); await pc.waitForTimeout(400);
  for (let i = 0; i < 2 && !(await pc.$('tr.irow')); i++) { await pc.click('#eVM'); await pc.waitForTimeout(500); }
  const row = await pc.$eval('tr.irow', e => ({ disp: getComputedStyle(e.querySelector('.ct')).display, h: e.getBoundingClientRect().height })).catch(() => null); log('③ row:', JSON.stringify(row));
  if (!row || row.disp !== 'flex' || row.h >= 60) errs.push('③ wide list rows are one line (flex, under 60px)');
  /* ④ 사진 확대 */
  await pc.click('tr.irow img[data-big]'); await pc.waitForTimeout(400);
  const zi = () => pc.evaluate(() => { const p = document.getElementById('ppop'); return { on: p.classList.contains('on'), lab: (p.querySelector('.ppzs') || {}).textContent, tf: (p.querySelector('.ppz img') || { style: {} }).style.transform }; });
  let z = await zi(); if (!z.on || z.lab !== '100%') errs.push('④ photo popup opens at 100%');
  const bb = await (await pc.$('.ppz')).boundingBox(); await pc.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await pc.mouse.wheel(0, -300); await pc.waitForTimeout(200); z = await zi(); log('④ wheel:', JSON.stringify(z));
  if (!/scale\(1\.2\)/.test(z.tf) || z.lab !== '120%') errs.push('④ wheel up zooms in (got ' + z.tf + ' ' + z.lab + ')');
  await pc.mouse.down(); await pc.mouse.move(bb.x + bb.width / 2 + 80, bb.y + bb.height / 2 + 40, { steps: 5 }); await pc.mouse.up(); await pc.waitForTimeout(100); z = await zi(); log('④ drag:', JSON.stringify(z));
  if (!z.on) errs.push('④ dragging the photo does not close the popup'); if (!/translate\((?!0px, 0px)/.test(z.tf)) errs.push('④ dragging pans the zoomed photo (got ' + z.tf + ')');
  await pc.click('.ppz img'); await pc.waitForTimeout(150); z = await zi(); if (!z.on) errs.push('④ a click on the photo does not close the popup');
  await pc.click('[data-pz="0"]'); await pc.waitForTimeout(100); z = await zi(); if (z.lab !== '100%' || z.tf) errs.push('④ reset returns to 100% (got ' + z.lab + ' ' + z.tf + ')');
  await pc.click('[data-pz="+"]'); await pc.waitForTimeout(100); z = await zi(); if (z.lab !== '150%') errs.push('④ + button zooms to 150% (got ' + z.lab + ')');
  await pc.mouse.click(20, 450); await pc.waitForTimeout(200); z = await zi(); if (z.on) errs.push('④ clicking the backdrop closes the popup');
  await pc.context().close();
  /* ① 폰 */
  const ph = await open(430, 900); nv = await navInfo(ph); log('① phone nav:', JSON.stringify(nv));
  if (nv.parent !== 'BODY' || nv.pos !== 'fixed' || nv.top < 700) errs.push('① phone: nav is the fixed bottom bar');
  await ph.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
