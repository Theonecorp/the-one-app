/* v0.8.174 시험 — 🖥 태블릿 · 컴퓨터(900px+)의 주문 화면이 SBM GO 처럼 화면을 채움: 분류 타일이 폭에 맞춰 칸이 늘고, 아래 바(프리셋 · 합계 · 저장)가 한 줄로 합쳐져 아이템이 더 보임
 *   ① 폴드 가로(1000×700): 분류 타일 5칸 · 타일 높이 72px 이상 · 검색과 분류 경로가 한 줄 · 아래 바 한 줄(프리셋 · 합계 · 저장이 같은 높이) · 카드 2줄 이상 보임
 *   ② 아이패드 가로(1180×820): 타일 6칸 이상 · 카드 2줄 이상
 *   ③ 폰(430): 전과 같이 아래 바가 세 줄(프리셋 위 · 합계 · 단추) · 타일은 폰 규칙 그대로 (2칸 이상) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8818', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const open = async (W, H) => { const pg = await (await br.newContext({ viewport: { width: W, height: H } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'brandon@x.com', name: 'X' }; }); await pg.goto('http://127.0.0.1:8818/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
    await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', 'ali'); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(200); } return pg; };
  const measure = async pg => {
    const cats = await pg.evaluate(() => { const c = document.querySelector('.cats'); return c ? { cols: getComputedStyle(c).gridTemplateColumns.split(' ').length, h: c.querySelector('button').offsetHeight } : null; });
    const top = await pg.evaluate(() => { const q = document.getElementById('eQ1').getBoundingClientRect(), c = document.querySelector('.chips.crumbs').getBoundingClientRect(); return { sameRow: Math.abs(q.top - c.top) < 12 }; });
    const bar = await pg.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const q = r('#qbar'), t = r('.tbar'), b = r('.sticky .btns'); return { qt: Math.round(q.top), tt: Math.round(t.top), bt: Math.round(b.top), stickyH: Math.round(r('.sticky').height) }; });
    await pg.fill('#eQ1', 'AHG'); await pg.waitForTimeout(700);
    const cards = await pg.evaluate(() => { const top = document.querySelector('.sticky').getBoundingClientRect().top; const L = Array.from(document.querySelectorAll('.gcard')).filter(c => c.getBoundingClientRect().bottom < top); const rows = new Set(L.map(c => Math.round(c.getBoundingClientRect().top))); return { visible: L.length, rows: rows.size, cols: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length }; });
    return { cats, top, bar, cards };
  };
  /* ① 폴드 가로 */
  let pg = await open(1000, 700); let m = await measure(pg); log('① fold landscape:', JSON.stringify(m));
  if (!m.cats || m.cats.cols < 5) errs.push('① category tiles fill the width (5 columns at 1000px)');
  if (!m.cats || m.cats.h < 72) errs.push('① tiles are tall enough to tap (got ' + (m.cats && m.cats.h) + ')');
  if (!m.top.sameRow) errs.push('① search box and category path share one row in landscape');
  if (Math.abs(m.bar.qt - m.bar.tt) > 12 || Math.abs(m.bar.tt - m.bar.bt) > 12) errs.push('① preset bar · total · buttons are on one row (tops ' + m.bar.qt + '/' + m.bar.tt + '/' + m.bar.bt + ')');
  if (m.cards.rows < 2) errs.push('① at least two rows of item cards visible (got ' + m.cards.rows + ' rows, ' + m.cards.visible + ' cards)');
  await pg.close();
  /* ② 아이패드 가로 */
  pg = await open(1180, 820); m = await measure(pg); log('② ipad landscape:', JSON.stringify(m));
  if (!m.cats || m.cats.cols < 6) errs.push('② 6+ tile columns at 1180px');
  if (m.cards.rows < 2) errs.push('② two rows of cards visible');
  await pg.close();
  /* ③ 폰 — 전과 같음 */
  pg = await open(430, 900); m = await measure(pg); log('③ phone:', JSON.stringify(m));
  if (m.top.sameRow) errs.push('③ phone keeps the search box and category path on separate rows');
  if (!(m.bar.qt < m.bar.tt && m.bar.tt < m.bar.bt)) errs.push('③ phone keeps the stacked bottom bar');
  if (!m.cats || m.cats.cols < 2) errs.push('③ phone tiles at least 2 columns');
  await pg.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
