/* v0.8.174 시험 — 🎁 디스플레이 · 선물 · 소모품 줄은 인보이스 종류를 주문의 나머지 줄에 맞춤 · 주문 화면 분류 타일을 종류별 색으로
 *   ① 'DISPLAYS, GIFT & SUPPLY' 1단계([ ] 기호 · 그 외 → 원래는 P) 아이템을 주얼리(A) 줄과 같이 담아 임시 저장하면 그 줄의 t 가 A — 주얼리 인보이스에 같이 찍힘
 *   ② 그 외 제품(P) 줄과 같이 담으면 P · 혼자만 담으면 기본 A
 *   ③ 분류 타일: 세트("" → k-set) · 주얼리(k-jew) · 그 외([ ] → k-oth) · 디스플레이 · 선물([DISPLAYS…] → k-disp, v0.8.175) · 맨 뒤(< > → k-last) 색 클래스 · 1단계 안으로 들어가면 1단계 색을 따라감 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8825', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  /* 시드 카탈로그에 그 외 · 선물 · 맨 뒤 아이템 추가 */
  const seed = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j);" +
    "rows.push(['GIFTBAG1', 'GIFT BAG SMALL', 0.5, 0, '', 'Other', '[DISPLAYS, GIFT & SUPPLY]', 'BAG', 'SMALL', '', 0, ''], ['CHEM1', 'EDGE CONTROL 4oz', 4, 0, '', 'Other', '[CHEMICAL]', 'EDGE', 'EDGE', '', 0, ''], ['OLD1', 'OLD STYLE RING', 1, 0, '', 'Jewelry', '<DISCONTINUE ITEM>', 'RING', 'OLD', '', 0, '']);" +
    "c0.j = JSON.stringify(rows); c0.n = rows.length; const meta = s.catalog.find(x => x.id === 'meta'); meta.count = rows.length; meta.cats = meta.cats.concat(['Other\\u0001[DISPLAYS, GIFT & SUPPLY]\\u0001BAG\\u0001SMALL', 'Other\\u0001[CHEMICAL]\\u0001EDGE\\u0001EDGE', 'Jewelry\\u0001<DISCONTINUE ITEM>\\u0001RING\\u0001OLD']);";
  const mk = async () => { const pg = await (await br.newContext({ viewport: { width: 1000, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed }); await pg.goto('http://127.0.0.1:8825/test/demo.html'); await pg.waitForSelector('#nav button');
    await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(200); } return pg; };
  const add = async (pg, code) => { await pg.fill('#eQ1', code); await pg.waitForTimeout(500); await pg.click('#eRes [data-gc="' + code + '"], #eRes tr[data-frow="' + code + '"] td.ct'); await pg.waitForTimeout(300); };
  const saveDraft = async (pg) => { await pg.click('#eDraft'); await pg.waitForTimeout(300); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(1200); return pg.evaluate(() => { const O = window.__MOCK_STORE__.orderLines || {}; const k = Object.keys(O).pop(); return k ? O[k].lines.map(l => [l.c, l.t]) : null; }); };
  /* ③ 타일 색 */
  const pg = await mk();
  const tiles = await pg.$$eval('.cats button[data-ck]', e => e.map(x => [x.dataset.ck, x.className])); log('③ tiles:', tiles.map(t => t[0].slice(0, 12) + ':' + t[1]).join(' | '));
  const cls = Object.fromEntries(tiles);
  if (!/k-set/.test(cls['SET ORDER""'] || '')) errs.push('③ SET ORDER tile is k-set');
  if (!/k-disp/.test(cls['[DISPLAYS, GIFT & SUPPLY]'] || '')) errs.push('③ [DISPLAYS…] tile is k-disp (v0.8.175: 디스플레이 · 선물 · 소모품은 제 색)');
  if (!/k-last/.test(cls['<DISCONTINUE ITEM>'] || '')) errs.push('③ <DISCONTINUE ITEM> tile is k-last');
  const jew = tiles.find(t => t[0] === 'Chains' || t[0] === 'Wax'); if (!jew || !/k-jew/.test(jew[1])) errs.push('③ plain jewelry tile is k-jew');
  const order = tiles.map(t => t[0]); if (order[order.length - 1] !== '<DISCONTINUE ITEM>') errs.push('③ <DISCONTINUE ITEM> is the last tile (got last: ' + order[order.length - 1] + ')');
  await pg.click('[data-ck="[CHEMICAL]"]'); await pg.waitForTimeout(400);
  const inner = await pg.$$eval('.cats button[data-ck]', e => e.map(x => x.className)); if (!inner.length || !inner.every(c => /k-oth/.test(c))) errs.push('③ tiles inside an [other] level 1 keep the k-oth color');
  await pg.click('[data-cp="0"]'); await pg.waitForTimeout(300);
  /* ① 선물 + 주얼리 → 선물 줄도 A */
  await add(pg, 'AHG100'); await add(pg, 'GIFTBAG1');
  let L = await saveDraft(pg); log('① lines:', JSON.stringify(L));
  const g1 = (L || []).find(l => l[0] === 'GIFTBAG1'); if (!g1 || g1[1] !== 'A') errs.push('① gift line follows the jewelry lines (A), got ' + JSON.stringify(g1));
  await pg.close();
  /* ② 선물 + 케미컬 → P · 선물만 → 기본 A */
  const p2 = await mk(); await add(p2, 'CHEM1'); await add(p2, 'GIFTBAG1'); L = await saveDraft(p2); log('② lines:', JSON.stringify(L));
  const g2 = (L || []).find(l => l[0] === 'GIFTBAG1'), c2 = (L || []).find(l => l[0] === 'CHEM1'); if (!c2 || c2[1] !== 'P') errs.push('② chemical line is P'); if (!g2 || g2[1] !== 'P') errs.push('② gift line follows the other-product lines (P), got ' + JSON.stringify(g2));
  await p2.close();
  const p3 = await mk(); await add(p3, 'GIFTBAG1'); L = await saveDraft(p3); log('② alone:', JSON.stringify(L));
  const g3 = (L || []).find(l => l[0] === 'GIFTBAG1'); if (!g3 || g3[1] !== 'A') errs.push('② gift alone defaults to A, got ' + JSON.stringify(g3));
  await p3.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
