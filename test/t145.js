/* v0.8.167 시험 — 📋 아이템 일괄 등록(붙여넣기) · 🗑 일괄 삭제 (#/items/bulk): 엑셀에서 복사한 표를 붙여 넣으면 미리보기 → 등록, 찾아서 체크 → 삭제 · 숨김 (v0.8.172: 한 칸 textarea 대신 셀 격자 — 붙여넣기는 아무 칸에나)
 *   ① 머리글 있는 붙여넣기: 새 코드 + Description + Price = 새 아이템(분류 · 바코드 · SRP · Group 자동), 있는 코드 = 적은 칸만(빈 칸 그대로) · 설명 · 가격 없는 새 코드는 ⚠️ 건너뜀
 *   ② SmartBee 머리글(Item No · Description · Unit Price · Price · PLine · Category1 · Group · Barcode) → Code · Price · SRP · Level 1 · 2 · 3 로 읽음 · 머리글 없으면 기본 순서
 *   ③ 삭제: 코드 앞부분으로 찾아 체크 → 🗑 → 목록에서 빠짐 · 🙈 숨김은 남고 h=1 · 아이템 화면 · 관리 📦 아이템 탭에 들어가는 단추 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8896', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 900, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8896/test/demo.html'); await pg.waitForSelector('#nav button');
  const cat = () => pg.evaluate(() => { const M = window.__MOCK_STORE__; const rows = [].concat(...Object.values(M.catalog).filter(d => /^c\d+$/.test(d.id)).map(d => JSON.parse(d.j))); const by = {}; rows.forEach(r => { by[r[0]] = r; }); return { n: rows.length, by }; });
  const c0 = await cat(); log('catalog before:', c0.n);
  /* v0.8.172: 셀 격자 — 0행 0열 칸에 붙여넣기 (엑셀 복사와 같은 paste 이벤트) */
  const paste = async txt => { await pg.waitForSelector('#ibGrid', { timeout: 8000 }); await pg.click('#ibClr'); await pg.evaluate(t => { const el = document.querySelector('#ibGrid input[data-r="0"][data-c="0"]'); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, txt); await pg.waitForTimeout(400); };
  /* 단추 */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itBulkGo', { timeout: 8000 }).catch(() => errs.push('③ items page has 📋 일괄 등록 · 삭제 button'));
  await pg.evaluate(() => { location.hash = '#/admin/cat'; }); await pg.waitForSelector('[data-cg="items/bulk"]', { timeout: 8000 }).catch(() => errs.push('③ admin 📦 아이템 tab has the bulk button'));
  /* ① 머리글 붙여넣기 */
  await pg.evaluate(() => { location.hash = '#/items/bulk'; }); await pg.waitForSelector('#ibGrid', { timeout: 8000 });
  const paste1 = ['Code\tDescription\tPrice\tSRP\tBarcode\tLevel 1\tLevel 2\tLevel 3', 'HAT-CH-BK\tHANDMADE RUFFLE CROCHET HATS - BLACK (12PC/PACK)\t120\t\t\t[NX] HAT\tHAT\tCROCHET HAT', 'HAT-CH-BW\tHANDMADE RUFFLE CROCHET HATS - BLACK & WHITE (12PC/PACK)\t120\t150\t840500800001\t[NX] HAT\tHAT\tCROCHET HAT', 'AHG100\t\t9.99\t\t\t\t\t', 'NOPRICE1\tNO PRICE ITEM\t\t\t\t[NX] HAT\t\t'].join('\n');
  await paste(paste1); await pg.waitForSelector('#ibGo', { timeout: 5000 }).catch(() => errs.push('① preview should offer 등록 · 적용'));
  const s1 = await pg.evaluate(() => (document.getElementById('ibSum') || {}).textContent || ''); log('① summary:', s1.replace(/\s+/g, ' ').slice(0, 160));
  if (!/새 아이템.*2/.test(s1) || !/바뀌는 아이템.*1/.test(s1)) errs.push('① summary: 2 new · 1 changed');
  const warn = await pg.evaluate(() => Array.from(document.querySelectorAll('#ibPrev .a-amb')).map(e => e.textContent).join(' ')); if (!/NOPRICE1/.test(warn)) errs.push('① unknown code without price is flagged');
  await pg.click('#ibGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  let c1 = await cat(); log('① after apply:', c1.n, JSON.stringify(c1.by['HAT-CH-BW']), JSON.stringify(c1.by['AHG100'] && c1.by['AHG100'].slice(0, 3)));
  if (c1.n !== c0.n + 2) errs.push('① two items added (got ' + (c1.n - c0.n) + ')');
  const bw = c1.by['HAT-CH-BW']; if (!bw || bw[1] !== 'HANDMADE RUFFLE CROCHET HATS - BLACK & WHITE (12PC/PACK)' || bw[2] !== 120 || bw[3] !== 150 || bw[4] !== '840500800001' || bw[6] !== '[NX] HAT' || bw[7] !== 'HAT' || bw[8] !== 'CROCHET HAT' || bw[5] !== 'Other') errs.push('① new item fields: desc · price · srp · barcode · levels · Group from Level 1 ([ → Other)');
  const a100 = c1.by['AHG100']; if (!a100 || a100[2] !== 9.99 || a100[1] !== c0.by['AHG100'][1] || a100[6] !== c0.by['AHG100'][6]) errs.push('① existing code: only price changed, description and levels kept');
  if (c1.by['NOPRICE1']) errs.push('① no-price unknown code must not be added');
  /* ② SmartBee 머리글 · 머리글 없음 */
  await paste(['Item No\tDescription\tQty\tU/M\tUnit Price\tPrice\tPLine\tCategory1\tPriceGroup\tGroup\tBarcode', 'SB-TEST1\tSMARTBEE PASTE ITEM\t1\tEA\t7\t10\t[NX] DUP\tDRESUP\tA\tWINTER\t840500800002'].join('\n'));
  await pg.waitForSelector('#ibGo', { timeout: 5000 }).catch(() => errs.push('② SmartBee header preview'));
  const s2 = await pg.evaluate(() => (document.getElementById('ibSum') || {}).textContent || ''); if (!/SmartBee/.test(s2)) errs.push('② SmartBee header recognized');
  await pg.click('#ibGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  c1 = await cat(); const sb = c1.by['SB-TEST1']; log('② smartbee item:', JSON.stringify(sb));
  if (!sb || sb[2] !== 7 || sb[3] !== 10 || sb[6] !== '[NX] DUP' || sb[7] !== 'DRESUP' || sb[8] !== 'WINTER' || sb[4] !== '840500800002') errs.push('② SmartBee columns map to price · srp · levels · barcode');
  await paste('NOHDR1\tNO HEADER ITEM\t3.5\t5\t\t[NX] HAT\tHAT\tCROCHET HAT'); await pg.waitForSelector('#ibGo', { timeout: 5000 }).catch(() => errs.push('② headerless paste'));
  const s3 = await pg.evaluate(() => (document.getElementById('ibSum') || {}).textContent || ''); if (!/머리글 없음|no header/.test(s3)) errs.push('② headerless paste uses the default order');
  await pg.click('#ibGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  c1 = await cat(); if (!c1.by['NOHDR1'] || c1.by['NOHDR1'][2] !== 3.5 || c1.by['NOHDR1'][7] !== 'HAT') errs.push('② headerless row added in default order');
  /* ③ 삭제 · 숨김 */
  await pg.evaluate(() => { location.hash = '#/items/bulk:del'; }); await pg.waitForSelector('#ibQ', { timeout: 8000 });
  await pg.fill('#ibQ', 'HAT-CH'); await pg.waitForTimeout(400); const shown = await pg.$$eval('[data-ibk]', e => e.map(x => x.dataset.ibk)); log('③ found:', shown);
  if (shown.sort().join() !== 'HAT-CH-BK,HAT-CH-BW') errs.push('③ prefix search lists the two hats');
  await pg.$eval('[data-ibk="HAT-CH-BK"]', e => e.click()); await pg.$eval('[data-ibk="HAT-CH-BW"]', e => e.click());   /* 아래 메뉴에 가려질 수 있어 JS 클릭 */ await pg.waitForSelector('#ibDel', { timeout: 3000 });
  await pg.$eval('#ibDel', e => e.click()); await pg.waitForSelector('#cfOk', { timeout: 5000 }); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  c1 = await cat(); if (c1.by['HAT-CH-BK'] || c1.by['HAT-CH-BW'] || c1.n !== c0.n + 2) errs.push('③ both hats deleted, others intact (n=' + c1.n + ')');
  await pg.waitForSelector('#ibQ', { timeout: 8000 }); await pg.fill('#ibQ', 'SB-TEST1'); await pg.waitForTimeout(400); await pg.$eval('[data-ibk="SB-TEST1"]', e => e.click()); await pg.waitForSelector('#ibHide', { timeout: 3000 }); await pg.$eval('#ibHide', e => e.click()); await pg.waitForTimeout(1200);
  c1 = await cat(); if (!c1.by['SB-TEST1'] || c1.by['SB-TEST1'][10] !== 1) errs.push('③ hide keeps the item with h=1');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
