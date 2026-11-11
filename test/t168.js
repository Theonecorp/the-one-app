/* v0.8.177 시험 — ↩ 크레딧 손질: 🏷 할인 백 % · 🕘 최근 인보이스에서 여러 줄 한 번에 · 📋 코드 · 수량 붙여넣기 · 주문 ↔ 크레딧 같은 가게로 바로 · 사무실 할인 백 다시 적용
 *   ① 세일즈맨: 가게(기본 할인 없음) → 🏷 10% → 코드로 담은 줄이 목록가 × 0.9 · 📋 붙여넣기("코드 수량" 여러 줄 · 모르는 코드는 알림) · 🕘 인보이스(할인 20%)에서 체크 · 수량 고쳐 담기 → 그 인보이스 가격(할인 뺀 값)
 *      확정 → CM 문서에 dback 10 · 줄 가격 · ⚠️ "할인 백 10% (가게 기본 0%)" 표시
 *   ② 사무실: 확인 전 크레딧에 🏷 할인 백 적용 15% → 모든 줄 목록가 × 0.85 · 합계 다시 · dback 15
 *   ③ 주문 화면 ↩ 크레딧 → 같은 가게가 채워진 크레딧 화면 · 크레딧 상세 🛒 이 가게 주문 → 같은 가게가 채워진 주문 화면 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8833', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = `s.accounts.forEach(a => { if (a.acct === '1111') delete a.disc; });
    s.invoices = (s.invoices || []).concat([{ id: 'A-000501', no: 'A-000501', t: 'A', d: '2026-10-20', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'AL GOLD 0', q: 6, p: 2.5, lp: 2.5 }, { c: 'AHG105', d: 'AL GOLD 5', q: 4, p: 3.75, lp: 3.75 }], qty: 10, sub: 30, list: 30, disc: 20, total: 24, bal: 24, st: 'open' }]);`;
  const mk = async (email, w, extra) => { const pg = await (await br.newContext({ viewport: { width: w || 430, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: seed + (extra || '') }); await pg.goto('http://127.0.0.1:8833/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg; };
  const lines = pg => pg.evaluate(() => [...document.querySelectorAll('[data-crl]')].map(el => ({ c: el.dataset.crl, q: Number(el.querySelector('[data-crq]').value), p: Number(el.querySelector('[data-crp]').value) })));
  /* ① 세일즈맨 */
  let pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/credit/new'; }); await pg.waitForSelector('#crStore', { timeout: 8000 });
  await pg.fill('#crStore', 'ali'); await pg.waitForSelector('#crHits [data-a="1111"]'); await pg.click('#crHits [data-a="1111"]'); await pg.waitForTimeout(800);
  await pg.click('[data-crw="기타"]');
  const chips = await pg.$$eval('[data-crdb]', e => e.map(x => x.dataset.crdb)); log('① discount chips:', chips.join(' ')); if (!chips.includes('10') || !chips.includes('')) errs.push('① discount-back chips (store default · 10%)');
  await pg.click('[data-crdb="10"]'); await pg.waitForTimeout(200);
  await pg.fill('#crItem', 'AHG110'); await pg.press('#crItem', 'Enter'); await pg.waitForTimeout(300);
  let L = await lines(pg); const l110 = L.find(l => l.c === 'AHG110'); log('① AHG110:', JSON.stringify(l110)); if (!l110 || Math.abs(l110.p - 2.93) > 0.011) errs.push('① a typed item is priced list × 0.9 (3.25 → 2.93)');
  /* 📋 붙여넣기 */
  await pg.click('#crPaste'); await pg.waitForSelector('#crPT'); await pg.fill('#crPT', 'AHG125 2\nAHG120\nZZZ999 3'); await pg.waitForTimeout(400);
  const po = await pg.textContent('#crPO'); log('① paste preview:', po.replace(/\s+/g, ' ')); if (!/2줄|2 ok/.test(po) || !/ZZZ999/.test(po)) errs.push('① paste preview counts 2 known lines and names the unknown code');
  await pg.click('#crPOk'); await pg.waitForTimeout(400);
  L = await lines(pg); const l115 = L.find(l => l.c === 'AHG125'), l120 = L.find(l => l.c === 'AHG120'); log('① after paste:', JSON.stringify(L));
  if (!l115 || l115.q !== 2 || Math.abs(l115.p - 3.15) > 0.011) errs.push('① pasted AHG125 ×2 at 3.50 × 0.9'); if (!l120 || l120.q !== 1) errs.push('① pasted AHG120 with default qty 1');
  /* 🕘 인보이스에서 */
  await pg.click('#crFromInv'); await pg.waitForSelector('[data-cri="0"]'); await pg.click('[data-cri="0"]'); await pg.waitForSelector('#criAdd');
  await pg.click('#criAll'); await pg.fill('[data-crkq="1"]', '2'); await pg.click('#criAdd'); await pg.waitForTimeout(400);
  L = await lines(pg); const l100 = L.find(l => l.c === 'AHG100'), l105 = L.find(l => l.c === 'AHG105'); log('① after invoice pick:', JSON.stringify([l100, l105]));
  if (!l100 || l100.q !== 6 || Math.abs(l100.p - 2.0) > 0.011) errs.push('① AHG100 ×6 at the invoice price after 20% (2.00)'); if (!l105 || l105.q !== 2 || Math.abs(l105.p - 3.0) > 0.011) errs.push('① AHG105 qty edited to 2 at 3.00');
  /* 할인 백을 바꿔도 인보이스 가격 줄은 그대로 */
  await pg.click('[data-crdb="5"]'); await pg.waitForTimeout(200); L = await lines(pg);
  if (Math.abs(L.find(l => l.c === 'AHG100').p - 2.0) > 0.011) errs.push('① invoice-priced lines keep their price when the discount back changes'); if (Math.abs(L.find(l => l.c === 'AHG110').p - 3.09) > 0.011) errs.push('① typed lines follow the new 5% (3.09)');
  await pg.click('[data-crdb="10"]'); await pg.waitForTimeout(200);
  await pg.click('#crGo'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const cm = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.invoices || {}).find(x => x.src === 'credit')); log('① saved:', JSON.stringify(cm && { no: cm.no, dback: cm.dback, total: cm.total, flags: cm.flags, lines: cm.lines.map(l => l.c + '×' + l.q + '@' + l.p + '/' + l.src) }));
  /* 2.93 + 2×3.15 + 3.60 + 6×2.00 + 2×3.00 = 2.93 + 6.30 + 3.60 + 12 + 6 = 30.83 */
  if (!cm || cm.dback !== 10 || Math.abs(cm.total + 30.83) > 0.011) errs.push('① CM saved with dback 10 and total −30.83 (got ' + (cm && cm.total) + ')');
  if (!cm || !(cm.flags || []).some(f => /할인 백 10%/.test(f))) errs.push('① office flag shows the discount back vs store default');
  /* ③ 크레딧 상세 → 🛒 이 가게 주문 */
  await pg.waitForSelector('#crOrder', { timeout: 6000 }).catch(() => errs.push('③ credit detail has 🛒 order for this store'));
  if (await pg.$('#crOrder')) { await pg.click('#crOrder'); await pg.waitForTimeout(1200); const st = await pg.evaluate(() => (document.querySelector('.estore b') || {}).textContent || ''); log('③ order store:', st); if (!/ALI B\/S # 1/.test(st)) errs.push('③ the order editor opens with the same store'); }
  /* ③ 주문 화면 ↩ 크레딧 → 같은 가게 */
  await pg.waitForSelector('#eStoreCr', { timeout: 6000 }).catch(() => errs.push('③ order editor has ↩ 크레딧'));
  /* v0.8.187: 세일즈맨은 ↩ 크레딧도 주문처럼 — 같은 가게로 크레딧 모드 주문 화면 (t193) */
  if (await pg.$('#eStoreCr')) { await pg.click('#eStoreCr'); await pg.waitForSelector('#eCrBan', { timeout: 6000 }).catch(() => {}); await pg.waitForTimeout(800); const v = await pg.evaluate(() => (document.querySelector('.estore b') || {}).textContent || ''); log('③ credit store:', v); if (!/ALI B\/S # 1/.test(v) || !(await pg.$('#eCrBan'))) errs.push('③ ↩ 크레딧 opens the credit (order-style) screen with the same store'); }
  await pg.context().close();
  /* ② 사무실 다시 적용 */
  const of = await mk('luke@theonefl.com', 1100, cm ? 's.invoices = (s.invoices || []).concat([' + JSON.stringify(cm) + ']);' : '');
  if (cm) {
    await of.evaluate(no => { location.hash = '#/credit/' + encodeURIComponent(no); }, cm.no);
    await of.waitForSelector('#crRedisc', { timeout: 8000 }).catch(() => errs.push('② office sees 🏷 할인 백 적용 on an unreviewed credit'));
    if (await of.$('#crRedisc')) {
      await of.click('#crRedisc'); await of.waitForSelector('[data-rdb="15"]'); await of.click('[data-rdb="15"]'); await of.waitForTimeout(100); await of.click('#rdbGo'); await of.waitForTimeout(900);
      const x = await of.evaluate(no => window.__MOCK_STORE__.invoices[no], cm.no); log('② after 15%:', JSON.stringify({ dback: x.dback, total: x.total, lines: x.lines.map(l => l.c + '×' + l.q + '@' + l.p) }));
      /* 모든 줄 = 목록가 × 0.85 (반올림) — 기대 합계는 저장된 목록가로 계산 */
      const exp = -Math.round(x.lines.reduce((a, l) => a + Math.abs(l.q) * Math.round(l.lp * 0.85 * 100) / 100, 0) * 100) / 100;
      if (x.dback !== 15 || Math.abs(x.total - exp) > 0.011 || x.lines.some(l => Math.abs(l.p - Math.round(l.lp * 0.85 * 100) / 100) > 0.011)) errs.push('② re-applied 15% → every line list × 0.85, total ' + exp + ' (got ' + x.total + ')');
    }
  }
  await of.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
