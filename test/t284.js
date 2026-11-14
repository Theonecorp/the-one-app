/* v0.8.242 시험 — 📝 세일즈맨 오늘 플랜 = 번호 목록 + ✓ 체크 (2026-11-14 관리자: "번호순으로 작성 · 체크마크로 한 것 · 안 한 것 구분")
 *   ① 맨 아래 칸에 쓰고 Enter → 1 · 2 · 3 번호 줄 · 줄에서 Enter = 바로 아래 새 줄 · 빈 줄에서 ⌫ = 그 줄 지우기 · ✕ = 지우기
 *   ② 체크하면 그 줄이 완료 모양(줄 긋기) · "완료 1 / 3" · 다른 화면에 갔다 와도 체크 · 순서 · 글이 그대로 (이 폰에 저장)
 *   ③ 옛 앱이 저장한 모양 { text, at } (자유 글) → 줄마다 한 항목으로 보임 · 새로 저장해도 text 칸을 같이 씀 (옛 버전이 읽음) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8972', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a), KEY = 'theone.plan.brandon@x.com';
  const open = async old => { const pg = await (await br.newContext({ viewport: { width: 430, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'Brandon' }; if (o.old) try { localStorage.setItem(o.key, JSON.stringify(o.old)); } catch (e) {} }, { old, key: KEY });
    await pg.goto('http://127.0.0.1:8972/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('#dPlanNew', { timeout: 8000 }); return pg; };
  const rows = pg => pg.$$eval('#dPlan .pli', L => L.map(li => ({ n: li.querySelector('.pn').textContent, t: li.querySelector('.pt').value, done: li.classList.contains('done'), ck: li.querySelector('[data-pc]').checked })));
  /* ① 쓰기 */
  let pg = await open(null);
  for (const t of ['올랜도 3곳 방문', 'ALI 수금', '샘플 전달']) { await pg.fill('#dPlanNew', t); await pg.press('#dPlanNew', 'Enter'); await pg.waitForTimeout(150); }
  let R = await rows(pg); log('① 3 rows:', JSON.stringify(R));
  if (R.map(r => r.n + r.t).join('|') !== '1올랜도 3곳 방문|2ALI 수금|3샘플 전달') errs.push('① typed items become numbered rows 1 2 3 in order');
  if (!(await pg.evaluate(() => document.activeElement && document.activeElement.id === 'dPlanNew'))) errs.push('① after Enter the cursor stays in the add box');
  await pg.press('[data-pt="0"]', 'End'); await pg.press('[data-pt="0"]', 'Enter'); await pg.waitForTimeout(150); await pg.keyboard.type('세금 확인'); await pg.waitForTimeout(450);
  R = await rows(pg); if (R.map(r => r.t).join('|') !== '올랜도 3곳 방문|세금 확인|ALI 수금|샘플 전달' || R[1].n !== '2') errs.push('① Enter in a row inserts a new row right below (' + R.map(r => r.n + r.t).join('|') + ')');
  await pg.fill('[data-pt="1"]', ''); await pg.press('[data-pt="1"]', 'Backspace'); await pg.waitForTimeout(200);
  R = await rows(pg); if (R.length !== 3 || R[1].t !== 'ALI 수금') errs.push('① Backspace on an empty row removes it (' + R.map(r => r.t).join('|') + ')');
  /* ② 체크 */
  await pg.check('[data-pc="1"]'); await pg.waitForTimeout(200);
  R = await rows(pg); const cnt = await pg.$eval('#dPlan .plcnt', e => e.textContent); log('② checked:', JSON.stringify(R), cnt);
  if (!R[1].done || R[0].done || R[2].done) errs.push('② only the checked row looks done'); if (!/1 \/ 3/.test(cnt)) errs.push('② count shows 1 / 3 (' + cnt + ')');
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForTimeout(500); await pg.evaluate(() => { location.hash = '#/home'; }); await pg.waitForSelector('#dPlan .pli', { timeout: 8000 });
  R = await rows(pg); log('② after nav:', JSON.stringify(R));
  if (R.map(r => r.n + r.t + (r.ck ? '✓' : '')).join('|') !== '1올랜도 3곳 방문|2ALI 수금✓|3샘플 전달') errs.push('② checks, order and text stay after leaving the screen');
  await pg.click('[data-px="0"]'); await pg.waitForTimeout(200); R = await rows(pg); if (R.length !== 2 || R[0].n !== '1' || R[0].t !== 'ALI 수금') errs.push('② ✕ removes a row and renumbers');
  const saved = await pg.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY); log('② saved:', JSON.stringify(saved));
  if (!saved || saved.text !== 'ALI 수금\n샘플 전달' || !Array.isArray(saved.items) || !saved.items[0].done) errs.push('② saved shape keeps items (with done) and the old text field');
  await pg.context().close();
  /* ③ 옛 모양 */
  pg = await open({ text: '올랜도 3곳\n\nALI 수금 · 샘플', at: '2026-11-13T10:00:00Z' }); R = await rows(pg); log('③ old shape:', JSON.stringify(R));
  if (R.map(r => r.n + r.t + (r.done ? '✓' : '')).join('|') !== '1올랜도 3곳|2ALI 수금 · 샘플') errs.push('③ an old free-text plan shows one row per line');
  await pg.context().close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
