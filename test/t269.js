/* v0.8.229 시험 — 🚫 인보이스 뒤 단계 숨김: 포장 대기(done) · UPS 출고(ups) · UPS 픽업(packed) · 딜리버리 대기(dlv) — 인보이스 발행 = ✅ 완료(shipped) · 🚚 배송 조회 화면 없앰 → Shipping History
 *   (2026-11-13 창고 매니저 요청, 시험용 사본 — "다른 기능과 이을 때까지 완료로". 주문 흐름이 바뀌므로 실제 반영은 관리자 승인 필요: t244 ④)
 *   ① 검수 끝난(picked) 주문의 🧾 인보이스 발행 → st shipped · shipVia INVOICE · shipAt · doneAt · invs
 *   ② 창고 매니저 홈 · 서랍 주문 칸에 숨긴 네 단계 없음 · ✅ 완료 칸은 있음 · 🧭 주문 흐름 감독에도 없음
 *   ③ 포르투갈어 화면: 완료 = "Concluído"
 *   ④ 배송 조회(track) 칸이 홈 · 묶음 · 서랍 · 세일즈맨 메뉴에 없음 · 옛 주소 #/track/주문 → Shipping History 검색 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8967', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], fails = [], log = (...a) => console.log(...a);
  const ok = (cond, name) => { log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fails.push(name); };
  const SEED = `s.orders.push({ id: 'O261113-AAA1', no: 'O261113-AAA1', d: '2026-11-13', ym: '2026-11', sm: 'BRANDON', acct: '1271', store: 'BEAUTY 4U', st: 'picked', n: 1, qty: 2, amt: 5, createdAt: '2026-11-13T10:00:00Z', updatedAt: '2026-11-13T10:00:00Z', sentAt: '2026-11-13T10:00:00Z', pickAt: '2026-11-13T10:10:00Z', pickDoneAt: '2026-11-13T10:20:00Z' });
    s.orderLines = (s.orderLines || []).concat([{ id: 'O261113-AAA1', sm: 'BRANDON', lines: [{ c: 'AHG100', d: 'ITEM', q: 2, p: 2.5, lp: 2.5, pq: 2 }] }]);
    s.users.push({ id: 'wh@theonefl.com', email: 'wh@theonefl.com', name: 'W', role: 'manager', job: 'whmgr', active: true });`;
  const mk = async (email, lang) => {
    const pg = await (await br.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.lang) try { localStorage.setItem('theone.lang', o.lang); } catch (e) {} window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed: SEED, lang });
    await pg.goto('http://127.0.0.1:8967/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.waitForTimeout(500);
    return pg;
  };
  const HIDE = ['done', 'ups', 'packed', 'dlv'];

  log('▶ ① 인보이스 발행 → ✅ 완료');
  let pg = await mk('luke@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/order/O261113-AAA1'; }); await pg.waitForSelector('#mInv', { timeout: 10000 });
  await pg.click('#mInv'); await pg.waitForSelector('#ivOk'); await pg.click('#ivOk'); await pg.waitForTimeout(1500);
  const o = await pg.evaluate(() => window.__MOCK_STORE__.orders['O261113-AAA1']);
  ok(o && o.st === 'shipped', '주문 상태 = shipped (완료) — ' + (o && o.st));
  ok(o && o.shipVia === 'INVOICE' && o.shipAt && o.doneAt && (o.invs || []).length === 1, 'shipVia INVOICE · shipAt · doneAt · 인보이스 1장 ' + JSON.stringify(o && o.invs));
  await pg.close();

  log('▶ ② 창고 매니저 — 홈 · 서랍 · 흐름 감독');
  pg = await mk('wh@theonefl.com');
  await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForTimeout(1500);
  const tiles = await pg.$$eval('[data-hg]', b => b.map(x => x.dataset.hg));
  ok(HIDE.every(k => !tiles.includes(k)), '홈 타일에 숨긴 단계 없음 (' + tiles.filter(k => HIDE.includes(k)).join(',') + ')');
  ok(tiles.includes('shipped'), '홈에 ✅ 완료 칸 있음');
  const dlf = await pg.$$eval('[data-dlf]', b => b.map(x => x.dataset.dlf));
  ok(dlf.length > 0 && HIDE.every(k => !dlf.includes(k)), '서랍 주문 칸에 숨긴 단계 없음 (' + dlf.join(',') + ')');
  await pg.evaluate(() => { location.hash = '#/flow'; }); await pg.waitForTimeout(1500);
  const ft = await pg.evaluate(() => document.getElementById('page').innerText);
  ok(!/포장 대기|UPS 픽업 대기|딜리버리 대기/.test(ft), '🧭 흐름 감독에 포장 · 픽업 · 딜리버리 대기 없음');

  log('▶ ④ 🚚 배송 조회(Rastreamento) 화면 없음 → Shipping History');
  const tracks = [];
  for (const h of ['shome', 'hub/wh', 'hub/look']) { await pg.evaluate(h => { location.hash = '#/' + h; }, h); await pg.waitForTimeout(900); if (await pg.$('[data-hg="track"], [data-go="track"]')) tracks.push(h); }
  ok(!tracks.length, '홈 · 재고 · 조회 묶음에 배송 조회 칸 없음 (' + tracks.join(',') + ')');
  ok(!(await pg.$('#drawer [data-dgo="track"]')), '서랍에 배송 조회 없음');
  await pg.evaluate(() => { location.hash = '#/track/O261113-AAA1'; }); await pg.waitForTimeout(2500);
  ok(/#\/shiphist/.test(await pg.evaluate(() => location.hash)), '옛 주소 #/track → #/shiphist');
  ok((await pg.$eval('#shBusca', i => i.value).catch(() => '')) === 'O261113-AAA1', 'Shipping History 검색칸에 그 주문 번호');
  await pg.close();
  const sp = await mk('brandon@x.com');
  for (const h of ['home', 'hub/slook']) { await sp.evaluate(h => { location.hash = '#/' + h; }, h); await sp.waitForTimeout(900); if (await sp.$('[data-hg="track"], [data-go="track"], [data-qa="track"]')) tracks.push('sm:' + h); }
  ok(!tracks.length, '세일즈맨 홈 · 조회에도 배송 조회 없음');
  await sp.close();

  log('▶ ③ 포르투갈어 — Concluído');
  pg = await mk('wh@theonefl.com', 'pt');
  await pg.evaluate(() => { location.hash = '#/shome'; }); await pg.waitForTimeout(1500);
  const done = await pg.evaluate(() => { const b = document.querySelector('[data-hg="shipped"]'); return b ? b.innerText : ''; });
  ok(/Conclu[ií]do/.test(done), '완료 칸 = Concluído (' + done.replace(/\s+/g, ' ') + ')');
  await pg.close();

  ok(!errs.length, '페이지 오류 없음' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close(); srv.kill();
  if (fails.length) { console.log('FAIL t269 — ' + fails.join(' · ')); process.exit(1); }
  console.log('PASS t269');
})().catch(e => { console.error(e); process.exit(1); });
