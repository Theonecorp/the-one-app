/* v0.8.166 시험 — 🎨 🧾 세일즈맨 정산의 줄을 들어온 길에 따라 색으로 가름: 체크 · CASH · ZELLE(현장) / COD · 카드 · ACH — 줄 왼쪽 색 띠(src-*) + 위 범례
 *   ① 현장 수금 줄은 src-check(체크) · src-cash · src-zelle, COD · 카드 · ACH 줄은 src-cod · src-card · src-ach
 *   ② 범례가 줄 목록 위에 있고, ✓ 한 뒤에도 띠는 그대로 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8891', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await br.newPage({ viewport: { width: 430, height: 900 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  const seed = `const base = s.entries.find(e => e.sm === 'BRANDON' && e.pays && e.pays.length); const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    s.entries = s.entries.filter(e => e.sm !== 'BRANDON');
    [['CK1', 'CHECK', '7101'], ['CA1', 'CASH', ''], ['ZE1', 'ZELLE', '']].forEach(([id, m, ref], i) => { const e = JSON.parse(JSON.stringify(base)); e.id = id; e.d = day(i % 2); e.ym = e.d.slice(0, 7); e.v = false; e.settled = ''; e.sb = true; e.rc = true; e.env = ''; e.mismatch = ''; e.store = 'SRC ' + m; e.pays = [{ m, ref, amt: 100 + i }]; e.refs = ref ? [ref] : []; e.invs = [{ no: 'A-01005' + i, t: 'A', amt: 100 + i }]; e.total = 100 + i; s.entries.push(e); });
    s.cod = (s.cod || []).concat([['CO1', 'COD'], ['CC1', 'CREDIT CARD'], ['AC1', 'ACH']].map(([id, method], i) => ({ id, d: day(i % 2), ym: day(i % 2).slice(0, 7), sm: 'BRANDON', acct: '1111', store: 'OTHER ' + method, method, ref: method === 'CREDIT CARD' ? '884' : '', amt: 50 + i, invs: [{ no: 'P-00870' + i, t: 'P', amt: 50 + i }], disc: '', note: '', v: true, vn: '', settled: '', void: false, createdBy: 'x', createdAt: new Date().toISOString() })));`;
  await pg.addInitScript(o => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); }, { seed });
  await pg.goto('http://127.0.0.1:8891/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/pay'; }); await pg.waitForSelector('#pSm', { timeout: 8000 }); await pg.selectOption('#pSm', 'BRANDON'); await pg.waitForSelector('[data-pl]', { timeout: 8000 }).catch(() => errs.push('settlement lines missing'));
  const rows = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-pl]')).map(el => el.dataset.pl + ' → ' + (el.className.match(/src-[a-z]+/) || [''])[0] + ' | ' + getComputedStyle(el).borderLeftWidth + ' ' + getComputedStyle(el).borderLeftColor)); log('rows:', JSON.stringify(rows));
  const cls = id => { const r = rows.find(x => x.startsWith(id)); return r ? (r.match(/src-[a-z]+/) || [''])[0] : ''; };
  const want = { 'f|CK1': 'src-check', 'f|CA1': 'src-cash', 'f|ZE1': 'src-zelle', 'o|CO1': 'src-cod', 'o|CC1': 'src-card', 'o|AC1': 'src-ach' };
  Object.keys(want).forEach(k => { if (cls(k) !== want[k]) errs.push('① ' + k + ' should carry ' + want[k] + ' (got ' + (cls(k) || 'none') + ')'); });
  const colors = await pg.evaluate(() => { const c = {}; document.querySelectorAll('[data-pl]').forEach(el => { c[(el.className.match(/src-[a-z]+/) || [''])[0]] = getComputedStyle(el).borderLeftColor + '/' + getComputedStyle(el).borderLeftWidth; }); return c; }); log('colors:', JSON.stringify(colors));
  const vals = Object.values(colors); if (new Set(vals).size !== vals.length || vals.some(v => /^rgba?\(0, 0, 0/.test(v) || /\/0px$/.test(v))) errs.push('① each source gets its own visible left-border color');
  const leg = await pg.evaluate(() => { const l = document.querySelector('.srcleg'); const first = document.querySelector('[data-pl]'); return l ? { txt: l.textContent.replace(/\s+/g, ' ').trim(), above: l.getBoundingClientRect().top < first.getBoundingClientRect().top, n: l.querySelectorAll('i').length } : null; }); log('legend:', JSON.stringify(leg));
  if (!leg || !leg.above || leg.n !== 6 || !/체크/.test(leg.txt) || !/COD/.test(leg.txt) || !/ACH/.test(leg.txt)) errs.push('② legend with 6 colors above the lines');
  await pg.click('[data-pl="o|CO1"]'); await pg.waitForFunction(() => { const el = document.querySelector('[data-pl="o|CO1"]'); return el && el.classList.contains('ok'); }, null, { timeout: 4000 }).catch(() => errs.push('② tapping still marks ✓'));
  const after = await pg.evaluate(() => document.querySelector('[data-pl="o|CO1"]').className); if (!/src-cod/.test(after) || !/\bok\b/.test(after)) errs.push('② after ✓ the band stays (class: ' + after + ')');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
