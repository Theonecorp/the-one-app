/* v0.8.166 시험 — 🧾 정산: 세일즈맨을 고르면 기간과 상관없이 담당자 확인을 거쳐 넘어온 미정산 기록 전부가 나옴(📋 미정산 전체, 기본) · 기간 칩은 좁혀 볼 때만 · 확정하면 목록에서 빠져 📁 보관함으로, 보관함에서 언제든 정산서를 다시 봄
 *   ① 오래된(두 달 전) 미정산 줄도 최근 줄과 함께 보임 · 기간 칩을 누르면 그 기간만 · 📋 미정산 전체로 돌아오면 다시 전부
 *   ② ✓ 하고 확정 → 그 줄들이 목록에서 사라지고(미정산 없음) 보관함에 실제 첫 날 ~ 끝 날로 쌓임 · 줄을 누르면 정산서 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8892', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seed = `const base = s.entries.find(e => e.sm === 'BRANDON' && e.pays && e.pays.length); const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(x)); };
    s.entries = s.entries.filter(e => e.sm !== 'BRANDON'); s.cod = (s.cod || []).filter(c => c.sm !== 'BRANDON');
    [['OLD1', 70], ['OLD2', 62], ['NEW1', 1], ['NEW2', 0]].forEach(([id, n], i) => { const e = JSON.parse(JSON.stringify(base)); e.id = id; e.d = day(n); e.ym = e.d.slice(0, 7); e.v = false; e.settled = ''; e.deferred = ''; e.sb = true; e.rc = true; e.env = ''; e.mismatch = ''; e.store = 'ST ' + id; e.pays = [{ m: 'CHECK', ref: '8' + i, amt: 100 }]; e.refs = ['8' + i]; e.invs = [{ no: 'A-0200' + i, t: 'A', amt: 100 }]; e.total = 100; s.entries.push(e); });
    window.__DAYS = { old: day(70), recent: day(0) };`;
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
  await pg.goto('http://127.0.0.1:8892/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pSm', { timeout: 8000 }); await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('[data-pl]', { timeout: 8000 }).catch(() => errs.push('① lines missing'));
  const ids = () => pg.$$eval('[data-pl]', e => e.map(x => x.dataset.pl).filter(x => /\|(OLD|NEW)/.test(x)).sort());
  const allOn = () => pg.evaluate(() => document.querySelector('[data-pall]').classList.contains('on'));
  let L = await ids(); log('① all (default):', L.join(' '), '| 전체 chip on:', await allOn(), '| title:', await pg.$eval('#pOut h2', e => e.textContent.trim()));
  if (!(await allOn()) || L.join() !== 'f|NEW1,f|NEW2,f|OLD1,f|OLD2') errs.push('① default view must list every unsettled record regardless of date');
  /* 기간 칩 → 그 기간만 (최근 45일에는 OLD 가 빠짐) */
  await pg.click('[data-pp$="' + (await pg.evaluate(() => window.__DAYS.recent)) + '"]'); await pg.waitForTimeout(500); L = await ids(); log('① 최근 45일 chip:', L.join(' '), '| 전체 chip on:', await allOn());
  if (await allOn() || L.join() !== 'f|NEW1,f|NEW2') errs.push('① a period chip narrows to that range (old ones drop out)');
  await pg.click('[data-pall]'); await pg.waitForTimeout(500); L = await ids(); if (L.length !== 4 || !(await allOn())) errs.push('① 📋 미정산 전체 brings everything back');
  /* ② 전부 ✓ → 확정 → 보관함 */
  await pg.click('#pAllOk').catch(() => {}); await pg.waitForTimeout(300);
  for (const k of L) { const ok = await pg.$eval('[data-pl="' + k + '"]', e => e.classList.contains('ok')); if (!ok) { await pg.click('[data-pl="' + k + '"]'); await pg.waitForTimeout(250); } }
  const nOk = await pg.$$eval('[data-pl].ok', e => e.length); log('② ✓ rows:', nOk); if (nOk < 4) errs.push('② all four rows should be ✓');
  await pg.click('#pConfirm'); await pg.waitForSelector('#cfGo', { timeout: 5000 }); if (await pg.evaluate(() => document.getElementById('cfGo').disabled)) await pg.click('#cfAck'); await pg.click('#cfGo'); await pg.waitForTimeout(1500);
  if (await pg.$('#prtClose')) { await pg.click('#prtClose'); await pg.waitForTimeout(300); }
  const after = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const st = Object.values(M.settlements || {}).filter(x => x.sm === 'BRANDON').sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1)[0];   /* 방금 확정한 것 (씨앗에 옛 정산이 하나 있음) */ return { settled: ['OLD1', 'OLD2', 'NEW1', 'NEW2'].map(id => !!M.entries[id].settled), st: st && { from: st.from, to: st.to, n: st.n, id: st.id } }; }); log('② after confirm:', JSON.stringify(after));
  if (after.settled.some(x => !x)) errs.push('② confirming must settle every listed record'); if (!after.st || after.st.n !== 4) errs.push('② one settlement with 4 records');
  const D = await pg.evaluate(() => window.__DAYS); if (!after.st || after.st.from !== D.old || after.st.to !== D.recent) errs.push('② settlement range = first ~ last actual date (' + D.old + ' ~ ' + D.recent + ')');
  await pg.waitForSelector('#pSm', { timeout: 8000 }); await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForTimeout(600);
  const left = await ids(); log('② list after confirm:', left.length); if (left.length) errs.push('② confirmed records must leave the list');
  await pg.click('#pHist'); await pg.waitForSelector('[data-sh]', { timeout: 8000 }).catch(() => errs.push('② 보관함 should list the settlement'));
  const hist = await pg.$$eval('[data-sh]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())); log('② 보관함:', hist.slice(0, 2));
  if (!hist.some(t => t.includes('BRANDON') && t.includes(D.old) && t.includes(D.recent))) errs.push('② 보관함 row shows BRANDON with the real range');
  await pg.click('[data-sh="' + after.st.id + '"]'); await pg.waitForSelector('#prt.on', { timeout: 5000 }).catch(() => errs.push('② tapping a 보관함 row reopens the statement'));
  const stmt = await pg.evaluate(() => (document.getElementById('prtbody') || {}).textContent || ''); if (!/커미션 정산서|수금 기록/.test(stmt) || !/ST OLD1/.test(stmt)) errs.push('② the archived statement shows the old record too');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
