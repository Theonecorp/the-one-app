/* v0.8.179 시험 — ↩ 크레딧은 가게 기록 · 인보이스에 바로 적용(오피스 매니저 · 관리자만) · 한도 기본 10000 (2026-11-10 관리자)
 *   ① 크레딧 한 장 한도 기본값 10000 (settings.creditMax 가 없을 때)
 *   ② 오피스 매니저: 크레딧 상세에 ↩ 인보이스에 바로 적용 — 누른 순서대로 남은 크레딧을 채움. 앱 인보이스 50 + AR 인보이스 50 → 크레딧 −100 이 0
 *      · 앱 인보이스 문서 pays['CM:…'] · 잔액이 줄고, AR 인보이스는 가게 창(storeInfo) · 수금 고르기(openInvoices) 잔액에서 빠짐 · 가게 창 수금 목록에 CREDIT 줄
 *   ③ 세일즈맨 · 회계 담당은 적용 단추가 없음
 *   ④ 적용 기록 ✕ 되돌리기 — AR 인보이스 잔액 · 남은 크레딧이 돌아옴
 *   ⑤ 수금 입력: 크레딧은 같이 고른 인보이스 금액까지만 씀 (인보이스 20 + 크레딧 −50 → 20 · −20, "일부만 씀") */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8836', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const seed = `const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(d)); };
    s.users = (s.users || []).concat([{ id: 'om@x.com', email: 'om@x.com', name: 'OM', role: 'manager', job: 'office', active: true }, { id: 'ac@x.com', email: 'ac@x.com', name: 'AC', role: 'manager', job: 'acct', active: true }]);
    const inv = (no, d, total) => ({ id: no, no, t: 'A', src: 'app', d, ym: d.substring(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total, bal: total, st: 'open', terms: 'N30', lines: [] });
    s.invoices = (s.invoices || []).concat([{ id: 'CM-000009', no: 'CM-000009', t: 'CM', kind: 'credit', src: 'credit', d: day(2), ym: day(2).substring(0, 7), acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', why: '대미지', lines: [{ c: 'AHG100', d: 'x', q: -40, p: 2.5, lp: 2.5 }], qty: -40, sub: -100, list: -100, disc: 0, total: -100, bal: -100, st: 'open', reviewed: false, createdBy: 'brandon@x.com', createdAt: new Date().toISOString() },
      inv('A-010099', day(1), 50), inv('A-010098', day(1), 20)]);`;
  const mk = async (email, w, extra) => { const pg = await (await br.newContext({ viewport: { width: w || 430, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: seed + (extra || '') }); await pg.goto('http://127.0.0.1:8836/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(300); return pg; };
  const openCm = async pg => { await pg.evaluate(() => { location.hash = '#/credit/CM-000009'; }); await pg.waitForSelector('#crPrint', { timeout: 8000 }); await pg.waitForTimeout(300); };
  /* ③ 세일즈맨 · 회계 담당 — 단추 없음 */
  for (const em of ['brandon@x.com', 'ac@x.com']) { const p = await mk(em); await openCm(p); const has = !!(await p.$('#crApply')); log('③', em, 'apply button:', has); if (has) errs.push('③ ' + em + ' must not see the apply-to-invoice button'); await p.context().close(); }
  /* ② ④ 오피스 매니저 — 화면에서 적용 · 되돌리기 (모듈 import 는 그 페이지 맨 끝에서만: 데모는 app.js 묶음이라 import 하면 앱이 하나 더 뜸) */
  const om = await mk('om@x.com', 1200);
  await openCm(om);
  if (!(await om.$('#crApply'))) errs.push('② office manager sees ↩ apply to invoices');
  else {
    await om.click('#crApply'); await om.waitForSelector('[data-apk]', { timeout: 8000 });
    const rows = await om.$$eval('[data-apk]', e => e.map(x => x.querySelector('b').textContent.replace(/\s+/g, ' ').trim())); log('② open invoices:', rows.join(' | '));
    const ix = no => rows.findIndex(r => r.startsWith(no));
    if (ix('A-010099') < 0 || ix('A10055') < 0 || rows.some(r => r.startsWith('CM-'))) errs.push('② the modal lists the store open invoices (app + AR), not the credit');
    await om.click('[data-apk="' + ix('A-010099') + '"]'); await om.waitForTimeout(200); await om.click('[data-apk="' + ix('A10055') + '"]'); await om.waitForTimeout(200);
    const vals = await om.$$eval('[data-apa]', e => e.map(x => x.value)); log('② fill:', vals.join(' | '));
    if (vals.join('|') !== '50.00|50.00') errs.push('② tapped order fill: 50 to A-010099, rest 50 to A10055 (got ' + vals.join('|') + ')');
    await om.click('#apGo'); await om.waitForTimeout(1500);
    let st = await om.evaluate(() => { const I = window.__MOCK_STORE__.invoices; return { cm: I['CM-000009'], a: I['A-010099'] }; });
    log('② CM:', JSON.stringify({ bal: st.cm.bal, apply: (st.cm.apply || []).map(a => a.no + ':' + a.amt + (a.ar ? ':AR' : '')), pays: st.cm.pays }), '· A-010099:', JSON.stringify({ bal: st.a.bal, pays: st.a.pays }));
    if (Math.abs(st.cm.bal) > 0.001 || (st.cm.apply || []).length !== 2 || !(st.cm.apply.find(a => a.no === 'A10055') || {}).ar) errs.push('② the −100 credit is fully used (bal 0, 2 applications, A10055 marked AR)');
    if (Math.abs(st.a.bal) > 0.001 || (st.a.pays || {})['CM:CM-000009'] !== 50) errs.push('② the app invoice gets pays CM:CM-000009 = 50 and balance 0');
    const hist = await om.$eval('#page', e => e.textContent); if (!/인보이스에 적용한 기록/.test(hist)) errs.push('② credit detail lists the applications');
    if (await om.$('#crApply')) errs.push('② no apply button once the credit is used up');
    /* ④ 되돌리기 (앱 인보이스 A-010099) */
    const k = await om.evaluate(() => (window.__MOCK_STORE__.invoices['CM-000009'].apply || []).findIndex(a => a.no === 'A-010099'));
    await om.click('[data-apx="' + k + '"]'); await om.waitForSelector('#cfOk'); await om.click('#cfOk'); await om.waitForTimeout(1500);
    st = await om.evaluate(() => { const I = window.__MOCK_STORE__.invoices; return { cm: I['CM-000009'], a: I['A-010099'] }; });
    log('④ after undo:', JSON.stringify({ cm: st.cm.bal, n: (st.cm.apply || []).length, a: st.a.bal, pays: st.a.pays }));
    if (Math.abs(st.cm.bal + 50) > 0.001 || st.cm.apply.length !== 1 || st.a.bal !== 50 || 'CM:CM-000009' in (st.a.pays || {})) errs.push('④ undo puts A-010099 back to 50 and the credit back to −50');
    /* 가게 창 (📒 인보이스 · 수금) — AR 인보이스 A10055 잔액 800 → 750 · 수금 목록에 CREDIT CM-000009 줄 */
    await om.evaluate(() => { location.hash = '#/order/new'; }); await om.waitForSelector('#eStoreQ'); await om.fill('#eStoreQ', 'ali'); await om.waitForTimeout(250); await om.click('#eStoreHits [data-ac="1111"]');
    await om.waitForSelector('[data-ipi]', { timeout: 8000 }).catch(() => {});
    const r55 = await om.$eval('.ipinv tr[data-ipi="A10055"]', r => [...r.children].map(td => td.textContent.trim())).catch(() => []);
    const crRow = await om.$$eval('.iptbl tr', T => T.map(r => r.textContent).filter(t => /CREDIT/.test(t) && /CM-000009/.test(t))).catch(() => []);
    log('② store window A10055:', JSON.stringify(r55), '· credit rows:', crRow.length); if (!/\$750\.00/.test(r55[3] || '') || crRow.length !== 1) errs.push('② store window: AR invoice A10055 balance 750 and a CREDIT CM-000009 payment row');
  }
  await om.context().close();
  /* ② 세일즈맨 수금 고르기 · ⑤ 크레딧은 고른 인보이스까지만 — 적용이 들어간 크레딧으로 시작 */
  const pg = await mk('brandon@x.com', 430, `const t = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date())), c = s.invoices.find(x => x.no === 'CM-000009'); Object.assign(c, { bal: -50, paid: -50, pays: { 'AP:A10055': -50 }, apply: [{ no: 'A10055', acct: '1111', amt: 50, d: t, by: 'om@x.com', ar: true }] });`);
  await pg.evaluate(() => { location.hash = '#/entry/new'; }); await pg.waitForSelector('#fAcct');
  await pg.fill('#fAcct', '1111'); await pg.waitForTimeout(400); await pg.waitForSelector('.apr', { timeout: 6000 });
  const picks = await pg.$$eval('.apr', e => e.map(x => x.querySelector('b').textContent.replace(/\s+/g, ' ').trim() + ' ' + x.querySelector('.ab').firstChild.textContent.trim())); log('② salesman picks:', picks.join(' | '));
  if (!picks.some(p => /^A10055 .*\$750\.00/.test(p)) || !picks.some(p => /^CM-000009 .*[-−]\$50\.00/.test(p))) errs.push('② salesman picks: A10055 750 (credit applied), credit −50 left');
  const idx = no => picks.findIndex(p => p.startsWith(no));
  await pg.click('.apr[data-pk="' + idx('A-010098') + '"]'); await pg.waitForTimeout(300); await pg.click('.apr[data-pk="' + idx('CM-000009') + '"]'); await pg.waitForTimeout(300);
  const amts = await pg.$$eval('[data-iamt]', e => e.map(x => x.value)); const part = await pg.$$eval('.part', e => e.filter(x => x.style.display !== 'none').map(x => x.textContent));
  log('⑤ alloc:', amts.join(' | '), '·', part.join(' / '));
  if (amts.join('|') !== '20.00|-20.00') errs.push('⑤ invoice 20 + credit −50 → 20.00 | -20.00 (got ' + amts.join('|') + ')');
  if (!part.some(t => /일부만 씀/.test(t))) errs.push('⑤ the credit row says it is partly used');
  const cmax = await pg.evaluate(async () => (await import('/src/credit.js')).creditMax()); log('① creditMax default:', cmax); if (cmax !== 10000) errs.push('① credit limit default is 10000 (got ' + cmax + ')');
  await pg.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
