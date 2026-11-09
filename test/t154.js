/* v0.8.174 시험 — 🛒 주문 화면: ✕ 검색어 지우기 · 전체/분류를 누르면 검색어도 지워짐 · 💲 목록 보기 가격 칸 = 가격 창 · 같은 분류 · 같은 목록가 아이템에 가격 같이 적용 (이전 프로그램의 Cust Price)
 *   ① 검색어가 있으면 검색 칸 옆 ✕ 가 보이고, 누르면 검색어가 지워지고 분류 타일이 돌아옴 · 검색어가 있을 때 "전체" 를 눌러도 검색어가 지워짐
 *   ② 목록 보기에서 가격 칸을 누르면 가격 창(#qpPr) · 창에 "같은 분류 · 같은 목록가 N개도 이 가격으로" 선택이 있음
 *   ③ 담긴 아이템의 가격을 바꾸면 같은 분류 · 같은 목록가의 담긴 줄은 바로 바뀌고, 안 담긴 것은 그 뒤 담을 때 그 가격으로 들어감 · 목록에도 바뀐 가격이 보임 · 다른 목록가 아이템은 그대로
 *   ④ 선택을 끄면 그 아이템만 바뀜 · 저장된 주문 줄에 바뀐 가격과 목록가(lp) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8819', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const pg = await (await br.newContext({ viewport: { width: 1000, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; try { localStorage.setItem('theone.order.view', 'list'); } catch (e) {} });
  await pg.goto('http://127.0.0.1:8819/test/demo.html'); await pg.waitForSelector('#nav button');
  await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(200); }
  /* 같은 분류 · 같은 가격인 아이템 찾기 (시드에서) */
  const grp = await pg.evaluate(() => { const M = window.__MOCK_STORE__; const rows = [].concat(...Object.values(M.catalog).filter(d => /^c\d+$/.test(d.id)).map(d => JSON.parse(d.j))).filter(r => !r[10] && Number(r[2]) > 0);
    const by = {}; rows.forEach(r => { const k = [r[5], r[6], r[7], r[8], r[2]].join('|'); (by[k] = by[k] || []).push(r[0]); });
    const k = Object.keys(by).filter(x => by[x].length >= 4).sort((x, y) => by[y].length - by[x].length)[0]; const [g, l1, l2, l3, p] = k.split('|');
    const diff = rows.find(r => r[5] === g && r[6] === l1 && r[7] === l2 && r[8] === l3 && Math.abs(Number(r[2]) - Number(p)) > 0.01);
    return { codes: by[k].slice(0, 4), n: by[k].length, p: Number(p), diff: diff ? { c: diff[0], p: Number(diff[2]) } : null }; });
  log('group:', JSON.stringify(grp)); const [A, B, Cc, D] = grp.codes;
  /* ① ✕ 검색어 지우기 · 전체 */
  await pg.fill('#eQ1', A); await pg.waitForTimeout(500);
  if (await pg.$eval('#eQX', e => e.style.display === 'none')) errs.push('① ✕ shows when there is a search term');
  if (await pg.$eval('.cats', e => e.style.display !== 'none')) errs.push('① category tiles hidden while searching');
  await pg.click('#eQX'); await pg.waitForTimeout(300);
  if ((await pg.$eval('#eQ1', e => e.value)) !== '' || await pg.$eval('.cats', e => e.style.display === 'none')) errs.push('① ✕ clears the search and brings the tiles back');
  if (!(await pg.$eval('#eQX', e => e.style.display === 'none'))) errs.push('① ✕ hidden again when empty');
  await pg.fill('#eQ1', A); await pg.waitForTimeout(400); await pg.click('[data-cp="0"]'); await pg.waitForTimeout(400);
  if ((await pg.$eval('#eQ1', e => e.value)) !== '') errs.push('① tapping 전체 clears the search term');
  /* ② 가격 칸 → 가격 창 (같은 분류 선택 있음) */
  await pg.fill('#eQ1', A); await pg.waitForTimeout(500);
  await pg.click('#eRes tr[data-frow="' + A + '"] td.ct'); await pg.waitForTimeout(200);   // A 담김 (1개)
  await pg.click('#eRes tr[data-frow="' + A + '"] td.pc'); await pg.waitForTimeout(300);
  if (!(await pg.$('#qpPr'))) errs.push('② price cell opens the price pad');
  const sibTxt = await pg.evaluate(() => (document.getElementById('qpSib') || {}).textContent || ''); log('② sib option:', sibTxt.replace(/\s+/g, ' ').slice(0, 90));
  if (!new RegExp(' ' + (grp.n - 1) + '개도').test(sibTxt)) errs.push('② option names the ' + (grp.n - 1) + ' same-category same-price items');
  await pg.click('#qpX'); await pg.waitForTimeout(200);
  /* ③ B 도 담고 → A 가격 바꾸기(같이 적용) → B 바로 · C 는 담을 때 */
  await pg.fill('#eQ1', B); await pg.waitForTimeout(500); await pg.click('#eRes tr[data-frow="' + B + '"] td.ct'); await pg.waitForTimeout(200);
  await pg.fill('#eQ1', A); await pg.waitForTimeout(500); await pg.click('#eRes tr[data-frow="' + A + '"] td.pc'); await pg.waitForSelector('#qpPr');
  const newP = Math.round((grp.p + 0.5) * 100) / 100;
  await pg.fill('#qpPr', String(newP)); await pg.click('#qpOk'); await pg.waitForTimeout(700);
  const lines = () => pg.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf('theone.order.wip') === 0)) || '{}').lines || []);
  let L = await lines(); log('③ lines after change:', JSON.stringify(L.map(l => [l.c, l.p, l.lp])));
  const lb = L.find(l => l.c === B); if (!lb || Math.abs(lb.p - newP) > 0.001) errs.push('③ sibling already in the order gets the new price');
  await pg.fill('#eQ1', Cc); await pg.waitForTimeout(500);
  const shown = await pg.$eval('#eRes tr[data-frow="' + Cc + '"] td.pc', e => e.textContent); log('③ C price shown before adding:', shown.replace(/\s+/g, ' '));
  if (shown.indexOf(newP.toFixed(2)) < 0) errs.push('③ not-yet-added sibling already shows the applied price');
  await pg.click('#eRes tr[data-frow="' + Cc + '"] td.ct'); await pg.waitForTimeout(700); L = await lines();   /* 작성 중 저장은 0.4초 뒤 */
  const lc = L.find(l => l.c === Cc); if (!lc || Math.abs(lc.p - newP) > 0.001 || Math.abs(lc.lp - grp.p) > 0.001) errs.push('③ sibling added later gets the applied price and keeps the list price');
  if (grp.diff) { await pg.fill('#eQ1', grp.diff.c); await pg.waitForTimeout(500); const t = await pg.$eval('#eRes tr[data-frow="' + grp.diff.c + '"] td.pc', e => e.textContent); if (t.indexOf(newP.toFixed(2)) >= 0 && Math.abs(grp.diff.p - newP) > 0.001) errs.push('③ different list price in the same folder is not touched'); }
  /* ④ 선택 끄고 D 만 바꾸기 */
  await pg.fill('#eQ1', D); await pg.waitForTimeout(500); await pg.click('#eRes tr[data-frow="' + D + '"] td.ct'); await pg.waitForTimeout(200);
  await pg.click('#eRes tr[data-frow="' + D + '"] td.pc'); await pg.waitForSelector('#qpPr');
  const dShown = await pg.$eval('#qpPr', e => e.value); if (Math.abs(Number(dShown) - newP) > 0.001) errs.push('④ pad opens with the applied price (got ' + dShown + ')');
  await pg.click('#qpSib'); await pg.fill('#qpPr', String(newP + 1)); await pg.click('#qpOk'); await pg.waitForTimeout(700); L = await lines();
  const ld = L.find(l => l.c === D), la = L.find(l => l.c === A); if (!ld || Math.abs(ld.p - (newP + 1)) > 0.001) errs.push('④ D changed alone'); if (!la || Math.abs(la.p - newP) > 0.001) errs.push('④ A untouched when the option is off');
  await pg.click('#eDraft'); await pg.waitForTimeout(300); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const saved = await pg.evaluate(() => { const O = window.__MOCK_STORE__.orderLines || {}; const k = Object.keys(O).pop(); return k ? O[k].lines.map(l => [l.c, l.p, l.lp]) : null; }); log('④ saved:', JSON.stringify(saved));
  if (!saved || !saved.find(l => l[0] === B && Math.abs(l[1] - newP) < 0.001 && Math.abs(l[2] - grp.p) < 0.001)) errs.push('④ saved order keeps changed price and list price');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
