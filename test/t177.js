/* v0.8.181 시험 — 🧭 데스크탑(1200px 이상): 고정 서랍이 하나뿐인 메뉴 (2026-11-10 관리자: "메뉴가 왜 두 개가 떠")
 *   ① 머리띠 가로 메뉴(#nav) 숨김 · 담당자 홈(대시보드)에는 단계 탭 없음 — 본문은 서랍 바로 옆에서 시작 (기둥만큼 밀리지 않음)
 *      (v0.8.241: 목록 안에서는 위쪽 가로 단계 탭이 보임 — 2026-11-14 관리자 "화면 안으로 들어간 뒤에도 보이게" · 왼쪽 기둥은 없음)
 *   ② 담당자 서랍에 주문 칸이 묶음별로 (접수 · 출고 · 완료 · 기타) — 누르면 그 목록 · 그 칸만 켜짐 · 🏠 홈은 담당자 홈
 *   ③ 한 화면은 서랍에 한 번만 (배송 조회가 재고 · 조회 두 묶음에 있어도 하나)
 *   ④ 세일즈맨 서랍에는 주문 칸이 없음 (세일즈 메뉴 그대로) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8843', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, job) => { const pg = await (await br.newContext({ viewport: { width: 1500, height: 950 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.job) window.__AFTER_SEED__ = s => { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; }; }, { email, job });
    await pg.goto('http://127.0.0.1:8843/test/demo.html'); await pg.waitForSelector('#drawer.dock', { timeout: 10000 }); await pg.waitForTimeout(900); return pg; };
  const lay = pg => pg.evaluate(() => { const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    return { nav: vis(document.getElementById('nav')), omenu: Array.from(document.querySelectorAll('.omenu')).some(vis), dock: Math.round(document.getElementById('drawer').getBoundingClientRect().width), left: Math.round(document.getElementById('page').getBoundingClientRect().left),
      on: Array.from(document.querySelectorAll('#drawer [data-dgo].on, #drawer [data-dlf].on')).map(b => b.dataset.dgo || b.dataset.dlf), hash: location.hash }; });
  /* ① ② 오피스 매니저 */
  let pg = await open('office@theonefl.com', 'office');
  let L = await lay(pg); log('① home:', JSON.stringify(L));
  if (L.nav || L.omenu) errs.push('① no header menu buttons and no order column next to the docked drawer');
  if (Math.abs(L.left - L.dock) > 30) errs.push('① page starts right after the drawer (left ' + L.left + ' vs drawer ' + L.dock + ')');
  if (L.on.join() !== 'shome') errs.push('② home is on at the staff home (got ' + L.on.join() + ')');
  const secs = await pg.$$eval('#drawer .dord', S => S.map(s => s.querySelector('small').textContent.trim().split(' ')[1] + ':' + Array.from(s.querySelectorAll('[data-dlf]')).map(b => b.dataset.dlf).join(',')));
  log('② order sections:', secs.join(' | '));
  if (secs.length !== 4 || !/^접수:sent,cfw,cfok/.test(secs[0]) || !/pick/.test(secs[1]) || !/shipped/.test(secs[2]) || !/bo/.test(secs[3])) errs.push('② drawer has the 4 order groups with their chips');
  await pg.click('#drawer [data-dlf="pick"]'); await pg.waitForTimeout(1000); L = await lay(pg); log('② pick:', JSON.stringify(L));
  if (L.hash !== '#/order' || L.on.join() !== 'pick' || !L.omenu || L.nav) errs.push('② clicking 출고 작업 opens that list, only that drawer item is on, the top stage tab bar shows (no header menu)');
  if (await pg.evaluate(() => [...document.querySelectorAll('.omenu [data-lf].on')].map(b => b.dataset.lf).join()) !== 'pick') errs.push('② the top tab bar has 출고 작업 on too');
  if (!(await pg.$('#page h2:has-text("출고 작업")'))) errs.push('② fulfillment list shown');
  if (Math.abs(L.left - L.dock) > 30) errs.push('② list page is not pushed right by a hidden column');
  await pg.click('#drawer [data-dlf="sent"]'); await pg.waitForTimeout(900); L = await lay(pg); if (L.on.join() !== 'sent' || !(await pg.$('#page h2:has-text("신규 주문")'))) errs.push('② 신규 주문 list from the drawer');
  await pg.click('#drawer [data-dlf="bo"]'); await pg.waitForTimeout(1000); L = await lay(pg); log('② bo:', L.on.join()); if (L.on.join() !== 'bo') errs.push('② backorders from the drawer');
  await pg.click('#drawer [data-dgo="shome"]'); await pg.waitForTimeout(900); L = await lay(pg); log('② home again:', JSON.stringify({ hash: L.hash, on: L.on })); if (L.on.join() !== 'shome') errs.push('② 🏠 홈 goes back to the staff home');
  /* ③ 한 번만 */
  const dgo = await pg.$$eval('#drawer [data-dgo]', B => B.map(b => b.dataset.dgo)); const dup = dgo.filter((x, i) => dgo.indexOf(x) !== i); log('③ items:', dgo.join(' '), '· dup:', dup.join());
  if (dup.length) errs.push('③ each screen once in the drawer (dup: ' + dup.join() + ')');
  await pg.context().close();
  /* ④ 세일즈맨 */
  pg = await open('brandon@x.com', ''); L = await lay(pg); const nOrd = await pg.$$eval('#drawer .dord', S => S.length); log('④ salesman:', JSON.stringify({ nav: L.nav, ord: nOrd }));
  if (nOrd || L.nav) errs.push('④ salesman: no staff order groups, no header buttons');
  if (!(await pg.$('#drawer [data-dgo="order"]'))) errs.push('④ salesman drawer still has 세일');
  await pg.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
