/* v0.8.172 시험 — 🎁 인서트 · 디스플레이 요청 종류: 창고 실제 종류 16종이 영어 표기 그대로 (C4 Spinner · C4 Insert · C13 Spinner · C13 Insert · BCBTop · BCBase · LB1 · LB2 · LB3 · LD · Wall Short · Wall Long · Black Insert · Bangle Insert · Nose Ring Insert · Black Wide Insert)
 *   ① 📝 메모 탭 목록 = 기본 16종, 순서 · 이름 그대로 · 옛 주문의 WALL · FLOOR 키는 Wall Display · Floor Display 로 그대로 보임
 *   ② 관리 → 설정 "인서트 · 디스플레이 종류" 칸에 줄을 더해 저장 → 주문 메모 탭에 새 종류가 생김 · 비우고 저장하면 기본 목록
 *   ③ 담당자 주문: 가게의 세일즈맨이 서버에는 있는데 폰 목록엔 없을 때(옛 캐시) 저장하면 서버 값으로 채워 바로 저장 (고르는 창 없이) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
const DEF = ['C4 Spinner', 'C4 Insert', 'C13 Spinner', 'C13 Insert', 'BCBTop', 'BCBase', 'LB1', 'LB2', 'LB3', 'LD', 'Wall Short', 'Wall Long', 'Black Insert', 'Bangle Insert', 'Nose Ring Insert', 'Black Wide Insert'];
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8815', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a);
  const mk = async (email, seed) => { const pg = await (await br.newContext({ viewport: { width: 430, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8815/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); return pg; };
  const newOrder = async (pg, q) => { await pg.evaluate(() => { Object.keys(localStorage).filter(k => k.indexOf('theone.order.wip') === 0).forEach(k => localStorage.removeItem(k)); location.hash = '#/stores'; }); await pg.waitForTimeout(300); await pg.evaluate(() => { location.hash = '#/order/new'; }); await pg.waitForSelector('#eStoreQ'); await pg.fill('#eStoreQ', q); await pg.waitForTimeout(250); await pg.click('#eStoreHits [data-ac]'); await pg.waitForTimeout(900); if (await pg.$('#modal.on')) { await pg.click('#modal .mclose'); await pg.waitForTimeout(200); } };
  /* ① 기본 목록 · 옛 키 */
  const d = (z => new Date(z - z.getTimezoneOffset() * 6e4).toISOString().substring(0, 10))(new Date(new Date()));
  const pg = await mk('brandon@x.com', "s.orders = [{ id: 'O-OLD1', no: 'O-OLD1', d: '" + d + "', ym: '" + d.substring(0, 7) + "', sm: 'BRANDON', acct: '1111', store: 'ALI B/S # 1', st: 'sent', n: 1, qty: 3, amt: 30, req: { WALL: 1, FLOOR: 2, C4: 1 }, createdBy: 'brandon@x.com', createdAt: '" + d + "T10:00:00Z', updatedAt: '" + d + "T10:00:00Z' }];");
  await newOrder(pg, 'ali'); await pg.click('[data-ev="memo"]'); await pg.waitForSelector('[data-rqp]', { timeout: 5000 });
  const kinds = await pg.$$eval('.reqrow', r => r.map(x => x.querySelector('b').textContent.trim())); log('① kinds:', kinds.length, kinds.join(' · '));
  if (kinds.join('|') !== DEF.join('|')) errs.push('① memo tab lists the 16 kinds in order with exact names (got ' + kinds.join('|') + ')');
  const keys = await pg.$$eval('[data-rqp]', b => b.map(x => x.dataset.rqp)); if (!keys.includes('C4') || !keys.includes('C13') || !keys.includes('WALLS') || !keys.includes('NOSE')) errs.push('① keys C4 · C13 kept, WALLS · NOSE added');
  await pg.evaluate(() => { location.hash = '#/order/O-OLD1'; }); await pg.waitForTimeout(1500);
  const old = (await pg.textContent('#page')).replace(/\s+/g, ' '); log('① old order:', (old.match(/🎁[^—]{0,80}/) || [''])[0]);
  if (!/C4 Insert ×1/.test(old) || !/Wall Display ×1/.test(old) || !/Floor Display ×2/.test(old)) errs.push('① old WALL · FLOOR keys still show as Wall Display · Floor Display');
  await pg.close();
  /* ② 설정으로 종류 추가 · 기본으로 */
  const ad = await mk('luke@theonefl.com', '');
  await ad.evaluate(() => { location.hash = '#/admin/set'; }); await ad.waitForSelector('#stReq', { timeout: 8000 }).catch(() => errs.push('② settings has the request kinds box'));
  const txt0 = await ad.$eval('#stReq', e => e.value); log('② box lines:', txt0.split('\n').length); if (txt0.split('\n').length !== 16 || !/^C4SP \| C4 Spinner/.test(txt0)) errs.push('② box shows the default 16 lines "key | name"');
  await ad.fill('#stReq', txt0 + '\nNEWD | Counter Display 2\nRing Tower'); await ad.click('#stSave'); await ad.waitForTimeout(600);
  const saved = await ad.evaluate(() => (window.__MOCK_STORE__.settings.app || {}).reqKinds || ''); if (!/NEWD \| Counter Display 2/.test(saved)) errs.push('② reqKinds saved in settings/app');
  await newOrder(ad, 'ali'); await ad.click('[data-ev="memo"]'); await ad.waitForSelector('[data-rqp]', { timeout: 5000 });
  const k2 = await ad.$$eval('.reqrow', r => r.map(x => x.querySelector('b').textContent.trim())); log('② kinds after add:', k2.length);
  if (k2.length !== 18 || k2[16] !== 'Counter Display 2' || k2[17] !== 'Ring Tower') errs.push('② new kinds appear after the defaults (got ' + k2.slice(14).join('|') + ')');
  if (!(await ad.$('[data-rqp="NEWD"]')) || !(await ad.$('[data-rqp="RINGTOWER"]'))) errs.push('② key given or made from the name');
  await ad.click('[data-rqp="NEWD"]'); await ad.waitForTimeout(100); if (!/Counter Display 2 ×1/.test((await ad.textContent('#eBody')).replace(/\s+/g, ' '))) errs.push('② request text uses the new name');
  await ad.evaluate(() => { location.hash = '#/admin/set'; }); await ad.waitForSelector('#stReq', { timeout: 8000 }); await ad.fill('#stReq', ''); await ad.click('#stSave'); await ad.waitForTimeout(600);
  await newOrder(ad, 'ali'); await ad.click('[data-ev="memo"]'); await ad.waitForSelector('[data-rqp]', { timeout: 5000 });
  if ((await ad.$$eval('.reqrow', r => r.length)) !== 16) errs.push('② empty box = default list');
  await ad.close();
  /* ③ 서버에만 있는 세일즈맨 — 폰 목록(accounts 캐시)엔 없음 */
  const of = await mk('office@x.com', "s.users.push({ id: 'office@x.com', email: 'office@x.com', name: 'O', role: 'manager', job: 'office', active: true }); s.accounts.push({ id: '9778', acct: '9778', store: 'STALE SM STORE', addr: '2 ST', city: 'MIAMI', state: 'FL', zip: '33101' });");
  await newOrder(of, 'STALE SM');
  await of.evaluate(() => { const M = window.__MOCK_STORE__; M.accounts['9778'] = Object.assign({}, M.accounts['9778'] || { id: '9778', acct: '9778', store: 'STALE SM STORE' }, { sm: 'ALEX' }); });   /* 서버 쪽에서만 세일즈맨이 붙음 */
  await of.fill('#eQ1', 'AHG100'); await of.press('#eQ1', 'Enter'); await of.waitForTimeout(400);
  await of.click('#eDraft'); await of.waitForTimeout(800);
  if (await of.$('#smPick')) errs.push('③ server-side salesman is used — no picker');
  if (await of.$('#cfOk')) await of.click('#cfOk'); await of.waitForTimeout(1200);
  const o3 = await of.evaluate(() => Object.values(window.__MOCK_STORE__.orders || {}).filter(o => o.store === 'STALE SM STORE').map(o => o.sm)); log('③ saved sm:', o3.join(','));
  if (o3.join() !== 'ALEX') errs.push('③ order saved with the server-side salesman');
  await of.close();
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
