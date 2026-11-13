/* v0.8.233 시험 — 📦 창고 매니저 왼쪽 메뉴(컴퓨터 고정 서랍)에 재고 묶음 (2026-11-13 창고 매니저: "재고 탭이 안 보여")
 *   ① 창고 매니저: 서랍에 📦 재고 묶음 · 재고 · 상품 · 라벨 출력 · 상품 받기 · 보충 · 재확인 화면이 있음 → 누르면 #/estoque 열림
 *   ② 오피스 매니저 · 출고 · 인보이스 담당 서랍은 그대로 (재고 묶음 없음 — v0.8.219 관리자 결정) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8996', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (email, job) => { const pg = await (await br.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ': ' + e.message));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'U' }; window.__AFTER_SEED__ = s => { s.users.push({ id: o.email, email: o.email, name: 'U', role: 'manager', job: o.job, active: true }); }; }, { email, job });
    await pg.goto('http://127.0.0.1:8996/test/demo.html'); await pg.waitForSelector('#drawer [data-dgo]', { timeout: 15000 }); await pg.waitForTimeout(800); return pg; };
  const dg = pg => pg.$$eval('#drawer .dgrp', D => D.map(d => d.dataset.dg)), dgo = pg => pg.$$eval('#drawer [data-dgo]', B => B.map(b => b.dataset.dgo));
  /* ① */
  const w = await open('wh@x.com', 'whmgr');
  const G = await dg(w), R = await dgo(w); log('① whmgr groups:', G.join(' '), '| screens:', R.join(' '));
  if (!G.includes('inv')) errs.push('① warehouse manager menu should have the 📦 Estoque group');
  for (const r of ['estoque', 'produtos', 'etiquetas', 'recebimento', 'repor', 'recheca']) if (!R.includes(r)) errs.push('① warehouse manager menu should have ' + r);
  await w.click('#drawer [data-dgo="estoque"]'); await w.waitForTimeout(1200);
  if (!/#\/estoque/.test(w.url())) errs.push('① 📦 Estoque in the menu should open #/estoque: ' + w.url());
  /* ② */
  for (const job of ['office', 'pickinv']) { const p = await open(job + '@x.com', job); const g = await dg(p); log('②', job, g.join(' ')); if (g.includes('inv')) errs.push('② ' + job + ' menu should stay without 📦 Estoque'); }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
