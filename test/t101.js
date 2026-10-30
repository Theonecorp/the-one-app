/* v0.8.124 시험 (안드로이드 흉내) — 뒤로가기 = 한 단계 위(창 → 상세 → 목록 → 홈), 화면 이동은 기록을 쌓지 않음 · 홈에서는 빈 칸 없음
 *   · 긴 창의 맨 아래 버튼(확인 · 저장)이 작은 화면에서도 보임 · 입력 칸을 누르면(키보드) 아래 메뉴 · 고정 칸이 숨음 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8846', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 393, height: 640 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; window.__AFTER_SEED__ = s => { s.orders.forEach(o => { o.sm = 'BRANDON'; o.ym = new Date().toISOString().slice(0, 7); }); s.orderLines.forEach(l => { l.sm = 'BRANDON'; }); }; });
  await pg.goto('http://127.0.0.1:8846/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(600);
  const H = () => pg.evaluate(() => ({ hash: location.hash, len: history.length }));
  const h0 = await H(); log('start:', JSON.stringify(h0));
  /* 홈 → 🛒 세일(목록) → 주문 상세 — 앱 안 이동 */
  await pg.tap('#nav button[data-go="order"]'); await pg.waitForTimeout(800);
  const o1 = await pg.$('.pr.tap[data-oid="O261014-AAAA"]'); if (!o1) errs.push('order list empty'); else { await o1.tap(); await pg.waitForTimeout(900); }
  const h1 = await H(); log('detail:', JSON.stringify(h1)); if (!/#\/order\//.test(h1.hash)) errs.push('should be on an order detail');
  if (h1.len > h0.len + 2) errs.push('in-app moves should not stack history (len ' + h0.len + ' → ' + h1.len + ')');
  /* 창 열고 뒤로 → 창만 닫힘 */
  await pg.tap('#oStoreI').catch(() => {}); await pg.waitForSelector('#modal.on', { timeout: 5000 }).catch(() => errs.push('store window did not open'));
  await pg.goBack(); await pg.waitForTimeout(600); let st = await pg.evaluate(() => ({ m: document.getElementById('modal').classList.contains('on'), hash: location.hash })); log('back 1:', JSON.stringify(st));
  if (st.m || st.hash !== h1.hash) errs.push('back should close the window only');
  /* 뒤로 → 목록, 뒤로 → 홈 */
  await pg.goBack(); await pg.waitForTimeout(800); st = await H(); log('back 2:', JSON.stringify(st)); if (st.hash !== '#/order') errs.push('back from detail should go up to the list, got ' + st.hash);
  await pg.goBack(); await pg.waitForTimeout(800); st = await H(); log('back 3:', JSON.stringify(st)); if (st.hash !== '#/home') errs.push('back from the list should go home, got ' + st.hash);
  const guard = await pg.evaluate(() => history.state && history.state.g); if (guard) errs.push('home should have no back guard (back exits the app)');
  /* 긴 창 — 맨 아래 버튼이 보임 (작은 화면) */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', '1271'); await pg.waitForSelector('[data-ac="1271"]'); await pg.tap('[data-ac="1271"]'); await pg.waitForTimeout(1200);
  if (await pg.$('#modal.on')) await pg.tap('#modal .mclose'); await pg.waitForTimeout(300);
  await pg.fill('#eQ1', 'AHG100'); await pg.waitForTimeout(400); await pg.$eval('[data-gc="AHG100"]', e => e.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(200); await pg.tap('[data-gc="AHG100"]'); await pg.waitForTimeout(300);
  await pg.$eval('[data-gq="AHG100"]', e => e.click());   // 수량 창 열기 (이 시험은 창 아래 버튼이 보이는지) await pg.waitForSelector('#qpOk', { timeout: 5000 }).catch(() => errs.push('qty window missing'));
  const vis = await pg.evaluate(() => { const b = document.getElementById('qpOk').getBoundingClientRect(); return { bottom: Math.round(b.bottom), h: innerHeight, hit: (document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) || {}).id }; }); log('qty window OK button:', JSON.stringify(vis));
  if (vis.bottom > vis.h || vis.hit !== 'qpOk') errs.push('window OK button should be visible and tappable');
  log('mclose:', JSON.stringify(await pg.evaluate(() => { const x = document.querySelector('#modal .mclose'); const r = x.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { r: [r.x, r.y, r.width, r.height].map(Math.round), cs: getComputedStyle(x).display + '/' + getComputedStyle(x).zIndex, hit: h && (h.id || h.className), vv: window.visualViewport && [visualViewport.offsetTop, visualViewport.height] }; })));
  await pg.tap('#modal .mclose'); await pg.waitForTimeout(300);
  /* 키보드 — 입력 칸을 누르면 아래 메뉴 · 고정 칸 숨김 */
  await pg.tap('#eVM'); await pg.waitForTimeout(300); await pg.$eval('[data-qi="AHG100"]', e => e.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(200); await pg.tap('[data-qi="AHG100"]'); await pg.waitForTimeout(500);
  const kb = await pg.evaluate(() => ({ kb: document.body.classList.contains('kb'), nav: getComputedStyle(document.getElementById('nav')).display, sticky: (document.querySelector('.sticky') ? getComputedStyle(document.querySelector('.sticky')).display : 'none') })); log('typing:', JSON.stringify(kb));
  if (!kb.kb || kb.nav !== 'none' || kb.sticky !== 'none') errs.push('bottom nav and sticky bar should hide while typing');
  /* v0.8.128: 키보드 모드로 메뉴가 숨은 동안 resize 가 와도 --navh 는 0 으로 바뀌지 않아야 (키보드가 내려간 뒤 고정 바가 메뉴를 덮는 원인) */
  const nh0 = await pg.evaluate(() => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navh')) || 0);
  await pg.evaluate(() => window.dispatchEvent(new Event('resize'))); await pg.waitForTimeout(200);
  const nh1 = await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--navh').trim()); log('--navh while typing:', nh0, '→', nh1); if (nh1 === '0px' || parseInt(nh1) < 40) errs.push('--navh must keep its value while the nav is hidden for typing, got ' + nh1);
  await pg.evaluate(() => document.activeElement.blur()); await pg.waitForTimeout(400); const kb2 = await pg.evaluate(() => ({ kb: document.body.classList.contains('kb'), nav: getComputedStyle(document.getElementById('nav')).display })); log('after typing:', JSON.stringify(kb2)); if (kb2.kb || kb2.nav === 'none') errs.push('nav should come back after typing');
  await pg.waitForTimeout(500); const nh2 = await pg.evaluate(() => ({ navh: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navh')) || 0, nav: document.getElementById('nav').offsetHeight, over: window.scrollY > Math.max(0, document.documentElement.scrollHeight - window.innerHeight) + 1 })); log('after keyboard:', JSON.stringify(nh2));
  if (nh2.navh < 40 || nh2.navh > 140 || Math.abs(nh2.navh - nh2.nav) > 2) errs.push('--navh should equal the real nav height after the keyboard closes'); if (nh2.over) errs.push('page must not stay over-scrolled after the keyboard closes');
  /* v0.8.129: body 가 스크롤 상자가 아니어야 — 아니면 아래 고정 바가 화면 대신 body 상자에 붙어 내용이 짧을 때 화면 가운데 떠서 카테고리 타일을 덮음 */
  if (await pg.$('[data-ev="add"]')) await pg.tap('[data-ev="add"]'); await pg.waitForSelector('.ecard', { timeout: 8000 }); await pg.waitForTimeout(600);
  const geo = await pg.evaluate(() => { const cs = getComputedStyle(document.body), st = document.querySelector('.sticky'), card = document.querySelector('.ecard'); return { bodyOv: cs.overflowX + '/' + cs.overflowY, stTop: st ? Math.round(st.getBoundingClientRect().top) : -1, stBot: st ? Math.round(st.getBoundingClientRect().bottom) : -1, cardBot: card ? Math.round(card.getBoundingClientRect().bottom) : -1, line: innerHeight - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navh')) || 0) }; });
  log('order screen:', JSON.stringify(geo)); if (/auto|scroll|hidden/.test(geo.bodyOv)) errs.push('body must not be a scroll container (overflow ' + geo.bodyOv + ')');
  /* 바는 내용 바로 뒤(자연 위치)거나, 내용이 길면 화면 맨 아래(메뉴 위)에 붙어야 — 그 사이 공중에 떠서 내용을 덮으면 안 됨 */
  if (geo.stTop >= 0 && geo.stTop < geo.cardBot - 1 && geo.stBot < geo.line - 8) errs.push('sticky bar floats mid-screen over the item card (' + JSON.stringify(geo) + ')');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
