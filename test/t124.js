/* v0.8.161 시험 — 📦 창고 매니저 재고 관리: ⚠️ 부족 기준(아이템마다 · 기본 설정) · ± 빠른 조정 · 기준 아래로 내려가면 사무실 · 관리자에게 💬 알림(+ 이메일 · 챗 큐) 한 번만
 *   ⚠️ 부족 탭 = 0 이하 + 기준 아래 · 📤 지금 알리기 · 🏭 공급처 별칭(China 1 · …)이 아이템 공급업체 · 입고 '어디서' 고르기에 나옴 · ☰ 서랍 📡 연결 · 보낼 함 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8878', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seed = s => {
    s.stock = (s.stock || []).concat([{ id: 'AHG100', code: 'AHG100', qty: 20 }, { id: 'AHG101', code: 'AHG101', qty: 5, min: 3 }, { id: 'AHG102', code: 'AHG102', qty: 0 }]);
    s.factories = [{ id: 'JD', code: 'JD', name: 'ZHEJIANG JUDA SUPPLY CHAIN', alias: 'China 1', active: true }, { id: 'RM', code: 'RM', name: 'QINGDAO RUMINO', alias: 'China 2', active: true }];
    s.settings[0].suppliers = [{ code: 'JD', alias: 'China 1', name: 'ZHEJIANG JUDA SUPPLY CHAIN' }, { code: 'RM', alias: 'China 2', name: 'QINGDAO RUMINO' }];
  };
  await pg.addInitScript(f => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f); }, '(' + seed.toString() + ')(s)');
  await pg.goto('http://127.0.0.1:8878/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(400);
  const msgs = () => pg.evaluate(() => Object.values(window.__MOCK_STORE__.msgs || {}).filter(m => m.to === 'g:office' && /기준|minimum|부족|Low/i.test(m.text)).map(m => m.text));
  const nq = () => pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'lowstock').length);   // v0.8.162: 이메일 · 챗은 kind lowstock (받는 사람 = 설정 stockAlertTo, 없으면 담당자 알림 이메일)
  /* ① ☰ 서랍에 📡 연결 · 보낼 함 */
  await pg.click('#hMenu'); await pg.click('#drawer [data-dgo="settings"]'); await pg.waitForSelector('.stpage #mNet', { timeout: 3000 }).catch(() => errs.push('⚙️ settings page should have the 📡 connection button'));
  if (await pg.$('.stpage #mNet')) { await pg.click('.stpage #mNet'); await pg.waitForSelector('#modal.on #netX', { timeout: 3000 }).catch(() => errs.push('📡 button should open the connection sheet')); await pg.click('#netX').catch(() => {}); }
  /* ② 재고 조회 → AHG100 창: 기준(기본 12) · ± 빠른 조정 −12 → 8 → 기준 아래 → 💬 알림 */
  await pg.evaluate(() => { location.hash = '#/stock'; }); await pg.waitForSelector('#skQ', { timeout: 8000 }); await pg.fill('#skQ', 'AHG100'); await pg.waitForTimeout(500);
  await pg.click('[data-sti="AHG100"]'); await pg.waitForSelector('#skSave', { timeout: 5000 }); await pg.waitForTimeout(200);
  const ph = await pg.getAttribute('#skMin', 'placeholder'); log('min placeholder:', ph); if (!/12/.test(ph || '')) errs.push('min placeholder should show the default 12');
  await pg.click('[data-skq="-12"]'); const adj = await pg.inputValue('#skAdj'); log('adj after −12:', adj); if (adj !== '-12') errs.push('quick −12 should fill the adjustment');
  await pg.fill('#skWhy', 'damaged'); await pg.click('#skSave'); await pg.waitForTimeout(900);
  let q = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty); let M = await msgs(); log('AHG100 qty:', q, '· office msgs:', M.length, (M[0] || '').replace(/\n/g, ' | ').slice(0, 120), '· notifyq:', await nq());
  if (q !== 8) errs.push('qty should be 8 after −12'); if (M.length !== 1) errs.push('dropping below the minimum should send one office message'); if (!/AHG100/.test(M[0] || '')) errs.push('message should name the item');
  if ((await nq()) !== 1) errs.push('low-stock email/chat should be queued once (notifyq kind lowstock)');
  /* ③ 이미 아래인데 또 내려가면 다시 알리지 않음 · 기준 위로 올라갔다 다시 내려가면 또 */
  await pg.click('[data-sti="AHG100"]'); await pg.waitForSelector('#skSave'); await pg.click('[data-skq="-1"]'); await pg.fill('#skWhy', 'sample'); await pg.click('#skSave'); await pg.waitForTimeout(700);
  M = await msgs(); if (M.length !== 1) errs.push('no second alert while already below the minimum (got ' + M.length + ')');
  await pg.click('[data-sti="AHG100"]'); await pg.waitForSelector('#skSave'); await pg.fill('#skCnt', '50'); await pg.click('#skSave'); await pg.waitForTimeout(700);
  await pg.click('[data-sti="AHG100"]'); await pg.waitForSelector('#skSave'); await pg.fill('#skAdj', '-45'); await pg.fill('#skWhy', 'sold'); await pg.click('#skSave'); await pg.waitForTimeout(900);
  M = await msgs(); q = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty); log('after 50 → −45: qty', q, 'msgs', M.length); if (q !== 5 || M.length !== 2) errs.push('crossing the minimum again should alert again');
  /* ④ 아이템마다 기준: AHG101 min 3 (qty 5) → 정상 · 기준을 10 으로 올리면 저장되고 부족 */
  await pg.fill('#skQ', 'AHG101'); await pg.waitForTimeout(500); let badge = await pg.textContent('[data-sti="AHG101"] .sbadge'); log('AHG101 badge (min 3):', badge.trim()); if (!/정상|In stock/.test(badge)) errs.push('AHG101 with min 3 and qty 5 should be in stock');
  await pg.click('[data-sti="AHG101"]'); await pg.waitForSelector('#skSave'); const v = await pg.inputValue('#skMin'); if (v !== '3') errs.push('item min should be shown (3), got ' + v);
  await pg.fill('#skMin', '10'); await pg.click('#skSave'); await pg.waitForTimeout(800);
  const mn = await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG101.min); log('AHG101 min saved:', mn); if (mn !== 10) errs.push('min should be saved on the stock doc');
  badge = await pg.textContent('[data-sti="AHG101"] .sbadge'); if (!/부족|Low/.test(badge)) errs.push('AHG101 should be low once min is 10');
  /* ⑤ ⚠️ 부족 탭: 0 이하(AHG102) + 기준 아래(AHG100 5<12 · AHG101 5<10) · 📤 지금 알리기 */
  await pg.click('[data-sk="low"]'); await pg.waitForSelector('#skLowSend', { timeout: 5000 }).catch(() => errs.push('low tab should offer 📤 notify')); await pg.waitForTimeout(400);
  const lowTxt = (await pg.textContent('#skBody')).replace(/\s+/g, ' '); log('low tab:', lowTxt.slice(0, 160));
  ['AHG100', 'AHG101', 'AHG102'].forEach(c => { if (!lowTxt.includes(c)) errs.push('low tab should list ' + c); });
  if (await pg.$('#skLowSend')) { await pg.click('#skLowSend'); await pg.waitForTimeout(800); M = await msgs(); if (M.length !== 3) errs.push('manual notify should send one more office message (got ' + M.length + ')'); }
  /* ⑥ 공급처 별칭: 입고 '어디서' 목록 · 아이템 수정 창 공급업체 목록 */
  await pg.click('[data-sk="recv"]'); await pg.waitForSelector('#rvFrom'); const opts = await pg.$$eval('#rvFrom option', L => L.map(o => o.value + '=' + o.textContent)); log('recv from options:', opts);
  if (!opts.some(o => /^JD=.*ZHEJIANG JUDA.*China 1/.test(o))) errs.push('admin should see the factory name with China 1 in brackets');
  /* 입고 저장 → receipts.fromCode = JD (경영의 공장과 연결) */
  await pg.selectOption('#rvFrom', 'JD'); await pg.fill('#rvC', 'AHG105'); await pg.press('#rvC', 'Enter'); await pg.fill('#rvQ', '24'); await pg.press('#rvQ', 'Enter'); await pg.waitForTimeout(400);
  await pg.click('#rvSave'); await pg.waitForSelector('#cfOk', { timeout: 3000 }); await pg.click('#cfOk'); await pg.waitForTimeout(900);
  const rc = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.receipts || {})[0]); log('receipt:', rc && rc.fromCode, rc && rc.from, rc && rc.qty);
  if (!rc || rc.fromCode !== 'JD' || !/ZHEJIANG/.test(rc.from || '')) errs.push('receipt should carry fromCode JD and the full label');
  /* 경영 › 공장 페이지에 그 입고가 보임 */
  await pg.evaluate(() => { location.hash = '#/mg/fac'; }); await pg.waitForSelector('[data-fc="JD"]', { timeout: 8000 }).catch(() => errs.push('factory page should list JD')); if (await pg.$('[data-fc="JD"]')) { await pg.click('[data-fc="JD"]'); await pg.waitForFunction(() => { const e = document.getElementById('facRcp'); return e && !/…/.test(e.textContent); }, null, { timeout: 8000 }).catch(() => {}); const fr = (await pg.textContent('#facRcp').catch(() => '')).replace(/\s+/g, ' '); log('factory receipts card:', fr.slice(0, 120)); if (!/1건/.test(fr) || !/24/.test(fr)) errs.push('factory page should show the warehouse receipt (1건 · 24)'); const head = (await pg.textContent('#mgBody h2').catch(() => '')); if (!/ZHEJIANG/.test(head)) errs.push('admin factory page should be headed by the factory name'); }
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itList [data-it]', { timeout: 8000 }); await pg.click('#itList [data-it="AHG100"] .ct'); await pg.waitForSelector('#isEd', { timeout: 5000 }); await pg.click('#isEd'); await pg.waitForSelector('#fSup', { timeout: 5000 });
  const sup = await pg.$$eval('#fSup option', L => L.map(o => o.value + '=' + o.textContent)); log('supplier options:', sup.slice(0, 4)); if (!sup.some(o => /^RM=.*QINGDAO RUMINO/.test(o))) errs.push('item form supplier select should include RM = QINGDAO RUMINO');
  await pg.selectOption('#fSup', 'RM'); await pg.click('#fOk'); await pg.waitForTimeout(900);
  const supSaved = await pg.evaluate(() => { const c = JSON.parse(window.__MOCK_STORE__.catalog.c0.j); const r = c.find(x => x[0] === 'AHG100'); return r && r[12]; }); log('AHG100 sup saved:', supSaved); if (supSaved !== 'RM') errs.push('item supplier should be saved as the factory code RM');
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL'); errs.forEach(e => console.log(' -', e)); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
