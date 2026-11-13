/* v0.8.166 시험 — ➕ 주문 · 인보이스 · 가게 없이 UPS 라벨 (임의 출고): 🚚 배송 조회의 "주문 없이 UPS 라벨" → 같은 출고 창에서 받는 곳을 손으로 적고 라벨 요청 → shipq 에 주문 없는 요청(adhocId) · adhoc 문서에 받는 곳 이름 → UPS.gs 가 끝내면 adhoc 문서에 트래킹 · shipped
 *   ① 단추는 출고 권한(can('ship'))이 있는 사람에게 · 누르면 adhoc/{id} 문서가 생기고 출고 창이 빈 받는 곳으로 열림
 *   ② 받는 곳 · 박스를 적고 📦 라벨 만들기 → shipq/{id}: st wait · orderId '' · adhocId = id · store = 받는 곳 이름 · to 그대로 · 주문 · 거래처 문서는 건드리지 않음
 *   ③ (UPS.gs 흉내) shipq 가 done 이 되면 창에 ✅ 라벨 · adhoc 문서에 track · st shipped */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8893', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 900, height: 1000 } });
  const mk = async (email, view) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.view) try { localStorage.setItem('theone.view.' + o.email, o.view); } catch (e) {} }, { email, view }); await pg.goto('http://127.0.0.1:8893/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  /* ① 세일즈맨에겐 없음 · 담당자에겐 있음 — v0.8.226: 🚚 배송 조회 화면을 없애서(2026-11-13 창고 매니저) 단추는 담당자 홈의 ➕ 주문 없이 UPS 라벨 칸 */
  let pg = await mk('brandon@x.com'); await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForTimeout(1200);
  if (await pg.$('[data-hg="adhoc"]')) errs.push('① salesmen must not see the ad-hoc label button'); await pg.close();
  pg = await mk('luke@theonefl.com', 'manager'); await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForSelector('[data-hg="adhoc"]', { state: 'attached', timeout: 8000 }).then(() => pg.evaluate(() => { const g = document.querySelector('[data-hg="adhoc"]').closest('.hgrp'); if (g && !g.classList.contains('open')) g.querySelector('[data-ghd]').click(); })).catch(() => errs.push('① staff should see ➕ 주문 없이 UPS 라벨'));
  const before = await pg.evaluate(() => ({ orders: Object.keys(window.__MOCK_STORE__.orders || {}).length, accounts: JSON.stringify(window.__MOCK_STORE__.accounts || {}).length }));
  await pg.click('[data-hg="adhoc"]'); await pg.waitForSelector('[data-f="to.name"]', { timeout: 8000 });
  const A = await pg.evaluate(() => { const L = Object.values(window.__MOCK_STORE__.adhoc || {}); const a = L[L.length - 1]; return a && { id: a.id, no: a.no, st: a.st, store: a.store, col: a.col }; }); log('① adhoc doc:', JSON.stringify(A));
  if (!A || A.st !== 'open' || !/^ADHOC-/.test(A.no) || A.col !== 'adhoc' || A.store) errs.push('① an open adhoc document is created first');
  const empty = await pg.evaluate(() => ['to.name', 'to.addr1', 'to.city', 'to.zip'].map(k => document.querySelector('[data-f="' + k + '"]').value).join('')); if (empty) errs.push('① ship-to starts empty (no store)');
  const head = await pg.evaluate(() => document.querySelector('#mbox .muted').textContent); log('① header:', head); if (!/임의 출고|Ad-hoc/.test(head)) errs.push('① header says ad-hoc');
  /* ② 받는 곳 · 박스 → 라벨 만들기 */
  const fill = async (k, v) => { await pg.fill('[data-f="' + k + '"]', v); await pg.dispatchEvent('[data-f="' + k + '"]', 'input'); await pg.dispatchEvent('[data-f="' + k + '"]', 'change'); };
  await fill('to.name', 'WALK-IN BUYER LLC'); await fill('to.attn', 'JANE'); await fill('to.phone', '4075551234'); await fill('to.addr1', '100 MAIN ST'); await fill('to.city', 'ORLANDO'); await fill('to.state', 'FL'); await fill('to.zip', '32801');
  const wsel = await pg.$('[data-f="boxes.0.w"]'); if (wsel) await fill('boxes.0.w', '3');
  await pg.click('#upGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }).catch(() => errs.push('② should ask to confirm the label'));
  const ask = await pg.evaluate(() => { const b = document.getElementById('cfOk'); const box = b && (b.closest('.ovr') || b.closest('.box') || b.parentElement.parentElement); return (box || {}).textContent || ''; }); if (!/WALK-IN BUYER LLC/.test(ask) || !/100 MAIN ST/.test(ask)) errs.push('② confirm shows the typed recipient');
  if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(800);
  const Q = await pg.evaluate(id => { const q = window.__MOCK_STORE__.shipq[id]; const a = window.__MOCK_STORE__.adhoc[id]; return { q: q && { st: q.st, orderId: q.orderId, dispId: q.dispId, adhocId: q.adhocId, store: q.store, acct: q.acct, to: q.to && [q.to.name, q.to.addr1, q.to.city, q.to.state, q.to.zip], boxes: (q.boxes || []).length, ref: q.ref }, a: a && { store: a.store, st: a.st, to: a.to && a.to.name } }; }, A.id); log('② shipq:', JSON.stringify(Q));
  if (!Q.q || Q.q.st !== 'wait' || Q.q.orderId !== '' || Q.q.dispId !== '' || Q.q.adhocId !== A.id || Q.q.store !== 'WALK-IN BUYER LLC' || Q.q.acct !== '' || !Q.q.to || Q.q.to.join('|') !== 'WALK-IN BUYER LLC|100 MAIN ST|ORLANDO|FL|32801' || Q.q.boxes < 1) errs.push('② shipq request: wait · no order · adhocId · store = recipient · typed address');
  if (!Q.a || Q.a.store !== 'WALK-IN BUYER LLC' || Q.a.to !== 'WALK-IN BUYER LLC') errs.push('② adhoc doc gets the recipient name');
  const after = await pg.evaluate(() => ({ orders: Object.keys(window.__MOCK_STORE__.orders || {}).length, accounts: JSON.stringify(window.__MOCK_STORE__.accounts || {}).length })); if (after.orders !== before.orders || after.accounts !== before.accounts) errs.push('② no order or account document is touched');
  /* ③ UPS.gs 흉내: done */
  await pg.evaluate(id => { const q = window.__MOCK_STORE__.shipq[id]; Object.assign(q, { st: 'done', track: '1Z999AA10123456784', labels: [{ trk: '1Z999AA10123456784', gif: '' }], charge: 12.3, env: 'test' }); }, A.id);
  await pg.waitForFunction(id => { const a = window.__MOCK_STORE__.adhoc[id]; return a && a.st === 'shipped' && a.track === '1Z999AA10123456784'; }, A.id, { timeout: 15000 }).catch(() => errs.push('③ when UPS finishes, the adhoc doc gets track + shipped'));
  const fin = await pg.evaluate(id => { const a = window.__MOCK_STORE__.adhoc[id]; return { st: a.st, track: a.track, boxes: a.boxes, cost: a.shipCost, modal: (document.getElementById('mbox') || {}).textContent || '' }; }, A.id); log('③ after done:', JSON.stringify({ st: fin.st, track: fin.track, boxes: fin.boxes, cost: fin.cost }), '| modal has label:', /1Z999AA10123456784/.test(fin.modal));
  if (fin.st !== 'shipped' || fin.boxes !== 1 || fin.cost !== 12.3) errs.push('③ adhoc doc: shipped · 1 box · charge');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
