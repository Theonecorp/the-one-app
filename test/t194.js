/* v0.8.187 시험 — 🏷 타사 제품 리턴은 가격으로 · ✍️ 직접 크레딧 (2026-11-11 관리자: "타 회사 제품은 가격으로 정리 — 1.99 · 2.49 · 2.99 ~ 9.49 · 9.99 … 39.99 · 특이사항은 크레딧을 수동으로")
 *   ① 크레딧 모드의 🏷 타사 제품 · 가격으로: $1.99 · $2.49 … $9.49 · $9.99 (0.50씩) 다음 $10.99 … $39.99 (1달러씩) · 누를 때마다 그 가격 줄 +1 (×N)
 *   ② ✍️ 직접: 설명 · 단가 · 수량 → 줄 하나 · 설명 없으면 막힘
 *   ③ 이 줄들은 가게 할인 · 🏷 할인 백을 빼지 않음 (우리 아이템 줄만 10% 백)
 *   ④ 사무실 확정 → CM 에 OB-1.99 · 직접 줄이 그 가격 그대로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8862', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 900 } });
  const open = async (email, store) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.store) window.__AFTER_SEED__ = s => { const D = JSON.parse(o.store); Object.keys(D).forEach(k => { s[k] = Object.values(D[k]); }); }; }, { email, store });
    await pg.goto('http://127.0.0.1:8862/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const sm = await open('brandon@x.com');
  await sm.evaluate(() => { location.hash = '#/order/credit'; }); await sm.waitForSelector('#eStoreQ', { timeout: 8000 }); await sm.fill('#eStoreQ', 'ali'); await sm.waitForTimeout(300); await sm.click('#eStoreHits [data-ac="1111"]'); await sm.waitForTimeout(900);
  if (await sm.$('#modal.on')) { await sm.click('#modal .mclose'); await sm.waitForTimeout(300); }
  /* ① */
  await sm.click('#eCrOther'); await sm.waitForSelector('#obGrid [data-obp]');
  const P = await sm.$$eval('#obGrid [data-obp]', B => B.map(b => b.dataset.obp)); log('① prices:', P.length, P.slice(0, 4).join(' '), '…', P.slice(15, 19).join(' '), '…', P[P.length - 1]);
  const want = []; for (let v = 199; v <= 999; v += 50) want.push((v / 100).toFixed(2)); for (let v = 1099; v <= 3999; v += 100) want.push((v / 100).toFixed(2));
  if (P.join() !== want.join()) errs.push('① price buttons 1.99 … 9.99 by 0.50 then 10.99 … 39.99 by 1.00');
  await sm.click('[data-obp="1.99"]'); await sm.click('[data-obp="1.99"]'); await sm.click('[data-obp="9.99"]'); await sm.waitForTimeout(150);
  const b199 = (await sm.textContent('[data-obp="1.99"]')).replace(/\s+/g, ' '); log('① $1.99 button:', b199); if (!/×2/.test(b199)) errs.push('① two taps → ×2');
  /* ② */
  await sm.fill('#obP', '12.50'); await sm.click('#obAdd'); await sm.waitForTimeout(150); const t2 = await sm.textContent('#toast').catch(() => ''); if (!/설명/.test(t2)) errs.push('② manual line needs a description');
  await sm.waitForTimeout(600);   /* 파란 단추 두 번 누름 막기(0.45초) — 사람이 설명을 적는 시간 */
  await sm.fill('#obD', 'WIG RETURN'); await sm.fill('#obP', '12.50'); await sm.fill('#obQ', '2'); await sm.click('#obAdd'); await sm.waitForTimeout(150);
  const man = (await sm.textContent('#obMan')).replace(/\s+/g, ' '); log('② manual:', man); if (!/WIG RETURN · 2 × \$12\.50 = \$25\.00/.test(man)) errs.push('② manual line WIG RETURN 2 × $12.50');
  await sm.click('#obDone'); await sm.waitForTimeout(300);
  /* 우리 아이템 하나 + 10% 할인 백 */
  await sm.fill('#eQ1', 'AHG100'); await sm.waitForTimeout(500); await sm.click('#eRes [data-gc="AHG100"], #eRes tr[data-frow="AHG100"] td.ct'); await sm.waitForTimeout(250);
  await sm.click('[data-ev="memo"]'); await sm.waitForSelector('[data-ecw]'); await sm.click('[data-ecw="기타"]'); await sm.click('[data-ecd="10"]'); await sm.waitForTimeout(200);
  /* ③ 1.99×2 + 9.99 + 12.50×2 = 38.97 (할인 없음) + AHG100 2.50 × 0.9 = 2.25 → 41.22 */
  const amt = (await sm.textContent('#eA')).trim(); log('③ total:', amt); if (!/−\$41\.22/.test(amt)) errs.push('③ other-brand and manual lines keep their price; only our item gets 10% back → −$41.22');
  await sm.click('#eDraft'); await sm.waitForSelector('#cfOk', { timeout: 5000 }); await sm.click('#cfOk'); await sm.waitForTimeout(1500);
  const o = await sm.evaluate(() => { const M = window.__MOCK_STORE__, x = Object.values(M.orders).find(o => o.kind === 'credit'); return x && { id: x.id, amt: x.amt, lines: (M.orderLines[x.id] || {}).lines.map(l => l.c + ':' + l.q + '@' + l.p + ':' + l.t).join(' ') }; });
  log('③ saved:', JSON.stringify(o)); if (!o || o.amt !== -41.22 || !/OB-1\.99:2@1\.99:OB/.test(o.lines) || !/MAN-\w+:2@12\.5:OB/.test(o.lines)) errs.push('③ saved −$41.22 with OB-1.99 ×2 and the manual line');
  /* ④ 보내기 → 사무실 확정 */
  await sm.evaluate(() => { location.hash = '#/order'; }); await sm.waitForSelector('#oSendAll', { timeout: 8000 }); await sm.click('#oSendAll'); await sm.waitForTimeout(400); if (await sm.$('#cfOk')) await sm.click('#cfOk'); await sm.waitForTimeout(1500);
  const store = await sm.evaluate(() => { const M = window.__MOCK_STORE__; const o = {}; ['orders', 'orderLines', 'invoices', 'counters'].forEach(k => { o[k] = {}; Object.entries(M[k] || {}).forEach(([id, d]) => { o[k][id] = Object.assign({ id }, d); }); }); return JSON.stringify(o); });
  const of = await open('luke@theonefl.com', store);
  await of.evaluate(id => { location.hash = '#/order/' + id; }, o.id); await of.waitForSelector('#crrOk', { timeout: 8000 });
  await of.click('#crrOk'); await of.waitForSelector('#cfOk'); await of.click('#cfOk'); await of.waitForTimeout(1500);
  const cm = await of.evaluate(id => { const x = Object.values(window.__MOCK_STORE__.invoices || {}).find(v => v.fromOrder === id); return x && { total: x.total, lines: x.lines.map(l => l.c + ':' + l.q + '@' + l.p).join(' ') }; }, o.id);
  log('④ CM:', JSON.stringify(cm));
  if (!cm || cm.total !== -41.22 || !/OB-1\.99:-2@1\.99/.test(cm.lines) || !/OB-9\.99:-1@9\.99/.test(cm.lines) || !/MAN-\w+:-2@12\.5/.test(cm.lines) || !/AHG100:-1@2\.25/.test(cm.lines)) errs.push('④ CM keeps the price lines as they are (−$41.22)');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
