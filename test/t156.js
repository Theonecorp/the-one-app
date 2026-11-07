/* v0.8.174 시험 — 🚚 배송 조회: 출고(여러 박스) 단위 목록 · 직원 앱 Shipping History 와 같은 칸(날짜 · 기록 · 거래처 · 세일즈맨 · 받는 곳 · 서비스 · 박스 · 무게 · 운임 · 운송장 · 상태) · 줄을 누르면 팝업(개요 + 박스마다 운송장 · 기록) · UPS 기록 가져오기(src:'ups') 문서도 같이
 *   ① 담당자 폰: 가게로 찾으면 출고 2건(박스 3개)이 2줄 · 줄에 #거래처 · 세일즈맨 · 박스 수 · 무게 · 운임 · 상태 · 머리에 "2 출고 · 3 박스"
 *   ② 줄을 누르면 팝업: 출고일 · 거래처 · 세일즈맨 · 주소 · 운임(협상가 · 정가) · 박스 2개 각각 운송장 · 📍 기록 → 스캔 기록 창 → ← 출고로 로 팝업 복귀
 *   ③ 컴퓨터: 표 머리 순서 날짜 · 기록 · 거래처 · 세일즈맨 · 받는 곳 · 서비스 · 박스 · 무게 · 운임 · 운송장 · 상태
 *   ④ 세일즈맨은 자기 가게 것만 (sm 규칙과 같게) · 취소된 출고는 ✕ 취소됨 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8821', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = "const B = { orderId: '', no: '', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', invs: [], svc: '03', svcName: 'UPS Ground', shipDate: '2026-11-05', to: '100 MAIN ST', city: 'ORLANDO', state: 'FL', zip: '32801', src: 'ups', by: 'import', cost: 33.45, list: 70.56, sw: 27, rec: 'SHP-2026-014001', shipId: 'Y9620EAAAA1', lead: '1ZY9620E0300000001', status: 'In Transit', delivered: false, voided: false, trkSt: 'open', at: '2026-11-05T10:00:00Z' };" +
    "s.shipments = [Object.assign({}, B, { id: '1ZY9620E0300000001', trk: '1ZY9620E0300000001', box: 1, boxes: 2, w: 17, dims: '20×14×10' }), Object.assign({}, B, { id: '1ZY9620E0300000002', trk: '1ZY9620E0300000002', box: 2, boxes: 2, w: 10, dims: '12×12×8', delivered: true, deliveredAt: '2026-11-06', status: 'Delivered', trkSt: 'done', events: [{ d: '2026-11-06', t: '10:44', st: 'D', desc: 'Delivered', loc: 'ORLANDO, FL' }] })," +
    " Object.assign({}, B, { id: '1ZY9620E0300000009', trk: '1ZY9620E0300000009', lead: '1ZY9620E0300000009', shipId: 'Y9620EAAAA9', box: 1, boxes: 1, w: 5, sw: 5, cost: 11.24, list: 25.99, rec: 'SHP-2026-013990', shipDate: '2026-11-03', status: 'Voided', voided: true, trkSt: 'void' })," +
    " Object.assign({}, B, { id: '1ZY9620E0300000007', trk: '1ZY9620E0300000007', lead: '1ZY9620E0300000007', shipId: 'Y9620EAAAA7', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', box: 1, boxes: 1, w: 8, sw: 8, cost: 12.5, shipDate: '2026-11-04', status: 'Delivered', delivered: true, deliveredAt: '2026-11-05', trkSt: 'done' })];";
  const mk = async (email, W) => { const pg = await (await br.newContext({ viewport: { width: W, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8821/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  /* ① 담당자 폰 — 가게 3001 */
  const pg = await mk('luke@theonefl.com', 430);
  await pg.evaluate(() => { location.hash = '#/track'; }); await pg.waitForSelector('#tkQ'); await pg.fill('#tkQ', '3001'); await pg.waitForTimeout(400); await pg.click('[data-tka="3001"]'); await pg.waitForSelector('[data-shp]', { timeout: 8000 }).catch(() => errs.push('① shipment rows render'));
  const rows = await pg.$$eval('[data-shp]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())); log('① rows:', rows.map(r => r.slice(0, 110)));
  if (rows.length !== 2) errs.push('① two shipments (3 boxes) → 2 rows, got ' + rows.length);
  const r1 = rows[0] || ''; if (!/#3001/.test(r1) || !/ALEX/.test(r1) || !/2 .*박스|2 ⁢박스/.test(r1) || !/27 lb/.test(r1) || !/\$33\.45/.test(r1) || !/운송 중/.test(r1)) errs.push('① first row shows #acct · salesman · 2 boxes · 27 lb · $33.45 · in transit');
  if (!/취소됨/.test(rows[1] || '')) errs.push('① voided shipment shows ✕ 취소됨');
  const head = await pg.$eval('#tkOut h2', e => e.textContent.replace(/\s+/g, ' ')); log('① head:', head); if (!/2 .{0,3}출고/.test(head) || !/3 .{0,3}박스/.test(head)) errs.push('① header counts shipments and boxes');
  /* ② 팝업 */
  await pg.click('[data-shp]'); await pg.waitForSelector('#shGo', { timeout: 5000 }).catch(() => errs.push('② tapping a row opens the shipment popup'));
  const m = await pg.$eval('#mbox', e => e.textContent.replace(/\s+/g, ' ')); log('② modal:', m.slice(0, 200));
  if (!/2026-11-05/.test(m) || !/SHP-2026-014001/.test(m) || !/#3001/.test(m) || !/ALEX/.test(m) || !/100 MAIN ST/.test(m) || !/\$33\.45/.test(m) || !/\$70\.56/.test(m)) errs.push('② popup shows ship date · record · customer · salesman · address · cost · list price');
  const bx = await pg.$$eval('#mbox .shpbox', e => e.map(x => x.textContent.replace(/\s+/g, ' '))); if (bx.length !== 2 || !/1ZY9620E0300000001/.test(bx[0]) || !/17 lb/.test(bx[0]) || !/1ZY9620E0300000002/.test(bx[1]) || !/배달/.test(bx[1])) errs.push('② popup lists both boxes with tracking · weight · status');
  await pg.click('#mbox [data-trk="1ZY9620E0300000002"]'); await pg.waitForSelector('#tkGo'); const sc = await pg.$eval('#mbox', e => e.textContent); if (!/Delivered/.test(sc) || !/ORLANDO, FL/.test(sc)) errs.push('② 📍 기록 opens the scan history of that box');
  await pg.click('#tkBack'); await pg.waitForSelector('#shGo', { timeout: 3000 }).catch(() => errs.push('② ← 출고로 on the scan history returns to the shipment popup'));
  await pg.close();
  /* ③ 컴퓨터 표 */
  const pc = await mk('luke@theonefl.com', 1200);
  await pc.evaluate(() => { location.hash = '#/track'; }); await pc.waitForSelector('#tkQ'); await pc.fill('#tkQ', '3001'); await pc.waitForTimeout(400); await pc.click('[data-tka="3001"]'); await pc.waitForSelector('table.shptbl', { timeout: 8000 }).catch(() => errs.push('③ table on wide screens'));
  const ths = await pc.$$eval('table.shptbl thead th', t => t.map(x => x.textContent.replace(/\s+/g, ' ').trim())).catch(() => []); log('③ heads:', ths.join(' | '));
  const want = ['날짜', '기록', '거래처', '세일즈맨', '받는 곳', '서비스', '박스', '무게', '운임', '운송장', '상태']; const idx = want.map(w => ths.findIndex(t => t.indexOf(w) === 0 || t.indexOf('⁢' + w) === 0));
  if (idx.some(i => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) errs.push('③ column order: ' + want.join(' · ') + ' (got ' + ths.join(' | ') + ')');
  const tr = await pc.$$eval('table.shptbl tbody tr', t => t.map(x => x.textContent.replace(/\s+/g, ' '))); if (tr.length !== 2 || !/SHP-2026-014001/.test(tr[0]) || !/1ZY9620E0300000001 \+1/.test(tr[0])) errs.push('③ rows show record id and lead tracking +1');
  await pc.close();
  /* ④ 세일즈맨 BRANDON — 최근 출고에 자기 가게(1111)만 */
  const sp = await mk('brandon@x.com', 430);
  await sp.evaluate(() => { location.hash = '#/track'; }); await sp.waitForSelector('#tkQ'); await sp.waitForTimeout(1200);
  const mine = await sp.$$eval('[data-shp]', e => e.map(x => x.textContent.replace(/\s+/g, ' '))); log('④ salesman rows:', mine.map(r => r.slice(0, 60)));
  if (mine.length !== 1 || !/#1111/.test(mine[0]) || !/배송 완료/.test(mine[0])) errs.push('④ salesman sees only own store shipments (1 row, delivered)');
  await sp.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
