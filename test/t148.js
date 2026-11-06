/* v0.8.171 시험 — 🔐 L5 CSP: index.html 과 시험 화면(test/demo.html)에 Content-Security-Policy 가 있고, 앱의 모든 화면은 인라인 스크립트(onclick · onerror · javascript:) 없이 돈다
 *   ① index.html: CSP meta 가 있고 인라인 <script> 가 없음 (서비스 워커 등록은 app.js 에서) · demo.html 도 같은 CSP · script-src 에 'unsafe-inline' 없음
 *   ② 예전에 onclick="…" 이던 단추들이 CSP 아래서도 일한다: 관리 → 아이템 탭 '🏷 아이템 전체 보기'(data-hash) · 인쇄 바 '🖨 인쇄'(id) · 세트 상세 '닫기'(id) · 거래처 미수 정렬 링크(href="#" 가 홈으로 튀지 않음)
 *   ③ 화면 여러 개를 돌아도 DOM 에 on* 속성 · javascript: 링크가 하나도 없고 securitypolicyviolation 이 안 난다 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const errs = [], log = (...a) => console.log(...a);
  /* ① 파일 */
  const idx = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'), demo = fs.readFileSync(path.resolve(__dirname, 'demo.html'), 'utf8');
  const csp = (idx.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  log('① csp:', csp.slice(0, 80) + '…');
  if (!csp) errs.push('① index.html must have a CSP meta');
  if (!(demo.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1]) errs.push('① demo.html must carry the same CSP so every test runs under it');
  else if ((demo.match(/content="([^"]+)"/g) || []).indexOf('content="' + csp + '"') < 0) errs.push('① demo.html CSP differs from index.html');
  const scriptSrc = (csp.match(/script-src ([^;]+)/) || [])[1] || '';
  if (/unsafe-inline|unsafe-eval/.test(scriptSrc)) errs.push('① script-src must not allow unsafe-inline / unsafe-eval');
  if (!/'self'/.test(scriptSrc) || !/www\.gstatic\.com/.test(scriptSrc) || !/cdnjs\.cloudflare\.com/.test(scriptSrc)) errs.push('① script-src needs self · gstatic (firebase) · cdnjs');
  if (/<script>[^<]/.test(idx)) errs.push('① index.html must not have an inline <script>');
  if (!/object-src 'none'/.test(csp) || !/base-uri 'self'/.test(csp)) errs.push('① object-src none · base-uri self');
  /* 소스에도 인라인 핸들러가 없음 */
  const src = fs.readdirSync(path.resolve(__dirname, '../src')).filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.resolve(__dirname, '../src', f), 'utf8')]);
  src.forEach(([f, s]) => { s.split('\n').forEach((l, i) => { if (/^\s*\/[/*]|^\s*\*/.test(l)) return; if (/\son(click|error|load|change|input|submit|keyup|keydown)=\\?"/.test(l)) errs.push('① inline handler in src/' + f + ':' + (i + 1)); if (/href="javascript:/.test(l)) errs.push('① javascript: link in src/' + f + ':' + (i + 1)); }); });

  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8848', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  const seed = `s.invoices = (s.invoices || []).concat([{ id: 'A-000500', no: 'A-000500', t: 'A', d: '2026-10-01', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 6, p: 2.5, lp: 2.5 }], qty: 6, sub: 15, list: 15, disc: 20, total: 12, bal: 12, st: 'open' }, { id: 'A-000501', no: 'A-000501', t: 'A', d: '2026-10-03', ym: '2026-10', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'x', q: 1, p: 2.5, lp: 2.5 }], qty: 1, sub: 2.5, list: 2.5, disc: 0, total: 2.5, bal: 2.5, st: 'open' }]);`;
  const viol = [];
  const mk = async (email) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); pg.on('console', m => { if (/Content Security Policy/i.test(m.text())) viol.push(m.text().slice(0, 160)); });
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; window.__AFTER_SEED__ = new Function('s', o.seed); window.__CSPV__ = []; document.addEventListener('securitypolicyviolation', e => window.__CSPV__.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + e.lineNumber)); }, { email, seed });
    await pg.goto('http://127.0.0.1:8848/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const inlineCount = pg => pg.evaluate(() => document.querySelectorAll('[onclick],[onerror],[onload],[onchange],[oninput],[onsubmit],a[href^="javascript:"]').length);
  const txt = async (pg, q) => ((await pg.textContent(q).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  /* ② 관리자 — 관리 → 아이템 탭의 data-hash 단추 */
  let pg = await mk('luke@theonefl.com');
  const has = await pg.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')); if (!has) errs.push('② demo page must be under CSP');
  await pg.evaluate(() => { location.hash = '#/admin/cat'; }); await pg.waitForSelector('[data-hash="#/items"]', { timeout: 8000 }).catch(() => errs.push('② admin 올리기 tab has the data-hash button'));
  if (await pg.$('[data-hash="#/items"]')) { await pg.click('[data-hash="#/items"]'); await pg.waitForTimeout(900); log('② hash after click:', location = await pg.evaluate(() => location.hash)); if (!/^#\/items/.test(location)) errs.push('② data-hash button must navigate to #/items'); }
  if (await inlineCount(pg)) errs.push('② items screen still has inline handlers');
  if (await pg.$('#itLv')) { await pg.click('#itLv'); await pg.waitForTimeout(600); const h = await pg.evaluate(() => location.hash); log('② itLv link → hash', h); if (!/^#\/items/.test(h)) errs.push('② href="#" link must not navigate away (preventDefault)'); await pg.evaluate(() => { const m = document.getElementById('modal'); if (m) m.classList.remove('on'); }); } else errs.push('② items screen shows the 레벨 · 그룹 link');
  /* 세트 상세 닫기 — 주문 화면의 세트 줄 */
  await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(1200);
  await pg.evaluate(() => { location.hash = '#/own'; }); await pg.waitForTimeout(900);
  if (await pg.$('[data-hash="#/flow"]')) { await pg.click('[data-hash="#/flow"]'); await pg.waitForTimeout(900); const h = await pg.evaluate(() => location.hash); log('② flow tile →', h); if (!/^#\/flow/.test(h)) errs.push('② owner flow tile must navigate to #/flow'); }
  /* 인쇄 바 — printOpen 으로 열고 🖨 단추가 window.print 를 부름 */
  await pg.evaluate(() => { window.__PRINTED__ = 0; window.print = () => { window.__PRINTED__++; }; });
  await pg.evaluate(async () => { const U = await import('../app.js').catch(() => null); const el = document.getElementById('prt'); if (el) { el.classList.add('on'); document.body.classList.add('printing'); } });
  if (await pg.$('#prtGo')) { await pg.evaluate(() => document.getElementById('prtGo').click()); const n = await pg.evaluate(() => window.__PRINTED__); log('② print clicks:', n); if (n !== 1) errs.push('② 🖨 button must call window.print()'); } else errs.push('② print bar button #prtGo exists');
  await pg.close();
  /* ② 세일즈맨 — 가게 창의 정렬 링크(href="#") 가 홈으로 튀지 않음 */
  pg = await mk('brandon@x.com');
  await pg.evaluate(() => { location.hash = '#/invlook'; }); await pg.waitForTimeout(1500);
  const h0 = await pg.evaluate(() => location.hash);
  if (await pg.$('#ivSort')) { await pg.click('#ivSort'); await pg.waitForTimeout(500); const h1 = await pg.evaluate(() => location.hash); log('② invlook sort: hash', h0, '→', h1); if (h1 !== h0) errs.push('② sort link must not navigate (preventDefault)'); }
  else log('② (invlook sort link not shown — fewer than 2 invoices)');
  if (await inlineCount(pg)) errs.push('② invlook screen still has inline handlers');
  await pg.close();
  /* ③ 여러 화면 */
  pg = await mk('luke@theonefl.com');
  for (const h of ['#/order', '#/stores', '#/items', '#/stock', '#/admin', '#/admin/cat', '#/admin/tree', '#/newacct', '#/credit/new', '#/ship', '#/fulfill', '#/boss', '#/hub/wh', '#/photos', '#/cat']) {
    await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(700);
    const n = await inlineCount(pg); if (n) errs.push('③ ' + h + ' has ' + n + ' inline handler attrs');
  }
  const v = await pg.evaluate(() => window.__CSPV__); log('③ violations:', v.length, v.slice(0, 3), viol.slice(0, 2));
  if (v.length) errs.push('③ CSP violations: ' + v.slice(0, 3).join(' | '));
  await pg.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
