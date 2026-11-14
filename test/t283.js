/* v0.8.242 시험 — 🎨 화면 안쪽도 조의 디자인 톤 (1단계: 세일즈맨 홈 · 담당자 주문 목록) · 세일즈맨 홈 인사말이 보임
 *   ① 세일즈맨 홈: 인사말(h1) 글자색과 카드 바탕이 다름(남색 위 남색 글씨 사고) · 제목(오늘 할 일 · 오늘 플랜 · 바로 가기) 앞이 선 아이콘(svg) · 바로 가기 타일 아이콘이 모두 svg · 할 일 줄 아이콘이 색 네모(.tq) 안 svg
 *   ② 담당자 주문 목록(폰 · 데스크탑): 위쪽 숫자 칸 3개가 색 네모(.tq) + 숫자 · 단계 탭 칸 아이콘이 모두 svg(이모지 없음 — 💾 임시 저장 포함) · 목록 제목 앞도 svg · 숫자 칸을 누르면 그 목록 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8970', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const open = async (email, job, w) => { const pg = await (await br.newContext({ viewport: { width: w, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(email + ' ' + w + ': ' + e.message));
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.job) window.__AFTER_SEED__ = s => { let u = s.users.find(x => x.id === o.email); if (!u) { u = { id: o.email, email: o.email, name: 'X', active: true }; s.users.push(u); } u.role = 'manager'; u.job = o.job; }; }, { email, job });
    await pg.goto('http://127.0.0.1:8970/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(500); return pg; };
  /* ① 세일즈맨 홈 */
  const sm = await open('brandon@x.com', '', 430); await sm.evaluate(() => { location.hash = '#/home'; }); await sm.waitForSelector('#dTodo .trow, #dTodo .none', { timeout: 8000 }); await sm.waitForTimeout(400);
  const h = await sm.evaluate(() => { const c = document.querySelector('.card.dhead'), h1 = c && c.querySelector('h1'); const bg = c ? getComputedStyle(c).backgroundColor : '', fg = h1 ? getComputedStyle(h1).color : '';
    return { bg, fg, h2: [...document.querySelectorAll('#page .card h2')].slice(0, 3).map(x => ({ t: x.textContent.trim().slice(0, 8), svg: !!x.querySelector('svg') })), qa: [...document.querySelectorAll('.qgrid .qb .i')].map(i => !!i.querySelector('svg') && !/\S/.test(i.textContent)), todo: [...document.querySelectorAll('#dTodo .trow')].map(r => !!r.querySelector('.tq svg') && !r.querySelector('.i')) }; });
  log('① home:', JSON.stringify(h));
  if (!h.fg || h.fg === h.bg || (h.bg === 'rgb(15, 27, 45)' && h.fg === 'rgb(15, 23, 42)')) errs.push('① the greeting is readable (text ' + h.fg + ' on ' + h.bg + ')');
  if (h.h2.length < 3 || h.h2.some(x => !x.svg || EMO.test(x.t))) errs.push('① section titles start with a line icon, no emoji');
  if (!h.qa.length || h.qa.some(x => !x)) errs.push('① every quick action tile icon is a line icon (' + h.qa.join() + ')');
  if (!h.todo.length || h.todo.some(x => !x)) errs.push('① todo rows use a colored square line icon');
  await sm.context().close();
  /* ② 담당자 주문 목록 */
  for (const w of [430, 1440]) {
    const pg = await open('office@theonefl.com', 'office', w); await pg.evaluate(() => { location.hash = '#/order'; }); await pg.waitForTimeout(900);
    await pg.evaluate(() => document.querySelectorAll('.hgrp').forEach(g => g.classList.add('open'))); await pg.click('[data-hg="pick"]'); await pg.waitForTimeout(900);
    const L = await pg.evaluate(() => ({ strip: [...document.querySelectorAll('#oStrip > div')].map(d => !!d.querySelector('.tq svg') && /\d|…/.test((d.querySelector('b') || {}).textContent || '')), chips: [...document.querySelectorAll('.omenu .ochips button')].filter(b => b.offsetWidth).map(b => ({ k: b.dataset.lf || (b.dataset.orf ? 'refresh' : '?'), svg: !!b.querySelector('.ci svg'), ci: (b.querySelector('.ci') || {}).textContent || '' })),
      h2: (() => { const x = [...document.querySelectorAll('#page .card h2')].find(e => /출고 작업/.test(e.textContent)); return x ? { svg: !!x.querySelector('svg'), t: x.textContent.trim().slice(0, 6) } : null; })() }));
    log('②', w, JSON.stringify({ strip: L.strip, chips: L.chips.map(c => c.k + (c.svg ? '' : '✗')).join(' '), h2: L.h2 }));
    if (L.strip.length !== 3 || L.strip.some(x => !x)) errs.push('② ' + w + ': 3 count cards with a colored square icon and a number');
    const bad = L.chips.filter(c => !c.svg || EMO.test(c.ci)); if (!L.chips.length || bad.length) errs.push('② ' + w + ': every stage tab uses a line icon (' + bad.map(c => c.k).join() + ')');
    if (!L.chips.some(c => c.k === 'draft')) errs.push('② ' + w + ': office tabs include 임시 저장 (draft)');
    if (!L.h2 || !L.h2.svg || EMO.test(L.h2.t)) errs.push('② ' + w + ': list title starts with a line icon');
    await pg.click('#oStrip > div:nth-child(1)'); await pg.waitForTimeout(900); const on = await pg.evaluate(() => [...document.querySelectorAll('.omenu [data-lf].on')].map(b => b.dataset.lf).join());
    if (on !== 'sent') errs.push('② ' + w + ': tapping the 신규 주문 card opens that list (' + on + ')');
    await pg.context().close();
  }
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
