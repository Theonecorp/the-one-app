/* v0.8.174 시험 — 📌 담당자 주문 메뉴 고정: 단계(접수 · 출고 · 완료 · 기타)를 누를 때마다 세부 칸이 생겼다 없어지지 않고 모든 칸이 묶음별로 항상 보임
 *   (v0.8.241 고침 — 2026-11-14 관리자 "목록 안에서도 단계가 보이게 · 순서 고정해서 위에 · 모바일도 데스크탑처럼": 왼쪽 210px 기둥 · 폰 큰 격자 · 작게 단추 → 폰 · 컴퓨터 같은 위쪽 가로 탭 한 줄)
 *   ① 어느 담당자 목록이든 [data-lg] 단계 단추가 없고 .omenu 안에 묶음(data-og) 4개 · 그 일(job)의 칸이 전부 있음 (오피스 · 창고 매니저 · 픽킹 담당)
 *   ② 컴퓨터(1100px) · 폰(430px) 같음: 홈(대시보드 타일)에는 탭 없음 · 타일을 누르면 그 목록 위에 가로 탭 한 줄(칸들이 한 줄 · 위에 붙어 있음 sticky) · 그 칸만 켜짐 · 본문이 옆으로 밀리지 않음
 *   ③ 탭에서 다른 칸을 누르면 그 목록 · 탭 그대로
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
  const menuInfo = pg => pg.evaluate(() => { const m = document.querySelector('.omenu'); if (!m) return null; const r = m.getBoundingClientRect(), cs = getComputedStyle(m); const bs = document.querySelectorAll('#nav button'), last = bs[bs.length - 1]; const dk = document.body.classList.contains('dock') ? document.getElementById('drawer').getBoundingClientRect().width : 0; return { dock: dk, pos: cs.position, vis: cs.display !== 'none' && r.width > 0, left: r.left, top: r.top, w: r.width, navbtm: last ? last.getBoundingClientRect().bottom : 0, groups: [...m.querySelectorAll('[data-og]')].map(g => g.dataset.og), chips: [...m.querySelectorAll('[data-lf]')].map(b => b.dataset.lf), on: [...m.querySelectorAll('[data-lf].on')].map(b => b.dataset.lf), lg: document.querySelectorAll('[data-lg]').length, head: (document.querySelector('.ohead') || {}).className, sticky: document.querySelector('.ohead') ? getComputedStyle(document.querySelector('.ohead')).position : '', tops: [...m.querySelectorAll('[data-lf]')].filter(b => b.offsetWidth).map(b => Math.round(b.getBoundingClientRect().top)), pleft: Math.round(document.getElementById('page').getBoundingClientRect().left) }; });
  const row = m => m && m.tops.length && Math.max(...m.tops) - Math.min(...m.tops) <= 6;
  const toList = async (pg, k) => { await pg.evaluate(() => { document.querySelectorAll('.hgrp').forEach(g => g.classList.add('open')); }); const t = k ? '[data-hg="' + k + '"]' : await pg.evaluate(() => { const b = [...document.querySelectorAll('[data-hg]')].find(e => e.offsetWidth && !/^(flow|new)$/.test(e.dataset.hg)); return b ? '[data-hg="' + b.dataset.hg + '"]' : ''; }); if (t) await pg.click(t); await pg.waitForTimeout(800); };
  for (const [nm, w, h] of [['pc', 1100, 800], ['phone', 430, 900]]) {
    const pg = await open('luke@theonefl.com', '', w, h);
    let m = await menuInfo(pg); log('②', nm, 'home:', JSON.stringify({ vis: m && m.vis }));
    if (m && m.vis) errs.push('② ' + nm + ' home is the dashboard (tiles), no tab bar');
    await toList(pg, 'pick'); m = await menuInfo(pg); log('②', nm, 'list:', JSON.stringify({ vis: m && m.vis, sticky: m && m.sticky, groups: m && m.groups, on: m && m.on, left: m && m.pleft, tops: m && m.tops.length }));
    if (!m || !m.vis) errs.push('② ' + nm + ': the list shows the tab bar'); else {
      if (m.sticky !== 'sticky') errs.push('② ' + nm + ': tab bar sticks to the top (got ' + m.sticky + ')');
      if (!row(m)) errs.push('② ' + nm + ': all chips in one horizontal row');
      if (m.on.join() !== 'pick') errs.push('② ' + nm + ': only the 출고 작업 chip is on, got ' + m.on.join());
      if (m.groups.join() !== 'recv,ship,fin,etc') errs.push('① ' + nm + ': 4 groups in fixed order, got ' + m.groups.join());
      if (m.lg) errs.push('① ' + nm + ': no stage toggle buttons');
      if (m.pleft > m.dock + 40) errs.push('② ' + nm + ': page is not pushed right by a column (left ' + m.pleft + ')');
    }
    if (!(await pg.$('#page h2:has-text("출고 작업")'))) errs.push('② ' + nm + ': the fulfillment list opened');
    /* ④ 새로 고침 */
    await pg.click('[data-orf]'); await pg.waitForTimeout(800); m = await menuInfo(pg); if (!m || m.on.join() !== 'pick') errs.push('④ ' + nm + ': refresh keeps the current list (' + (m && m.on.join()) + ')');
    /* ③ 다른 칸 */
    await pg.click('.omenu [data-lf="bo"]'); await pg.waitForTimeout(900); m = await menuInfo(pg); log('③', nm, 'bo list:', JSON.stringify({ on: m && m.on, vis: m && m.vis }));
    if (!m || !m.vis || m.on.join() !== 'bo' || !row(m)) errs.push('③ ' + nm + ': backorder list shows the same tab bar with bo on');
    if (!(await pg.$('[data-orf]'))) errs.push('④ refresh button on the backorder list'); else { await pg.click('[data-orf]'); await pg.waitForTimeout(800); m = await menuInfo(pg); if (!m || m.on.join() !== 'bo') errs.push('④ refresh on the backorder list stays on bo'); }
    await pg.context().close();
  }
  /* ① 창고 매니저 · 픽킹 담당 — 그 일의 칸이 전부 */
  for (const [job, must, mustNot] of [['whmgr', ['shipped', 'cfok', 'sent', 'all'], ['draft', 'ups', 'packed', 'done', 'dlv']], ['pick', ['mine', 'pick', 'bo', 'sent', 'inv'], ['draft']]   /* v0.8.217: 예전 창고 직원(pick) = 출고 · 인보이스 담당 */]) {
    const pg = await open('office@theonefl.com', job, 1100, 800); await toList(pg); const m = await menuInfo(pg); log('①', job, ':', JSON.stringify({ groups: m && m.groups, chips: m && m.chips }));
    if (!m || !m.vis) errs.push('① ' + job + ' list shows the tab bar'); else { must.forEach(k => { if (!m.chips.includes(k)) errs.push('① ' + job + ' menu has ' + k); }); mustNot.forEach(k => { if (m.chips.includes(k)) errs.push('① ' + job + ' menu must not have ' + k); }); if (m.lg) errs.push('① ' + job + ': no stage buttons'); }
    await pg.context().close();
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
