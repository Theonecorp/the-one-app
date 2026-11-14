/* 📸 역할별 화면 사진 — /screens 스킬. node shot.cjs <out> <hash[>selector]> [roles] [widths]  (SCREENS_ROOT 로 다른 폴더(예: main worktree)의 앱) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const [out, target = '#/', rolesArg = 'admin,office,salesman', widthsArg = '430,1440'] = process.argv.slice(2);
if (!out) { console.log('사용: node shot.cjs <나갈 폴더> <화면 해시[>선택자]> [역할,…] [폭,…]'); process.exit(1); }
const root = process.env.SCREENS_ROOT || path.resolve(__dirname, '../../..'), [hash, sel] = target.split('>');
/* 시험 자료(test/seed.js)의 계정 — 관리자는 src/main.js 의 ADMIN_EMAILS 첫 줄, 세일즈맨은 seed 의 세일즈맨, 나머지는 새 계정에 role · job 을 붙임 */
const adminEmail = (fs.readFileSync(path.join(root, 'src/main.js'), 'utf8').match(/ADMIN_EMAILS\s*=\s*\[\s*'([^']+)'/) || [])[1];
const salesEmail = (fs.readFileSync(path.join(root, 'test/seed.js'), 'utf8').match(/\{ id: '([^']+)', email: '[^']+', name: '[^']+', role: 'salesman'/) || [])[1];
const who = r => r === 'admin' ? [adminEmail, '', ''] : r === 'salesman' ? [salesEmail, '', ''] : r === 'owner' ? ['owner@example.com', 'owner', ''] : ['staff@example.com', 'manager', r];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const port = 8990 + Math.floor(Math.random() * 9), srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  try {
    for (const r of rolesArg.split(',')) for (const w of widthsArg.split(',').map(Number)) {
      const [email, role, job] = who(r), pg = await (await br.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })).newPage();
      await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.role) window.__AFTER_SEED__ = s => { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = o.role; if (o.job) u.job = o.job; }; }, { email, role, job });
      await pg.goto('http://127.0.0.1:' + port + '/test/demo.html'); await pg.waitForTimeout(1500);
      await pg.evaluate(h => { location.hash = h; }, hash); await pg.waitForTimeout(1200);
      if (sel) { await pg.evaluate(() => document.querySelectorAll('.hgrp').forEach(g => g.classList.add('open'))); await pg.click(sel).catch(() => console.log('  (누르기 실패: ' + sel + ')')); await pg.waitForTimeout(1000); }
      const f = path.join(out, r + '-' + w + '.png'); await pg.screenshot({ path: f }); console.log('📸', f); await pg.context().close();
    }
  } finally { await br.close(); srv.kill(); }
})();
