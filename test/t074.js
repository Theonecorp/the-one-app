/* v0.8.86 시험 — 수금 흐름 ④⑤: 💳 COD·카드 입력 안전장치 (미결 인보이스 칩 · 카드 승인번호 필수 · 금액≠합 · 겹침 경고) · 🧮 정산 대조 (걸리는 것 · 담당자 기록 대조 · 확정 전 확인) · 💼 급여제 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8808', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 430, height: 1000 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8808/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  /* ---- ④ 회계 담당: 💳 COD · 카드 입력 ---- */
  let pg = await mk('acct@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/cod'; }); await pg.waitForSelector('#btnCodNew', { timeout: 8000 });
  await pg.click('#btnCodNew'); await pg.waitForSelector('#cSave');
  /* 카드 → 승인번호 필수 */
  await pg.click('#cM [data-m="CREDIT CARD"]'); await pg.waitForTimeout(200);
  const refL = await txt(pg, '#cRefL'); log('ref label (card):', refL); if (!/승인번호|Auth/.test(refL)) errs.push('card ref label should say auth #');
  await pg.selectOption('#cSm', 'BRANDON'); await pg.fill('#cStore', 'ALI B'); await pg.waitForSelector('#cHits [data-a="1111"]'); await pg.click('#cHits [data-a="1111"]');
  await pg.waitForSelector('#cOpen [data-oi]', { timeout: 8000 }).catch(() => errs.push('open invoice chips should appear after picking the store'));
  const chips = await pg.$$eval('#cOpen [data-oi]', b => b.map(x => x.dataset.oi + '=' + x.textContent.replace(/\s+/g, ' ').trim())); log('chips:', chips);
  if (!chips.some(c => /A10055/.test(c) && /800/.test(c))) errs.push('A10055 with $800 balance should be offered');
  if (chips.some(c => /A10021/.test(c))) errs.push('A10021 is paid by E1 — should not be offered');
  await pg.click('#cOpen [data-oi="A10055"]'); await pg.waitForTimeout(200);
  const row0 = await pg.evaluate(() => [document.querySelector('[data-cno="0"]').value, document.querySelector('[data-camt="0"]').value, document.getElementById('cAmt').value]); log('row after chip:', row0);
  if (row0[0] !== 'A10055' || Number(row0[1]) !== 800 || Number(row0[2]) !== 800) errs.push('chip should fill invoice no, balance and amount');
  if (await pg.$('#cOpen [data-oi="A10055"]')) errs.push('used chip should disappear');
  await pg.click('#cSave'); await pg.waitForTimeout(400);
  if (await pg.$('#cfOk')) errs.push('card without auth # should be blocked by toast, not confirm');
  const n0 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.cod).filter(x => !x.void).length); if (n0 !== 2) errs.push('card w/o auth should not be saved');
  /* 금액 ≠ 인보이스 합 → 확인 창 */
  await pg.fill('#cRef', '884412'); await pg.fill('#cAmt', '750'); await pg.waitForTimeout(150);
  const sumL = await txt(pg, '#cSum'); log('sum line:', sumL); if (!/≠/.test(sumL)) errs.push('sum line should flag amount ≠ invoice sum');
  await pg.click('#cSave'); await pg.waitForSelector('#cfOk', { timeout: 3000 }).catch(() => errs.push('amount ≠ sum should ask'));
  const q1 = await txt(pg, '.ovr h2'); log('ask:', q1.slice(0, 80)); if (!/750/.test(q1) || !/800/.test(q1)) errs.push('ask should show both amounts');
  await pg.click('#cfNo'); await pg.waitForTimeout(300);
  /* 겹침: A10021 은 E1 (현장 수금) 에 이미 들어가 있음 */
  await pg.fill('#cAmt', '800'); await pg.click('#cMore'); await pg.fill('[data-cno="1"]', 'A10021'); await pg.fill('[data-camt="1"]', '0'); await pg.fill('#cAmt', '800');
  await pg.click('#cSave'); await pg.waitForSelector('#cfOk', { timeout: 3000 }).catch(() => errs.push('duplicate invoice should ask'));
  const q2 = await txt(pg, '.ovr h2'); log('dup ask:', q2.slice(0, 120)); if (!/A10021/.test(q2) || !/현장/.test(q2)) errs.push('dup ask should name the field payment');
  await pg.click('#cfOk'); await pg.waitForTimeout(800);
  const saved = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.cod).filter(x => !x.void && x.method === 'CREDIT CARD')[0]); log('saved:', saved && [saved.sm, saved.acct, saved.ref, saved.amt, (saved.invs || []).map(v => v.no).join(',')]);
  if (!saved || saved.ref !== '884412' || saved.acct !== '1111' || saved.amt !== 800) errs.push('card payment should save after confirm');
  /* 같은 날 · 같은 가게 · 같은 금액 → 경고 */
  await pg.click('#btnCodNew'); await pg.waitForSelector('#cSave'); await pg.selectOption('#cSm', 'BRANDON'); await pg.fill('#cStore', 'ALI B'); await pg.waitForSelector('#cHits [data-a="1111"]'); await pg.click('#cHits [data-a="1111"]'); await pg.waitForTimeout(600);
  await pg.fill('#cAmt', '800'); await pg.click('#cSave'); await pg.waitForSelector('#cfOk', { timeout: 3000 }).catch(() => errs.push('same day/store/amount should ask'));
  const q3 = await txt(pg, '.ovr h2'); log('same ask:', q3.slice(0, 80)); if (!/같은 날|Same store/.test(q3)) errs.push('same-day ask text'); await pg.click('#cfNo'); await pg.waitForTimeout(200);
  await pg.close();
  /* ---- ⑤ 루크: 🧮 정산 대조 · 💼 급여제 ---- */
  const seed = `const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().substring(0, 10); };
    s.entries.forEach(e => { if (e.id === 'E2') { e.env = 'V251001-001'; e.envAt = d(-2); } });
    s.cod.forEach(c => { if (c.id === 'C1') { c.method = 'CREDIT CARD'; c.ref = ''; } });
    s.salesmen.forEach(x => { if (x.code === 'KAEL') x.salaried = true; });
    s.entries.push(Object.assign({}, s.entries[2], { id: 'E9', sm: 'KAEL', acct: '1111', store: 'ALI B/S # 1', sb: true, rc: true, v: true, mismatch: '', total: 500, pays: [{ m: 'CHECK', ref: '77', amt: 500 }], invs: [{ no: 'A10021', t: 'A', amt: 500 }] }));`;
  pg = await mk('luke@theonefl.com', seed);
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pSm', { timeout: 8000 });
  const cards = await txt(pg, '#pOut'); log('cards:', cards.slice(0, 160)); if (!/KAEL.*급여제/.test(cards)) errs.push('salaried tag should show on the all-salesmen table');
  await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('#recBox', { timeout: 8000 }).catch(() => errs.push('recBox missing'));
  const rec = await txt(pg, '#recBox'); log('rec:', rec.slice(0, 400));
  if (!/걸리는 것 (\d+)건/.test(rec)) errs.push('blockers box missing');
  if (!/봉투로 보냈지만/.test(rec)) errs.push('E2 (env, not rc) should be listed as in transit');
  if (!/아직 회사로 안 보낸 체크/.test(rec)) errs.push('E1 (no env) should be listed as not sent');
  if (!/카드 승인번호 없음/.test(rec)) errs.push('C1 card without auth should be flagged');
  if (!/확인 안 된 COD/.test(rec)) errs.push('unverified cod should be flagged');
  /* 담당자 기록 대조 */
  const sysN = Number((rec.match(/합계\s*(\d+)건/) || [])[1]); log('sys n:', sysN);
  await pg.fill('#recN', String(sysN + 1)); await pg.fill('#recAmt', '1'); await pg.waitForTimeout(200);
  let out = await txt(pg, '#recOut'); log('recOut diff:', out.slice(0, 80)); if (!/차이/.test(out) || !/\+1건/.test(out)) errs.push('mismatch should show a diff');
  const sysAmt = await pg.evaluate(() => document.getElementById('recAmt').placeholder);
  await pg.fill('#recN', String(sysN)); await pg.fill('#recAmt', sysAmt); await pg.waitForTimeout(200);
  out = await txt(pg, '#recOut'); log('recOut ok:', out.slice(0, 80)); if (!/일치/.test(out)) errs.push('matching numbers should show 일치');
  /* 확정: 걸리는 것이 있으면 확인 체크 전엔 못 누름 */
  await pg.click('#pAll'); await pg.waitForTimeout(1200); await pg.waitForSelector('#pConfirm:not([disabled])', { timeout: 5000 }).catch(() => errs.push('confirm should enable after ✓ all'));
  await pg.click('#pConfirm'); await pg.waitForSelector('#cfGo', { timeout: 3000 });
  const dis = await pg.evaluate(() => document.getElementById('cfGo').disabled); if (!dis) errs.push('cfGo should be disabled until blockers acknowledged');
  const ask = await txt(pg, '#modal, .modal'); if (!/걸리는 것/.test(ask) || !/일치/.test(ask)) errs.push('confirm modal should show blockers and rec result');
  await pg.click('#cfAck'); await pg.waitForTimeout(150); if (await pg.evaluate(() => document.getElementById('cfGo').disabled)) errs.push('cfGo should enable after ack');
  await pg.click('#cfGo'); await pg.waitForTimeout(2000);
  const st = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.settlements || {}).find(x => x.sm === 'BRANDON' && x.kind)); log('settlement:', st && [st.sm, st.kind, st.blockers, st.rec && st.rec.ok, st.pay]);
  if (!st || st.kind !== 'comm' || !(st.blockers > 0) || !st.rec || !st.rec.ok) errs.push('settlement should carry kind/blockers/rec');
  /* 💼 급여제 KAEL */
  await pg.click('#prtClose').catch(() => {}); await pg.waitForTimeout(300);
  await pg.selectOption('#pSm', 'KAEL'); await pg.waitForSelector('#recBox', { timeout: 8000 });
  const kp = await txt(pg, '#pOut'); log('kael:', kp.slice(0, 200));
  if (!/급여제/.test(kp) || !/커미션을 계산하지 않습니다/.test(kp)) errs.push('salaried banner missing');
  if (/지급액/.test(kp.split('🧮')[0])) errs.push('salaried hero should not show pay');
  const btn = await txt(pg, '#pConfirm'); log('btn:', btn); if (!/마감/.test(btn) || !/급여제/.test(btn)) errs.push('salaried confirm button should say 마감 (급여제)');
  await pg.click('#pConfirm'); await pg.waitForSelector('#cfGo', { timeout: 3000 }); await pg.waitForTimeout(100);
  if (await pg.evaluate(() => document.getElementById('cfGo').disabled)) await pg.click('#cfAck');
  await pg.click('#cfGo'); await pg.waitForTimeout(2000);
  const st2 = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.settlements || {}).find(x => x.sm === 'KAEL')); log('kael settlement:', st2 && [st2.kind, st2.pay, st2.finalPay, st2.n]);
  if (!st2 || st2.kind !== 'salary' || st2.pay !== 0 || st2.finalPay !== 0 || !(st2.n > 0)) errs.push('salaried settlement should be kind salary with 0 pay');
  if (await pg.evaluate(() => Object.values(window.__MOCK_STORE__.pay1099 || {}).some(x => x.who === 'KAEL'))) errs.push('salaried should not create 1099');
  const prt = await pg.evaluate(() => document.getElementById('prtbody').textContent.replace(/\s+/g, ' ')); if (!/급여제/.test(prt) || !/수금 기록/.test(prt)) errs.push('printed statement should say 급여제');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
