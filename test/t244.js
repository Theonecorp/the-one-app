/* v0.8.215 시험 — 🧹 재고 · 아이템 중복 정리: 조가 만든 화면(옛 WMS)으로 교체 · 주문 흐름은 그대로 (2026-11-13 관리자: "중복 되는 부분 없애고 조가 만든 것으로 유지 · 큰 틀 · 주문이 진행되는 전체 플로우는 바꾸지 마")
 *   ① 📦 재고 묶음(#/hub/wh): 조의 재고 · 상품 · 상품 받기 · 보충 · 재확인 · 라벨 출력 — 예전 📦 재고(stock) · 🏷 아이템(items) 칸은 없음
 *   ② 예전 화면은 주소로 그대로 열림 (#/stock · #/items — 주문 화면 · 카탈로그 · 디자인 담당 메뉴가 씀)
 *   ③ 대시보드 빠른 작업 📥 입고 → 조의 상품 받기(#/recebimento)
 *   ④ 주문 흐름 칸은 그대로: 접수 · 출고(배정 · 피킹 · 인보이스 · UPS · 포장 · 딜리버리) · 완료 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8951', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; });
  await pg.goto('http://127.0.0.1:8951/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  /* ① */
  await pg.evaluate(() => { location.hash = '#/hub/wh'; }); await pg.waitForSelector('[data-hub]', { timeout: 8000 });
  const hubs = await pg.$$eval('[data-hub]', b => b.map(x => x.dataset.hub)); log('① wh hub:', hubs.join(' '));
  for (const r of ['estoque', 'produtos', 'recebimento', 'repor', 'recheca', 'etiquetas']) if (!hubs.includes(r)) errs.push('① Joao screen in the inventory hub: ' + r);
  if (hubs.includes('stock') || hubs.includes('items')) errs.push('① old 📦 재고 · 🏷 아이템 tiles are gone (no duplicates)');
  /* ② */
  await pg.evaluate(() => { location.hash = '#/stock'; }); await pg.waitForSelector('#skQ, #skScan', { timeout: 8000 }).catch(() => errs.push('② #/stock still opens'));
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itQ', { timeout: 8000 }).catch(() => errs.push('② #/items still opens'));
  /* ③ */
  await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForTimeout(900);
  const q = await pg.$('[data-dq="recv"], [data-qa="recv"], [data-hk="recv"]');
  if (q) { await q.click(); await pg.waitForTimeout(700); const h = await pg.evaluate(() => location.hash); log('③ 입고 →', h); if (h !== '#/recebimento') errs.push('③ 입고 opens 상품 받기'); } else log('③ (quick action not on this home — checked in t227 ⑤)');
  /* ④ */
  const st = await pg.evaluate(async () => { const O = await import('/src/orders.js'); return O.stageMenu().map(([g, cs]) => g[0] + ':' + cs.map(c => c[0]).join(',')).join(' | '); });
  log('④ stages:', st);
  for (const k of ['sent', 'pick', 'picked', 'done', 'packed', 'shipped']) if (!new RegExp('[:,]' + k + '(,|$| )').test(st)) errs.push('④ order flow stage still there: ' + k);
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
