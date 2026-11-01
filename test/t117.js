/* v0.8.153 시험 — 🏷 아이템 통로별: 검색어가 있어도 통로를 누르면 그 통로 아이템이 나옴 · 7A 와 07A 는 같은 통로
 *   ⚡ 재고 전체는 폰 보관 + 바뀐 것만 읽음 (두 번째부터 전체 읽기 없음) · 지난 달 인보이스는 폰 보관 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8872', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 420, height: 900 } });   // 같은 컨텍스트 = 같은 IndexedDB
  const seed = s => { const rows = JSON.parse(s.catalog[1].j); const loc = { AHG100: '7A-01', AHG101: '07A-02', AHG102: '11B-01' }; rows.forEach(r => { if (loc[r[0]]) { while (r.length < 12) r.push(r.length === 10 ? 0 : ''); r[11] = loc[r[0]]; } }); s.catalog[1].j = JSON.stringify(rows);
    s.stock = [['AHG100', 10], ['AHG101', 0], ['AHG102', 5]].map(x => ({ id: x[0], code: x[0], qty: x[1], at: '2026-10-30T00:00:00Z' })); };
  const mk = async () => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(f => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'X' }; window.__AFTER_SEED__ = new Function('s', f); window.__LIST_LOG__ = []; }, '(' + seed.toString() + ')(s)');
    await pg.goto('http://127.0.0.1:8872/test/demo.html'); await pg.waitForSelector('#nav button'); await pg.waitForTimeout(400);
    /* 재고 읽기 호출을 기록 */
    await pg.evaluate(() => { const S = window.__S__ || null; });
    return pg; };

  let pg = await mk();
  /* ---------- 통로별 + 검색어 ---------- */
  await pg.evaluate(() => { location.hash = '#/items'; }); await pg.waitForSelector('#itQ', { timeout: 8000 }); await pg.waitForTimeout(800);
  await pg.fill('#itQ', 'STUNN'); await pg.waitForTimeout(400);
  await pg.click('[data-iv="aisle"]'); await pg.waitForTimeout(500);
  const chips = await pg.$$eval('[data-ia]', b => b.map(x => x.dataset.ia)); log('aisles:', chips);
  if (chips.includes('7A')) errs.push('7A should be normalized to 07A'); if (!chips.includes('07A') || !chips.includes('11B')) errs.push('aisle chips missing');
  await pg.click('[data-ia="07A"]'); await pg.waitForTimeout(600);
  const q = await pg.$eval('#itQ', e => e.value), rows = await pg.$$eval('#itList [data-it]', r => r.map(x => x.dataset.it)); log('after aisle tap: q=', JSON.stringify(q), 'rows', rows);
  if (q !== '') errs.push('tapping an aisle should clear the search text'); if (rows.join(',') !== 'AHG100,AHG101') errs.push('07A should list both 7A-01 and 07A-02 items in location order');
  /* ---------- 재고 보관: 두 번째 페이지는 바뀐 것만 읽음 ---------- */
  const idb = await pg.evaluate(() => new Promise(res => { const r = indexedDB.open('theone', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('kv.stock.all'); g.onsuccess = () => res(g.result || null); }; r.onerror = () => res(null); }));
  log('idb stock cache:', idb && { since: idb.since, n: Object.keys(idb.m || {}).length }); if (!idb || !idb.m || idb.m.AHG100 !== 10) errs.push('stock map should be kept in IndexedDB');
  await pg.close();
  pg = await mk();
  /* 새 페이지: 메모리 캐시 없음 → IDB 에서 가져오고 at > since 만 읽어야 함. 시드에서 AHG102 를 바꿔 둠 (at 이 더 늦음) */
  await pg.evaluate(() => { const s = window.__MOCK_STORE__.stock; s.AHG102 = { id: 'AHG102', code: 'AHG102', qty: 99, at: '2026-11-01T09:00:00Z' }; s.AHG100 = { id: 'AHG100', code: 'AHG100', qty: 777, at: '2026-10-01T00:00:00Z' }; });   // AHG100 은 옛 at → 보관값(10) 유지돼야 함
  await pg.evaluate(() => { location.hash = '#/stock/find'; }); await pg.waitForSelector('#skQ', { timeout: 8000 }); await pg.waitForTimeout(1500);
  const st = await pg.$$eval('#skRes [data-sti]', r => r.filter(x => /^AHG10[02]$/.test(x.dataset.sti)).map(x => x.dataset.sti + ':' + (x.querySelector('.cnum, td.r b') || {}).textContent)); log('stock rows:', st);
  if (!st.some(x => x === 'AHG102:99')) errs.push('changed stock (newer at) should be merged'); if (!st.some(x => x === 'AHG100:10')) errs.push('unchanged stock should come from the phone cache, not a full re-read');
  /* ---------- 지난 달 인보이스 보관 ---------- */
  await pg.evaluate(() => { location.hash = '#/own'; }); await pg.waitForTimeout(2500);
  const invKeys = await pg.evaluate(() => new Promise(res => { const r = indexedDB.open('theone', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').getAllKeys(); g.onsuccess = () => res((g.result || []).filter(k => /^kv\.(inv\.m\.|own\.)/.test(k))); }; r.onerror = () => res([]); }));
  log('cached keys:', invKeys); if (!invKeys.some(k => /^kv\.inv\.m\./.test(k))) errs.push('past months of invoices should be cached'); if (!invKeys.some(k => /^kv\.own\.comm/.test(k))) errs.push('settlement estimate should be cached for the dashboard');
  await pg.close();
  await br.close(); srv.kill();
  if (errs.length) { console.log('FAIL', errs); process.exit(1); } console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
