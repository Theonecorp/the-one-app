/* v0.8.189 시험 — 🛒 주문 화면: 폴더를 바꾸면 프리셋이 앞 폴더의 마지막 아이템을 바꾸지 않음 · 검색 뒤 다른 버튼을 누르면 검색어 리셋 (2026-11-12 세일즈맨: "18K CHAIN 을 프리셋 3 으로 찍다가 PAD STUD 폴더로 가서 프리셋 1 을 누르면 마지막 18K CHAIN 이 1 로 바뀜")
 *   ① 폴더 A 에서 프리셋 3 → 아이템 카드 누름 = 3개 · 그 자리에서 1 을 누르면 그 아이템이 1 로 (지금처럼 — 마지막 아이템 고치기)
 *   ② 다시 3 으로 놓고 카드 누름 → "상위" · 다른 폴더로 가서 프리셋 1 → 앞 아이템은 3 그대로 · 아래 줄은 "프리셋 1개"
 *   ③ 검색어를 넣고 🧺 탭 → 🛒 주문 탭으로 돌아오면 검색어 빈칸 · 분류 타일이 다시 보임 · 🆕 / 폴더를 눌러도 검색어 지움 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8867', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'B' }; try { localStorage.setItem('theone.order.pre', '0'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:8867/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ', { timeout: 8000 });
  await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(300); await pg.click('#eStoreHits [data-ac="1111"]'); await pg.waitForTimeout(900);
  if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(300); }
  const qty = c => pg.evaluate(c => { const W = JSON.parse(localStorage.getItem('theone.order.wip.brandon@x.com') || '{}'); const l = (W.lines || []).find(x => x.c === c); return l ? l.q : 0; }, c);
  const folders = await pg.$$eval('[data-ck]', B => B.map(b => b.dataset.ck)); log('folders:', folders.slice(0, 4).join(' | '));
  if (folders.length < 2) errs.push('need two folders');
  /* 폴더 A 로 내려가 첫 카드 */
  const down = async i => { await pg.$$eval('[data-ck]', (B, i) => B[i].click(), i); await pg.waitForTimeout(300); while (!(await pg.$('#eRes [data-gc]')) && await pg.$('[data-ck]')) { await pg.click('[data-ck]'); await pg.waitForTimeout(300); } };
  await down(0); const A = await pg.$eval('#eRes [data-gc]', e => e.dataset.gc); log('item A:', A);
  /* ① */
  await pg.click('[data-qk="3"]'); await pg.waitForTimeout(100); await pg.click('#eRes [data-gc="' + A + '"]'); await pg.waitForTimeout(700);
  log('① A after tap with preset 3:', await qty(A)); if (await qty(A) !== 3) errs.push('① preset 3 + tap → 3');
  await pg.click('[data-qk="1"]'); await pg.waitForTimeout(700); log('① same folder, press 1:', await qty(A)); if (await qty(A) !== 1) errs.push('① in the same place, 1 fixes the last item → 1');
  /* ② */
  await pg.click('[data-qk="3"]'); await pg.waitForTimeout(100); await pg.click('#eRes [data-gc="' + A + '"]'); await pg.waitForTimeout(700); const a2 = await qty(A); log('② A now:', a2);
  await pg.click('[data-cp="0"]'); await pg.waitForTimeout(300); await down(1);
  await pg.click('[data-qk="1"]'); await pg.waitForTimeout(700);
  const a3 = await qty(A), who = await pg.textContent('#qbarWho'); log('② after folder change + preset 1:', a3, '|', who);
  if (a3 !== a2) errs.push('② preset in another folder must not change the last item of the previous folder');
  if (!/프리셋 1개/.test(who)) errs.push('② bar shows preset 1');
  /* ③ */
  await pg.fill('#eQ1', 'AHG'); await pg.waitForTimeout(500);
  await pg.click('[data-ev="cart"]'); await pg.waitForTimeout(400); await pg.click('[data-ev="add"]'); await pg.waitForTimeout(500);
  const q3 = await pg.$eval('#eQ1', e => e.value), cats = await pg.$('[data-ck]'); log('③ search after tab change:', JSON.stringify(q3), 'cats:', !!cats);
  if (q3 !== '') errs.push('③ switching tabs clears the search');
  await pg.fill('#eQ1', 'AHG'); await pg.waitForTimeout(500); await pg.click('[data-cp="0"]'); await pg.waitForTimeout(400);
  if (await pg.$eval('#eQ1', e => e.value) !== '') errs.push('③ All clears the search');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
