/* v0.8.166 시험 — 담당자 홈 묶음을 🛒 세일(인보이스 발행까지: 접수 · 확인 · 배정 · 픽킹 · 검수) / 🚚 배송(그 뒤: 포장 대기 · UPS 라벨 · 픽업 · 출고 완료 · 백오더 · 디스플레이 · 주문 없이 라벨 · 배송 조회) / 💵 수금 / 📚 조회 로
 *   ① 오피스 매니저: 네 묶음 · 세일에 새 주문 · 신규 · 확인 · 픽킹 · 검수, 배송에 인보이스 발행 · UPS · 픽업 · 출고 완료 · 백오더 · 주문 없이 라벨 · 배송 조회 · 수금에 크레딧 · 어느 타일도 두 묶음에 겹치지 않음 · 기본으로 세일이 펼쳐짐
 *   ② 배송 묶음의 ➕ 주문 없이 UPS 라벨 → 임의 출고 창 · 창고 매니저는 배송 묶음이 기본 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8894', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); try { localStorage.clear(); } catch (e) {} }, { email, seed }); await pg.goto('http://127.0.0.1:8894/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const groups = pg => pg.$$eval('.hgrp', g => g.map(x => ({ k: x.dataset.grp, open: x.classList.contains('open'), head: x.querySelector('.hgh').textContent.replace(/\s+/g, ' ').trim(), ic: !!x.querySelector('.hgh .hgi svg'), tiles: [...x.querySelectorAll('[data-hg]')].map(b => b.dataset.hg) })));
  /* ① 오피스 매니저 */
  let pg = await mk('office@x.com', "s.users.push({ id: 'office@x.com', email: 'office@x.com', name: 'O', role: 'manager', job: 'office', active: true });");
  await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForSelector('.hgrp', { timeout: 8000 });
  let G = await groups(pg); log('① office groups:', JSON.stringify(G.map(g => g.k + (g.open ? '*' : '') + ':' + g.tiles.join(','))));
  const by = k => G.find(g => g.k === k);
  if (G.map(g => g.k).join() !== 'sale,ship,money,look') errs.push('① four groups in order: sale · ship · money · look');
  if (!by('sale') || !by('sale').ic || !/세일/.test(by('sale').head)) errs.push('① first group is 세일 (cart icon — v0.8.203 선 아이콘)');
  if (!by('ship') || !by('ship').ic || !/배송/.test(by('ship').head)) errs.push('① second group is 배송 (truck icon)');
  const has = (k, t) => by(k) && by(k).tiles.includes(t);
  ['new', 'sent', 'cfw', 'cfok', 'pick', 'picked', 'flow'].forEach(t => { if (!has('sale', t)) errs.push('① 세일 should hold ' + t); });
  ['done', 'ups', 'packed', 'shipped', 'bo', 'displays', 'adhoc', 'track'].forEach(t => { if (!has('ship', t)) errs.push('① 배송 should hold ' + t); });
  if (!has('money', 'credit') || !has('money', 'verify')) errs.push('① 수금 holds credit · verify'); if (!has('look', 'inv') || !has('look', 'stores')) errs.push('① 조회 holds invoices · customers');
  const all = G.flatMap(g => g.tiles); if (new Set(all).size !== all.length) errs.push('① no tile appears in two groups');
  if (!by('sale').open || G.filter(g => g.open).length !== 1) errs.push('① 세일 is the only group open by default for office');
  /* ② 배송 묶음 → 주문 없이 UPS 라벨 */
  await pg.evaluate(() => { document.querySelector('.hgrp[data-grp="ship"]').classList.add('open'); }); await pg.click('[data-hg="adhoc"]'); await pg.waitForSelector('[data-f="to.name"]', { timeout: 8000 }).catch(() => errs.push('② adhoc tile opens the ship modal'));
  const head = await pg.evaluate(() => (document.querySelector('#mbox .muted') || {}).textContent || ''); if (!/임의 출고|Ad-hoc/.test(head)) errs.push('② modal is the ad-hoc shipment (got ' + head + ')');
  await pg.close();
  pg = await mk('wh@x.com', "s.users.push({ id: 'wh@x.com', email: 'wh@x.com', name: 'W', role: 'manager', job: 'whmgr', active: true });");
  await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForSelector('.hgrp', { timeout: 8000 });
  G = await groups(pg); log('② whmgr groups:', JSON.stringify(G.map(g => g.k + (g.open ? '*' : '') + ':' + g.tiles.join(','))));
  if (!by('ship') || !by('ship').open || !has('ship', 'adhoc') || !has('ship', 'ups')) errs.push('② warehouse manager: 배송 open by default with UPS · ad-hoc label');
  if (by('sale') && by('sale').tiles.includes('new')) errs.push('② warehouse manager has no 새 주문 tile');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
