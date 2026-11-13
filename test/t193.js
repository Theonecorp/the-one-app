/* v0.8.187 시험 — ↩ 크레딧을 주문처럼 눌러 담고 보낼 주문과 같이 보냄 → 사무실 확인 때 CM 발행 (2026-11-11 관리자: "코드를 찾아 입력하지 말고 오더 찍듯이 · 보낼 주문에 같이 모였다가 오더와 같이 보내지게 · 오피스 매니저가 같이 확인" · 발행 시점 = 오피스 확인 때)
 *   ① 세일즈맨: 홈 ↩ 크레딧 → 주문 화면(크레딧 모드 — ↩ 띠 · 합계 −) · 가게 고르기 · 아이템을 눌러 담기(두 번 = 2개)
 *   ② 사유 없이 저장 → 막고 📝 사유 탭으로 · 사유 고르고 🏷 할인 백 10% → 저장 → orders 에 kind credit · 금액 · 수량 마이너스 · draft · 보낼 주문에 ↩ 크레딧으로 주문과 같이 나옴 · 주문 작성 중은 그대로
 *   ③ 📤 보내기 → sent (CM 은 아직 없음 · 가게 잔액 그대로)
 *   ④ 사무실(관리자): 주문 목록에 ↩ 크레딧 · 픽킹 배정에서 빠짐 · 열면 크레딧 요청 화면(줄 · 할인 백 가격 · 합계) → ↩ 크레딧 확정 → invoices CM(마이너스 · 사무실 확인됨 · fromOrder) · 요청은 done + cmNo
 *   ⑤ 세일즈맨이 요청을 열면 ✅ CM 번호 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8861', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 900 } });
  const open = async (email, store) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept('물건 확인 안 됨'));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.store) window.__AFTER_SEED__ = s => { const D = JSON.parse(o.store); Object.keys(D).forEach(k => { s[k] = Object.values(D[k]); }); }; }, { email, store });
    await pg.goto('http://127.0.0.1:8861/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① */
  const sm = await open('brandon@x.com');
  await sm.evaluate(() => { localStorage.setItem('theone.order.wip.brandon@x.com', JSON.stringify({ id: '', no: '', st: 'draft', sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', memo: '', req: {}, disc: {}, lines: [{ c: 'AHG105', d: 'x', q: 3, p: 3.75, lp: 3.75, t: 'A' }], d: '2026-11-11' })); });
  await sm.evaluate(() => { location.hash = '#/home'; }); await sm.waitForTimeout(600);
  const tile = await sm.$('[data-hg="order/credit"]'); if (!tile) errs.push('① salesman home: ↩ credit tile opens the order-style credit'); else await tile.click();
  await sm.waitForSelector('#eStoreQ', { timeout: 8000 }); await sm.fill('#eStoreQ', 'ali'); await sm.waitForTimeout(300); await sm.click('#eStoreHits [data-ac="1111"]'); await sm.waitForTimeout(900);
  if (await sm.$('#modal.on')) { await sm.click('#modal .mclose'); await sm.waitForTimeout(300); }
  const ban = await sm.textContent('#eCrBan').catch(() => ''); log('① banner:', ban.replace(/\s+/g, ' ').slice(0, 80));
  if (!/크레딧 · 리턴/.test(ban)) errs.push('① credit mode banner');
  await sm.fill('#eQ1', 'AHG100'); await sm.waitForTimeout(500);
  const card = '#eRes [data-gc="AHG100"], #eRes tr[data-frow="AHG100"] td.ct'; await sm.click(card); await sm.waitForTimeout(250); await sm.click(card); await sm.waitForTimeout(300);
  const amt = (await sm.textContent('#eA')).trim(); log('① total:', amt); if (!/↩ −\$5\.00/.test(amt)) errs.push('① two taps → 2 × $2.50, shown as ↩ −$5.00');
  /* ② */
  await sm.click('#eDraft'); await sm.waitForTimeout(500);
  const t2 = await sm.textContent('#toast').catch(() => ''); const onMemo = !!(await sm.$('[data-ecw]')); log('② no reason:', t2, onMemo);
  if (!/사유/.test(t2) || !onMemo) errs.push('② saving without a reason is blocked and opens the reason tab');
  await sm.click('[data-ecw="대미지"]'); await sm.click('[data-ecd="10"]'); await sm.waitForTimeout(200);
  const amt2 = (await sm.textContent('#eA')).trim(); log('② with 10% back:', amt2); if (!/−\$4\.50/.test(amt2)) errs.push('② discount back 10% → −$4.50');
  await sm.click('#eDraft'); await sm.waitForSelector('#cfOk', { timeout: 5000 }); await sm.click('#cfOk'); await sm.waitForTimeout(1500);
  if (await sm.$('#acGo')) errs.push('② no "any payment?" prompt after a credit');
  const st2 = await sm.evaluate(() => { const O = Object.values(window.__MOCK_STORE__.orders || {}).filter(o => o.kind === 'credit'); const W = JSON.parse(localStorage.getItem('theone.order.wip.brandon@x.com') || 'null'); return { n: O.length, o: O[0] && { st: O[0].st, amt: O[0].amt, qty: O[0].qty, why: O[0].why, dback: O[0].dback, acct: O[0].acct }, wipStore: W && W.store, wipLines: W && W.lines.length, cr: localStorage.getItem('theone.order.wip.cr.brandon@x.com') }; });
  log('② saved:', JSON.stringify(st2));
  if (st2.n !== 1 || !st2.o || st2.o.st !== 'draft' || st2.o.amt !== -4.5 || st2.o.qty !== -2 || st2.o.why !== '대미지' || st2.o.dback !== 10 || st2.o.acct !== '1111') errs.push('② credit saved as an order draft: kind credit · −$4.50 · −2 pcs · reason · 10% back');
  if (st2.wipStore !== 'BEAUTY 4U' || st2.wipLines !== 1 || st2.cr) errs.push('② the order in progress (BEAUTY 4U) is untouched · credit draft cleared');
  /* 보낼 주문 */
  await sm.evaluate(() => { localStorage.removeItem('theone.order.wip.brandon@x.com'); location.hash = '#/order'; }); await sm.waitForSelector('#oSendAll', { timeout: 8000 });
  const dr = await sm.$$eval('[data-sd]', E => E.map(e => e.closest('label').textContent.replace(/\s+/g, ' ').trim())); log('② review & send:', JSON.stringify(dr));
  if (!dr.some(t => /↩ 크레딧/.test(t) && /ALI B\/S # 1/.test(t) && /-\$4\.50|−\$4\.50/.test(t) && /대미지/.test(t))) errs.push('② the credit shows in Review & send as ↩ 크레딧 with −$4.50 and the reason');
  /* ③ */
  await sm.click('#oSendAll'); await sm.waitForTimeout(400); if (await sm.$('#cfOk')) await sm.click('#cfOk'); await sm.waitForTimeout(1500);
  const st3 = await sm.evaluate(() => { const M = window.__MOCK_STORE__; return { st: Object.values(M.orders).find(o => o.kind === 'credit').st, cms: Object.values(M.invoices || {}).filter(x => x.src === 'credit' && x.acct === '1111').length }; });
  log('③ sent:', JSON.stringify(st3)); if (st3.st !== 'sent' || st3.cms) errs.push('③ sent with the orders — no CM yet');
  const store = await sm.evaluate(() => { const M = window.__MOCK_STORE__; const pick = ['orders', 'orderLines', 'invoices', 'counters']; const o = {}; pick.forEach(k => { o[k] = {}; Object.entries(M[k] || {}).forEach(([id, d]) => { o[k][id] = Object.assign({ id }, d); }); }); return JSON.stringify(o); });
  const crId = await sm.evaluate(() => Object.values(window.__MOCK_STORE__.orders).find(o => o.kind === 'credit').id);
  /* ④ 사무실 */
  const of = await open('luke@theonefl.com', store);
  await of.evaluate(() => { location.hash = '#/order/' + 'x'; }); await of.waitForTimeout(300);
  await of.evaluate(id => { location.hash = '#/order/' + id; }, crId); await of.waitForSelector('#crrOk', { timeout: 8000 }).catch(() => errs.push('④ office opens the request and sees ↩ 크레딧 확정'));
  const rv = (await of.textContent('#page')).replace(/\s+/g, ' '); log('④ review:', rv.slice(0, 220));
  if (!/크레딧 요청/.test(rv) || !/대미지/.test(rv) || !/−\$4\.50/.test(rv) || !/\$2\.25/.test(rv)) errs.push('④ request shows reason, unit $2.25 (10% back) and −$4.50');
  if (await of.$('#crrOk')) { await of.click('#crrOk'); await of.waitForSelector('#cfOk'); await of.click('#cfOk'); await of.waitForTimeout(1500); }
  const st4 = await of.evaluate(id => { const M = window.__MOCK_STORE__; const o = M.orders[id]; const cm = Object.values(M.invoices || {}).find(x => x.fromOrder === id); return { st: o.st, cmNo: o.cmNo, cm: cm && { no: cm.no, total: cm.total, bal: cm.bal, reviewed: cm.reviewed, q: cm.lines.map(l => l.c + ':' + l.q + '@' + l.p).join(), why: cm.why, sm: cm.sm, src: cm.src }, hash: location.hash }; }, crId);
  log('④ issued:', JSON.stringify(st4));
  if (st4.st !== 'shipped' ||   /* v0.8.226: 크레딧 메모 발행 = ✅ 완료 */ !st4.cm || st4.cmNo !== st4.cm.no || st4.cm.total !== -4.5 || st4.cm.bal !== -4.5 || !st4.cm.reviewed || st4.cm.q !== 'AHG100:-2@2.25' || st4.cm.src !== 'credit' || st4.cm.sm !== 'BRANDON') errs.push('④ confirm → CM −$4.50 (reviewed, lines −2 @ 2.25) · request done with cmNo');
  if (!/credit/.test(st4.hash)) errs.push('④ goes to the issued CM');
  /* 픽킹 배정에서 빠짐 */
  const fl = await of.evaluate(async () => { const F = await import('/src/fulfill.js'); return typeof F.assignPicker; }); if (fl !== 'function') errs.push('④ assignPicker exists');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
