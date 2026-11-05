/* v0.8.166 시험 — 🛡 COD · 카드 · ACH 입력도 수금 입력처럼: 가게를 고르면 미결 인보이스가 칩으로 뜨고, 탭하면 번호 · 잔액이 줄에 그대로 들어감 · 줄의 번호 · 금액이 미결 인보이스와 다르면 표시하고 저장 때 한 번 더 물음
 *   ① COD · 카드: 칩 탭 → 번호 · 잔액 · 금액 자동 → 금액을 바꾸면 "≠ 미결 잔액" 표시 · 미결 목록에 없는 번호는 "없음" 표시 → 저장 때 확인 창에 둘 다 적힘(취소하면 저장 안 됨) → 맞게 고치면 표시 없이 저장
 *   ② ACH: 가게 고르면 칩 → 탭하면 줄 · 합계 → 금액을 바꾸면 표시 → 저장 확인 창에 적힘(취소) → 맞게 고치면 경고 없이 저장, 줄 금액 = 잔액 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8888', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; });
  await pg.goto('http://127.0.0.1:8888/test/demo.html'); await pg.waitForSelector('#nav button');
  const txt = async q => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const dlg = async () => (await pg.evaluate(() => { const o = document.querySelector('.ovr'); return (o ? o.textContent : (document.getElementById('mbox') || {}).textContent) || ''; })).replace(/\s+/g, ' ');
  const setVal = async (q, v) => { await pg.fill(q, String(v)); await pg.dispatchEvent(q, 'input'); await pg.waitForTimeout(80); };
  const norm = v => String(v || '').replace(/([A-Z]{1,3})-?0*(\d+)/g, '$1$2'), has = (t, no) => norm(t).includes(norm(no));   /* A10055 · A-010055 같은 번호 */
  const codN = () => pg.evaluate(() => Object.values(window.__MOCK_STORE__.cod || {}).filter(x => !x.void).length);
  /* ---------- ① COD · 카드 ---------- */
  await pg.evaluate(() => { location.hash = '#/cod'; }); await pg.waitForSelector('#btnCodNew', { timeout: 8000 }); await pg.click('#btnCodNew'); await pg.waitForSelector('#cSave');
  await pg.selectOption('#cSm', 'BRANDON'); await pg.fill('#cStore', 'ALI B'); await pg.waitForSelector('#cHits [data-a="1111"]'); await pg.click('#cHits [data-a="1111"]');
  await pg.waitForSelector('#cOpen [data-oi]', { timeout: 8000 });
  const chip = await pg.$eval('#cOpen [data-oi]', b => ({ no: b.dataset.oi, bal: Number(b.querySelector('.en').textContent.replace(/[^0-9.]/g, '')) })); log('① chip:', JSON.stringify(chip));
  await pg.click('#cOpen [data-oi="' + chip.no + '"]'); await pg.waitForTimeout(200);
  const r0 = await pg.evaluate(() => [document.querySelector('[data-cno="0"]').value, Number(document.querySelector('[data-camt="0"]').value), Number(document.getElementById('cAmt').value), document.getElementById('cChk').textContent.trim()]); log('① after chip:', JSON.stringify(r0));
  if (r0[0] !== chip.no || Math.abs(r0[1] - chip.bal) > 0.009 || Math.abs(r0[2] - chip.bal) > 0.009) errs.push('① tapping a chip must fill no · balance · amount'); if (r0[3]) errs.push('① no warning while the row equals the balance');
  await setVal('[data-camt="0"]', (chip.bal - 100).toFixed(2));
  const w1 = await txt('#cChk'); log('① after amount change:', w1); if (!has(w1, chip.no) || !w1.includes('≠')) errs.push('① changed amount must be flagged against the open balance');
  await pg.click('#cMore'); await setVal('[data-cno="1"]', 'A99999'); await setVal('[data-camt="1"]', '5');
  const w2 = await txt('#cChk'); log('① unknown number:', w2); if (!/A-?0*99999/.test(w2) || !/없음|not among/.test(w2)) errs.push('① a number not among the open invoices must be flagged');
  await setVal('#cAmt', (chip.bal - 100 + 5).toFixed(2));   /* 금액 = 인보이스 합 → "금액 ≠ 합" 창은 안 뜸 → 줄 검사 창이 떠야 */
  const n0 = await codN(); await pg.waitForTimeout(500); await pg.click('#cSave'); await pg.waitForSelector('#cfOk', { timeout: 5000 }).catch(() => errs.push('① mismatched rows must ask before saving'));
  const d1 = await dlg(); log('① ask:', d1.slice(0, 160)); if (!has(d1, chip.no) || !/A-?0*99999/.test(d1) || !d1.includes('≠')) errs.push('① the ask must list the changed amount and the unknown number');
  if (await pg.$('#cfNo')) { await pg.click('#cfNo'); await pg.waitForSelector('#cfNo', { state: 'detached', timeout: 5000 }).catch(() => {}); }
  await pg.waitForTimeout(300); if ((await codN()) !== n0) errs.push('① cancelling the ask must not save');
  /* 맞게 고침 → 표시 없음 → 저장 */
  await setVal('[data-cno="1"]', ''); await setVal('[data-camt="1"]', ''); await setVal('[data-camt="0"]', chip.bal.toFixed(2)); await setVal('#cAmt', chip.bal.toFixed(2));
  const w3 = await txt('#cChk'); if (w3) errs.push('① fixed rows must clear the warning (got ' + w3 + ')');
  await pg.waitForTimeout(500); await pg.click('#cSave'); await pg.waitForTimeout(600);
  for (let i = 0; i < 3 && await pg.$('#cfOk'); i++) { const t = await dlg(); log('① extra ask (other safeguard):', t.slice(0, 80)); if (t.includes('≠')) errs.push('① no mismatch ask when rows equal the balances'); await pg.click('#cfOk'); await pg.waitForTimeout(600); }
  const saved = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.cod || {}).filter(x => !x.void).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1)[0]); log('① saved:', saved && JSON.stringify([saved.acct, saved.amt, saved.invs]));
  if ((await codN()) !== n0 + 1 || !saved || Math.abs(saved.amt - chip.bal) > 0.009 || !saved.invs || norm(saved.invs[0].no) !== norm(chip.no) || Math.abs(saved.invs[0].amt - chip.bal) > 0.009) errs.push('① matching rows must save with the invoice balance');
  /* ---------- ② ACH ---------- */
  const achN = () => pg.evaluate(() => Object.values(window.__MOCK_STORE__.ach || {}).filter(x => !x.void).length);
  await pg.evaluate(() => { location.hash = '#/ach'; }); await pg.waitForSelector('[data-at="new"]', { timeout: 8000 }); await pg.click('[data-at="new"]'); await pg.waitForSelector('#aQ');
  await pg.fill('#aQ', '1111'); await pg.waitForTimeout(150); await pg.click('#aHits [data-a]'); await pg.waitForSelector('#aOpen [data-ao]', { timeout: 8000 }).catch(() => errs.push('② ACH must show open-invoice chips after picking the store'));
  const achip = await pg.$eval('#aOpen [data-ao]', b => ({ no: b.dataset.ao, bal: Number(b.querySelector('.en').textContent.replace(/[^0-9.]/g, '')) })).catch(() => null); log('② chip:', JSON.stringify(achip));
  if (achip) {
    await pg.click('#aOpen [data-ao="' + achip.no + '"]'); await pg.waitForTimeout(250);
    const a0 = await pg.evaluate(() => [document.querySelector('[data-lno="0"]').value, Number(document.querySelector('[data-lamt="0"]').value), document.getElementById('aTot').textContent, document.getElementById('aChk').textContent.trim(), !!document.querySelector('#aOpen [data-ao]') && Array.from(document.querySelectorAll('#aOpen [data-ao]')).map(b => b.dataset.ao)]); log('② after chip:', JSON.stringify(a0));
    if (a0[0] !== achip.no || Math.abs(a0[1] - achip.bal) > 0.009 || !a0[2].replace(/[^0-9.]/g, '').includes(achip.bal.toFixed(2).replace(/\.00$/, '').split('.')[0])) errs.push('② tapping a chip must fill the line and the total'); if (a0[3]) errs.push('② no warning while the line equals the balance'); if (Array.isArray(a0[4]) && a0[4].includes(achip.no)) errs.push('② used chip should disappear');
    await setVal('[data-lamt="0"]', (achip.bal - 50).toFixed(2));
    const aw = await txt('#aChk'); log('② after amount change:', aw); if (!aw.includes(achip.no) || !aw.includes('≠')) errs.push('② changed amount must be flagged');
    const m0 = await achN(); await pg.click('#aSave'); await pg.waitForSelector('#cfOk', { timeout: 5000 }).catch(() => errs.push('② save should ask'));
    const d2 = await dlg(); log('② ask:', d2.slice(0, 160)); if (!d2.includes('≠') || !has(d2, achip.no)) errs.push('② the save ask must carry the mismatch');
    if (await pg.$('#cfNo')) { await pg.click('#cfNo'); await pg.waitForSelector('#cfNo', { state: 'detached', timeout: 5000 }).catch(() => {}); }
    await pg.waitForTimeout(300); if ((await achN()) !== m0) errs.push('② cancelling must not save');
    await setVal('[data-lamt="0"]', achip.bal.toFixed(2)); const aw2 = await txt('#aChk'); if (aw2) errs.push('② fixed line must clear the warning');
    await pg.click('#aSave'); await pg.waitForSelector('#cfOk', { timeout: 5000 }); const d3 = await dlg(); if (d3.includes('≠') || d3.includes('⚠️')) errs.push('② no warning in the ask when the line equals the balance'); await pg.click('#cfOk'); await pg.waitForTimeout(600);
    const asaved = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.ach || {}).filter(x => !x.void).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1)[0]); log('② saved:', asaved && JSON.stringify([asaved.acct, asaved.amt, asaved.lines]));
    if ((await achN()) !== m0 + 1 || !asaved || !asaved.lines || norm(asaved.lines[0].no) !== norm(achip.no) || Math.abs(asaved.lines[0].amt - achip.bal) > 0.009) errs.push('② ACH must save with the invoice balance');
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
