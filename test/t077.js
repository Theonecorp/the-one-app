/* v0.8.90 시험 — 🏭 공장 명세서 파서 (facstmt.js): 연도 탭 · BALANCE FORWARD · 날짜 빈 이어지는 줄(CREDIT · 조정) · 송금 · 파일 TOTAL/DEPOSIT 검산 · 앞 연도 있으면 이월 생략 */
(async () => {
  const { parseFactoryStatement, suggestFactoryCode, matchFactory, looksLikeStatement } = await import('../src/facstmt.js');
  const errs = [];
  const hdr = ['Date', '', 'ITEM', 'FREIGHT', '', 'Amount', '', 'PAID DATE', 'DEPOSIT MONEY'];
  const y25 = { name: '2025', rows: [
    ['TEST FACTORY', '', '', '', '', '', '', '', 'TOTAL', 1300], ['', '', '', '', '', '', '', '', 'DEPOSIT', 800], ['', '', '', '', 'avg', '', '', '', 'BALANCE', 500], [], hdr,
    ['2025-01-05', '', 'BALANCE FORWARD', '', '', 400, '', '2025-01-20', 300],
    ['2025-02-01', '', 500, 50, 0.1, 550, '', '2025-03-01', 500],
    ['', '', 300, 30, 0.1, 330, ''],
    ['CREDIT', '', -80, '', '', -80, 1200],
    ['uniform', '', '', 100, '', 100, ''],
    ['', '', '', '', '', 0, ''] ] };
  const y26 = { name: '2026', rows: [
    ['TEST FACTORY', '', '', '', '', '', '', '', 'TOTAL', 720], ['', '', '', '', '', '', '', '', 'DEPOSIT', 100], ['', '', '', '', 'avg', '', '', '', 'BALANCE', 620], [], hdr,
    ['BALANCE FORWARD', '', '', '', '', 500, '', '2026-01-10', 100],
    ['ANDREW BALANCE FORWARD', '', '', '', '', 20, 20],
    ['2026-01-15', '', 180, 20, 0.1, 200, ''] ] };
  if (!looksLikeStatement(y25.rows) || looksLikeStatement([['a', 'b'], ['Code', 'Description']])) errs.push('looksLikeStatement');
  const P = parseFactoryStatement([y26, y25]);   /* 탭 순서가 뒤집혀도 연도순 */
  console.log('name', P.name, 'years', P.sheets.map(s => s.year), 'inv', P.inv.length, 'pay', P.pay.length, 'warn', P.warn);
  if (P.name !== 'TEST FACTORY') errs.push('name');
  const a = P.sheets[0], b = P.sheets[1];
  console.log('2025', a.inv.length, a.sumInvAll, a.okTotal, a.pay.length, a.sumPay, a.okDep, '| 2026', b.inv.length, b.sumInvAll, b.sumInv, b.fwdSkipped, b.okTotal, b.okDep);
  if (a.inv.length !== 5 || a.sumInvAll !== 1300 || !a.okTotal) errs.push('2025 invoices should match TOTAL 1300 (forward + 2 invoices + credit + uniform)');
  if (a.pay.length !== 2 || a.sumPay !== 800 || !a.okDep) errs.push('2025 payments should match DEPOSIT 800');
  const cont = a.inv.find(x => x.amt === 330); if (!cont || cont.d !== '2025-02-01') errs.push('dateless continuation row should take the date above');
  const cr = a.inv.find(x => x.amt === -80); if (!cr || cr.d !== '2025-02-01' || !/CREDIT/.test(cr.note)) errs.push('CREDIT row should keep its label in note');
  const un = a.inv.find(x => x.amt === 100); if (!un || un.frt !== 100 || !/uniform/.test(un.note)) errs.push('uniform freight-only row');
  if (a.inv.filter(x => x.type === '이월').length !== 1) errs.push('2025 forward should stay (no 2024 tab)');
  if (!b.okTotal || b.fwdSkipped !== 500 || b.sumInv !== 220) errs.push('2026: forward 500 (= 2025 BALANCE) skipped, ANDREW forward 20 kept → 220');
  if (!b.inv.some(x => x.type === '이월' && x.amt === 20 && /ANDREW/.test(x.note))) errs.push('extra forward should be kept as 이월 with note');
  const total = P.inv.reduce((s, x) => s + x.amt, 0), pay = P.pay.reduce((s, x) => s + x.amt, 0); console.log('balance from rows', total - pay);
  if (Math.abs(total - pay - 620) > 0.01) errs.push('rows should reproduce the 2026 BALANCE 620');
  /* 2026 만 올리면 이월이 들어가야 함 */
  const Q = parseFactoryStatement([y26]); if (Q.sheets[0].fwdSkipped || Q.inv.filter(x => x.type === '이월').length !== 2) errs.push('single-year file keeps its forwards');
  /* 코드 제안 · 기존 공장 맞추기 */
  if (suggestFactoryCode('ZHEJIANG JUDA SUPPLY CHAIN CO. LTD') !== 'ZJSC' || suggestFactoryCode('SHENGXING') !== 'SHEN') errs.push('code suggestion');
  const F = [{ code: 'JR', name: 'QUINGDAO JINRUIJIA' }, { code: 'RM', name: 'QUINGDAO RUMINO' }];
  if ((matchFactory('QUINGDAO RUMINO', F) || {}).code !== 'RM' || matchFactory('QUINGDAO RUMINO', F.slice(0, 1)) !== null || matchFactory('NEW FACTORY', F) !== null) errs.push('matchFactory');
  console.log(errs.length ? 'FAIL\n' + errs.join('\n') : 'PASS'); process.exit(errs.length ? 1 : 0);
})();
