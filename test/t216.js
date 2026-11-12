/* v0.8.198 시험 — 🏷 타사 제품 크레딧은 소매가가 아니라 우리 판매가 · 할인도 빠짐 (2026-11-12 관리자: "크레딧이 판매가가 아닌 retail 가격으로 잡힘 · 9.99 가 5.00 으로 잡혀야" · "$5 · 10% 면 4.50 — 리턴 크레딧도 −4.50")
 *   ① 가격 단추에 판매가가 같이 보임 ($9.99 → $5.00) · 누르면 줄 단가 $5.00 (설명에 소매가)
 *   ② 할인 백을 안 골라도 가게 기본 할인(A 10%)이 빠짐 → $9.99 하나 = −$4.50
 *   ③ 🏷 할인 백 20% 를 고르면 −$4.00
 *   ⑤ 💎 바디 주얼리 칸: 우리 판매가를 바로 누름 ($2.00 단추에 "소매 $4.99") → 줄 OBB-2.00 @ 2.00 · 할인도 빠짐 (②: 4.50 + 1.80 = −$6.30 · ③: 4.00 + 1.60 = −$5.60)
 *   ④ 옛 요청(OB-9.99 가 소매가 9.99 로 담겨 보낸 것)도 사무실 확인 화면 · CM 에서 판매가 − 가게 할인: 2개 → −$9.00 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8886', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, oldReq) => { const pg = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = s => {
      s.accounts.find(a => a.acct === '1111').disc = { A: 10 };
      if (o.oldReq) { s.orders.push({ id: 'O261112-CRED', no: 'O261112-CRED', kind: 'credit', st: 'sent', d: '2026-11-12', ym: '2026-11', sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', why: '기타', disc: { A: 10 }, n: 1, qty: 2, amt: -19.98, createdBy: 'brandon@x.com', createdAt: '2026-11-12T10:00:00Z', sentAt: '2026-11-12T10:00:00Z' });
        s.orderLines.push({ id: 'O261112-CRED', sm: 'BRANDON', lines: [{ c: 'OB-9.99', d: '타사 제품 $9.99', q: 2, p: 9.99, lp: 9.99, t: 'OB' }] }); } }; }, { email, oldReq });
    await pg.goto('http://127.0.0.1:8886/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const sm = await open('brandon@x.com', false);
  await sm.evaluate(() => { location.hash = '#/order/credit'; }); await sm.waitForSelector('#eStoreQ', { timeout: 8000 }); await sm.fill('#eStoreQ', 'ali'); await sm.waitForTimeout(300); await sm.click('#eStoreHits [data-ac="1111"]'); await sm.waitForTimeout(900);
  if (await sm.$('#modal.on')) { await sm.click('#modal .mclose'); await sm.waitForTimeout(300); }
  /* ① */
  await sm.click('#eCrOther'); await sm.waitForSelector('#obGrid [data-obp]');
  const lbl = (await sm.textContent('[data-obp="9.99"]')).replace(/\s+/g, ' '); log('① $9.99 button:', lbl); if (!/\$9\.99.*→ \$5\.00/.test(lbl)) errs.push('① button shows $9.99 → $5.00');
  await sm.click('[data-obp="9.99"]'); await sm.waitForTimeout(150);
  /* ⑤ */
  const bl = (await sm.textContent('[data-obb="2.00"]')).replace(/\s+/g, ' '); log('⑤ body $2.00 button:', bl); if (!/\$2\.00.*\$4\.99/.test(bl)) errs.push('⑤ body jewelry $2.00 button notes retail $4.99');
  await sm.click('[data-obb="2.00"]'); await sm.waitForTimeout(150);
  await sm.click('#obDone'); await sm.waitForTimeout(300);
  const ln = await sm.evaluate(() => { const w = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /wip/i.test(k)) || '{}') || '{}'); return (w.lines || []).map(l => l.c + '@' + l.p + ' ' + l.d); }); log('① line:', JSON.stringify(ln));
  if (!ln.some(l => /^OB-9\.99@5 OTHER BRAND \(RETAIL \$9\.99\)/.test(l))) errs.push('① line unit is our price $5.00 (retail in the description)');
  if (!ln.some(l => /^OBB-2\.00@2 BODY JEWELRY/.test(l))) errs.push('⑤ body jewelry line OBB-2.00 @ 2.00');
  /* ② */
  const t1 = (await sm.textContent('#eA')).trim(); log('② total (store default 10%):', t1); if (!/−\$6\.30/.test(t1)) errs.push('② store default 10% → 4.50 + body 1.80 = −$6.30');
  /* ③ */
  await sm.click('[data-ev="memo"]'); await sm.waitForSelector('[data-ecd]'); await sm.click('[data-ecd="20"]'); await sm.waitForTimeout(200);
  const t2 = (await sm.textContent('#eA')).trim(); log('③ total (20% back):', t2); if (!/−\$5\.60/.test(t2)) errs.push('③ 20% back → 4.00 + body 1.60 = −$5.60');
  /* ④ */
  const of = await open('luke@theonefl.com', true);
  await of.evaluate(() => { location.hash = '#/order/O261112-CRED'; }); await of.waitForSelector('#crrOk', { timeout: 8000 }); await of.waitForTimeout(300);
  const hero = (await of.textContent('.hero')).trim(); log('④ review total:', hero); if (!/−\$9\.00/.test(hero)) errs.push('④ old request shows −$9.00 (2 × $5.00 − 10%)');
  await of.click('#crrOk'); await of.waitForSelector('#cfOk'); await of.click('#cfOk'); await of.waitForTimeout(1500);
  const cm = await of.evaluate(() => { const x = Object.values(window.__MOCK_STORE__.invoices || {}).find(v => v.fromOrder === 'O261112-CRED'); return x && { total: x.total, lines: x.lines.map(l => l.c + ':' + l.q + '@' + l.p).join(' ') }; });
  log('④ CM:', JSON.stringify(cm)); if (!cm || cm.total !== -9 || !/OB-9\.99:-2@4\.5\b/.test(cm.lines)) errs.push('④ CM OB-9.99 −2 @ 4.50 = −$9.00');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
