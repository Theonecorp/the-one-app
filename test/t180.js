/* v0.8.182 시험 — 🚢 입고 예정: 공장 인보이스 → 오는 중 → 창고에서 수량 확인 → 재고 (2026-11-11 관리자)
 *   ① 공장 인보이스(중국 커머셜 인보이스 모양 — 머리 · 묶음 · ITEM NO · QTY · 합친 단가 칸 · TOTAL)를 읽음: 공장 · 날짜(11月11日) · 묶음별 수량/금액 · 합친 칸 단가 채움 · 같은 이름 묶음은 (2)
 *   ② 등록(관리자): 목록에 없는 코드는 빨갛게 → 코드를 고치면 맞춤 · 등록하면 오는 중 + 창고 · 오피스 팝업(kind inbound)
 *   ③ 창고 매니저: 공장별 목록에 보임 · 단가(원가)는 안 보임 · 등록 단추 없음 · 받은 수량 입력(한 줄 모자람) + 남은 줄 모두 맞음 → 입고 확정
 *      → 재고에 받은 수량만큼 · 입고 기록(receipts) · 상태 입고 완료 · 차이 1줄 기록 + 알림(kind inboundDiff)
 *   ④ 팩킹 리스트 모양 (SX ONE#78 装箱单 2026.9.2 · 箱数 박스 · 한 코드가 두 박스 · 머리글이 PRICE|PRICE 로 잘못 적힌 묶음 · 단가가 판매가보다 비싸면 위안 추정)
 *   ⑤ 공급망 인보이스 모양 (Seller: · INVOICE #: · 엑셀 날짜 숫자 · 공장 코드와 우리 코드 두 칸 · Q'ty/CT 와 QTY · 끝 숫자 한 자리 코드 OPCG7 = OPCG07 · 트래킹 · FREIGHT) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const dir = path.resolve(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
  const csv = path.join(dir, 't180-factory.csv');
  fs.writeFileSync(csv, ['COMMERCIAL  INVOICE,,,,,', 'Shipper,,,,Invoice No:,', '(회사명) Test Crafts Co. Ltd,,,,Date:11月11日,', 'Consignee,,,,,', 'THE ONE HHH CORP,,,,,', 'MADE IN CHINA,,,,,',
    'ALUMINUM HOOP,,,,,', 'ITEM ,ITEM NO,COLOR,PRICE/USD,QTY,TOTAL', 'HOOP,AHG100,GOLD,1.5,100,150', ',AHG105,GOLD,,40,60', ',AHG-110,GOLD,2,30,60', 'TOTAL,,,,170 PCS,270', '材质：铝,,,,,',
    'ALUMINUM HOOP,,,,,', 'ITEM ,ITEM NO,COLOR,PRICE/USD,QTY,TOTAL', ',ZZBAD1,GOLD,1,10,10', 'TOTAL,,,,10 PCS,10'].join('\n') + '\n');
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8848', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 1000, height: 1000 } });
  const mk = async (email, job) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.job) window.__AFTER_SEED__ = s => { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'WH', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; }; }, { email, job });
    await pg.goto('http://127.0.0.1:8848/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/stock/inb'; }); await pg.waitForSelector('#skBody .card', { timeout: 8000 }); await pg.waitForTimeout(400); return pg; };
  /* ① ② 관리자 등록 */
  const ad = await mk('luke@theonefl.com');
  await ad.setInputFiles('#ibFile', csv); await ad.waitForSelector('#ibGo', { timeout: 8000 });
  const pv = await ad.evaluate(() => ({ f: document.getElementById('ibF').value, d: document.getElementById('ibD').value, txt: document.getElementById('mbox').textContent.replace(/\s+/g, ' ') }));
  log('① preview:', pv.f, pv.d, pv.txt.slice(0, 200));
  if (pv.f !== 'Test Crafts Co. Ltd' || !/-11-11$/.test(pv.d)) errs.push('① factory and date (11月11日) read');
  if (!/ALUMINUM HOOP — 170개 · \$270\.00/.test(pv.txt) || !/ALUMINUM HOOP \(2\) — 10개/.test(pv.txt)) errs.push('① sections with qty and amount (merged price filled: AHG105 1.5×40) — same-name section becomes (2)');
  if (!/앱에 없는 코드 1/.test(pv.txt)) errs.push('② unknown code ZZBAD1 flagged');
  await ad.fill('[data-ibc]', 'AHG115'); await ad.dispatchEvent('[data-ibc]', 'change'); await ad.waitForTimeout(400);
  const ok2 = await ad.evaluate(() => /모든 코드가 앱 카탈로그와 맞습니다/.test(document.getElementById('mbox').textContent)); if (!ok2) errs.push('② fixing the code to a catalog code clears the warning');
  await ad.click('#ibGo'); await ad.waitForTimeout(1200);
  const doc = await ad.evaluate(() => Object.values(window.__MOCK_STORE__.inbound || {})[0]);
  log('② saved:', JSON.stringify({ no: doc && doc.no, st: doc && doc.st, n: doc && doc.n, qty: doc && doc.qty, amt: doc && doc.amt, codes: doc && doc.lines.map(l => l.c + ':' + l.q + '@' + l.p).join(' ') }));
  if (!doc || doc.st !== 'coming' || doc.qty !== 180 || doc.amt !== 280 || !doc.lines.some(l => l.c === 'AHG110') || !doc.lines.some(l => l.c !== 'ZZBAD1' && l.raw === 'ZZBAD1')) errs.push('② inbound saved as coming (180 pcs · $280 · AHG-110 → AHG110 · fixed code)');
  const nq = await ad.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'inbound').map(n => n.toGroup + ':' + n.pushOnly)); if (nq.join() !== 'g:wh:true') errs.push('② warehouse + office get a push (kind inbound)');
  const store = await ad.evaluate(() => JSON.stringify({ inbound: window.__MOCK_STORE__.inbound, stock: window.__MOCK_STORE__.stock || {} }));
  await ad.close();
  /* ③ 창고 매니저 — 같은 데이터로 */
  const wh = await ctx.newPage(); wh.on('pageerror', e => errs.push('wh: ' + e.message)); wh.on('dialog', d => d.accept());
  await wh.addInitScript(o => { window.__MOCK_USER__ = { email: 'wh@x.com', name: 'WH' }; window.__AFTER_SEED__ = s => { s.users.push({ id: 'wh@x.com', email: 'wh@x.com', name: 'WH', role: 'manager', job: 'whmgr', active: true }); const D = JSON.parse(o); s.inbound = Object.values(D.inbound); }; }, store);
  await wh.goto('http://127.0.0.1:8848/test/demo.html'); await wh.waitForSelector('#nav button', { state: 'attached' }); await wh.evaluate(() => { location.hash = '#/stock/inb'; }); await wh.waitForSelector('[data-ib]', { timeout: 8000 });
  const list = (await wh.textContent('#skBody')).replace(/\s+/g, ' '); log('③ list:', list.slice(0, 220));
  if (!/🏭 Test Crafts Co\. Ltd/.test(list) || !/오는 중/.test(list)) errs.push('③ warehouse sees it under the factory, on the way');
  if (/\$/.test(list) || await wh.$('#ibFile')) errs.push('③ warehouse sees no cost and no register button');
  const before = await wh.evaluate(() => { const S = window.__MOCK_STORE__.stock || {}; return { a: (S.AHG100 || {}).qty || 0, b: (S.AHG105 || {}).qty || 0 }; });
  await wh.click('[data-ib]'); await wh.waitForSelector('[data-ibq]');
  if (await wh.$eval('#ibOk', b => !b.disabled)) errs.push('③ confirm is disabled until every line is counted');
  await wh.fill('[data-ibq="1"]', '35'); await wh.dispatchEvent('[data-ibq="1"]', 'change'); await wh.waitForTimeout(200); await wh.click('#ibAll'); await wh.waitForTimeout(200);
  const md = (await wh.textContent('#mbox')).replace(/\s+/g, ' '); if (/\$/.test(md)) errs.push('③ no cost in the detail for warehouse');
  await wh.click('#ibOk'); await wh.waitForSelector('#cfOk'); await wh.click('#cfOk'); await wh.waitForTimeout(1800);
  const after = await wh.evaluate(() => { const S = window.__MOCK_STORE__.stock || {}, I = Object.values(window.__MOCK_STORE__.inbound)[0], R = Object.values(window.__MOCK_STORE__.receipts || {}).find(r => r.inbound === I.id); return { a: (S.AHG100 || {}).qty || 0, b: (S.AHG105 || {}).qty || 0, st: I.st, diff: I.diff, rq: R && R.qty, nd: Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'inboundDiff').length }; });
  log('③ after:', JSON.stringify({ before, after }));
  if (after.a - before.a !== 100 || after.b - before.b !== 35) errs.push('③ stock goes up by the received qty (AHG100 +100, AHG105 +35)');
  if (after.st !== 'done' || after.rq !== 175 || !after.diff || after.diff.length !== 1 || after.diff[0].c !== 'AHG105' || after.nd !== 1) errs.push('③ inbound done, receipt 175 pcs, 1 difference recorded + alert');
  /* ④ ⑤ 다른 공장 모양 — 읽기만 (작은 카탈로그로) */
  const P = await wh.evaluate(async () => {
    const M = await import('/src/inbound.js');
    const by = { HGDS01: { c: 'HGDS01', p: 3 }, N_B100S: { c: 'N_B100S', p: 10 }, N_L100G: { c: 'N_L100G', p: 10 }, TNG01: { c: 'TNG01', p: 4 }, TNS01: { c: 'TNS01', p: 4 }, OPCG07: { c: 'OPCG07', p: 3 }, ICE208: { c: 'ICE208', p: 13 }, PEG121: { c: 'PEG121', p: 2 } };
    const a = M.parseFactoryInvoice([
      ['SX   ONE#78装箱单  2026.9.2日   空运'], ['NO', '箱数', 'ITEM#', 'PRICE', 'QTY', 'TOTAL', '每箱数量'],
      [1, '1#', 'TNG01', 7.5, 300, 2250, 600], [2, '', 'TNS01', 7.5, 200, 1500], [3, '2#', 'TNS01', 7.5, 100, 750, 400], [4, '', 'HG0S01', 4, 300, 1200], ['', '', '', '', '900对'],
      ['D#89   装箱单  2026.9.2 日'], ['NO', '箱数', 'PRICE', 'PRICE', 'QTY', 'TOTAL'], [5, '3#', 'N-B100S', 8, 240, 1920], [6, '', 'N-L100G', 8.5, 120, 1020]], by, 2026);
    const b = M.parseFactoryInvoice([
      ['', 'COMMERCIAL INVOICE', '', '', 'DATE：', 46326], ['', 'INVOICE #:', '261031-ONE'], ['', 'Seller:', '', 'Consignee:'], ['', 'ZHEJIANG JUDA SUPPLY CHAIN CO.,LTD', '', 'The One hhh Corp'],
      ['', 'SHIP VIA', 'SHIP NO.', 'Weight'], ['', 'UPS', '1Z2K28F30317822035', 518],
      ['A+ ITEM #', 'ONE \nItem No.', 'Description', 'C/T \nNO.', 'C/T', "Q'ty\n/CT", 'QTY', 'PRICE', 'TOTAL'],
      ['PCG7\nPE2-2', 'OPCG7', 'PIN CATCH', 'T683', '', '', 503, 0.47, 236.41], ['ICE208', 'ICE208', 'BRACELET', 'T666', 1, '', 456, 1.7, 775.2], ['ICE208', 'ICE208', 'BRACELET', 'T678', 1, '', 12, 1.7, 20.4],
      ['PEG1-9', 'PEG121', 'PINCATCH', 'T683', 1, '', 1272, 0.56, 712.32], ['SUBTOTAL', '', '', '', 3, '', 2243, '', 1744.33], ['FREIGHT', '', '', '', '', '', '', '', 100.5]], by, 2026);
    const L = r => r.lines.map(l => l.c + ':' + l.q + '@' + l.p + (l.box && l.box.length ? '[' + l.box.join('+') + ']' : '') + (l.ok ? '' : '✗' + (l.sim || ''))).join(' ');
    return { a: { f: a.factory, no: a.no, d: a.d, cur: a.cur, boxes: a.boxes, secs: a.secs.map(x => x.q + '/' + x.amt).join(' '), L: L(a) }, b: { f: b.factory, no: b.no, d: b.d, trk: b.trk, frt: b.frt, boxes: b.boxes, q: b.lines.reduce((x, l) => x + l.q, 0), L: L(b) } };
  });
  log('④ packing list:', JSON.stringify(P.a)); log('⑤ supply chain:', JSON.stringify(P.b));
  if (P.a.f !== 'SX' || P.a.no !== 'ONE#78' || P.a.d !== '2026-09-02' || P.a.boxes !== 3) errs.push('④ factory SX · no ONE#78 · date 2026.9.2 · 3 boxes from the title and 箱数');
  if (!/TNS01:300@7\.5\[1#\+2#\]/.test(P.a.L) || !/N_B100S:240@8\[3#\]/.test(P.a.L) || !/N_L100G:120@8\.5/.test(P.a.L)) errs.push('④ code split over two boxes is summed (TNS01 1#+2#) · N-B100S = N_B100S · price read even when the code column is labelled PRICE');
  if (!/HG0S01:300@4\[2#\]✗HGDS01/.test(P.a.L) || P.a.cur !== 'CNY?') errs.push('④ unknown HG0S01 suggests HGDS01 (not applied) · currency guessed as CNY');
  if (P.b.f !== 'ZHEJIANG JUDA SUPPLY CHAIN CO.,LTD' || P.b.no !== '261031-ONE' || P.b.d !== '2026-10-31' || P.b.trk !== '1Z2K28F30317822035' || P.b.frt !== 100.5) errs.push('⑤ Seller · INVOICE # · Excel date 46326 · UPS tracking · freight');
  if (!/OPCG07:503@0\.47/.test(P.b.L) || !/ICE208:468@1\.7\[T666\+T678\]/.test(P.b.L) || P.b.q !== 2243 || /✗/.test(P.b.L)) errs.push("⑤ our code column (not the factory's) · QTY (not Q'ty/CT) · OPCG7 = OPCG07 · ICE208 summed over cartons");
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
