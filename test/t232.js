/* v0.8.206 시험 — 🚚 인보이스 뒤 UPS 출고를 🏪 Shipping UPS 카운터 하나로 (2026-11-12 관리자: "인보이스 발행 뒤 겹치는 UPS 단계를 조의 화면으로 통합 · UPS API 는 그대로")
 *   ① 주문(인보이스 발행 · st done)의 🚚 출고 → 카운터에 그 가게가 열리고 🧾 이 가게의 출고할 인보이스 중 그 주문만 ✓ · 다른 주소 주문은 고를 수 없음
 *   ② 라벨 요청은 예전처럼 shipq → (UPS.gs 흉내) done → 고른 주문만 📦 포장 완료(packed) · 트래킹 · 박스 · shipId · adhoc 에 인보이스 · 주문 번호
 *   ③ 다른 주소(shipTo)로 가는 주문의 🚚 출고는 예전 출고 창 (카운터로 안 감) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8944', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
    window.__AFTER_SEED__ = s => { const d = new Date().toISOString().substring(0, 10), O = (id, inv, amt, x) => Object.assign({ id, no: id, d, ym: d.substring(0, 7), acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', st: 'done', invs: [inv], amt, lines: [], doneAt: d + 'T1' + id.slice(-1) + ':00:00Z', createdAt: d }, x || {});
      s.orders = (s.orders || []).concat([O('UO1', 'A-050101', 500), O('UO2', 'A-050102', 300, { shipTo: { name: 'OTHER', addr1: '1 MAIN ST', city: 'TAMPA', state: 'FL', zip: '33601' } }), O('UO3', 'A-050103', 200)]); }; });
  await pg.goto('http://127.0.0.1:8944/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  /* ① */
  await pg.evaluate(() => { location.hash = '#/order/UO1'; }); await pg.waitForSelector('#mShip', { timeout: 8000 }); await pg.click('#mShip');
  await pg.waitForSelector('[data-sb-ord]', { timeout: 8000 }).catch(() => errs.push('① 🚚 출고 opens the counter with the store\'s invoices'));
  const ck = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-sb-ord]')].map(c => [c.dataset.sbOrd, (c.checked ? 'on' : 'off') + (c.disabled ? '-x' : '')])));
  log('① hash:', await pg.evaluate(() => location.hash), JSON.stringify(ck));
  if (ck.UO1 !== 'on' || ck.UO3 !== 'off' || ck.UO2 !== 'off-x') errs.push('① only the order you came from is ticked · other-address order cannot be picked');
  /* ② */
  await pg.focus('#sbP'); await pg.keyboard.type('10'); await pg.keyboard.press('Enter'); await pg.keyboard.type('12'); await pg.keyboard.press('Enter'); await pg.keyboard.type('10'); await pg.keyboard.press('Enter'); await pg.keyboard.type('8'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('.sb .su-feita', { timeout: 4000 });
  if (await pg.$('#sbCod:checked')) await pg.uncheck('#sbCod');
  await pg.click('.sb [data-act="sb-finalizar"]');
  await pg.waitForFunction(() => Object.values(window.__MOCK_STORE__.shipq || {}).some(q => q.st === 'wait'), null, { timeout: 6000 }).catch(() => errs.push('② label request goes to shipq'));
  const W = await pg.evaluate(() => { const e = Object.entries(window.__MOCK_STORE__.shipq).find(([, q]) => q.st === 'wait'); return e ? e[0] : ''; });
  const A = await pg.evaluate(id => window.__MOCK_STORE__.adhoc[id], W); log('② adhoc:', JSON.stringify({ invs: A && A.invs, orderIds: A && A.orderIds }));
  if (!A || (A.orderIds || []).join() !== 'UO1' || (A.invs || []).join() !== 'A-050101') errs.push('② adhoc keeps the invoice · order');
  await pg.evaluate(id => Object.assign(window.__MOCK_STORE__.shipq[id], { st: 'done', track: '1Z999AA10123456784', charge: 18.2, labels: [{ trk: '1Z999AA10123456784', img: '' }] }), W);
  await pg.waitForFunction(() => window.__MOCK_STORE__.orders.UO1.st === 'packed', null, { timeout: 15000 }).catch(() => errs.push('② order becomes packed'));
  const o = await pg.evaluate(() => ['UO1', 'UO2', 'UO3'].map(id => { const x = window.__MOCK_STORE__.orders[id]; return { id, st: x.st, track: x.track || '', boxes: x.boxes || 0, shipId: x.shipId || '', via: x.shipVia || '' }; }));
  log('② orders:', JSON.stringify(o));
  if (o[0].track !== '1Z999AA10123456784' || o[0].boxes !== 1 || o[0].shipId !== W || o[0].via !== 'UPS') errs.push('② tracking · boxes · shipId on the order');
  if (o[1].st !== 'done' || o[2].st !== 'done') errs.push('② unticked orders stay waiting');
  /* ③ */
  await pg.waitForTimeout(2500); await pg.evaluate(() => { location.hash = '#/order/UO2'; }); await pg.waitForSelector('#mShip', { timeout: 8000 }); await pg.click('#mShip'); await pg.waitForTimeout(1200);
  const h3 = await pg.evaluate(() => location.hash); log('③ other address →', h3, !!(await pg.$('#modal .modal, .modal')));
  if (/balcao/.test(h3)) errs.push('③ other-address order keeps the old ship window');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
