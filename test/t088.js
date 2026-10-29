/* v0.8.110 시험 — ❓ 확인 → 👷 배정 순서 · 체크 칸 · 🏷 인보이스 종류(W) 사무실 판단
 *   ① 담당자 📥 신규: 줄을 누르면 주문이 열림(배정 팝업 아님) · 체크 칸(.ckw) 누르면 선택만 · 👤 묶음의 ❓ 전체 확인 요청 → cfReq + notifyq(cfreq, order/cf)
 *   ② 세일즈맨: 홈 ❓ 카드 → #/order/cf 검토 화면(아이템 보임) → ✅ 전체 → cfOk/cfHow 'req' + notifyq(cfok)
 *   ③ 담당자: 접수 주문에서 🏷 모두 W → orderLines t='W' 저장 · 목록 🏷 W 태그 · 인보이스 확정 창에서 묶음 종류 바꾸기 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8825', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 }, hasTouch: true });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8825/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const more = "const o = s.orders[0]; s.orders.push(Object.assign({}, o, { id: 'O261015-BBBB', no: 'O261015-BBBB', d: '2026-10-15', store: 'BEAUTY 4U', acct: '1271', amt: 120, sentAt: '2026-10-15T15:00:00Z' }), Object.assign({}, o, { id: 'O261015-CCCC', no: 'O261015-CCCC', d: '2026-10-15', sm: 'BRANDON', store: 'HAIR TOWN', acct: '1272', amt: 60, sentAt: '2026-10-15T16:00:00Z' })); s.orderLines.push(Object.assign({}, s.orderLines[0], { id: 'O261015-BBBB' }), Object.assign({}, s.orderLines[0], { id: 'O261015-CCCC', sm: 'BRANDON' }));";
  /* ① 담당자 — 📥 신규 */
  let pg = await mk('luke@theonefl.com', more);
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(600);
  await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' }))); await pg.waitForSelector('[data-ck]', { timeout: 8000 }).catch(() => errs.push('new-orders list with checkboxes missing'));
  const bar = await txt(pg, '#bulkBar'); log('bulk:', bar.slice(0, 90)); if (!/확인 요청/.test(bar)) errs.push('bulk bar should explain confirm-first flow');
  const smcf = await pg.$$('[data-smcf]'); log('smcf buttons:', smcf.length); if (smcf.length < 2) errs.push('per-salesman ask buttons missing');
  /* 체크 칸 — 선택만 되고 주문이 열리지 않아야 */
  await pg.click('[data-ckw="O261014-AAAA"]'); await pg.waitForTimeout(300);
  const ckd = await pg.evaluate(() => document.querySelector('[data-ck="O261014-AAAA"]').checked), ckN = await txt(pg, '#ckN'); log('checked:', ckd, ckN);
  if (!ckd) errs.push('tapping the checkbox area should check the box'); if (!/1/.test(ckN)) errs.push('selection count should show 1');
  if (await pg.$('#pkOk')) errs.push('assign popup should not open from the checkbox'); if (await pg.$('#mBack')) errs.push('order should not open from the checkbox');
  await pg.click('[data-ckw="O261014-AAAA"]'); await pg.waitForTimeout(200); if (await pg.evaluate(() => document.querySelector('[data-ck="O261014-AAAA"]').checked)) errs.push('second tap should uncheck');
  /* 줄 누르기 — 주문 열림 (배정 팝업 아님) */
  await pg.click('[data-oid="O261015-BBBB"] .ct'); await pg.waitForTimeout(800);
  if (await pg.$('#pkOk')) errs.push('tapping a new order should open it, not the assign popup'); if (!(await pg.$('#mBack'))) errs.push('order detail should open on tap');
  const det = await txt(pg, '#page'); if (!/BEAUTY 4U/.test(det)) errs.push('opened order should be BEAUTY 4U');
  /* 🏷 인보이스 종류 바 — 접수 단계에서 모두 W */
  const tb = await txt(pg, '#mTypes'); log('types:', tb.slice(0, 80)); if (!/A 2/.test(tb) || !/W 0/.test(tb)) errs.push('type bar should show A 2 · W 0');
  await pg.click('[data-tall="W"]'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  let ol = await pg.evaluate(() => window.__MOCK_STORE__.orderLines['O261015-BBBB'].lines.map(l => l.t)), od = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261015-BBBB'].ty); log('lines t:', ol, 'ty:', od);
  if (ol.join() !== 'W,W') errs.push('all lines should be W after 모두 W'); if (!od || od.W !== 2) errs.push('order.ty.W should be 2');
  if (!/W 2/.test(await txt(pg, '#mTypes'))) errs.push('type bar should update to W 2');
  /* 목록 🏷 태그 · ❓ 전체 확인 요청 (ALEX) */
  await pg.click('#mBack'); await pg.waitForTimeout(600); await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'sent' }))); await pg.waitForSelector('[data-smcf="ALEX"]', { timeout: 8000 }).catch(() => errs.push('ALEX ask button missing'));
  const row = await txt(pg, '[data-oid="O261015-BBBB"]'); log('row:', row.slice(0, 100)); if (!/🏷 W 2/.test(row)) errs.push('list row should show 🏷 W 2 tag');
  await pg.click('[data-smcf="ALEX"]'); await pg.waitForSelector('#cfOk'); const ask = await txt(pg, '#mbox, .ovr'); log('ask:', ask.slice(0, 100)); if (!/ALEX/.test(ask) || !/2건/.test(ask)) errs.push('ask confirm should name ALEX and 2 orders');
  await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const st = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.orders).map(o => [o.id, !!o.cfReq, o.cfOk])); log('orders:', JSON.stringify(st));
  if (!st.filter(x => x[0] !== 'O261015-CCCC').every(x => x[1] && !x[2])) errs.push('ALEX orders should be cfReq'); if (st.find(x => x[0] === 'O261015-CCCC')[1]) errs.push('BRANDON order should not be requested');
  let nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'cfreq')); log('notifyq cfreq:', nq.length, nq[0] && [nq[0].toSm, nq[0].url, nq[0].text.slice(0, 60)]);
  if (nq.length !== 1 || nq[0].toSm !== 'ALEX' || !/order\/cf$/.test(nq[0].url) || !/2건/.test(nq[0].text)) errs.push('one cfreq notice to ALEX with review url expected');
  if (await pg.$('[data-oid="O261014-AAAA"]')) errs.push('requested orders should leave the 📥 new tab');
  await pg.close();
  /* ② 세일즈맨 — 검토 화면 */
  pg = await mk('brandon@x.com', more + " s.orders.forEach(o => { o.sm = 'BRANDON'; if (o.id !== 'O261015-CCCC') { o.cfReq = true; o.cfReqAt = '2026-10-16T10:00:00Z'; o.cfReqBy = 'office@x.com'; } }); s.orderLines.forEach(l => { l.sm = 'BRANDON'; }); s.orders[1].cfNote = 'AHG100 20개 맞나요?';");
  await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('#dcReq', { timeout: 8000 }).catch(() => errs.push('home ❓ request card missing'));
  const hc = await txt(pg, '#dcReq'); log('home card:', hc.slice(0, 90)); if (!/2건/.test(hc)) errs.push('home card should count 2 requests');
  await pg.click('#dcReq'); await pg.waitForSelector('#rvAll', { timeout: 8000 }).catch(() => errs.push('review page missing')); await pg.waitForTimeout(800);
  const rv = await txt(pg, '#page'); log('review:', rv.slice(0, 160));
  if (!/BEAUTY EXCHANGE ORLANDO/.test(rv) || !/BEAUTY 4U/.test(rv) || /HAIR TOWN/.test(rv)) errs.push('review should list only requested orders');
  if (!/AHG100/.test(rv) || !/AHG101/.test(rv)) errs.push('review should show the items'); if (!/AHG100 20개 맞나요/.test(rv)) errs.push('review should show the office note');
  if ((await pg.$$('[data-rvk]')).length !== 2) errs.push('per-order ✅ buttons expected');
  await pg.click('#rvAll'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const st2 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.orders).map(o => [o.id, o.cfOk, o.cfHow])); log('after ✅:', JSON.stringify(st2));
  if (!st2.filter(x => x[0] !== 'O261015-CCCC').every(x => x[1] === true && x[2] === 'req')) errs.push('requested orders should be cfOk/req'); if (st2.find(x => x[0] === 'O261015-CCCC')[1]) errs.push('unrequested order untouched');
  nq = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'cfok')); log('notifyq cfok:', nq.length, nq[0] && [nq[0].toStaff, nq[0].text.slice(0, 50)]); if (nq.length !== 1 || !nq[0].toStaff) errs.push('staff notice on confirm expected');
  if (!/확인 요청이 없습니다/.test(await txt(pg, '#page'))) errs.push('review page should be empty after confirming');
  await pg.close();
  /* ③ 담당자 — 👍 확인 완료 탭에서는 줄 누르면 배정 팝업 · 인보이스 확정 창에서 묶음 종류 바꾸기 */
  pg = await mk('luke@theonefl.com', more + " s.orders.forEach(o => { o.cfReq = true; o.cfOk = true; o.cfHow = 'req'; }); s.orders[1].st = 'picked'; s.orderLines[1].lines.forEach(l => { l.pq = l.q; l.ok = true; }); s.orderLines[1].lines[1].t = 'W';");
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(600);
  await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'cfok' }))); await pg.waitForSelector('[data-oid="O261014-AAAA"]', { timeout: 8000 }).catch(() => errs.push('cfok list missing'));
  await pg.click('[data-oid="O261014-AAAA"] .ct'); await pg.waitForSelector('#pkOk', { timeout: 5000 }).catch(() => errs.push('assign popup should open from the 👍 tab')); await pg.click('#pkX').catch(() => {}); await pg.waitForTimeout(300);
  await pg.evaluate(() => { location.hash = '#/order/O261015-BBBB'; }); await pg.waitForSelector('#mInv', { timeout: 8000 }).catch(() => errs.push('invoice button missing on picked order'));
  const tb2 = await txt(pg, '#mTypes'); log('types(picked):', tb2.slice(0, 60)); if (!/A 1/.test(tb2) || !/W 1/.test(tb2)) errs.push('type bar should show A 1 · W 1');
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); const ivt = await pg.$$('[data-ivt]'); log('group selects:', ivt.length); if (ivt.length !== 2) errs.push('two group type selects expected');
  await pg.selectOption('[data-ivt="W"]', 'A'); await pg.waitForTimeout(500);
  const ivt2 = await pg.$$('[data-ivt]'); const mb = await txt(pg, '#mbox'); log('after move:', ivt2.length, mb.slice(0, 80)); if (ivt2.length !== 1 || !(await pg.$('[data-ivt="A"]'))) errs.push('W group should merge into A');
  await pg.click('#ivOk'); await pg.waitForTimeout(1500);
  const inv = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices || {}).filter(v => v.orderId === 'O261015-BBBB').map(v => [v.no, v.t, v.lines.length])); log('invoices:', JSON.stringify(inv));
  if (inv.length !== 1 || inv[0][1] !== 'A' || inv[0][2] !== 2) errs.push('one A invoice with 2 lines expected');
  ol = await pg.evaluate(() => window.__MOCK_STORE__.orderLines['O261015-BBBB'].lines.map(l => l.t)); if (ol.join() !== 'A,A') errs.push('lines should be saved as A');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
