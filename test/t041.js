/* v0.5.0 시험 — 사진 카드 담기 · 수량 패드 · 세트(구성 보기 · 세트로/풀어서 담기) · 손님 보기 · 새 인보이스 번호 · 세트 픽킹 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8769', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); const errs = [], log = (...a) => console.log(...a);
  pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
  const shot = n => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'Luke' }; window.__AFTER_SEED__ = s => { s.settings[0].ordersOn = true; }; });
  await pg.goto('http://127.0.0.1:8769/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(200); await pg.waitForTimeout(700); if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(150); }
  await shot('g0_cats');
  await pg.click('[data-ck="Earrings · Hoops & Pincatch"]'); await pg.waitForTimeout(200);
  log('branch (no items yet):', !!(await pg.$('#eAll')), '| L2 tiles:', await pg.$$eval('[data-ck]', els => els.map(e => e.textContent.trim()).join(' | ')));
  await pg.click('[data-ck="Aluminum"]'); await pg.waitForTimeout(150); await pg.click('[data-ck="Gold"]'); await pg.waitForTimeout(250);
  log('L1 tiles:', await pg.$$eval('[data-ck]', els => els.map(e => e.textContent.trim()).join(' | ')));
  await pg.click('[data-gc="AHG100"]'); await pg.click('[data-gc="AHG100"]'); await pg.click('[data-gc="AHG105"]'); await pg.waitForTimeout(100);
  log('card qty AHG100:', await pg.textContent('[data-gq="AHG100"]'), 'N:', await pg.textContent('#eN'));
  await pg.click('[data-gm="AHG100"]'); log('after minus:', await pg.textContent('[data-gq="AHG100"]'));
  await pg.click('[data-gq="AHG100"]'); await pg.waitForSelector('#qpV'); await pg.click('[data-qp="24"]'); await pg.click('#qpOk'); await pg.waitForTimeout(100);
  log('after pad:', await pg.textContent('[data-gq="AHG100"]'));
  await shot('g1_grid');
  /* 세트 */
  await pg.click('[data-cp="0"]'); await pg.waitForTimeout(100);
  await pg.fill('#eQ1', 'FI-TEST'); await pg.waitForTimeout(300);
  log('set card kit badge:', await pg.textContent('[data-gc="FI-TEST01"] .gkit'));
  await pg.click('[data-gc="FI-TEST01"] .gkit'); await pg.waitForSelector('#kSet'); await shot('g2_kit'); await pg.click('#kSet'); await pg.waitForTimeout(100);
  await pg.fill('#eQ1', 'AHG115'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(100);
  await pg.waitForTimeout(500); log('old code → new set qty:', await pg.evaluate(() => JSON.parse(localStorage.getItem('theone.order.wip.luke@theonefl.com')).lines.find(l => l.c === 'FI-TEST01').q));
  await pg.fill('#eQ1', 'C4-EB01'); await pg.waitForTimeout(300); await pg.click('[data-gc="C4-EB01"] .gkit'); await pg.waitForSelector('#kAll'); await pg.click('#kAll'); await pg.waitForTimeout(100);
  await pg.waitForTimeout(500); log('kit spread EB103:', await pg.evaluate(() => (JSON.parse(localStorage.getItem('theone.order.wip.luke@theonefl.com')).lines.find(l => l.c === 'EB103') || {}).q));
  /* 손님 보기 */
  await pg.fill('#eQ1', ''); await pg.click('[data-ck="Earrings · Hoops & Pincatch"]').catch(() => {}); await pg.waitForTimeout(150); await pg.click('[data-ck="Aluminum"]').catch(() => {}); await pg.waitForTimeout(150); await pg.click('[data-ck="Gold"]').catch(() => {}); await pg.waitForTimeout(250);
  await pg.click('#eShow'); await pg.waitForSelector('#viewer'); await pg.click('#vR'); await pg.click('#vA'); await pg.click('#vP'); await shot('g3_show'); await pg.click('#vX');
  await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(200); await shot('g4_cart');
  log('types:', (await pg.textContent('#eTypes')).replace(/\s+/g, ' '));
  /* v0.8.14: 편집 화면은 저장만 → 주문 확인(보낼 오더)에서 보내기 → 들어온 오더 열기 */
  await pg.click('#eDraft'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(900);
  log('review card (staff):', !!(await pg.$('#oSendAll')));
  await pg.click('#oSendAll'); await pg.waitForTimeout(150); await pg.click('#cfOk'); await pg.waitForTimeout(900);
  await pg.click('[data-lf="sent"]'); await pg.waitForTimeout(600); log('sent oids:', await pg.$$eval('#page [data-oid]', e => e.map(x => x.dataset.oid + '|' + x.className)), await pg.evaluate(() => location.hash), (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 200)); await pg.click('#page [data-oid]'); await pg.waitForSelector('#mPick');
  log('before pick:', await pg.evaluate(() => location.hash), 'errs so far:', errs);
  await pg.click('#mPick'); await pg.waitForTimeout(1500); log('prt:', await pg.evaluate(() => document.getElementById('prt').className), 'errs:', errs, (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 100)); await pg.waitForSelector('#prt.on'); await pg.waitForTimeout(400); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'g5_pickprint.png'), fullPage: true }); await pg.click('#prtClose'); await pg.waitForTimeout(300);
  await pg.click('#mInv'); await pg.waitForTimeout(200); await pg.click('#ivOk'); await pg.waitForTimeout(1200); await pg.setViewportSize({ width: 820, height: 1100 }); await pg.screenshot({ path: path.resolve(__dirname, 'out', 'g6_inv.png'), fullPage: true }); await pg.setViewportSize({ width: 430, height: 1000 }); await pg.click('#prtClose'); await pg.waitForTimeout(300);
  log('invoices:', (await pg.textContent('#page .sumbox')).replace(/\s+/g, ' '));
  /* 번호 단계 넘김 */
  log('fmtNo:', await pg.evaluate(async () => { const m = await import('/src/invoicing.js').catch(() => null); return m ? [1, 99999, 100000, 199998, 199999].map(n => m.fmtNo({ c: 'G' }, n)).join(' ') : 'skip'; }));
  await pg.evaluate(() => { location.hash = '#/admin/set'; }); await pg.waitForTimeout(600); await shot('g7_invtypes');
  await pg.evaluate(() => { location.hash = '#/admin/cat'; }); await pg.waitForTimeout(600); await pg.fill('#setQ', 'FI'); await pg.waitForTimeout(700); await shot('g8_sets');
  /* v0.5.1: 가게 기록 창 · 목록 보기의 최근 구매 · 빠른 수량 바 · 온라인 표시 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'beauty ex'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ai]'); await pg.waitForSelector('#ssPick'); await shot('g9_storesheet');
  log('store sheet kpi:', (await pg.textContent('#mbox .sumbox')).replace(/\s+/g, ' '));
  await pg.click('[data-ss="ord"]'); await pg.waitForTimeout(100); log('store orders tab:', (await pg.textContent('#mbox')).includes('O261014-AAAA'));
  await pg.click('#ssPick'); await pg.waitForTimeout(600);
  log('bal line:', (await pg.textContent('#eStoreBal')).replace(/\s+/g, ' '));
  await pg.click('#eVM'); await pg.waitForTimeout(200); await pg.fill('#eQ1', 'AHG10'); await pg.waitForTimeout(400);
  log('hist on AHG100:', await pg.$eval('[data-row="AHG100"] .hist', e => e.textContent).catch(() => 'none'));
  await pg.click('[data-row="AHG101"] .ct'); await pg.click('[data-qk="12"]'); await pg.waitForTimeout(100);
  log('quick 12 →', await pg.$eval('[data-qi="AHG101"]', e => e.value), 'who:', await pg.textContent('#qbarWho'));
  await shot('g10_listmode');
  log('net dot:', await pg.$eval('#hNet', e => e.className));
  await pg.click('#eVM'); await pg.waitForTimeout(100);
  /* v0.6.0: 분류 관리 · 일괄 변경 · 세일즈맨 보낼 오더 */
  await pg.evaluate(() => { location.hash = '#/admin/tree'; }); await pg.waitForSelector('[data-tren]'); await shot('g11_tree');
  log('tree root:', await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent).join(' | ')));
  await pg.click('[data-tin="Jewelry"]'); await pg.waitForTimeout(200);
  await pg.click('[data-tren="Chains"]'); await pg.waitForSelector('#trNew'); await pg.fill('#trNew', 'CHAIN'); await pg.click('#trOk'); await pg.waitForTimeout(800);
  log('renamed:', await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent).join(' | ')));
  await pg.click('[data-tdn="Earrings · Hoops & Pincatch"]'); await pg.waitForTimeout(800);
  log('moved:', await pg.$$eval('[data-tin]', els => els.map(e => e.querySelector('b').textContent).join(' | ')));
  /* 일괄 변경 적용 (파일 없이 함수로) */
  const bulk = await pg.evaluate(async () => { const m = await import('/src/catalog.js'); const r = m.parseBulkSheet([['Code', 'NewCode', 'Description', 'Price', 'Level 1'], ['AHG100', 'AHG100X', 'RENAMED ITEM', 9.99, ''], ['GM104', '', '', '', 'Wax Moved'], ['NOPE1', '', '', '', 'x']]); const rows = JSON.parse(window.__MOCK_SEED__.catalog[1].j), cats = [], sets = JSON.parse(window.__MOCK_SEED__.catalog[2].j); const sum = m.applyBulk(rows, cats, sets, r.patches); return { sum, row: rows.find(x => x[0] === 'AHG100X'), gm: rows.find(x => x[0] === 'GM104')[6], setk: sets['FI-TEST01'].k[0][0] }; });
  log('bulk:', JSON.stringify(bulk));
  log('csv head:', await pg.evaluate(async () => (await import('/src/catalog.js')).catalogCsv().split('\r\n')[0]));
  /* 세일즈맨: 임시저장 2건 → 보낼 오더 카드 → 한 번에 보내기 */
  await pg.click('#hMenu'); await pg.waitForSelector('#mOut'); await pg.evaluate(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' }; }); await pg.click('#mOut'); await pg.waitForSelector('#btnLogin'); await pg.click('#btnLogin'); await pg.waitForSelector('#nav button');
  for (let k = 0; k < 2; k++) { await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', k ? '1271' : 'ali'); await pg.waitForTimeout(150); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(200); await pg.waitForTimeout(700); if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(150); } await pg.fill('#eQ1', 'AHG10' + k); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(100); await pg.click('#eDraft'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(700); }
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('#oSendAll'); await shot('g12_sendcard');
  log('drafts to send:', await pg.$$eval('[data-sd]', els => els.length));
  await pg.click('#oSendAll'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  log('after send:', (await pg.textContent('#page')).includes('보낼 오더') ? 'card still' : 'card gone', '| sent tags:', await pg.$$eval('#page .tag', els => els.map(e => e.textContent).filter(t => t === '들어옴').length));
  /* v0.6.2: 세일즈맨 홈 · 로고 */
  await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('.htile'); await pg.waitForTimeout(800); await shot('g13_home');
  log('nav:', await pg.$$eval('#nav button', els => els.map(e => e.textContent.trim()).join(' | ')), '| tiles:', await pg.$$eval('.htile b', els => els.map(e => e.textContent).join(',')), '| send sub:', await pg.textContent('#hs-order'));
  await pg.click('[data-hg="order/new"]'); await pg.waitForSelector('#eStoreQ'); log('new order from home: ok');
  await pg.click('#hMenu'); await pg.waitForSelector('#mOut'); await pg.click('#mOut'); await pg.waitForSelector('#btnLogin'); await shot('g14_login');
  /* v0.6.3: ‹ 뒤로 */
  await pg.click('#btnLogin'); await pg.waitForSelector('#nav button'); await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('.htile'); await pg.waitForTimeout(300);
  log('back hidden at home:', !(await pg.$eval('#hBack', e => e.classList.contains('show'))));
  await pg.click('[data-hg="order/new"]'); await pg.waitForSelector('#eStoreQ'); log('back shown in editor:', await pg.$eval('#hBack', e => e.classList.contains('show')));
  await pg.click('#hBack'); await pg.waitForTimeout(400); log('after back hash:', await pg.evaluate(() => location.hash));
  await pg.evaluate(() => { location.hash = '#/ar'; }); await pg.waitForTimeout(300); await pg.click('#hBack'); await pg.waitForTimeout(400); log('back from ar →', await pg.evaluate(() => location.hash));
  log('errors:', errs); await br.close(); srv.kill();
})();
