/* v0.8.149 시험 — 주문 화면 누르기 정리: 폰 카드가 커지고(3칸) 설명이 보임 · 카드 · 줄에 ✎ 가격 단추 없음(가격은 수량 창 · 주문 확인에서)
 *   목록 줄은 이름 · 가격 · 📦 칸을 누르면 담기고, 수량 칸은 따로 · 길게 누르면 수량 · 가격 창 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8866', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const mk = async (view) => { const pg = await br.newPage({ viewport: { width: 420, height: 860 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(v => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; try { localStorage.removeItem('theone.order.wip.brandon@x.com'); localStorage.removeItem('theone.order.pre'); localStorage.setItem('theone.order.view', v); } catch (x) {} }, view); await pg.goto('http://127.0.0.1:8866/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(400);
    await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(150); }
    await pg.fill('#eQ1', 'AHG'); await pg.waitForTimeout(600); return pg; };

  /* ---------- 카드 보기 ---------- */
  let pg = await mk('grid');
  const card = await pg.$eval('.gcard', c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), desc: getComputedStyle(c.querySelector('.gt small')).display, pen: !!c.querySelector('.pen'), pe: !!c.querySelector('[data-pe]') }; });
  log('card:', card); if (card.w < 110) errs.push('phone cards should be at least 110px wide: ' + card.w); if (card.desc === 'none') errs.push('description should be visible on phone cards'); if (card.pen || card.pe) errs.push('cards should not have the price pen');
  const perRow = await pg.$$eval('.gcard', cs => { const t = cs[0].getBoundingClientRect().top; return cs.filter(c => Math.abs(c.getBoundingClientRect().top - t) < 2).length; }); log('cards per row:', perRow); if (perRow !== 3) errs.push('420px should show 3 cards per row, got ' + perRow);
  await pg.click('[data-gc="AHG100"] .gt'); await pg.waitForTimeout(200); if ((await pg.textContent('#eN')).trim() !== '1') errs.push('tapping the card text should add 1');
  const minus = await pg.$eval('[data-gc="AHG100"] .gm', b => { const r = b.getBoundingClientRect(), i = b.closest('.gcard').querySelector('.gimg').getBoundingClientRect(); return { w: Math.round(r.width), bottomRight: r.right > i.right - 40 && r.bottom > i.bottom - 40 }; }); log('minus:', minus); if (minus.w < 28 || !minus.bottomRight) errs.push('− button should be a large button at the image bottom-right');
  await pg.click('[data-gc="AHG100"] .gm'); await pg.waitForTimeout(200); if ((await pg.textContent('#eN')).trim() !== '0') errs.push('− should remove');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'order_cards.png') });
  await pg.close();

  /* ---------- 목록 보기 ---------- */
  pg = await mk('list');
  if (await pg.$('#eRes .pedit, #eRes [data-pe]')) errs.push('list rows should not have the price pen');
  const qc = await pg.$eval('#eRes tr.irow td.qc', td => { const b = td.querySelector('button'); return { w: Math.round(td.getBoundingClientRect().width), bw: Math.round(b.getBoundingClientRect().width), bh: Math.round(b.getBoundingClientRect().height) }; }); log('qty cell:', qc); if (qc.bw < 32 || qc.bh < 36) errs.push('stepper buttons should be at least 32x36');
  await pg.click('#eRes tr[data-frow="AHG101"] td.pc'); await pg.waitForTimeout(200); if ((await pg.textContent('#eN')).trim() !== '1') errs.push('tapping the price cell should add 1');
  await pg.click('#eRes tr[data-frow="AHG101"] td.r'); await pg.waitForTimeout(200); if ((await pg.textContent('#eN')).trim() !== '1' || (await pg.$eval('[data-qi="AHG101"]', e => e.value)) !== '2') errs.push('tapping the stock cell should add again (qty 2)');
  await pg.click('#eRes tr[data-frow="AHG101"] td.qc'); await pg.waitForTimeout(200); if ((await pg.$eval('[data-qi="AHG101"]', e => e.value)) !== '2') errs.push('tapping the qty cell background should not add');
  /* 길게 누르기 → 수량 · 가격 창 */
  const box = await pg.$eval('#eRes tr[data-frow="AHG102"] td.ct', e => { const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await pg.mouse.move(box.x, box.y); await pg.mouse.down(); await pg.waitForTimeout(750); await pg.mouse.up(); await pg.waitForTimeout(200);
  if (!(await pg.$('#qpV'))) errs.push('long press on a list row should open the qty/price pad'); else { if (!(await pg.$('#qpPr'))) errs.push('pad should have a price field'); await pg.click('#qpX'); await pg.waitForTimeout(150); }
  if ((await pg.$eval('[data-qi="AHG102"]', e => e.value)) !== '') errs.push('long press should not also add 1');
  await pg.screenshot({ path: path.resolve(__dirname, 'out', 'order_list_rows.png') });
  await pg.close();

  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
