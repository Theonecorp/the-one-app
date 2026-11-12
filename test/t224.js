/* v0.8.203 시험 — 🎨 새 디자인 1단계: 묶음 서랍 · 아이콘만 접기 · 선 아이콘 · 머리띠 제목 · ⌘K 검색 · 🏠 대시보드(숫자 · 빠른 작업 · 할 일 · 최근 주문 · 활동)
 *   ① 데스크탑 고정 서랍: 묶음(개요 · 운영 · 재고 관리 · 수금 · 재무 · 거래처 · 관리) 머리 · 화면은 빠짐없이 한 번씩 · 주문 칸(.dord)은 운영 묶음 안
 *   ② 묶음 머리를 누르면 접힘 → 새로 그려도 기억 · 지금 화면이 든 묶음은 접히지 않음
 *   ③ 접기 단추(#dRail) → 서랍 72px · 본문이 그만큼 왼쪽으로 · 다시 누르면 260px
 *   ④ 서랍 · 아래 메뉴 · 머리띠 단추가 이모지 대신 선 아이콘(svg) · 머리띠 제목 = 지금 화면
 *   ⑤ 담당자 홈 = 대시보드: 숫자 4칸(실제 주문 수) · 빠른 작업은 권한대로 · 할 일에 밀린 주문 · 최근 주문 표 → 누르면 그 주문 · 빠른 작업 → 원래 화면
 *   ⑥ ⌘K / Ctrl+K → 검색 창
 *   ⑦ 폰(390px): 아래 메뉴가 선 아이콘 · 대시보드 숫자 2칸씩 · 가로로 넘치지 않음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8864', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, job, W, H, ls) => { const pg = await (await br.newContext({ viewport: { width: W, height: H } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; try { Object.keys(o.ls || {}).forEach(k => localStorage.setItem(k, o.ls[k])); } catch (e) {}
      window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; if (o.job) { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; } }; }, { email, job, ls });
    await pg.goto('http://127.0.0.1:8864/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached', timeout: 10000 }); await pg.waitForTimeout(1200); return pg; };
  try {
    /* ① 오피스 매니저 · 데스크탑 */
    let pg = await open('office@x.com', 'office', 1500, 950);
    await pg.waitForSelector('#drawer.dock', { timeout: 8000 });
    const G = await pg.$$eval('#drawer .dgrp', D => D.map(d => d.dataset.dg + ':' + Array.from(d.querySelectorAll(':scope > [data-dgo]')).map(b => b.dataset.dgo).join(',') + (d.querySelector('.dord') ? '+ord' : '')));
    log('① groups:', G.join(' | '));
    const keys = G.map(g => g.split(':')[0]);
    if (!keys.includes('ov') || !keys.includes('ops') || !keys.includes('inv')) errs.push('① drawer has overview · operations · inventory groups');
    if (!/^ops:.*\+ord$/.test(G.find(g => g.startsWith('ops:')) || '')) errs.push('① order stages sit inside the operations group');
    const dgo = await pg.$$eval('#drawer [data-dgo]', B => B.map(b => b.dataset.dgo)); const dup = dgo.filter((x, i) => dgo.indexOf(x) !== i);
    if (dup.length) errs.push('① a screen appears twice: ' + dup.join());
    for (const r of ['shome', 'order', 'invs', 'stores', 'stock', 'items', 'cat', 'verify', 'track', 'notesups']) if (!dgo.includes(r)) errs.push('① screen missing from drawer: ' + r);
    /* ② 접기 · 기억 */
    await pg.click('#drawer .dgrp[data-dg="inv"] .dgh'); await pg.waitForTimeout(200);
    let shut = await pg.$eval('#drawer .dgrp[data-dg="inv"]', d => d.classList.contains('fold') && getComputedStyle(d.querySelector('[data-dgo]')).display === 'none');
    if (!shut) errs.push('② clicking the group header folds it');
    await pg.click('#drawer [data-dgo="stores"]'); await pg.waitForTimeout(700);
    shut = await pg.$eval('#drawer .dgrp[data-dg="inv"]', d => d.classList.contains('fold')).catch(() => false);
    await pg.evaluate(() => { location.hash = '#/stock'; }); await pg.waitForTimeout(800);
    await pg.reload(); await pg.waitForSelector('#drawer.dock'); await pg.waitForTimeout(900);
    const st2 = await pg.$eval('#drawer .dgrp[data-dg="inv"]', d => d.classList.contains('fold'));
    log('② folded remembered:', shut, '· open on its own screen:', !st2);
    if (!shut) errs.push('② fold is remembered after redraw'); if (st2) errs.push('② the group of the current screen stays open');
    /* ③ 아이콘만 */
    const w0 = await pg.$eval('#drawer', d => Math.round(d.getBoundingClientRect().width));
    await pg.click('#dRail'); await pg.waitForTimeout(300);
    const r1 = await pg.evaluate(() => ({ w: Math.round(document.getElementById('drawer').getBoundingClientRect().width), left: Math.round(document.getElementById('page').getBoundingClientRect().left), txt: getComputedStyle(document.querySelector('#drawer [data-dgo] .t')).display }));
    await pg.click('#dRail'); await pg.waitForTimeout(300);
    const w2 = await pg.$eval('#drawer', d => Math.round(d.getBoundingClientRect().width));
    log('③ widths:', w0, '→', JSON.stringify(r1), '→', w2);
    if (w0 !== 260 || r1.w !== 72 || r1.txt !== 'none' || w2 !== 260 || r1.left > 140) errs.push('③ rail collapses to 72px icons only and back to 260px');
    /* ④ 아이콘 · 제목 */
    await pg.click('#drawer [data-dgo="shome"]'); await pg.waitForTimeout(1500);
    const ic = await pg.evaluate(() => ({ drawer: document.querySelectorAll('#drawer [data-dgo] .i svg').length, rows: document.querySelectorAll('#drawer [data-dgo]').length, head: ['hSearch', 'hScan', 'hBell', 'hMenu'].every(id => document.querySelector('#' + id + ' svg')), title: document.getElementById('hTitle').textContent }));
    log('④ icons:', JSON.stringify(ic));
    if (ic.drawer !== ic.rows) errs.push('④ every drawer row has a line icon'); if (!ic.head) errs.push('④ header buttons use line icons'); if (!/대시보드|Dashboard/.test(ic.title)) errs.push('④ header title shows the current screen');
    await pg.click('#drawer [data-dgo="stores"]'); await pg.waitForTimeout(600);
    if (!/거래처|Customers/.test(await pg.textContent('#hTitle'))) errs.push('④ header title follows navigation');
    /* ⑤ 대시보드 */
    await pg.click('#drawer [data-dgo="shome"]'); await pg.waitForSelector('#wdash'); await pg.waitForTimeout(1500);
    const D = await pg.evaluate(() => ({ k: ['in', 'pick', 'pack', 'ship'].map(k => (document.getElementById('wk-' + k) || {}).textContent), qa: Array.from(document.querySelectorAll('#wdash .wd-qa [data-wq]')).map(b => b.dataset.wq), al: Array.from(document.querySelectorAll('#wdAl [data-wa]')).map(b => b.dataset.wa), ord: document.querySelectorAll('#wdOrd [data-wo]').length, act: document.querySelectorAll('#wdAct li').length, sales: !!document.querySelector('#wdSales .wd-amt'), grp: document.querySelectorAll('.hgrp').length, hs: !!document.getElementById('hSales') }));
    log('⑤ dash:', JSON.stringify(D));
    if (D.k.some(v => !/^\d+$/.test(v || ''))) errs.push('⑤ the 4 KPI numbers are filled');
    if (D.k[0] !== '0' || D.k[1] !== '0') errs.push('⑤ seed has no orders today and none picking: ' + D.k.join());
    if (!D.qa.includes('cat') || !D.qa.includes('notesups') || !D.qa.includes('recv')) errs.push('⑤ office quick actions include receive · UPS · find product');
    if (!D.al.includes('old')) errs.push('⑤ alerts list the order waiting 1+ day');
    if (!D.ord || !D.act || !D.sales) errs.push('⑤ latest orders · activity · sales are shown');
    if (D.grp < 3 || !D.hs) errs.push('⑤ all the old home groups and the sales detail stay under the dashboard');
    await pg.click('#wdOrd [data-wo]'); await pg.waitForTimeout(900);
    if (!/#\/order\/O/.test(await pg.evaluate(() => location.hash))) errs.push('⑤ clicking a latest order opens it');
    await pg.click('#drawer [data-dgo="shome"]'); await pg.waitForSelector('#wdash .wd-qa'); await pg.waitForTimeout(800);
    await pg.click('#wdash [data-wq="recv"]'); await pg.waitForTimeout(900);
    if (await pg.evaluate(() => location.hash) !== '#/stock/recv') errs.push('⑤ quick action 입고 opens stock › receive');
    await pg.click('#drawer [data-dgo="shome"]'); await pg.waitForSelector('#wdash [data-wa="old"]'); await pg.waitForTimeout(600);
    await pg.click('#wdash [data-wa="old"]'); await pg.waitForTimeout(900);
    if (!(await pg.$('#page h2:has-text("신규 주문")'))) errs.push('⑤ the late-orders alert opens the stage list');
    /* ⑥ ⌘K */
    await pg.keyboard.press('Control+k'); await pg.waitForTimeout(300);
    if (!(await pg.$('#gsQ'))) errs.push('⑥ Ctrl+K opens search');
    /* 픽킹 담당 — 빠른 작업은 권한대로 (배정 권한이 없어 출고 작업 전체가 아니라 👷 내 배정 작업) */
    let pk = await open('pk@x.com', 'pick', 1500, 950);
    const qa2 = await pk.$$eval('#wdash .wd-qa [data-wq]', B => B.map(b => b.dataset.wq)).catch(() => []);
    log('⑤ picker quick:', qa2.join());
    if (!qa2.includes('mine') || qa2.includes('pick')) errs.push('⑤ picker quick actions open My assignments');
    /* ⑦ 폰 */
    let ph = await open('office@x.com', 'office', 390, 844);
    const M = await ph.evaluate(() => ({ nav: Array.from(document.querySelectorAll('#nav button')).every(b => b.querySelector('.i svg')), over: document.documentElement.scrollWidth - window.innerWidth, cols: getComputedStyle(document.querySelector('.wd-kpis')).gridTemplateColumns.split(' ').length }));
    log('⑦ phone:', JSON.stringify(M));
    if (!M.nav) errs.push('⑦ bottom menu uses line icons'); if (M.over > 1) errs.push('⑦ no sideways scroll on a phone: ' + M.over); if (M.cols !== 2) errs.push('⑦ KPI cards 2 per row on a phone');
    await ph.screenshot({ path: path.resolve(__dirname, 'out', 't223-phone.png') }); await pg.screenshot({ path: path.resolve(__dirname, 'out', 't223-desk.png') });
  } catch (e) { errs.push('crash: ' + e.message); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL ' + JSON.stringify(errs) : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
