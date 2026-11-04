/* 🕷 깊은 점검 (도구 — CI 시험 아님, `node test/crawl.js` 로 필요할 때)
 *   모든 역할 × ☰ 서랍의 모든 화면 × 그 화면의 단추(최대 CRAWL_MAX 개)를 하나씩 눌러 봄 · 폰 폭(430)과 넓은 화면(1200) 둘 다
 *   잡는 것: 페이지 오류(pageerror) · console.error · 실패 토스트 · 화면에 undefined / NaN / [object Object] · "읽는 중" 에 멈춤
 *   단추를 누른 뒤 열린 창은 닫고(✕ · 닫기 · 아니오), 주소가 바뀌었으면 그 화면으로 다시 돌아와 다음 단추
 *   인자: node test/crawl.js [역할필터] — 예: node test/crawl.js whmgr
 *   관리자 역할은 시드의 기본 사용자(seed.js 의 __MOCK_USER__ 기본값)로 들어감 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
const MAX = Number(process.env.CRAWL_MAX || 14), FILTER = process.argv[2] || '';
const SKIP = /로그아웃|Sign out|설치|Install|인쇄|Print|PDF|다운로드|Download|CSV|엑셀|Excel|스캔|Scan|카메라|Camera|📷|🖨|파일|File/i;
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8890', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const ACCT = 'acct@theonefl.com';
  const ROLES = [[null, 'admin', ''], ['own@x.com', 'owner', ''], ['brandon@x.com', 'salesman', ''], [ACCT, 'manager', 'office'], [ACCT, 'manager', 'acct'], [ACCT, 'manager', 'pickinv'], [ACCT, 'manager', 'invoice'], [ACCT, 'manager', 'whmgr'], [ACCT, 'manager', 'pick'], [ACCT, 'manager', 'catalog']].filter(r => !FILTER || (r[1] + '/' + r[2]).includes(FILTER));
  const found = [];
  const one = async ([email, role, job], vw) => {
    const who = role + (job ? '/' + job : '') + (vw > 700 ? '@wide' : '@phone');
    const ctx = await br.newContext({ viewport: { width: vw, height: 950 } }); const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 180)));
    pg.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR|cdnjs|jsdelivr|googleusercontent|lh3|shopify|gstatic/i.test(m.text())) errs.push('console: ' + m.text().slice(0, 180)); });
    pg.on('dialog', d => d.accept().catch(() => {})); ctx.on('page', p => p.close().catch(() => {}));
    await pg.addInitScript(o => { if (o.email) window.__MOCK_USER__ = { email: o.email, name: 'T' }; window.__AFTER_SEED__ = s => { if (o.role === 'owner') s.users.push({ id: o.email, email: o.email, name: 'Owner', role: 'owner', active: true }); s.users.forEach(u => { if (u.email === o.email && o.job) u.job = o.job; }); }; }, { email, role, job });
    await pg.goto('http://127.0.0.1:8890/test/demo.html'); if (!(await pg.waitForSelector('#nav button', { timeout: 10000 }).then(() => true).catch(() => false))) { found.push(who + ': nav never appeared'); await ctx.close(); return; }
    await pg.click('#hMenu'); await pg.waitForSelector('#drawer [data-dgo]', { timeout: 5000 }).catch(() => {});
    const routes = Array.from(new Set(await pg.$$eval('#drawer [data-dgo]', b => b.map(x => x.dataset.dgo))));
    await pg.evaluate(() => { const d = document.getElementById('drawer'); if (d) d.classList.remove('on'); document.body.classList.remove('drawer-on'); });
    const closeAll = async () => { for (let k = 0; k < 4; k++) { const open = await pg.$('#modal.on, .ovr'); if (!open) break; const b = await pg.$('#cfNo, #modal.on .mclose, #modal.on button.b-ghost'); if (b) await b.click({ timeout: 800 }).catch(() => {}); else await pg.keyboard.press('Escape').catch(() => {}); await pg.waitForTimeout(150); } await pg.evaluate(() => { const m = document.getElementById('modal'); if (m) m.classList.remove('on'); document.querySelectorAll('.ovr').forEach(x => x.remove()); }).catch(() => {}); };
    const scan = async (where) => {
      const t = ((await pg.textContent('#page').catch(() => '')) || '') + ' ' + ((await pg.textContent('#modal.on').catch(() => '')) || '');
      const m = t.match(/.{0,40}(\bundefined\b|\bNaN\b|\[object Object\]).{0,40}/); if (m) errs.push('text: ' + m[0].replace(/\s+/g, ' '));
      const toast = ((await pg.$eval('#toast.on.bad', e => e.textContent).catch(() => '')) || ''); if (toast && !/사유|이유|넣으세요|고르세요|적어|Enter|Pick|Give|Type|필수|없습니다|먼저/.test(toast)) errs.push('bad toast: ' + toast.slice(0, 120));
      if (errs.length) { found.push(who + ' ' + where + ' → ' + Array.from(new Set(errs)).join(' || ')); errs.length = 0; }
    };
    const lines = [];
    for (const r of routes) {
      errs.length = 0;
      await pg.evaluate(g => { location.hash = '#/' + g; }, r); await pg.waitForTimeout(1300); await closeAll();
      const pt = ((await pg.textContent('#page').catch(() => '')) || '').replace(/\s+/g, ' '); if (/읽는 중|Loading/.test(pt) && pt.length < 80) errs.push('stuck loading');
      await scan('#/' + r);
      const labels = (await pg.$$eval('#page button:not([disabled])', (B, skip) => { const re = new RegExp(skip, 'i'); const seen = new Set(); return B.map((b, i) => ({ i, vis: b.offsetParent !== null, t: (b.textContent || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 40), k: Object.keys(b.dataset).map(k => k + '=' + b.dataset[k]).join(',') })).filter(x => x.vis && !re.test(x.t) && !seen.has(x.t + x.k) && seen.add(x.t + x.k)); }, SKIP.source)).slice(0, MAX);
      let n = 0;
      for (const L of labels) {
        const h0 = await pg.evaluate(() => location.hash);
        const btns = await pg.$$('#page button:not([disabled])'); const b = btns[L.i]; if (!b) continue;
        await b.click({ timeout: 1500 }).catch(() => {}); n++;
        await pg.waitForTimeout(450); await scan('#/' + r + ' [' + (L.t || L.k) + ']'); await closeAll();
        if ((await pg.evaluate(() => location.hash)) !== h0) { await pg.evaluate(g => { location.hash = g; }, h0); await pg.waitForTimeout(700); await closeAll(); }
      }
      lines.push(r + ':' + n);
    }
    console.log(who, routes.length + ' screens ·', lines.join(' '));
    await ctx.close();
  };
  const jobs = []; ROLES.forEach(r => { jobs.push([r, 430]); jobs.push([r, 1200]); });
  let i = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (i < jobs.length) { const j = jobs[i++]; await one(j[0], j[1]).catch(e => found.push(j[0][1] + '/' + j[0][2] + ': crawler error ' + e.message.slice(0, 120))); } }));
  await br.close(); srv.kill();
  console.log('\n' + (found.length ? '❌ ' + found.length + ' problems\n' + found.join('\n') : '✅ no problems'));
  process.exit(found.length ? 1 : 0);
})();
