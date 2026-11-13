/* v0.8.174 시험 — 📌 담당자 주문 메뉴 고정: 단계(접수 · 출고 · 완료 · 기타)를 누를 때마다 세부 칸이 생겼다 없어지지 않고 모든 칸이 묶음별로 항상 보임
 *   ① 어느 담당자 화면이든 [data-lg] 단계 단추가 없고 .omenu 안에 묶음(data-og) 4개 · 그 일(job)의 칸이 전부 있음 (오피스 · 창고 매니저 · 픽킹 담당)
 *   ② 컴퓨터(900–1199px · v0.8.181 부터 1200px 이상은 고정 서랍 하나로 — t177): 메뉴가 왼쪽 메뉴 단추들 바로 아래에 고정(position fixed · 왼쪽 0 · 너비 210) · 홈 화면에서도 같은 자리에 있고 🏠 홈 칸이 켜짐 · 홈에서 칸을 누르면 그 목록
 *   ③ 폰(430px): 메뉴는 목록 위에 흐름대로 · 작게(아이콘) 모드에서는 위에 고정 · 홈 화면에는 메뉴 없음(타일)
 *   ④ 🔄 새로 고침 단추가 지금 칸을 다시 읽음 (칸이 그대로 켜져 있음) · 백오더 목록에서 눌러도 동작 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8826', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, job, w, h, cmp) => {
    const pg = await (await br.newContext({ viewport: { width: w, height: h } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.job) window.__AFTER_SEED__ = s => { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; }; if (o.cmp) try { localStorage.setItem('theone.ocompact', '1'); } catch (e) {} }, { email, job, cmp });
    await pg.goto('http://127.0.0.1:8826/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300);
    await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(800); return pg;
  };
  const menuInfo = pg => pg.evaluate(() => { const m = document.querySelector('.omenu'); if (!m) return null; const r = m.getBoundingClientRect(), cs = getComputedStyle(m); const bs = document.querySelectorAll('#nav button'), last = bs[bs.length - 1]; const dk = document.body.classList.contains('dock') ? document.getElementById('drawer').getBoundingClientRect().width : 0; return { dock: dk, pos: cs.position, vis: cs.display !== 'none' && r.width > 0, left: r.left, top: r.top, w: r.width, navbtm: last ? last.getBoundingClientRect().bottom : 0, groups: [...m.querySelectorAll('[data-og]')].map(g => g.dataset.og), chips: [...m.querySelectorAll('[data-lf]')].map(b => b.dataset.lf), on: [...m.querySelectorAll('[data-lf].on')].map(b => b.dataset.lf), lg: document.querySelectorAll('[data-lg]').length, head: (document.querySelector('.ohead') || {}).className, sticky: document.querySelector('.ohead') ? getComputedStyle(document.querySelector('.ohead')).position : '' }; });
  /* ① ② 컴퓨터 · 관리자(오피스처럼 전체 칸) → 홈에 메뉴 · 칸 누르면 목록 */
  const pc = await open('luke@theonefl.com', '', 1100, 800);
  let m = await menuInfo(pc); log('② pc home:', JSON.stringify(m));
  if (!m || !m.vis) errs.push('② pc home shows the menu'); else {
    if (m.pos !== 'fixed' || m.left !== m.dock || m.w !== 210) errs.push('② pc menu is fixed at the left (after the docked drawer, ' + m.dock + 'px), 210px wide — got left ' + m.left);
    if (m.top < m.navbtm) errs.push('② pc menu sits below the last nav button (top ' + m.top + ' < navbtm ' + m.navbtm + ')');
    if (m.on.join() !== 'home') errs.push('② home chip is on at the staff home, got ' + m.on.join());
    if (m.groups.join() !== 'recv,ship,fin,etc') errs.push('① 4 groups, got ' + m.groups.join());
    if (m.lg) errs.push('① no stage toggle buttons');
  }
  await pc.click('.omenu [data-lf="pick"]'); await pc.waitForTimeout(800); m = await menuInfo(pc); log('② pc list:', JSON.stringify({ pos: m && m.pos, top: m && m.top, on: m && m.on }));
  if (!m || m.pos !== 'fixed' || m.on.join() !== 'pick') errs.push('② clicking a chip at home opens that list, menu stays fixed with the chip on');
  if (!(await pc.$('#page h2:has-text("출고 작업")'))) errs.push('② the fulfillment list opened');
  /* ④ 새로 고침 */
  await pc.click('[data-orf]'); await pc.waitForTimeout(800); m = await menuInfo(pc); if (!m || m.on.join() !== 'pick') errs.push('④ refresh keeps the current list (' + (m && m.on.join()) + ')');
  await pc.click('.omenu [data-lf="bo"]'); await pc.waitForTimeout(900); m = await menuInfo(pc); log('④ bo list:', JSON.stringify({ on: m && m.on, pos: m && m.pos }));
  if (!m || m.on.join() !== 'bo' || m.pos !== 'fixed') errs.push('④ backorder list shows the same fixed menu with bo on');
  if (!(await pc.$('[data-orf]'))) errs.push('④ refresh button on the backorder list'); else { await pc.click('[data-orf]'); await pc.waitForTimeout(800); m = await menuInfo(pc); if (!m || m.on.join() !== 'bo') errs.push('④ refresh on the backorder list stays on bo'); }
  await pc.context().close();
  /* ① 창고 매니저 · 픽킹 담당 — 그 일의 칸이 전부 */
  for (const [job, must, mustNot] of [['whmgr', ['shipped', 'cfok', 'sent', 'all'], ['draft', 'ups', 'packed', 'done', 'dlv']], ['pick', ['mine', 'pick', 'bo', 'sent', 'inv'], ['draft']]   /* v0.8.217: 예전 창고 직원(pick) = 출고 · 인보이스 담당 */]) {
    const pg = await open('office@theonefl.com', job, 1100, 800); m = await menuInfo(pg); log('①', job, ':', JSON.stringify({ groups: m && m.groups, chips: m && m.chips, pos: m && m.pos }));
    if (!m || !m.vis || m.pos !== 'fixed') errs.push('① ' + job + ' home shows the fixed menu'); else { must.forEach(k => { if (!m.chips.includes(k)) errs.push('① ' + job + ' menu has ' + k); }); mustNot.forEach(k => { if (m.chips.includes(k)) errs.push('① ' + job + ' menu must not have ' + k); }); if (m.lg) errs.push('① ' + job + ': no stage buttons'); }
    await pg.context().close();
  }
  /* ③ 폰 */
  const ph = await open('luke@theonefl.com', '', 430, 900); m = await menuInfo(ph); log('③ phone home:', JSON.stringify({ vis: m && m.vis, head: m && m.head }));
  if (m && m.vis) errs.push('③ phone home has tiles, not the menu');
  await ph.evaluate(() => { document.querySelectorAll('.hgrp').forEach(g => g.classList.add('open')); }); await ph.click('[data-hg="pick"]'); await ph.waitForTimeout(800); m = await menuInfo(ph); log('③ phone list:', JSON.stringify({ pos: m && m.pos, sticky: m && m.sticky, groups: m && m.groups, on: m && m.on }));
  if (!m || !m.vis || m.pos === 'fixed' || m.sticky === 'sticky') errs.push('③ phone full menu flows with the list (not fixed / sticky)');
  if (!m || m.groups.length !== 4 || m.lg) errs.push('③ phone shows all 4 groups, no stage buttons');
  await ph.context().close();
  const pc2 = await open('luke@theonefl.com', '', 430, 900, true); await pc2.evaluate(() => { document.querySelectorAll('.hgrp').forEach(g => g.classList.add('open')); }); await pc2.click('[data-hg="pick"]'); await pc2.waitForTimeout(800); m = await menuInfo(pc2); log('③ phone compact:', JSON.stringify({ sticky: m && m.sticky, h: m && m.top }));
  if (!m || m.sticky !== 'sticky') errs.push('③ phone compact (icon) menu stays sticky at the top');
  await pc2.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
