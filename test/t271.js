/* v0.8.231 시험 — 📱 폰 주문 화면 비율 · 🏷 타사 제품 수량 고치기 (2026-11-13 관리자: "위쪽 · 아래쪽 비율 조정 — 가운데 오더 화면을 최대한 넓게" · "타사 제품 크레딧 — 누를 때마다 수량은 올라가는데 잘못 찍었을 때 수정이 어려워")
 *   ① 폰(390×844) 세일즈맨 새 주문: 아래 메뉴(홈 · 세일 …) 숨김 · 위 고정 칸(머리띠 + 가게 · 탭 · 검색 · 분류) ≤ 230px · 아래 고정 칸 ≤ 105px · 가운데 목록 ≥ 480px
 *      · 합계 · 🗑 · 닫기 · 저장이 한 줄 (화면 안에 다 보임) · 수량 버튼 줄도 화면 안
 *   ② 분류 칩은 한 줄 (넘치면 옆으로 밀기 — 두 줄로 내려가지 않음)
 *   ③ 컴퓨터 폭(1300)에서는 예전대로 (메뉴 자리 · 합계 줄의 가게 이름)
 *   ④ 타사 제품: 가격 $9.99 를 세 번 누름 → 🧾 담은 것 맨 위에 한 줄 ×3 → − 한 번 = 2 · 수량 칸에 5 = 5 · 🗑 = 줄 없어짐 · 바디 $2.00 은 따로 한 줄 · 합계도 같이 바뀜 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8994', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (W, H, mob) => { const pg = await (await br.newContext({ viewport: { width: W, height: H }, isMobile: !!mob, hasTouch: !!mob })).newPage(); pg.on('pageerror', e => errs.push(W + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' }; window.__AFTER_SEED__ = s => { s.accounts.find(a => a.acct === '1111').disc = { A: 10 }; }; });
    await pg.goto('http://127.0.0.1:8994/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(600); return pg; };
  const pickStore = async pg => { await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(300); await pg.click('#eStoreHits [data-ac="1111"]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose').catch(() => {}); await pg.waitForTimeout(300); } };
  const box = (pg, s) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(), c = getComputedStyle(e); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height), vis: c.display !== 'none' && b.height > 0 }; }, s);
  /* ① ② */
  const pg = await open(390, 844, true);
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ', { timeout: 8000 }); await pickStore(pg);
  await pg.click('.ecard .cats button >> nth=1').catch(() => {}); await pg.waitForTimeout(600);
  const nav = await box(pg, '#nav'), head = await box(pg, '#eHead'), st = await box(pg, '.sticky'), body = await box(pg, '#eBody');
  const btn = {}; for (const id of ['eCancel', 'eClose', 'eDraft', 'eA']) btn[id] = await box(pg, '#' + id); const qk = await box(pg, '#qbar button:last-child');
  log('① phone:', JSON.stringify({ nav, headBottom: head && head.b, sticky: st && [st.t, st.h], body: body && body.h }), JSON.stringify(btn), 'qk', JSON.stringify(qk));
  if (nav && nav.vis) errs.push('① bottom menu hidden while ordering on a phone');
  if (!head || head.b > 230) errs.push('① top fixed area ≤ 230px (was ~256)');
  if (!st || st.h > 105) errs.push('① bottom fixed area ≤ 105px (was ~163)');
  if (!body || body.h < 480) errs.push('① middle list ≥ 480px tall');
  const row = Object.values(btn); if (row.some(b => !b || !b.vis || b.r > 390) || new Set(row.slice(0, 3).map(b => b.t)).size !== 1 || Math.abs(btn.eA.t - btn.eDraft.t) > 12) errs.push('① total · 🗑 · close · save on one row, all on screen');
  if (!qk || qk.r > 390) errs.push('① quick qty bar fits the screen');
  const cr = await pg.evaluate(() => { const c = document.querySelector('.ehead .chips.crumbs'); return c ? getComputedStyle(c).flexWrap : null; }); log('② crumbs wrap:', cr); if (cr && cr !== 'nowrap') errs.push('② folder chips stay on one line');
  /* ③ */
  const pc = await open(1300, 900); await pc.evaluate(() => { location.hash = '#/order/new'; }); await pc.waitForSelector('#eStoreQ', { timeout: 8000 }); await pickStore(pc);
  const pnav = await pc.evaluate(() => getComputedStyle(document.body).getPropertyValue('--navh').trim()), pname = await box(pc, '.tbar .tl b');
  log('③ desktop --navh:', pnav, 'store name in total bar:', JSON.stringify(pname)); if (!pname || !pname.vis) errs.push('③ desktop unchanged (store name in the total bar)');
  /* ④ */
  const c = await open(390, 844, true);
  await c.evaluate(() => { location.hash = '#/order/credit'; }); await c.waitForSelector('#eStoreQ', { timeout: 8000 }); await pickStore(c);
  await c.click('#eCrOther'); await c.waitForSelector('#obGrid [data-obp]');
  for (let i = 0; i < 3; i++) { await c.click('[data-obp="9.99"]'); await c.waitForTimeout(80); }
  await c.click('[data-obb="2.00"]'); await c.waitForTimeout(150);
  const sel = () => c.evaluate(() => [...document.querySelectorAll('#obSel .obrow')].map(r => r.querySelector('.obl').textContent.trim() + '=' + r.querySelector('input').value + ' ' + r.querySelector('.oba').textContent.trim()));
  const tot = () => c.evaluate(() => document.getElementById('obTot').textContent.trim());
  let a = await sel(); log('④ after 3 taps + body:', JSON.stringify(a), await tot());
  if (a.length !== 2 || !/9\.99.*=3/.test(a[0]) || !/=1/.test(a[1])) errs.push('④ 🧾 added list shows $9.99 ×3 and body $2.00 ×1');
  const top = await c.evaluate(() => { const s = document.querySelector('.obsel'), g = document.getElementById('obGrid'); return !!(s && g && (s.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING) && getComputedStyle(s).position === 'sticky'); }); if (!top) errs.push('④ added list sits above the price grid and stays in view (sticky)');
  await c.click('[data-obm="OB-9.99"]'); await c.waitForTimeout(120); a = await sel(); log('④ after −:', JSON.stringify(a), await tot()); if (!/=2/.test(a[0])) errs.push('④ − takes one off (3 → 2)');
  await c.fill('[data-obq="OB-9.99"]', '5'); await c.dispatchEvent('[data-obq="OB-9.99"]', 'change'); await c.waitForTimeout(120); a = await sel(); log('④ typed 5:', JSON.stringify(a), await tot()); if (!/=5/.test(a[0])) errs.push('④ typing a quantity sets it (5)');
  if (!/^6/.test(await tot())) errs.push('④ total follows (5 + 1 = 6 pcs)');
  await c.click('[data-obx="OB-9.99"]'); await c.waitForTimeout(120); a = await sel(); log('④ after 🗑:', JSON.stringify(a), await tot()); if (a.length !== 1 || /9\.99/.test(a[0])) errs.push('④ 🗑 removes the line');
  const grid = await c.textContent('[data-obp="9.99"]'); if (/×/.test(grid)) errs.push('④ price button count cleared too');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
