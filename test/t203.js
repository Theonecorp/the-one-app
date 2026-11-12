/* v0.8.191 시험 — 🧭 픽킹 리스트 순서 규칙 (2026-11-12 관리자: "통로별로(통로 순서가 동선), 같은 종류끼리 ABC 1234, CVEG 01~16 순서대로 — CVEG 였다가 CVNG 로 갔다가 섞이면 안 됨, 규칙을 알면 누구나 쉽게")
 *   ① 📍 통로 순서: 00 → 02B(2B 도 같은 통로) → 04B → 10B → WAREHOUSE01 → 위치 없음은 맨 끝 · 통로마다 머리 줄 (몇 줄 · 몇 개)
 *   ② 같은 통로 안: 코드 앞 글자 ABC (AHG → CVEG → CVNG) · 같은 종류 안은 번호 순 (CVEG01 → 02 → 10 → 16) — 종류가 섞이지 않음
 *   ③ 같은 통로 안에서 종류가 바뀌는 곳에 가는 선 · 맨 위에 규칙 한 줄 · 화면의 픽킹 목록도 같은 순서 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8874', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const LOC = { AHG100: '04B', AHG101: '2B', AHG102: 'WAREHOUSE01', AHG105: '00', AHG106: '10B', EB103: '', CVEG01: '04B', CVEG02: '04B', CVEG10: '04B', CVEG16: '04B', CVNG01: '04B' };
  const LINES = ['CVNG01', 'CVEG10', 'AHG100', 'EB103', 'CVEG02', 'AHG102', 'AHG101', 'CVEG16', 'AHG106', 'CVEG01', 'AHG105'].map(c => ({ c, d: c + ' ITEM', q: 2, pq: 2, ok: true, p: 1, t: 'A' }));
  const pg = await br.newPage({ viewport: { width: 1200, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' }; window.__AFTER_SEED__ = s => {
    const c0 = s.catalog.find(x => x.id === 'c0'), rows = JSON.parse(c0.j), base = rows.find(r => r[0] === 'AHG100');
    ['CVEG01', 'CVEG02', 'CVEG10', 'CVEG16', 'CVNG01'].forEach(c => { const r = base.slice(); r[0] = c; r[1] = c + ' ITEM'; r[4] = ''; rows.push(r); });
    rows.forEach(r => { if (o.loc[r[0]] != null) r[11] = o.loc[r[0]]; }); c0.j = JSON.stringify(rows); const meta = s.catalog.find(x => x.id === 'meta'); if (meta) { meta.count = rows.length; meta.ver = 'T203'; c0.ver = 'T203'; }
    Object.assign(s.orders[0], { st: 'pick', picker: 'luke@theonefl.com', pickerName: 'L', cfOk: true }); s.orderLines[0].lines = o.lines; }; }, { loc: LOC, lines: LINES });
  await pg.goto('http://127.0.0.1:8874/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/order/O261014-AAAA'; }); await pg.waitForSelector('#mPickPrint', { timeout: 8000 });
  const want = 'AHG105 AHG101 AHG100 CVEG01 CVEG02 CVEG10 CVEG16 CVNG01 AHG106 AHG102 EB103';
  /* ③ 화면 */
  await pg.waitForFunction(() => document.querySelectorAll('#mLines tr.pkg').length >= 6, null, { timeout: 6000 }).catch(() => {});
  const scr = await pg.$$eval('#mLines tr:not(.pkg) td:first-child b', e => e.map(x => x.textContent)); log('③ screen:', scr.join(' ')); if (scr.join(' ') !== want) errs.push('③ screen order follows the same rule');
  /* ① ② 인쇄 */
  await pg.click('#mPickPrint'); await pg.waitForSelector('#prt.on'); await pg.waitForTimeout(300);
  const P = await pg.evaluate(() => { const b = document.getElementById('prtbody'), out = []; b.querySelectorAll('tbody tr').forEach(tr => { if (tr.classList.contains('pktype')) out.push('[' + tr.textContent.trim() + ']'); else if (tr.classList.contains('pkfam')) out.push('—'); else if (!tr.classList.contains('fin')) { const c = tr.querySelector('td:nth-child(3) b'); if (c) out.push(c.textContent); } }); return { seq: out, rule: (b.querySelector('.pkrule') || {}).textContent || '' }; });
  log('① ② print:', P.seq.join(' '));
  const codes = P.seq.filter(x => !/^\[|^—$/.test(x)); if (codes.join(' ') !== want) errs.push('② order: aisle → code letters → number (got ' + codes.join(' ') + ')');
  const heads = P.seq.filter(x => /^\[/.test(x)); if (heads.length !== 6 || !/AISLE 00/.test(heads[0]) || !/AISLE 02B/.test(heads[1]) || !/AISLE 04B · 6 lines · 12 pcs/.test(heads[2]) || !/AISLE 10B/.test(heads[3]) || !/AISLE WAREHOUSE01/.test(heads[4]) || !/NO LOCATION/.test(heads[5])) errs.push('① aisle headers 00 → 02B → 04B → 10B → WAREHOUSE01 → NO LOCATION');
  const i04 = P.seq.findIndex(x => /AISLE 04B/.test(x)), seg = P.seq.slice(i04 + 1, i04 + 9).join(' '); log('③ aisle 04B:', seg);
  if (seg !== 'AHG100 — CVEG01 CVEG02 CVEG10 CVEG16 — CVNG01') errs.push('③ a thin line where the code letters change inside an aisle');
  if (!/CVEG01…CVEG16/.test(P.rule)) errs.push('③ the rule line is printed');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
