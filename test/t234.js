/* v0.8.204 시험 — 📧 사무실이 먼저 ① 접수 확인한 수금도 Daily Report 에 (2026-11-12 관리자: "오더 후 '수금 넣을까요?' 로 넣은 수금이 Daily Report 에 안 뜸")
 *   원인: 리포트 대상이 "아직 안 보냄 + 사무실 확인 전"만이라, 사무실이 먼저 ① 을 누르면 빠졌음 (규칙도 확인된 수금은 세일즈맨이 못 고치게 막혀 있었음)
 *   ① 오늘 입력 · 사무실이 이미 ① 확인(sb) · 아직 안 보냄 → 📧 전송 대상에 들어감 → 보내면 rep 표시
 *   ② 어제 입력해서 못 보낸 것(사무실 확인됨)도 지난 건으로 보이고 같이 보내짐
 *   ③ firestore.rules: 세일즈맨은 자기 수금의 env · rep 칸만 (rep 은 true 로만) — 한 줄로 합쳐 식 개수 한도 안 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8912', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' };
    window.__AFTER_SEED__ = s => { const t = new Date(), ds = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), td = ds(t), yd = ds(new Date(t - 864e5));
      const E = (id, d) => ({ id, d, ym: d.substring(0, 7), sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', addr: '', pays: [{ m: 'CHECK', ref: id, amt: 100, dep: d, mob: false }], invs: [{ no: 'A10055', t: 'A', amt: 100 }], total: 100, invTotal: 100, sb: true, sbAt: td, rc: false, v: false, vn: '', settled: '', void: false, rep: false, createdBy: 'brandon@x.com', createdAt: d + 'T15:00:00Z' });
      s.entries.push(E('REP-TODAY', td), E('REP-YDAY', yd)); }; });
  await pg.goto('http://127.0.0.1:8912/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  await pg.evaluate(() => { location.hash = '#/mine'; }); await pg.waitForSelector('#btnSend', { timeout: 8000 }); await pg.waitForTimeout(500);
  const prev = (await pg.textContent('#rPreview')).replace(/\s+/g, ' '), page = (await pg.textContent('#page')).replace(/\s+/g, ' ');
  log('① ② preview:', prev.slice(0, 80)); log('   page has yesterday:', /REP-YDAY|지난 건/.test(page));
  const n = Number((prev.match(/(\d+)건/) || [])[1] || 0); if (n < 2) errs.push('① ② both office-reviewed entries are in the report (got ' + n + ')');
  await pg.click('#btnSend'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const rep = await pg.evaluate(() => ['REP-TODAY', 'REP-YDAY'].map(id => !!window.__MOCK_STORE__.entries[id].rep)); log('① ② rep after send:', JSON.stringify(rep));
  if (rep.some(v => !v)) errs.push('① ② both marked sent');
  /* ③ */
  const R = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  if (!/hasOnly\(\['env', 'envAt', 'rep', 'repAt', 'repId', 'updatedAt'\]\)\s*&& \(request\.resource\.data\.get\('rep', null\) == resource\.data\.get\('rep', null\) \|\| request\.resource\.data\.get\('rep', false\) == true\)\)/.test(R)) errs.push('③ rules: salesman may only touch env · rep (rep → true), in one clause');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
