/* v0.8.75 시험 — 🔢 인보이스 번호 형식 (글자-6자리, 999999 다음 AA-000001) · 번호 형식 통일 도구 · 인보이스 목록은 번호 순 (🏷 종류별 묶음 · 날짜 묶음 안에서는 번호 순) · (2026-11 화면에 맞춤: v0.8.112 부터 날짜별 묶음, ↕ 은 날 순서) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8796', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], log = (...a) => console.log(...a), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) errs.push(m + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
  const pg = await br.newPage({ viewport: { width: 430, height: 1000 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.__MOCK_USER__ = { email: 'luke@theonefl.com', name: 'L' };
    const inv = (no, d, acct) => ({ id: no, no, t: no.replace(/[-\d].*/, ''), d, ym: d.substring(0, 7), acct, store: 'ALI B/S # 1', sm: 'BRANDON', total: 10, bal: 10, st: 'open', src: 'legacy', lines: [] });
    window.__AFTER_SEED__ = s => {
      s.invoices = [inv('A43350', '2026-10-20', '1111'), inv('A43349', '2026-10-20', '1111'), inv('A43301', '2026-10-25', '1111'), inv('P007803', '2026-10-21', '1111'), inv('P-008834', '2026-10-22', '1111'), inv('CM161', '2026-10-23', '1111')];   /* A43349 는 A43350 과 같은 날 — 하루 안 번호 순 확인 */
      s.cod = [{ id: 'C1', d: '2026-10-24', sm: 'BRANDON', acct: '1111', method: 'ACH', amt: 10, invs: [{ no: 'A43350', amt: 10 }] }];
      s.orders = [{ id: 'O261020-AAAA', no: 'O261020-AAAA', st: 'done', sm: 'BRANDON', acct: '1111', store: 'X', d: '2026-10-20', invs: ['A43301'] }];
    }; });
  await pg.goto('http://127.0.0.1:8796/test/demo.html'); await pg.waitForSelector('#nav button', { state: 'attached' });
  /* 1. 번호 만들기 · 맞추기 */
  const r = await pg.evaluate(async () => { const I = await import('/src/invoicing.js'), U = await import('/src/ui.js');
    return { fmt: [1, 43107, 999999, 1000000, 1999998, 1999999].map(n => I.fmtNo({ c: 'A' }, n)), norm: ['A43350', 'a 43350', 'P007803', 'P-008834', 'CM161', 'W612', 'A-043350', 'O261020-AAAA', 'AA12'].map(U.invNo),
      sort: U.sortInv(['P-008834', 'A-043350', 'CM-000161', 'A-043301', 'P-007803'], x => x).join(' ') }; });
  log(r);
  eq(r.fmt, ['A-000001', 'A-043107', 'A-999999', 'AA-000001', 'AA-999999', 'AB-000001'], 'fmtNo');
  eq(r.norm, ['A-043350', 'A-043350', 'P-007803', 'P-008834', 'CM-000161', 'W-000612', 'A-043350', 'O261020-AAAA', 'AA-000012'], 'invNo');
  eq(r.sort, 'A-043301 A-043350 CM-000161 P-007803 P-008834', 'sortInv');
  /* 2. 통일 전에도 새 번호(A-043350)로 옛 인보이스(A43350)가 찾아짐 */
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iqQ'); await pg.fill('#iqQ', 'A-043350'); await pg.press('#iqQ', 'Enter'); await pg.waitForTimeout(1500);
  const f1 = await pg.$$eval('#iList [data-go^="inv:"]', e => e.map(x => x.dataset.go)); log('find before convert:', f1); if (f1.length !== 1) errs.push('old invoice should be found by new number');
  /* 3. 통일 도구 */
  await pg.evaluate(() => { location.hash = '#/admin/imp'; }); await pg.waitForSelector('#fmtScan'); await pg.waitForTimeout(800); await pg.click('#fmtScan'); await pg.waitForSelector('#fmtGo', { timeout: 8000 }).catch(async () => errs.push('scan: ' + await pg.textContent('#fmtOut')));
  log('scan:', (await pg.textContent('#fmtOut')).replace(/\s+/g, ' ')); await pg.click('#fmtGo'); await pg.waitForSelector('#cfOk').catch(() => {}); if (await pg.$('#cfOk')) await pg.click('#cfOk'); await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => { const M = window.__MOCK_STORE__; return { inv: Object.keys(M.invoices).sort(), cod: M.cod.C1.invs[0].no, ord: M.orders['O261020-AAAA'].invs, ordNo: M.orders['O261020-AAAA'].no, ar: JSON.stringify(Object.values(M.ar || {})).match(/"inv":"[^"]+"/g) }; });
  log(st);
  eq(st.inv, ['A-043301', 'A-043349', 'A-043350', 'CM-000161', 'P-007803', 'P-008834'], 'invoice ids after convert'); eq(st.cod, 'A-043350', 'cod ref'); eq(st.ord, ['A-043301'], 'order invs'); eq(st.ordNo, 'O261020-AAAA', 'order no untouched');
  if ((st.ar || []).some(x => !/"inv":"[A-Z]+-\d{6}"/.test(x))) errs.push('AR refs not converted');
  /* 4. 인보이스 조회 — 📄 인보이스 탭(담당자 · 관리자)은 v0.8.112 부터 날짜별 묶음(최근 날 위) · 🏷 종류별 묶음에서는 종류 안 번호 순 · 날짜 묶음 안에서도 번호 순 · ↕(#iSort) 는 날 순서 반대 */
  const rows = async () => pg.$$eval('#iList [data-go^="inv:"]', e => e.map(x => x.dataset.go.substring(4)));
  const norm = async nos => pg.evaluate(async n => { const U = await import('/src/ui.js'); return n.map(U.invNo); }, nos);   // 순서는 번호를 새 형식으로 맞춰 비교 (표시 형식은 아래에서 따로 확인)
  await pg.evaluate(() => { location.hash = '#/invs'; }); await pg.waitForSelector('#iList .kpi', { timeout: 8000 }).catch(() => errs.push('invoice tab missing'));
  /* 씨앗 날짜(2026-10-20 ~ 25)를 품는 기간 칩 — fulfill.periodRange 와 같은 셈을 여기서 (페이지에서 /src 를 import 하면 main.js 가 다시 떠 #/own 으로 튐). 없으면(먼 뒤) '오늘' → 기간에 없어 최근 200장으로 */
  const ip = (() => { const d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), y = d.getFullYear(), m = d.getMonth() + 1, mon = (yy, mm) => yy + '-' + String(mm).padStart(2, '0');
    const lmEnd = new Date(y, m - 1, 0), lm = mon(lmEnd.getFullYear(), lmEnd.getMonth() + 1);
    const R = { month: [t.substring(0, 8) + '01', t], lastm: [lm + '-01', lm + '-' + String(lmEnd.getDate()).padStart(2, '0')], quarter: [mon(y, Math.floor((m - 1) / 3) * 3 + 1) + '-01', t], year: [y + '-01-01', t], lasty: [(y - 1) + '-01-01', (y - 1) + '-12-31'] };
    return Object.keys(R).find(k => R[k][0] <= '2026-10-20' && R[k][1] >= '2026-10-25') || 'today'; })(); log('period chip:', ip);
  if (await pg.$('#iqX')) { await pg.click('#iqX'); await pg.waitForSelector('#iList .kpi'); await pg.waitForTimeout(400); }   /* 2단계에서 친 번호 검색 지우기 */
  await pg.click('[data-ip="' + ip + '"]'); await pg.waitForSelector('#iList .kpi'); await pg.waitForTimeout(500);
  if (await pg.$('[data-ia="1111"]')) { await pg.click('[data-ia="1111"]'); await pg.waitForTimeout(1200); }
  const nosD = await rows(); log('list (by date, newest day first):', nosD.join(' '));
  eq(await norm(nosD), ['A-043301', 'CM-000161', 'P-008834', 'P-007803', 'A-043349', 'A-043350'], 'invoice list order (date groups · number order within a day)');
  /* 🔢 통일한 뒤 목록은 새 번호여야 — 지난 달 인보이스는 폰 보관(IndexedDB kv 'inv.m.YYYY-MM' · 6시간)에서 읽는데 dropInvCache 가 메모리만 비움 */
  if (nosD.some(n => !/^[A-Z]{1,2}-\d{6}$/.test(n))) errs.push('invoice tab shows pre-convert numbers after 🔢 convert (stale month cache): ' + nosD.join(' '));
  const heads = await pg.$$eval('#iList .gline b', e => e.map(x => x.textContent)); if (!heads.length || !heads.every(h => /📅/.test(h))) errs.push('invoice tab should group by date: ' + JSON.stringify(heads));
  await pg.click('#iSort').catch(() => errs.push('no sort toggle')); await pg.waitForSelector('#iList [data-go^="inv:"]').catch(() => {}); await pg.waitForTimeout(500);
  console.log('after sort page:', (await pg.textContent('#page')).replace(/\s+/g, ' ').slice(0, 300));
  const nos2 = await norm(await rows()); eq(nos2, ['A-043349', 'A-043350', 'P-007803', 'P-008834', 'CM-000161', 'A-043301'], 'desc order (oldest day first · number order within a day)');
  await pg.click('#iSort'); await pg.waitForTimeout(400);
  /* 🏷 종류별 — 종류 안에서 번호 순 (A · CM · P) */
  await pg.click('[data-im="type"]'); await pg.waitForSelector('#iList .kpi'); await pg.waitForTimeout(500);
  const nosT = await rows(); log('list (by type):', nosT.join(' '));
  eq(await norm(nosT), ['A-043301', 'A-043349', 'A-043350', 'CM-000161', 'P-007803', 'P-008834'], 'invoice list order by type (number order per type)');
  const headsT = await pg.$$eval('#iList .gline b', e => e.map(x => x.textContent.trim().split(/\s+/)[1])); eq(headsT, ['A', 'CM', 'P'], 'type group heads');
  await br.close(); srv.kill();
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
