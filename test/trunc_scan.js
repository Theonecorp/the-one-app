/* 긴 가게 이름 잘림 찾기 — 여러 화면을 돌며 가게 이름이 ... 로 잘리는 곳을 출력 (출력 없음 = 잘리는 곳 없음). W=768 로 태블릿 폭 */
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const LONG = 'SUPER BEAUTY SUPPLY AND WIGS INTERNATIONAL OUTLET NORTH MIAMI BEACH #2';
const scan = () => {
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && /NORTH MIAMI|SUPER BEAUTY/.test(n.textContent))) return;
    if (el.getClientRects().length === 0) return;
    for (let e = el, i = 0; e && i < 5; e = e.parentElement, i++) {
      const g = getComputedStyle(e);
      if ((g.overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 1) || (g.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1)) {
        const path = []; for (let p = e, k = 0; p && k < 4; p = p.parentElement, k++) path.push(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (p.className && typeof p.className === 'string' ? '.' + p.className.trim().split(/\s+/).join('.') : ''));
        out.push(path.join(' < ') + ' [' + e.scrollWidth + '>' + e.clientWidth + ' ' + g.whiteSpace + ']'); break;
      }
    }
  });
  return [...new Set(out)];
};
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8789', '--bind', '127.0.0.1'], { cwd: '/home/user/the-one-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const W = Number(process.env.W || 390);
  const users = { 'brandon@x.com': ['home', 'order', 'order/new', 'invs', 'stores', 'entry', 'ar', 'mine', 'hist', 'mycomm', 'find', 'track', 'cat'], 'luke@theonefl.com': ['now', 'order', 'invs', 'stores', 'bossar', 'ar', 'verify', 'cod', 'ach', 'pay', 'mg', 'reports', 'flow', 'arup', 'track'] };
  for (const em in users) for (const r of users[em]) {
    const pg = await br.newPage({ viewport: { width: W, height: 900 } });
    await pg.addInitScript(([e, L]) => { window.__MOCK_USER__ = { email: e, name: 'X' };
      window.__AFTER_SEED__ = s => { const walk = o => { if (Array.isArray(o)) return o.map(walk); if (o && typeof o === 'object') { for (const k in o) o[k] = walk(o[k]); return o; } return o === 'ALI B/S # 1' ? L : o; }; for (const k in s) s[k] = walk(s[k]); s.settings[0].ordersOn = true; }; }, [em, LONG]);
    await pg.goto('http://127.0.0.1:8789/test/demo.html'); await pg.waitForSelector('#nav button');
    await pg.evaluate(r => { location.hash = '#/' + r; }, r); await pg.waitForTimeout(1500);
    /* 가게 고르기 화면이면 검색해서 고름 */
    for (const q of ['#fStore', '#storeQ', '#eStoreQ', '#stQ', '#ivQ', '#oq']) { if (await pg.$(q)) { await pg.fill(q, 'super beauty'); await pg.waitForTimeout(600); const res1 = await pg.evaluate(scan); if (res1.length) console.log(em.split('@')[0], r, 'search', q, '\n   ' + res1.join('\n   ')); const hit = await pg.$('#sList div, #storeHits div, #eStoreHits [data-ac]'); if (hit) { await hit.click(); await pg.waitForTimeout(1200); } break; } }
    const row = await pg.$('.pr.tap:has-text("SUPER BEAUTY"), tr:has-text("SUPER BEAUTY")'); if (row) { try { await row.click({ timeout: 2000 }); await pg.waitForTimeout(1500); const r2 = await pg.evaluate(scan); if (r2.length) console.log(em.split('@')[0], r, 'after tap', '\n   ' + r2.join(' | ')); for (const t of ['invh', 'ar', 'notes', 'info']) { const b = await pg.$('[data-sst="' + t + '"]'); if (b) { await b.click(); await pg.waitForTimeout(800); const r3 = await pg.evaluate(scan); if (r3.length) console.log(em.split('@')[0], r, 'sheet', t, '\n   ' + r3.join(' | ')); } } } catch (e) {} }
    const res = await pg.evaluate(scan);
    if (res.length) console.log(em.split('@')[0], r, '\n   ' + res.join('\n   '));
    await pg.close();
  }
  await br.close(); srv.kill();
})();
