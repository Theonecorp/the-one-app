/* v0.8.174 시험 — 🚚 출고 팝업 자세히 (직원 앱과 같은 항목): 운송장 복사 · UPS 추적 링크 · 출고일 · 예상 배송 · 주문 없음 표시 · 고객 / 매장 · 영업 담당자 · 전화 · 주소 · 중량 · 청구 중량 · 박스별 치수 · 담당자 · 상태 · 추적 타임라인(박스 합쳐 시간순 · 5개 넘으면 더 보기) · 비용 요약(공시 · 협상 · 절감 · 합계)
 *   ① 팝업에 위 항목이 모두 있고, 타임라인은 두 박스의 스캔 9건을 시간 역순으로 합쳐 5개만 보이다가 "이벤트 4개 더 보기" 를 누르면 9개
 *   ② 비용 요약: 공시 $70.56 · 협상 $33.45 · 절감액 −$37.11 · 합계 $33.45 · 치수 칩 2개(16×12×8 17 lb · 12×12×8 10 lb) · 청구 중량 27 lb
 *   ③ 주문이 없는 출고는 "주문 없음 (계정 출고)" · 라벨 칸 없음 · 주문이 있는 출고(orderId)는 "라벨 보기" 가 shipq 의 라벨을 띄움 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8822', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ev = (d, t, desc, loc, st) => ({ d, t, desc, loc, st: st || 'I' });
  const seed = "const B = { orderId: '', no: '', acct: '3001', store: 'BEAUTY EXCHANGE ORLANDO', sm: 'ALEX', invs: [], svc: '03', svcName: 'UPS Ground', shipDate: '2026-11-05', to: '100 MAIN ST', city: 'ORLANDO', state: 'FL', zip: '32801', tel: '4073434247', src: 'ups', by: 'import', cost: 33.45, list: 70.56, sw: 27, rec: 'SHP-2026-014001', shipId: 'Y9620EAAAA1', lead: '1ZY9620E0300000001', status: 'In Transit', delivered: false, voided: false, trkSt: 'open', eta: '2026-11-09', at: '2026-11-05T10:00:00Z' };" +
    "const E1 = " + JSON.stringify([ev('2026-11-07', '05:18', 'Processing at UPS Facility', 'Davenport, FL'), ev('2026-11-07', '02:24', 'Arrived at Facility', 'Davenport, FL'), ev('2026-11-07', '01:48', 'Departed from Facility', 'Orlando, FL'), ev('2026-11-06', '23:47', 'Arrived at Facility', 'Orlando, FL'), ev('2026-11-06', '22:54', 'Departed from Facility', 'Longwood, FL')]) + ";" +
    "const E2 = " + JSON.stringify([ev('2026-11-07', '05:20', 'Processing at UPS Facility', 'Davenport, FL'), ev('2026-11-07', '02:24', 'Arrived at Facility', 'Davenport, FL'), ev('2026-11-06', '22:54', 'Departed from Facility', 'Longwood, FL'), ev('2026-11-06', '15:59', 'Shipper created a label, UPS has not received the package yet.', 'Sanford, FL', 'M')]) + ";" +
    "s.shipments = [Object.assign({}, B, { id: '1ZY9620E0300000001', trk: '1ZY9620E0300000001', box: 1, boxes: 2, w: 17, dims: '16×12×8', events: E1 }), Object.assign({}, B, { id: '1ZY9620E0300000002', trk: '1ZY9620E0300000002', box: 2, boxes: 2, w: 10, dims: '12×12×8', events: E2 })," +
    " Object.assign({}, B, { id: '1ZY9620E0300000007', trk: '1ZY9620E0300000007', lead: '1ZY9620E0300000007', shipId: 'Y9620EAAAA7', orderId: 'O261104-TEST', no: 'O261104-TEST', invs: ['A-041600'], box: 1, boxes: 1, w: 8, sw: 8, cost: 12.5, list: 25.99, rec: '', src: 'app', by: 'office@x.com', shipDate: '2026-11-04', events: [] })];" +
    "s.shipq = (s.shipq || []).concat([{ id: 'O261104-TEST', st: 'done', labels: [{ trk: '1ZY9620E0300000007', img: 'R0lGODdhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=' }] }]);";
  const pg = await (await br.newContext({ viewport: { width: 430, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
  await pg.goto('http://127.0.0.1:8822/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/track'; }); await pg.waitForSelector('#tkQ'); await pg.fill('#tkQ', '3001'); await pg.waitForTimeout(400); await pg.click('[data-tka="3001"]'); await pg.waitForSelector('[data-shp]');
  await pg.click('[data-shp]'); await pg.waitForSelector('#shGo');
  const txt = () => pg.$eval('#mbox', e => e.textContent.replace(/\s+/g, ' '));
  let m = await txt(); log('① popup:', m.slice(0, 160));
  const need = ['UPS Ground', '1ZY9620E0300000001', 'UPS 에서 추적', '2026-11-05', 'SHP-2026-014001', '2026-11-09', '주문 없음 (계정 출고)', '#3001', 'ALEX (Alex)', '407', '100 MAIN ST', 'ORLANDO FL 32801', '27 lb', '청구 중량', '16×12×8', '12×12×8', '추적 타임라인', '비용 요약', 'In Transit'];
  need.forEach(k => { if (m.indexOf(k) < 0) errs.push('① popup is missing "' + k + '"'); });
  if (!(await pg.$('#shCopy'))) errs.push('① copy button');
  let tev = await pg.$$eval('#mbox .tev', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())); log('① timeline:', tev.length, tev[0]);
  if (tev.length !== 5 || !/Processing at UPS Facility 📦 2/.test(tev[0]) || !/05:20/.test(tev[0])) errs.push('① timeline merges both boxes, newest first, 5 shown (got ' + tev.length + ': ' + (tev[0] || '') + ')');
  const moreTxt = await pg.$eval('#shMore', e => e.textContent).catch(() => ''); if (!/4개 더 보기/.test(moreTxt)) errs.push('① "이벤트 4개 더 보기" (got "' + moreTxt + '")');
  await pg.click('#shMore'); await pg.waitForTimeout(200); tev = await pg.$$eval('#mbox .tev', e => e.length); if (tev !== 9) errs.push('① more → 9 events (got ' + tev + ')');
  /* ② 비용 요약 · 치수 칩 */
  const cost = await pg.$$eval('#mbox .costbox > div', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())); log('② cost:', cost.join(' | '));
  if (!/\$70\.56/.test(cost[0] || '') || !/\$33\.45/.test(cost[1] || '') || !/−\$37\.11/.test(cost[2] || '') || !/합계.*\$33\.45/.test(cost[3] || '')) errs.push('② cost summary list · negotiated · savings · total');
  const chips = await pg.$$eval('#mbox .dimchip', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())); if (chips.length !== 2 || !/1 ?16×12×8 17 lb/.test(chips[0]) || !/2 ?12×12×8 10 lb/.test(chips[1])) errs.push('② dimension chips per box (got ' + chips.join(' / ') + ')');
  if (await pg.$('#shLbl')) errs.push('③ no label section without an order');
  /* ③ 주문 있는 출고: 라벨 보기 */
  await pg.click('#modal .mclose'); await pg.waitForTimeout(300);
  await pg.click('[data-shp="Y9620EAAAA7"]'); await pg.waitForSelector('#shGo'); m = await txt();
  if (!/O261104-TEST/.test(m) || !/A-041600/.test(m) || !/office@x\.com/.test(m)) errs.push('③ order · invoice · shipped-by shown for app shipments');
  if (!(await pg.$('#shLbl'))) errs.push('③ 라벨 보기 button for an app shipment'); else { await pg.click('#shLbl'); await pg.waitForSelector('#mbox img[alt="1ZY9620E0300000007"]', { timeout: 4000 }).catch(() => errs.push('③ 라벨 보기 shows the label image from shipq')); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
