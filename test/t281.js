/* v0.8.241 시험 — 🧭 관리 › 메뉴: 서랍 고정 메뉴를 관리자가 역할별로 (2026-11-14 관리자: "서랍 메뉴 전체를 관리 화면에서 — 역할에 맞게 보이기 · 이름 변경 · 위아래 이동 · 정리한 뒤 고정")
 *   ① 관리 › 🧭 메뉴: 역할 칩 · 묶음 줄 · 화면 줄(☑ · 이름 · ↑ ↓ · 묶음 옮기기)
 *   ② 오피스 매니저: '세일' 이름 → '주문 넣기' · '영업' 묶음을 맨 위로 · '거래처' 끄기 · 🔒 오너 전용 '세일즈맨 정산'(pay) 켜기 → 저장
 *   ③ 오피스 매니저 로그인: 서랍 첫 묶음 = 영업 · '주문 넣기' 보임 · 거래처 안 보임 · 세일즈맨 정산은 켜도 안 보임(권한 잠금)
 *   ④ 관리자는 오너 모드에서도 서랍에 ⚙️ 관리
 *   ⑤ ↺ 기본값 → 설정 지움 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8966', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 1300, height: 1000 } });   // 같은 창(같은 메모리 DB)에서 사람만 바꿈
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { const who = sessionStorage.getItem('t280who') || 'luke@theonefl.com'; window.__MOCK_USER__ = { email: who, name: 'T' };
    window.__AFTER_SEED__ = s => { s.users.push({ id: 'off@x.com', email: 'off@x.com', name: 'O', role: 'manager', job: 'office', active: true }); const keep = sessionStorage.getItem('t280cfg'); if (keep) { const st = Array.isArray(s.settings) ? s.settings.find(x => x.id === 'app') : s.settings && s.settings.app; if (st) st.drawerCfg = JSON.parse(keep); } }; });
  await pg.goto('http://127.0.0.1:8966/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(700);
  /* ① */
  await pg.evaluate(() => { location.hash = '#/admin/menu'; }); await pg.waitForSelector('.mcfg', { timeout: 8000 });
  await pg.click('[data-mr="office"]'); await pg.waitForTimeout(300);
  const groups = await pg.$$eval('.mcg', G => G.map(g => g.querySelector('.mch .mcn').placeholder)); log('① office groups:', groups.join(' | '));
  if (!groups.length || !(await pg.$('[data-mio]')) || !(await pg.$('[data-miu]')) || !(await pg.$('[data-mg]'))) errs.push('① editor rows with show · name · up/down · move');
  /* ② */
  const idx = k => pg.evaluate(k => { const gs = [...document.querySelectorAll('.mcg')]; for (let gi = 0; gi < gs.length; gi++) { const rows = [...gs[gi].querySelectorAll('.mci')]; for (let ii = 0; ii < rows.length; ii++) if (rows[ii].querySelector('.mck2').textContent === k || rows[ii].querySelector('[data-min]').placeholder === k) return gi + ':' + ii; } return null; }, k);
  const gIdx = name => pg.evaluate(n => [...document.querySelectorAll('.mcg')].findIndex(g => g.querySelector('.mch .mcn').placeholder === n), name);
  let i = await idx('세일'); await pg.fill('[data-min="' + i + '"]', '주문 넣기'); await pg.dispatchEvent('[data-min="' + i + '"]', 'input');
  let gi = await gIdx('영업'); while (gi > 0) { await pg.click('[data-mgu="' + gi + '"]'); await pg.waitForTimeout(80); gi = await gIdx('영업'); }
  i = await idx('거래처'); if (await pg.isChecked('[data-mio="' + i + '"]')) await pg.click('[data-mio="' + i + '"]'); await pg.waitForTimeout(80);
  i = await idx('pay') || await idx('세일즈맨 정산'); if (i && !(await pg.isChecked('[data-mio="' + i + '"]'))) await pg.click('[data-mio="' + i + '"]'); await pg.waitForTimeout(80);
  await pg.click('#mcSave'); await pg.waitForTimeout(500);
  const saved = await pg.evaluate(() => { const st = window.__MOCK_STORE__.settings.app; return st && st.drawerCfg && st.drawerCfg.office; });
  log('② saved first group:', saved && saved[0].id, '| 세일 name:', saved && JSON.stringify(saved.flatMap(g => g.items).find(x => x.k === 'order')), '| stores:', saved && JSON.stringify(saved.flatMap(g => g.items).find(x => x.k === 'stores')));
  if (!saved || saved[0].id !== 'sales' || saved.flatMap(g => g.items).find(x => x.k === 'order').name !== '주문 넣기' || saved.flatMap(g => g.items).find(x => x.k === 'stores').on !== false) errs.push('② office layout saved (sales first · renamed · stores off)');
  /* ③ office 로그인 */
  await pg.evaluate(c => { sessionStorage.setItem('t280cfg', JSON.stringify(c)); sessionStorage.setItem('t280who', 'off@x.com'); }, { office: saved });
  await pg.reload(); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(900);
  const dr = await pg.evaluate(() => ({ first: (document.querySelector('#drawer .dgrp') || {}).dataset ? document.querySelector('#drawer .dgrp').dataset.dg : '', txt: document.getElementById('drawer').innerText.replace(/\s+/g, ' '), go: [...document.querySelectorAll('#drawer [data-dgo]')].map(b => b.dataset.dgo) }));
  log('③ office drawer first group:', dr.first, '| items:', dr.go.join(','));
  if (dr.first !== 'sales' || !/주문 넣기/.test(dr.txt) || dr.go.includes('stores')) errs.push('③ office drawer follows the saved layout (sales first · 주문 넣기 · no 거래처)');
  if (dr.go.includes('pay')) errs.push('③ owner-only screen stays hidden for office even if switched on');
  /* ④ 관리자 · 오너 모드 */
  await pg.evaluate(() => { sessionStorage.setItem('t280who', 'luke@theonefl.com'); localStorage.setItem('theone.view.luke@theonefl.com', 'owner'); }); await pg.reload(); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(900);
  const adm = await pg.evaluate(() => [...document.querySelectorAll('#drawer [data-dgo]')].map(b => b.dataset.dgo)); log('④ admin in owner mode has 관리:', adm.includes('admin'));
  if (!adm.includes('admin')) errs.push('④ admin keeps ⚙️ 관리 in the drawer in owner mode');
  /* ⑤ */
  await pg.evaluate(() => { localStorage.setItem('theone.view.luke@theonefl.com', 'admin'); location.hash = '#/admin/menu'; }); await pg.reload(); await pg.waitForSelector('.mcfg', { timeout: 8000 }); await pg.click('[data-mr="office"]'); await pg.waitForTimeout(300);
  await pg.click('#mcReset'); await pg.waitForTimeout(150); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(500);
  const after = await pg.evaluate(() => { const st = window.__MOCK_STORE__.settings.app; return st && st.drawerCfg && st.drawerCfg.office ? 'still' : 'gone'; }); log('⑤ after reset:', after); if (after !== 'gone') errs.push('⑤ reset removes the office layout');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
