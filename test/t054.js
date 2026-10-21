/* v0.8.14 시험 — 뒤로가기(바로 전 화면) · 오더 저장→주문 확인→보내기 · 담당자 기간 대시보드 · 인보이스 줄합=합계 · 아이템 등록 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8779', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const T = new Date(), d0 = T.toISOString().substring(0, 10), d1 = new Date(T - 86400000).toISOString().substring(0, 10);
  const mkPage = async (email) => {
    const pg = await br.newPage({ viewport: { width: 430, height: 1000 } });
    pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n')[1])); pg.on('dialog', d => d.accept());
    await pg.addInitScript(([email, d0, d1]) => {
      window.__MOCK_USER__ = { email, name: 'X' };
      window.__AFTER_SEED__ = s => {
        s.settings[0].ordersOn = true;
        const mk = (no, t, d, acct, store, sm, total, st) => ({ id: no, no, t, d, ym: d.substring(0, 7), acct, store, sm, order: 'O261014-AAAA', orderId: 'O261014-AAAA', qty: 10, sub: total, disc: 0, total, bal: total, terms: 'N30', st: st || 'open', lines: [{ c: 'AHG100', d: 'ITEM 0', q: 7, p: 2.5, lp: 2.5, g: 'EARRING' }, { c: 'AHG101', d: 'ITEM 1', q: 3, p: 3, lp: 3, g: 'EARRING' }], createdAt: d + 'T12:00:00Z' });
        /* 할인 15% 인보이스 — 줄마다 반올림한 합이 Total 이어야 함: 7×2.13=14.91 + 3×2.55=7.65 = 22.56 */
        const dcv = mk('A00009', 'A', d0, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 22.56); dcv.disc = 15; dcv.sub = 26.5;
        s.invoices = [mk('A00001', 'A', d0, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 100), mk('P00001', 'P', d0, '3001', 'BEAUTY EXCHANGE ORLANDO', 'ALEX', 50), mk('A00002', 'A', d1, '1049', 'ELEGANT BEAUTY', 'SOO', 80), dcv];
        s.orders[0].sentAt = new Date().toISOString();
      };
    }, [email, d0, d1]);
    await pg.goto('http://127.0.0.1:8779/test/demo.html'); await pg.waitForSelector('#nav button');
    return pg;
  };
  const txt = async (pg, sel) => ((await pg.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
  const shot = (pg, n) => pg.screenshot({ path: path.resolve(__dirname, 'out', n + '.png'), fullPage: true });

  /* ---------- 1. 세일즈맨: 뒤로가기 · 저장 → 주문 확인 → 보내기 ---------- */
  let pg = await mkPage('brandon@x.com');
  await pg.waitForTimeout(500);
  const h0 = await pg.evaluate(() => location.hash); log('salesman start:', h0);
  await pg.click('nav button[data-go="entry"]'); await pg.waitForTimeout(400);
  await pg.click('nav button[data-go="ar"]'); await pg.waitForTimeout(400);
  log('dbg:', await pg.evaluate(() => location.hash + ' | ' + document.getElementById('hBack').className + ' | ' + (() => { const e = document.getElementById('hBack'); let a = e, out = []; while (a && a.tagName !== 'HTML') { const cs = getComputedStyle(a); out.push(a.tagName + (a.id ? '#' + a.id : '') + ':' + cs.display + '/' + cs.visibility + '/' + cs.opacity + '/' + cs.overflow); a = a.parentElement; } return 'rects=' + e.getClientRects().length + ' cv=' + e.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) + ' ' + out.join(' > '); })() + ' | hdr ' + document.querySelector('header').getBoundingClientRect().width));
  const back = async () => { const r = await pg.$eval('#hBack', e => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }); await pg.mouse.click(r[0], r[1]); };
  await back(); await pg.waitForTimeout(400); const b1 = await pg.evaluate(() => location.hash);
  await back(); await pg.waitForTimeout(400); const b2 = await pg.evaluate(() => location.hash);
  log('back chain: entry→ar →back', b1, '→back', b2); if (b1 !== h0 || b2 !== h0) errs.push('back should go up to home (tab → home), got ' + b1 + ' ' + b2);   // v0.8.44: 뒤로 = 한 단계 위
  /* 새 오더 → 저장만 있어야 함 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ');
  await pg.fill('#eStoreQ', 'beauty 4u'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(200); }
  log('editor buttons:', await pg.$$eval('.sticky .btns button', b => b.map(x => x.id + ':' + x.textContent.trim())));
  if (await pg.$('#eSend')) errs.push('editor must not have Send button');
  await pg.fill('#eQ1', 'AHG100'); await pg.press('#eQ1', 'Enter'); await pg.waitForTimeout(300);
  await pg.click('#eDraft'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const ah = await pg.evaluate(() => location.hash); log('after save hash (want home):', ah); if (/#\/order/.test(ah)) errs.push('save should go home');
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(500); await pg.evaluate(() => window.dispatchEvent(new CustomEvent('theone:list', { detail: 'draft' }))); await pg.waitForTimeout(500);
  const rv = await pg.$('#oSendAll'); log('review card present:', !!rv); if (!rv) errs.push('review & send card missing after save');
  await shot(pg, 'd0_review');
  await pg.click('#oSendAll'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  log('after send, drafts left:', await pg.$$eval('[data-sd]', e => e.length));
  await pg.close();

  /* ---------- 2. 담당자: 기간 대시보드 · 인보이스 보기 · 아이템 등록 ---------- */
  pg = await mkPage('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForSelector('.htile'); await pg.waitForTimeout(1200);
  log('dash sales:', (await txt(pg, '#hSales')).slice(0, 200));
  log('tiles:', await pg.$$eval('.htile', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 40))));
  const st = await txt(pg, '#hSales'); if (!/\$172\.56/.test(st)) errs.push('today sales total wrong: ' + st.slice(0, 80));
  await pg.click('[data-hp="week"]'); await pg.waitForTimeout(1200); log('week:', (await txt(pg, '#hSales')).slice(0, 120));
  await pg.click('[data-hp="year"]'); await pg.waitForTimeout(1200); const yr = await txt(pg, '#hSales'); log('year:', yr.slice(0, 120)); if (!/\$252\.56/.test(yr)) errs.push('year total wrong');
  await shot(pg, 'd1_dash');
  /* 완료 목록에 기간 칩 */
  await pg.click('[data-hg="done"]'); await pg.waitForTimeout(800); log('done list period chips:', await pg.$$eval('[data-hp2]', e => e.length));
  /* 인보이스 인쇄 — 15% 할인: 줄 합 = Total */
  await pg.evaluate(() => { location.hash = '#/order/inv:A00009'; }); await pg.waitForSelector('#iPrint'); await pg.click('#iPrint'); await pg.waitForSelector('#prt.on'); await pg.waitForTimeout(500);
  const tot = await pg.$$eval('#prtbody .ivtot tr', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  const lines = await pg.$$eval('#prtbody .ivlines tbody tr:not(.ivsub):not(.ivkitrow) td:last-child', r => r.map(x => x.textContent.trim()));
  log('inv totals:', tot, 'line totals:', lines);
  const lsum = lines.reduce((a, v) => a + (Number(v.replace(/,/g, '')) || 0), 0); if (Math.abs(lsum - 22.56) > 0.005 || !tot.some(t => /Total\s*22\.56/.test(t))) errs.push('invoice line sum != total');
  log('opts bar:', await pg.$$eval('.ivopts button', b => b.map(x => x.className + ':' + x.textContent.trim().split(' ')[0])));
  await pg.click('[data-ivs="abc"]'); await pg.waitForTimeout(300); log('abc subtotal rows:', await pg.$$eval('#prtbody .ivsub', e => e.length));
  await shot(pg, 'd2_inv'); await pg.click('#prtClose');
  /* 픽킹 할당 → 픽킹 완료 → 인보이스 발행 → 출고 · 세일즈맨 확인 요청 */
  const home = async () => { await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(600); if (await pg.$('[data-lf="home"]')) await pg.click('[data-lf="home"]'); await pg.waitForSelector('.htile'); await pg.waitForTimeout(600); };
  await home();
  await pg.click('[data-hg="sent"]'); await pg.waitForSelector('[data-ck]'); log('sent list groups:', await pg.$$eval('.smgrp', e => e.length), 'rows:', await pg.$$eval('[data-ck]', e => e.length));
  await pg.click('[data-ckall="1"]'); await pg.click('#bkCf'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  /* v0.8.51 흐름: 확인 요청 → ❓ 확인 대기 → 👍 확인 완료 → 배정 */
  await pg.click('[data-lf="cfw"]'); await pg.waitForSelector('[data-ckall="1"]');
  log('cf tags:', await pg.$$eval('.tag', e => e.map(x => x.textContent).filter(t => /확인/.test(t))));
  await pg.click('[data-ckall="1"]'); await pg.click('#bkCfOk'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(800);
  await pg.click('[data-lf="cfok"]'); await pg.waitForSelector('[data-ckall="1"]');
  await pg.click('[data-ckall="1"]'); await pg.click('#bkAssign'); await pg.waitForSelector('#pkOk'); log('picker opts:', await pg.$$eval('[data-pk]', e => e.map(x => x.textContent.trim())));
  await pg.evaluate(() => { document.getElementById('pkPrint').checked = false; }); await pg.click('#pkOk'); await pg.waitForTimeout(900);
  await pg.click('[data-lf="pick"]'); await pg.waitForTimeout(700); const pk = await pg.$$eval('#page [data-oid]', e => e.map(x => x.dataset.oid)); log('picking list:', pk);
  await pg.evaluate(id => { location.hash = '#/order/' + id; }, pk[0]); await pg.waitForSelector('#mPickDone');
  /* 두드려서 픽킹: 1번 줄 — 한 번 = ✓ 통과, 두 번째 = ⏳ 백오더(0) */
  await pg.click('[data-pkt="1"]'); await pg.waitForTimeout(80); await pg.click('[data-pkt="1"]'); await pg.waitForTimeout(80); await pg.click('[data-pkt="0"]'); await pg.waitForTimeout(80);
  log('pick taps:', await pg.$$eval('.pkb', b => b.map(x => x.className + ' ' + x.textContent.replace(/\s+/g, ''))));
  await pg.click('#mPickDone'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(900);
  log('after pick done:', (await txt(pg, '#page h2')).slice(0, 60), 'btns:', await pg.$$eval('#page .btns button', b => b.map(x => x.id).filter(Boolean)));
  if (!(await pg.$('#mInv'))) errs.push('picked state should offer invoice');
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForTimeout(1500); if (await pg.$('#prt.on')) await pg.click('#prtClose');
  log('after invoice:', (await txt(pg, '#page h2')).slice(0, 60), 'ship btn:', !!(await pg.$('#mShip')));
  await pg.click('#mShip'); await pg.waitForSelector('#shOk'); await pg.fill('#shTrack', '1Z999TEST'); await pg.click('#shOk'); await pg.waitForTimeout(900);
  log('after ship:', (await txt(pg, '#page h2')).slice(0, 60), (await txt(pg, '#page .muted')).slice(0, 160));
  if (!/픽업 대기/.test(await txt(pg, '#page h2'))) errs.push('UPS ship should go to awaiting pickup (packed)');   // v0.8.51: UPS → 📮 픽업 대기
  await home(); await pg.waitForTimeout(800); log('tiles after flow:', await pg.$$eval('.htile', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 44))));
  await shot(pg, 'd4_dash2');
  /* 아이템 등록 */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itNew');
  await pg.fill('#itQ', 'NEWX1'); await pg.waitForTimeout(300); log('no match:', (await txt(pg, '#itList')).slice(0, 80));
  await pg.click('#itMk'); await pg.waitForSelector('#fOk');
  await pg.fill('#fD', 'TEST NEW HOOP'); await pg.fill('#fP', '4.5'); await pg.fill('#fG', 'Jewelry'); await pg.fill('#fL1', 'EARRING'); await pg.dispatchEvent('#fL1', 'input');
  log('type preview:', await txt(pg, '#fType'));
  await pg.click('#fOk'); await pg.waitForTimeout(1500);
  log('after register:', (await txt(pg, '#itList')).slice(0, 120));
  const ok = await pg.evaluate(() => !!document.querySelector('[data-it="NEWX1"]')); if (!ok) errs.push('new item not listed');
  /* 수정: 가격 */
  await pg.click('[data-it="NEWX1"]'); await pg.waitForSelector('#fOk'); await pg.fill('#fP', '5'); await pg.click('#fOk'); await pg.waitForTimeout(1200);
  log('after edit:', (await txt(pg, '[data-it="NEWX1"]')).slice(0, 80));
  await shot(pg, 'd3_items');
  /* 오더 화면에서 새 아이템 검색 */
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'beauty 4u'); await pg.waitForTimeout(200); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#ssX')) { await pg.click('#ssX'); await pg.waitForTimeout(200); }
  await pg.fill('#eQ1', 'NEWX1'); await pg.waitForTimeout(400); log('order search NEWX1:', (await txt(pg, '#eRes')).slice(0, 80));
  if (!/NEWX1/.test(await txt(pg, '#eRes'))) errs.push('new item not searchable in order');
  await pg.close();
  /* 세일즈맨(ALEX 의 오더는 ALEX 에게) — seed 오더 O261014-AAAA 는 ALEX: alex 계정 없으면 brandon 으로 cf 요청된 자기 오더 확인 */
  pg = await mkPage('brandon@x.com'); await pg.waitForTimeout(800);
  log('salesman home cf tile:', (await txt(pg, '#hs-order')).slice(0, 60), await pg.$$eval('.htile', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 30))));
  await pg.close();
  log('errors:', errs.length ? errs : 'none'); await br.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
