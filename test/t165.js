/* v0.8.174 시험 — 📦 창고 · 사무실 의견 5가지 (새 주문 앱 보완점)
 *   ① 인보이스 문서: 분류 묶음이 앱 분류 순서(세트 "" 먼저 → 주얼리 → [그 외]) — SET ORDER 묶음이 맨 위
 *   ② 세트는 기본으로 한 줄(작은 글씨 SET: 구성) — 구성품 ↳ 줄(.ivkitrow)이 저절로 펼쳐지지 않음 (보기 설정 '구성품 펼침' 으로만)
 *   ③ ④ 피킹 리스트 인쇄: 인보이스 종류(A 주얼리 → P 그 외) 머리 → 분류(세트 먼저) 머리 → 위치 · 코드 순 · 화면의 픽킹 목록에도 분류 구분줄
 *   ⑤ 인보이스 확정 창에서 종류별 할인 % 를 바로 고침 → 합계가 바뀌고, 확정하면 인보이스 · 주문(disc · discChg)에 저장 · 가게 기본 할인은 그대로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8830', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  /* 주문: 세트(FLSIDE52 · SET ORDER) + 주얼리 2줄 + 그 외(EB103 · P) — 픽킹 완료 상태, 가게 기본 할인 A 10% */
  const SEED = "const c0 = s.catalog.find(x => x.id === 'c0'); const rows = JSON.parse(c0.j); rows.forEach(r => { if (r[0] === 'FLSIDE52') { r[5] = 'Set & Display'; r[6] = 'SET ORDER\"\"'; r[7] = 'FLOOR'; r[8] = 'BODY J'; } }); c0.j = JSON.stringify(rows);" +
    "s.orders[0].st = 'picked'; s.orders[0].picker = 'office@theonefl.com'; s.orders[0].disc = { A: 10 }; const acc = s.accounts.find(a => a.acct === '3001'); if (acc) acc.disc = { A: 10 };" +
    "s.orderLines[0].lines = [{ c: 'EB103', d: 'EDGE BOOSTER ITEM 3', q: 4, pq: 4, ok: true, p: 3.25, t: 'P' }, { c: 'AHG100', d: 'Aluminum Gold ITEM 0', q: 20, pq: 20, ok: true, p: 2.5, t: 'A' }, { c: 'FLSIDE52', d: 'FL INT #52 - BODY J - CHIN (66PC)', q: 1, pq: 1, ok: true, p: 198, t: 'A', kit: [{ c: 'AHG100', q: 6 }, { c: 'AHG105', q: 6 }] }, { c: 'AHG105', d: 'Aluminum Gold ITEM 5', q: 10, pq: 10, ok: true, p: 3.75, t: 'A' }];";
  const pg = await br.newPage({ viewport: { width: 1200, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'office@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', 'let u = s.users.find(x => x.id === "office@theonefl.com"); if (!u) { u = { id: "office@theonefl.com", email: "office@theonefl.com", name: "X", active: true }; s.users.push(u); } u.role = "manager"; u.job = "invoice";' + o.seed); }, { seed: SEED });
  await pg.goto('http://127.0.0.1:8830/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300);
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mInv', { timeout: 8000 }).catch(() => errs.push('order screen (picked) should offer invoice'));
  /* ③ 화면 픽킹 목록 구분줄 */
  await pg.waitForFunction(() => document.querySelectorAll('#mLines tr.pkg').length && ![...document.querySelectorAll('#mLines tr.pkg')].some(x => /NO CATEGORY/.test(x.textContent)), null, { timeout: 6000 }).catch(() => errs.push('③ screen groups should get category names once the catalog is loaded'));
  const seps = await pg.$$eval('#mLines tr.pkg', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())); log('③ screen groups:', seps.join(' | '));
  if (seps.length < 3 || !/^A SET ORDER/.test(seps[0])) errs.push('③ screen list starts with the A › SET ORDER group then other groups (got ' + seps.join(' | ') + ')');
  const order = await pg.$$eval('#mLines tr:not(.pkg) td:first-child b', e => e.map(x => x.textContent)); log('③ screen order:', order.join(' '));
  if (order.join(' ') !== 'FLSIDE52 AHG100 AHG105 EB103') errs.push('③ screen order: set → jewelry → other (got ' + order.join(' ') + ')');
  /* ③ ④ 피킹 리스트 인쇄 */
  await pg.click('#mPickPrint'); await pg.waitForSelector('#prt.on'); await pg.waitForTimeout(300);
  const P = await pg.evaluate(() => { const b = document.getElementById('prtbody'); return { types: [...b.querySelectorAll('tr.pktype')].map(x => x.textContent.trim()), cats: [...b.querySelectorAll('tr.pkcat')].map(x => x.textContent.trim()), codes: [...b.querySelectorAll('tbody tr:not(.pktype):not(.pkcat):not(.fin) td:nth-child(3) b')].map(x => x.textContent) }; }); log('④ print:', JSON.stringify(P));
  if (P.types.length !== 2 || !/JEWELRY.*TYPE A/.test(P.types[0]) || !/TYPE P/.test(P.types[1])) errs.push('④ picking list has a Jewelry (A) section then an Other (P) section');
  if (!P.cats.length || !/^SET ORDER/.test(P.cats[0])) errs.push('③ first category header is SET ORDER (got ' + P.cats[0] + ')');
  if (P.codes.join(' ') !== 'FLSIDE52 AHG100 AHG105 EB103') errs.push('③ printed order set → jewelry → other (got ' + P.codes.join(' ') + ')');
  await pg.click('#prtClose'); await pg.waitForTimeout(200);
  /* ⑤ 할인 바꾸기 → 확정 */
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk');
  const d0 = await pg.$$eval('[data-ivd]', e => e.map(x => x.dataset.ivd + '=' + x.value)); log('⑤ discounts:', d0.join(' '));
  if (!d0.includes('A=10') || !d0.includes('P=0')) errs.push('⑤ confirm modal shows editable discount per type (A 10 from the store default, P 0)');
  await pg.fill('[data-ivd="A"]', '15'); await pg.press('[data-ivd="A"]', 'Tab'); await pg.waitForSelector('#ivOk'); await pg.waitForTimeout(300);
  const d1 = await pg.$$eval('[data-ivd]', e => e.map(x => x.dataset.ivd + '=' + x.value)); const totA = await pg.evaluate(() => { const r = [...document.querySelectorAll('#mbox table tr')].find(tr => tr.querySelector('[data-ivd="A"]')); return r ? r.lastElementChild.textContent : ''; }); log('⑤ after change:', d1.join(' '), 'A total', totA);
  if (!d1.includes('A=15')) errs.push('⑤ the modal re-renders with A 15%'); if (totA !== '$242.80') errs.push('⑤ A total = 20×2.13 + 168.30 + 10×3.19 = $242.80 (unit price rounded, got ' + totA + ')');
  await pg.click('#ivOk'); await pg.waitForTimeout(1500);
  const R = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const inv = Object.values(M.invoices || {}); const o = M.orders['O261014-AAAA']; const acc = Object.values(M.accounts || {}).find(a => a.acct === '3001'); return { invs: inv.map(i => ({ no: i.no, t: i.t, disc: i.disc, sub: i.sub, total: i.total })), disc: o.disc, discChg: o.discChg, accDisc: acc && acc.disc }; }); log('⑤ saved:', JSON.stringify(R));
  const ia = R.invs.find(i => i.t === 'A'), ip = R.invs.find(i => i.t === 'P');
  if (!ia || ia.disc !== 15 || Math.abs(ia.total - 242.8) > 0.01) errs.push('⑤ invoice A saved with 15% and total 242.80'); if (!ip || ip.disc !== 0) errs.push('⑤ invoice P keeps 0%');
  if (!R.disc || R.disc.A !== 15 || !R.discChg) errs.push('⑤ order keeps disc A 15 and discChg'); if (!R.accDisc || R.accDisc.A !== 10) errs.push('⑤ store default discount unchanged (10)');
  /* ① ② 인보이스 문서 (확정 뒤 인쇄 창) */
  if (await pg.$('#prt.on')) {
    const V = await pg.evaluate(() => { const b = document.getElementById('prtbody'); const iv = [...b.querySelectorAll('.iv')]; return iv.map(d => ({ groups: [...d.querySelectorAll('tr.ivgh')].map(x => x.textContent.trim()), kitrows: d.querySelectorAll('tr.ivkitrow').length, setline: !!d.querySelector('.ivkit') })); }); log('①② invoice docs:', JSON.stringify(V));
    const A = V.find(v => v.groups.some(g => /SET ORDER/.test(g)));
    if (!A) errs.push('① the jewelry invoice has a SET ORDER group'); else { if (!/SET ORDER/.test(A.groups[0])) errs.push('① SET ORDER group is first (got ' + A.groups.join(' | ') + ')'); if (A.kitrows) errs.push('② set contents are not expanded by default'); if (!A.setline) errs.push('② set line shows its contents in small text'); }
    await pg.click('#prtClose');
  } else errs.push('①② invoice print should open after confirm');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
