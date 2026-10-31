/* v0.8.145 시험 — 🎁 인서트 · 디스플레이 요청: 세일즈맨이 주문 📝 탭에서 C4 ×2 · 월 디스플레이 ×1 요청 → 저장된 주문에 req
 *   담당자 주문 창 · 피킹 리스트 · 확정된 인보이스(DISPLAY / INSERT REQUEST 줄)에 나옴 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8858', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 860 } });
  /* 메모리 DB 는 페이지마다 새로 — 담당자 쪽은 세일즈맨이 저장한 모양 그대로 심어서 확인 */
  const mk = async (email, seedReq) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; try { localStorage.removeItem('theone.order.wip.' + o.email); } catch (x) {}
    if (o.seedReq) window.__AFTER_SEED__ = s => { const t = new Date().toISOString(), d = t.substring(0, 10); s.orders = [{ id: 'O-REQ1', no: 'O-REQ1', d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'REQ SHOP', st: 'sent', n: 1, qty: 3, amt: 30, memo: '', req: { C4: 2, WALL: 1 }, createdAt: t, updatedAt: t, sentAt: t, createdBy: 'brandon@x.com' }]; s.orderLines = [{ id: 'O-REQ1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 3, p: 10, lp: 10, t: 'A' }] }]; }; }, { email, seedReq }); await pg.goto('http://127.0.0.1:8858/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(500); return pg; };

  /* ---------- 세일즈맨: 주문 + 🎁 요청 ---------- */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ', { timeout: 8000 });
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(150); }
  await pg.fill('#eQ1', 'AHG100'); await pg.waitForTimeout(400); await pg.click('[data-gc="AHG100"]'); await pg.waitForTimeout(150);
  await pg.click('[data-ev="memo"]'); await pg.waitForSelector('[data-rqp="C4"]', { timeout: 5000 });
  await pg.click('[data-rqp="C4"]'); await pg.waitForTimeout(80); await pg.click('[data-rqp="C4"]'); await pg.waitForTimeout(80); await pg.click('[data-rqp="WALL"]'); await pg.waitForTimeout(80);
  await pg.click('[data-rqp="C13"]'); await pg.waitForTimeout(80); await pg.click('[data-rqm="C13"]'); await pg.waitForTimeout(120);   // 올렸다 내리면 0 → 저장 안 됨
  const vals = await pg.$$eval('[data-rqv]', e => e.map(x => x.dataset.rqv + '=' + x.textContent)); log('req values:', vals);
  if (!vals.includes('C4=2') || !vals.includes('WALL=1') || !vals.includes('C13=0')) errs.push('request steppers wrong');
  const tab = await pg.textContent('[data-ev="memo"]'); if (!/•/.test(tab)) errs.push('memo tab should show a dot when requests exist');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'req_memo.png') });
  await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(300);
  if (!/C4/.test(await pg.textContent('#eBody'))) errs.push('cart should echo the request');
  await pg.click('#eDraft'); await pg.waitForTimeout(150); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const ord = await pg.evaluate(() => { const O = window.__MOCK_STORE__.orders || {}; const k = Object.keys(O).find(id => O[id].sm === 'BRANDON' && O[id].req); return k ? { id: k, req: O[k].req, st: O[k].st } : null; });
  log('saved order:', ord); if (!ord || ord.req.C4 !== 2 || ord.req.WALL !== 1 || 'C13' in ord.req) errs.push('order should save req {C4:2, WALL:1}');
  await pg.close();
  if (!ord) { await br.close(); srv.kill(); console.log('FAIL', errs); process.exit(1); }

  /* ---------- 담당자: 주문 창 · 피킹 리스트 · 인보이스 ---------- */
  pg = await mk('luke@theonefl.com', true); ord.id = 'O-REQ1';
  await pg.evaluate(id => { location.hash = '#/order/' + id; }, ord.id); await pg.waitForSelector('#mPick', { timeout: 8000 });
  const head = (await pg.textContent('#page')).replace(/\s+/g, ' '); if (!/C4 인서트 ×2/.test(head) || !/월 디스플레이 ×1/.test(head)) errs.push('manage screen should show the request: ' + head.slice(0, 200));
  await pg.click('#mPick'); await pg.waitForSelector('#prt.on', { timeout: 8000 }); await pg.waitForTimeout(300);
  const pick = (await pg.textContent('#prtbody')).replace(/\s+/g, ' '); if (!/DISPLAY \/ INSERT REQUEST: C4 Insert ×2 · Wall Display ×1/.test(pick)) errs.push('picking list should print the request');
  await pg.evaluate(() => { document.getElementById('prt').classList.remove('on'); });
  await pg.click('#mPickDone'); await pg.waitForTimeout(150); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForSelector('#mInv', { timeout: 8000 });
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk', { timeout: 5000 }); await pg.click('#ivOk'); await pg.waitForTimeout(1500);
  const inv = await pg.evaluate(id => { const I = window.__MOCK_STORE__.invoices || {}; const k = Object.keys(I).find(n => I[n].orderId === id); return k ? { no: k, req: I[k].req } : null; }, ord.id);
  log('invoice:', inv); if (!inv || !inv.req || inv.req.C4 !== 2) errs.push('invoice should carry req');
  await pg.waitForSelector('#prt.on', { timeout: 8000 }).catch(() => errs.push('invoice print did not open'));
  const ivt = (await pg.textContent('#prtbody')).replace(/\s+/g, ' '); if (!/DISPLAY \/ INSERT REQUEST : C4 Insert ×2 · Wall Display ×1/.test(ivt)) errs.push('invoice should print the request line');
  await pg.setViewportSize({ width: 820, height: 1100 }); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'req_invoice.png'), fullPage: false });
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
