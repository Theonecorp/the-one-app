/* v0.8.172 시험 — 🏷 오피스 매니저 홈에서 아이템 등록 · 📋 일괄 등록은 엑셀처럼 셀 격자 (#/items/bulk)
 *   ① 오피스 매니저 홈 📚 묶음에 ＋ 아이템 등록 · 📋 아이템 일괄 등록 타일 → 누르면 새 아이템 창(#fC) → 등록하면 목록에 들어감. 인보이스 담당도 같음, 창고 매니저 홈엔 없음
 *   ② 셀 격자: 기본 8줄 · 한 칸 textarea(#ibTxt) 없음 · 줄마다 상태 🆕(새) ✏️(있는 코드 — 지금 값이 placeholder) ⚠️(이름 · 가격 없음) · Enter = 아래 칸 · 마지막 줄에 적으면 줄이 늘어남 · ✕ 줄 지우기 · 같은 코드 두 줄이면 ‼
 *   ③ 붙여넣기: 머리글 있는 표(SmartBee)를 아무 칸에 붙이면 이름으로 열을 찾아 0열부터 · 머리글 없는 표는 붙인 칸부터 순서대로 (#ibSum 에 어떻게 읽었는지)
 *   ④ ✅ 등록 · 적용 → 새 아이템(Group 은 Level 1 앞글자 규칙) · 있는 코드는 적은 칸만 · 이름 · 가격 없는 새 코드는 안 들어감 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8812', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 1100, height: 900 } });
  const mk = async (email, job) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', "s.users.push({ id: '" + o.email + "', email: '" + o.email + "', name: 'X', role: 'manager', job: '" + o.job + "', active: true });"); }, { email, job }); await pg.goto('http://127.0.0.1:8812/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const cat = pg => pg.evaluate(() => { const M = window.__MOCK_STORE__; const rows = [].concat(...Object.values(M.catalog).filter(d => /^c\d+$/.test(d.id)).map(d => JSON.parse(d.j))); const by = {}; rows.forEach(r => { by[r[0]] = r; }); return { n: rows.length, by }; });
  const tiles = pg => pg.$$eval('[data-hg]', b => b.map(x => x.dataset.hg).filter(k => /^items/.test(k)));
  /* ① 오피스 매니저 홈 타일 → 새 아이템 창 → 등록 */
  const pg = await mk('office@x.com', 'office');
  const t1 = await tiles(pg); log('① office tiles:', t1.join(' '));
  if (!t1.includes('items/new') || !t1.includes('items/bulk')) errs.push('① office home has ＋ 아이템 등록 · 📋 아이템 일괄 등록 tiles');
  const c0 = await cat(pg);
  await pg.$eval('[data-hg="items/new"]', e => e.click()); await pg.waitForSelector('#fC', { timeout: 8000 }).catch(() => errs.push('① 아이템 등록 tile opens the new item form'));
  if (await pg.$('#fC')) {
    await pg.fill('#fC', 'OFF-NEW1'); await pg.fill('#fD', 'OFFICE NEW ITEM'); await pg.fill('#fP', '15'); await pg.click('#fOk'); await pg.waitForTimeout(1200);
    const c1 = await cat(pg); log('① after register:', c1.n - c0.n, JSON.stringify(c1.by['OFF-NEW1'] && c1.by['OFF-NEW1'].slice(0, 3)));
    if (!c1.by['OFF-NEW1'] || c1.by['OFF-NEW1'][2] !== 15) errs.push('① office manager registers an item from the home tile');
  }
  const inv = await mk('inv@x.com', 'invoice'); const t2 = await tiles(inv); if (!t2.includes('items/new')) errs.push('① invoice staff also gets the 아이템 등록 tile'); await inv.close();
  const wh = await mk('wh@x.com', 'whmgr'); const t3 = await tiles(wh); log('① whmgr tiles:', t3.join(' ')); if (t3.includes('items/new') || t3.includes('items/bulk')) errs.push('① warehouse manager home has no 아이템 등록 tiles (location only)'); await wh.close();
  /* ② 셀 격자 */
  await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForSelector('[data-hg="items/bulk"]', { timeout: 8000, state: 'attached' });   /* 📚 묶음은 접혀 있어 보이진 않음 */ await pg.$eval('[data-hg="items/bulk"]', e => e.click()); await pg.waitForSelector('#ibGrid', { timeout: 8000 }).catch(() => errs.push('② 일괄 등록 tile opens the grid'));
  if (await pg.$('#ibTxt')) errs.push('② no single textarea any more');
  const cell = (r, c) => '#ibGrid input[data-r="' + r + '"][data-c="' + c + '"]';
  /* 시험 기계가 바쁘면 Playwright 의 글자 입력이 통째로 빠질 때가 있어 — 쓴 뒤 값을 확인하고 안 들어갔으면 다시 씀 */
  const fill = async (sel, v) => { for (let i = 0; i < 4; i++) { await pg.fill(sel, v); if (await pg.$eval(sel, e => e.value) === v) return; await pg.waitForTimeout(150); } errs.push('fill failed: ' + sel); };
  const nrow = () => pg.$$eval('#ibRows tr', r => r.length);
  log('② rows:', await nrow()); if (await nrow() !== 8) errs.push('② grid starts with 8 rows');
  await fill(cell(0, 0), 'GRID-1'); await fill(cell(0, 1), 'GRID ITEM ONE'); await fill(cell(0, 2), '12.5'); await fill(cell(0, 5), '[NX] HAT');
  await fill(cell(1, 0), 'AHG100'); await fill(cell(1, 2), '9.99');
  await fill(cell(2, 0), 'NOPRICE1'); await fill(cell(2, 1), 'X');
  await pg.waitForTimeout(500);
  const st = await pg.$$eval('#ibRows tr', r => r.slice(0, 3).map(x => x.className + ':' + x.querySelector('.st').textContent)); log('② status:', st.join(' '));
  if (st.join() !== 'new:🆕,chg:✏️,warn:⚠️') errs.push('② row status 🆕 · ✏️ · ⚠️ (got ' + st.join() + ')');
  const ph = await pg.$eval(cell(1, 1), e => e.placeholder); if (ph !== c0.by['AHG100'][1]) errs.push('② existing code shows current description as placeholder');
  let sum = await pg.$eval('#ibSum', e => e.textContent); log('② sum:', sum.replace(/\s+/g, ' ')); if (!/새 아이템.*1/.test(sum) || !/바뀌는 아이템.*1/.test(sum)) errs.push('② summary 1 new · 1 changed');
  if (!/NOPRICE1/.test(await pg.$$eval('#ibPrev .a-amb', L => L.map(e => e.textContent).join(' ')))) errs.push('② code without price is flagged');
  await pg.focus(cell(2, 1)); await pg.keyboard.press('Enter'); const fo = await pg.evaluate(() => document.activeElement.dataset.r + ',' + document.activeElement.dataset.c); if (fo !== '3,1') errs.push('② Enter moves to the cell below (got ' + fo + ')');
  const n0 = await nrow(); await fill(cell(n0 - 1, 0), 'TMP'); if (await nrow() !== n0 + 1) errs.push('② typing on the last row adds a row'); await fill(cell(n0 - 1, 0), '');
  await fill(cell(5, 0), 'GRID-1'); await pg.waitForTimeout(400); if (!/‼/.test(await pg.$eval('#ibRows tr[data-ir="5"] .st', e => e.textContent))) errs.push('② duplicate code in two rows is marked ‼');
  await pg.$eval('[data-ibx="5"]', e => e.click()); await pg.waitForTimeout(300); if (await pg.$eval(cell(5, 0), e => e.value) !== '') errs.push('② ✕ removes the row');
  /* ③ 붙여넣기 — 머리글(SmartBee) → 0열부터 · 머리글 없음 → 붙인 칸부터 */
  const paste = (r, c, txt) => pg.evaluate(([sel, t]) => { const el = document.querySelector(sel); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, [cell(r, c), txt]);
  await paste(3, 4, ['Item No\tDescription\tQty\tU/M\tUnit Price\tPrice\tPLine\tCategory1\tPriceGroup\tGroup\tBarcode', 'SB-TEST1\tSMARTBEE PASTE ITEM\t1\tEA\t7\t10\t[NX] DUP\tDRESUP\tA\tWINTER\t840500800002'].join('\n')); await pg.waitForTimeout(400);
  const r3 = await pg.$$eval('#ibRows tr[data-ir="3"] input', i => i.map(x => x.value).join('|')); log('③ header paste:', r3);
  if (r3 !== 'SB-TEST1|SMARTBEE PASTE ITEM|7|10|840500800002|[NX] DUP|DRESUP|WINTER|') errs.push('③ SmartBee header maps columns from column 0');
  sum = await pg.$eval('#ibSum', e => e.textContent); if (!/SmartBee/.test(sum)) errs.push('③ summary says SmartBee header');
  await fill(cell(4, 0), 'NOHDR1'); await paste(4, 1, 'NO HEADER ITEM\t3.5\t5\t\t[NX] HAT\tHAT\tCROCHET HAT'); await pg.waitForTimeout(400);
  const r4 = await pg.$$eval('#ibRows tr[data-ir="4"] input', i => i.map(x => x.value).join('|')); log('③ headerless paste:', r4);
  if (r4 !== 'NOHDR1|NO HEADER ITEM|3.5|5||[NX] HAT|HAT|CROCHET HAT|') errs.push('③ headerless paste fills from the pasted cell');
  sum = await pg.$eval('#ibSum', e => e.textContent); if (!/머리글 없음|no header/.test(sum)) errs.push('③ summary says no header');
  /* ④ 적용 */
  await pg.click('#ibGo'); await pg.waitForSelector('#cfOk', { timeout: 5000 }); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const c2 = await cat(pg); log('④ after apply:', c2.n - c0.n, JSON.stringify(c2.by['GRID-1']));
  const g = c2.by['GRID-1']; if (!g || g[2] !== 12.5 || g[5] !== 'Other' || g[6] !== '[NX] HAT') errs.push('④ GRID-1 added with price · Group Other from Level 1');
  const a = c2.by['AHG100']; if (!a || a[2] !== 9.99 || a[1] !== c0.by['AHG100'][1] || a[6] !== c0.by['AHG100'][6]) errs.push('④ AHG100: only the price changed');
  if (c2.by['NOPRICE1']) errs.push('④ NOPRICE1 not added');
  const sb = c2.by['SB-TEST1']; if (!sb || sb[2] !== 7 || sb[3] !== 10 || sb[7] !== 'DRESUP' || sb[4] !== '840500800002') errs.push('④ SB-TEST1 from the SmartBee paste');
  const nh = c2.by['NOHDR1']; if (!nh || nh[2] !== 3.5 || nh[8] !== 'CROCHET HAT') errs.push('④ NOHDR1 from the headerless paste');
  if (c2.n !== c0.n + 4) errs.push('④ four items added in total (got ' + (c2.n - c0.n) + ')');
  if (await nrow() !== 8) errs.push('④ grid is empty again after apply');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
