/* v0.8.81 시험 — ① 프리셋으로 같은 아이템을 여러 번 누르면 주황색 + ×2 (카드 · 주문 확인 줄 · 저장 확인창), 직접 고치면 지워짐
 *   ② 창고 매니저 홈: 재고 · UPS 출고 · 픽업 · 백오더가 먼저, 주문 처리는 아래 작은 칸 · (2026-11 화면에 맞춤: v0.8.125 부터 홈은 큰 묶음 4개 · v0.8.166 부터 🛒 세일 / 🚚 배송 — 창고 매니저는 📦 출고 묶음이 기본으로 펼쳐지고 📥 주문 접수 묶음은 접혀 있음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8803', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async (email) => { const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(e => { window.__MOCK_USER__ = { email: e, name: 'X' }; try { localStorage.setItem('theone.vm', 'grid'); localStorage.removeItem('theone.order.pre'); } catch (x) {}
      window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; s.users.push({ id: 'wh@x.com', email: 'wh@x.com', name: 'WH', role: 'manager', job: 'whmgr', active: true }); }; }, email);
    await pg.goto('http://127.0.0.1:8803/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* ① 세일즈맨 */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) await pg.click('#modal .mclose');
  await pg.click('[data-ck="Earrings · Hoops & Pincatch"]'); await pg.waitForTimeout(200); await pg.click('[data-ck="Aluminum"]'); await pg.waitForTimeout(150); await pg.click('[data-ck="Gold"]'); await pg.waitForTimeout(300);
  await pg.click('[data-qk="3"]'); await pg.waitForTimeout(100);
  await pg.click('[data-gc="AHG100"]'); await pg.waitForTimeout(150); await pg.click('[data-gc="AHG100"]'); await pg.waitForTimeout(150); await pg.click('[data-gc="AHG105"]'); await pg.waitForTimeout(200);
  const c1 = await pg.$eval('[data-gc="AHG100"]', e => [e.className, e.querySelector('[data-gq]').textContent, (e.querySelector('.gtap') || {}).textContent]);
  const c2 = await pg.$eval('[data-gc="AHG105"]', e => [e.className, e.querySelector('[data-gq]').textContent, !!e.querySelector('.gtap')]);
  log('AHG100', c1, 'AHG105', c2);
  if (!/multi/.test(c1[0]) || c1[1] !== '6' || c1[2] !== '×2') errs.push('double tap should be orange ×2 with 6pc');
  if (/multi/.test(c2[0]) || c2[1] !== '3' || c2[2]) errs.push('single tap must stay normal');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'multitap.png') });
  /* 주문 확인 탭 */
  await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(500);
  const cart = await pg.$$eval('[data-row]', r => r.map(x => x.dataset.row + ':' + (x.classList.contains('multi') ? 'M' : '-') + ':' + ((x.querySelector('.tapx') || {}).textContent || '')));
  log('cart:', cart); if (!cart.some(x => /^AHG100:M:×2/.test(x)) || !cart.some(x => /^AHG105:-:$/.test(x))) errs.push('cart should mark AHG100 only');
  /* 저장 확인창에 경고 */
  await pg.click('#eDraft'); await pg.waitForSelector('#cfOk'); const cm = (await pg.textContent('#mbox')).replace(/\s+/g, ' '); log('confirm:', cm.slice(0, 120));
  if (!/여러 번 눌린 아이템 1개/.test(cm) || !/AHG100 6개 ×2/.test(cm)) errs.push('save confirm should warn about multi tap');
  await pg.click('#cfNo'); await pg.waitForTimeout(300);
  /* 직접 고치면 표시 지움 */
  await pg.fill('[data-qi="AHG100"]', '6'); await pg.dispatchEvent('[data-qi="AHG100"]', 'change'); await pg.waitForTimeout(200);
  const after = await pg.$eval('[data-row="AHG100"]', x => x.classList.contains('multi') + ':' + !!x.querySelector('.tapx')); log('after manual:', after); if (after !== 'false:false') errs.push('manual edit should clear the warning');
  await pg.close();
  /* ② 창고 매니저 */
  pg = await mk('wh@x.com');
  await pg.waitForTimeout(800); const land = (await pg.textContent('#page')).replace(/\s+/g, ' '); log('whmgr landing:', land.slice(0, 90)); if (await pg.$('[data-lf="home"]')) await pg.click('[data-lf="home"]'); await pg.waitForSelector('.hgrp', { timeout: 8000 }).catch(() => errs.push('no warehouse home groups'));
  /* v0.8.125 — 홈은 묶음(.hgrp) 4개: 머리글은 🏭 창고, 창고 매니저는 📦 출고 묶음(UPS 출고 · 픽업 · 포장 대기 · 백오더 · 출고 완료)만 기본으로 펼쳐짐 = 창고 일이 먼저. 📥 주문 접수 묶음은 접힌 채 아래(= 주문 처리는 작게) */
  if (!/🏭 창고/.test(land)) errs.push('whmgr home should be headed 🏭 창고');
  const grps = await pg.$$eval('.hgrp', g => g.map(x => x.dataset.grp + (x.classList.contains('open') ? '*' : '') + ':' + [...x.querySelectorAll('[data-hg]')].map(b => b.dataset.hg).join(',')));
  const nav = await pg.$$eval('#nav button', b => b.map(x => x.textContent.trim()).join('|'));
  log('groups:', grps, 'nav:', nav);
  const open = grps.filter(g => /\*:/.test(g));
  if (open.length !== 1 || !/^ship\*:/.test(open[0]) || !/ups/.test(open[0]) || !/packed/.test(open[0]) || !/done/.test(open[0]) || !/bo\b/.test(open[0]) || !/shipped/.test(open[0])) errs.push('warehouse tiles should come first (출고 묶음만 기본으로 펼쳐짐: ' + open.join(' ') + ')');
  if (!grps.some(g => /^sale:/.test(g) && /flow|sent/.test(g))) errs.push('order tiles should be below (🛒 세일 묶음은 접힌 채 — v0.8.166: 📥 주문 접수 → 🛒 세일)');
  if (!grps.some(g => /\bitems\b/.test(g)) || !grps.some(g => /\btrack\b/.test(g))) errs.push('items · tracking tiles should be on the whmgr home');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'whmgr_home.png'), fullPage: true });
  await pg.click('[data-hg="ups"]'); await pg.waitForTimeout(1000); log('ups tile →', (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 80));
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
