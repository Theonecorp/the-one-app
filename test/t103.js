/* v0.8.126 시험 — 💵 수금 확인: ☑ · ② 수령 표시는 다시 읽지 않고 자리 그대로 → 💾 완료 때 한 번에 저장 · 📦 봉투 ✓ 도 표시만 → 💾
 *   ✏️ 거래처 정보 수정 (가게 창에서 바로) · 세일즈맨은 수정 요청 · 📈 세일즈맨 내 매출 (내 코드만) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8852', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [], log = (...a) => console.log(...a);
  const ctx = await br.newContext({ viewport: { width: 400, height: 760 } });
  const mk = async (email, seed) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.addInitScript(o => { window.__MOCK_USER__ = { email: o.email, name: 'X' }; if (o.seed) window.__AFTER_SEED__ = new Function('s', o.seed); }, { email, seed }); await pg.goto('http://127.0.0.1:8852/test/demo.html'); await pg.waitForSelector('#nav button'); return pg; };
  const seed = `const base = s.entries.find(e => e.sm === 'BRANDON' && e.pays && e.pays.length); const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    for (let i = 0; i < 30; i++) { const e = JSON.parse(JSON.stringify(base)); e.id = 'VV' + i; e.d = day(i % 6); e.ym = e.d.slice(0, 7); e.v = false; e.settled = ''; e.sb = false; e.rc = false; e.env = ''; e.mismatch = ''; e.store = 'VSTORE ' + i; e.pays = [{ m: 'CHECK', ref: String(7000 + i), amt: 100 + i }]; e.refs = [String(7000 + i)]; e.invs = []; e.total = 100 + i; s.entries.push(e); }
    const E1 = s.entries.find(e => e.id === 'VV1'), E2 = s.entries.find(e => e.id === 'VV2'); E1.env = 'VENV'; E2.env = 'VENV';
    s.envelopes = [{ id: 'VENV', sm: 'BRANDON', n: 2, total: 203, st: 'sent', sentAt: new Date().toISOString(), by: 'brandon@x.com', entries: ['VV1', 'VV2'], got: {}, miss: {}, checks: [{ eid: 'VV1', ref: '7001', amt: 101, store: E1.store, acct: E1.acct, d: E1.d }, { eid: 'VV2', ref: '7002', amt: 102, store: E2.store, acct: E2.acct, d: E2.d }] }];`;
  /* ---------- 💵 수금 확인 (관리자) ---------- */
  let pg = await mk('luke@theonefl.com', seed);
  await pg.evaluate(() => { location.hash = '#/verify'; }); await pg.waitForSelector('[data-vck="VV20"]', { timeout: 8000 });
  await pg.evaluate(() => { const el = document.querySelector('[data-vck="VV20"]'); el.scrollIntoView({ block: 'center' }); document.querySelector('[data-vid="VV0"]').dataset.keep = '1'; });
  await pg.waitForTimeout(300); const y0 = await pg.evaluate(() => window.scrollY); log('scrolled to', y0);
  for (const id of ['VV20', 'VV21', 'VV22']) { await pg.evaluate(i => document.querySelector('[data-vck="' + i + '"]').closest('.ckw').click(), id); await pg.waitForTimeout(150); }   // 체크칸 둘레를 눌러도
  const st0 = await pg.evaluate(() => ({ y: window.scrollY, keep: !!document.querySelector('[data-keep]'), pend: document.querySelectorAll('.pr.pend').length, modal: document.getElementById('modal').classList.contains('on'), sb: ['VV20', 'VV21', 'VV22'].filter(i => window.__MOCK_STORE__.entries[i].sb).length, bar: document.getElementById('vBulk').textContent }));
  log('after 3 ticks:', st0);
  if (!st0.keep) errs.push('ticking must not redraw the page'); if (Math.abs(st0.y - y0) > 5) errs.push('ticking must not move the scroll'); if (st0.pend !== 3) errs.push('ticked rows should be highlighted'); if (st0.modal) errs.push('tapping the box edge must not open the detail'); if (st0.sb) errs.push('nothing saved before 완료');
  if (!/완료/.test(st0.bar)) errs.push('bulk bar should offer 💾 … 완료');
  /* 📬 체크 번호 맞추기 → ② 수령 ✓ 는 표시만 */
  await pg.fill('#ckNo', '7023'); await pg.press('#ckNo', 'Enter'); await pg.waitForSelector('[data-ckrc="VV23"]', { timeout: 5000 }); await pg.click('[data-ckrc="VV23"]'); await pg.waitForTimeout(300);
  const st1 = await pg.evaluate(() => ({ rc: !!window.__MOCK_STORE__.entries.VV23.rc, sel: document.querySelector('[data-vck="VV23"]').checked, keep: !!document.querySelector('[data-keep]') }));
  log('check match:', st1); if (st1.rc) errs.push('② 수령 ✓ should only mark (not save)'); if (!st1.sel) errs.push('matched check should be ticked'); if (!st1.keep) errs.push('matching must not redraw');
  await pg.evaluate(() => document.querySelector('[data-vck="VV20"]').scrollIntoView({ block: 'center' })); await pg.waitForTimeout(200); const y1 = await pg.evaluate(() => window.scrollY);
  await pg.click('#vbRc'); await pg.waitForSelector('#cfOk'); await pg.click('#cfOk'); await pg.waitForTimeout(1200);
  const st2 = await pg.evaluate(() => ({ y: window.scrollY, rc: ['VV20', 'VV21', 'VV22', 'VV23'].filter(i => window.__MOCK_STORE__.entries[i].rc).length, ticked: document.querySelectorAll('.pr.pend').length }));
  log('after 완료:', st2, 'was at', y1); if (st2.rc !== 4) errs.push('완료 should save all 4'); if (Math.abs(st2.y - y1) > 60) errs.push('after 완료 the screen should stay where it was (not jump to top)'); if (st2.ticked) errs.push('saved rows should be unticked');
  /* 상세 창 저장도 자리 그대로 */
  await pg.evaluate(() => document.querySelector('[data-vid="VV25"]').scrollIntoView({ block: 'center' })); await pg.waitForTimeout(200); const y2 = await pg.evaluate(() => window.scrollY);
  await pg.click('[data-vid="VV25"] .ct'); await pg.waitForSelector('#pkSb'); await pg.click('#pkSb'); await pg.click('#vSave'); await pg.waitForTimeout(800);
  const st3 = await pg.evaluate(() => ({ y: window.scrollY, sb: !!window.__MOCK_STORE__.entries.VV25.sb })); log('detail save:', st3, 'was at', y2);
  if (!st3.sb) errs.push('detail save failed'); if (Math.abs(st3.y - y2) > 60) errs.push('detail save should keep the scroll');
  /* 📦 봉투 — ✓ 표시만, 💾 로 저장 */
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForSelector('[data-ev]', { timeout: 5000 }); await pg.click('[data-ev]'); await pg.waitForSelector('[data-ok]');
  const k1 = await pg.$eval('[data-ok]', b => b.dataset.ok); await pg.click('[data-ok="' + k1 + '"]'); await pg.waitForTimeout(300);
  const e1 = await pg.evaluate(() => ({ got: Object.keys(window.__MOCK_STORE__.envelopes.VENV.got || {}).length, bar: !!document.getElementById('evSave'), marks: document.querySelectorAll('#mbox .pr.v').length }));
  log('envelope after ✓:', e1); if (e1.got) errs.push('envelope ✓ should not save yet'); if (!e1.bar) errs.push('envelope 💾 bar missing'); if (e1.marks !== 1) errs.push('envelope ✓ should show at once');
  await pg.click('[data-ok]'); await pg.waitForTimeout(200); await pg.click('#evSave'); await pg.waitForTimeout(800);
  const e2 = await pg.evaluate(() => ({ got: Object.keys(window.__MOCK_STORE__.envelopes.VENV.got || {}).length, rc: ['VV1', 'VV2'].filter(i => window.__MOCK_STORE__.entries[i].rc).length, bar: !!document.getElementById('evSave') }));
  log('envelope after 💾:', e2); if (e2.got !== 2 || e2.rc !== 2) errs.push('envelope 💾 should save both checks and mark ② rc'); if (e2.bar) errs.push('save bar should go away after saving');
  await pg.click('#evX'); await pg.waitForTimeout(600);
  /* ---------- ✏️ 거래처 정보 수정 — 가게 창에서 바로 ---------- */
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForSelector('[data-st="1111"]', { timeout: 8000 }); await pg.click('[data-st="1111"] .ct');
  await pg.waitForSelector('#ssEdit', { timeout: 8000 }); await pg.click('#ssEdit'); await pg.waitForSelector('#sAddr');
  await pg.fill('#sAddr', '100 NEW ST'); await pg.fill('#sTel', '954-555-0101'); await pg.click('#sSave'); await pg.waitForSelector('#ssEdit', { timeout: 8000 }).catch(() => errs.push('after saving it should go back to the store window'));
  const a1 = await pg.evaluate(() => ({ addr: window.__MOCK_STORE__.accounts['1111'].addr, tel: window.__MOCK_STORE__.accounts['1111'].tel, sheet: document.getElementById('mbox').textContent }));
  log('edited:', a1.addr, a1.tel, /100 NEW ST/.test(a1.sheet)); if (a1.addr !== '100 NEW ST' || a1.tel !== '954-555-0101') errs.push('account not updated'); if (!/100 NEW ST/.test(a1.sheet)) errs.push('store window should show the new address');
  await pg.close();
  /* ---------- 세일즈맨: ✏️ 수정 요청 · 📈 내 매출 ---------- */
  const seed2 = `const d = new Date(), ym0 = d.toISOString().slice(0, 7), dd = d.toISOString().slice(0, 10); const p = new Date(d); p.setDate(1); p.setMonth(p.getMonth() - 1); const ym1 = p.toISOString().slice(0, 7), d1 = ym1 + '-10';
    s.invoices = (s.invoices || []).filter(x => !(x.sm === 'BRANDON' && [ym0, ym1].includes(x.ym))).concat([
      { id: 'A50001', no: 'A50001', t: 'A', d: dd, ym: ym0, acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 1000, bal: 1000, st: 'open' },
      { id: 'W50002', no: 'W50002', t: 'W', d: dd, ym: ym0, acct: '1271', store: 'BEAUTY 4U', sm: 'BRANDON', total: 500, bal: 500, st: 'open' },
      { id: 'CM5003', no: 'CM5003', t: 'CM', d: dd, ym: ym0, acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: -50, bal: -50, st: 'open', src: 'credit' },
      { id: 'A50004', no: 'A50004', t: 'A', d: dd, ym: ym0, acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 999, bal: 0, st: 'x' },
      { id: 'A50005', no: 'A50005', t: 'A', d: dd, ym: ym0, acct: '9999', store: 'OTHER', sm: 'JOHN', total: 7777, bal: 7777, st: 'open' },
      { id: 'A40001', no: 'A40001', t: 'A', d: d1, ym: ym1, acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', total: 1200, bal: 0, st: 'paid' }]);`;
  pg = await mk('brandon@x.com', seed2);
  const tile = await pg.$('[data-hg="mysales"]'); if (!tile) errs.push('home should have 📈 내 매출');
  await pg.evaluate(() => { location.hash = '#/mysales'; }); await pg.waitForFunction(() => /내 매출|My sales/.test(document.getElementById('page').textContent) && !/새로 읽는 중|refreshing/.test(document.getElementById('page').textContent), null, { timeout: 8000 });
  const t = (await pg.textContent('#page')).replace(/\s+/g, ' '); log('my sales:', t.slice(0, 220));
  if (!/1,450\.00/.test(t)) errs.push('this month net should be 1000 + 500 − 50 = 1,450 (VOID excluded)'); if (/7,777/.test(t) || /OTHER/.test(t)) errs.push('another salesman\'s invoice must not show');
  if (!/1,200\.00/.test(t)) errs.push('last month should be 1,200'); if (!/-?\$?-?50\.00|\(50\.00\)/.test(t)) errs.push('credits should show');
  await pg.click('[data-msm]:nth-of-type(2)').catch(() => {}); await pg.waitForTimeout(300);
  await pg.evaluate(() => { location.hash = '#/stores'; }); await pg.waitForSelector('[data-st="1111"]', { timeout: 8000 }); await pg.click('[data-st="1111"] .ct');
  await pg.waitForSelector('#ssEdit', { timeout: 8000 }); const lbl = await pg.textContent('#ssEdit'); log('salesman edit button:', lbl); if (!/요청|Request/.test(lbl)) errs.push('salesman should get 수정 요청');
  await pg.click('#ssEdit'); await pg.waitForSelector('#frAddr'); await pg.fill('#frTel', '305-111-2222'); await pg.click('#frOk'); await pg.waitForTimeout(800);
  const q = await pg.evaluate(() => { const L = Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'acctFix'); const N = Object.values(window.__MOCK_STORE__.acctNotes || {}).filter(n => n.acct === '1111'); return { n: L.length, text: L[0] && L[0].text, staff: L[0] && L[0].toStaff, notes: N.length, acctTel: window.__MOCK_STORE__.accounts['1111'].tel || '' }; });
  log('request:', q); if (q.n !== 1 || !/305-111-2222/.test(q.text || '') || !q.staff) errs.push('edit request should go to the office'); if (!q.notes) errs.push('request should leave a store note'); if (q.acctTel === '305-111-2222') errs.push('salesman must not change the account directly');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
