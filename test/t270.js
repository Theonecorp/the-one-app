/* v0.8.233 시험 — 🧮 발주 계획 · 🧾 발주서 = 옛 WMS 의 Planejamento de Compras · Pedidos de Compra 그대로 (plan.js · pocompra.js)
 *   계산: 옛 plan_compras_base 의 예(ZZPLAN-A/B/C/D) — 끝난 3달 · 추세 · 안전 · 재주문점 · 상자 단위 올림 · 최소 구매 · 리드타임(아이템) · 오는 중 · 품절일 → 12개월 평균 · VOID 안 셈 · 세트는 구성품 (Excel 로 숫자 확인)
 *   화면: 숫자 칸 5개 · 탭 4개(상품 → 공장별 → 검토 → 만들 발주서) · 고른 것이 검색 · 다시 열기에도 남음 · 검토 경고(상자 · 수정 · 잘못된 수량 · 공장 없음) · 서랍 설명
 *   발주서: 공장마다 하나 · 같은 확인(chave)으로 다시 눌러도 두 벌 안 생김 · PC-연도-6자리 · 고치기(이력 · 보낸 뒤엔 이유 필수 · 모두 빼기 거부) · 보냄 → 오는 중 · 받은 수량(주문보다 많으면 막음) · 취소 규칙 · 메일 대기열(PDF 첨부)
 *   권한: 오피스 매니저 = 보기 · 설정 저장 / 창고 매니저 = 보기 · 설정 잠김 / 그 밖 담당자 · 세일즈맨 = 못 봄 · firestore.rules 도 같은 사람 */
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const path = require('path'), fs = require('fs');
(async () => {
  const { spawn } = require('child_process'); const srv = spawn('python3', ['-m', 'http.server', '8964', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const br = await pw.chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const errs = [], fails = [], log = (...a) => console.log(...a);
  const ok = (cond, name) => { log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fails.push(name); };

  /* 끝난 달 — 화면과 같은 규칙 (이 기기 날짜, 달의 1일) */
  const loc = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mIni = b => { const d = new Date(); return loc(new Date(d.getFullYear(), d.getMonth() - b, 1)); };
  const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);
  const D3 = dias(mIni(3), mIni(0)), D12 = dias(mIni(12), mIni(0));
  const r2 = x => Math.round(x * 100) / 100, r4 = x => Math.round(x * 1e4) / 1e4;

  const seed = (s, a) => {
    const rows = JSON.parse(s.catalog[1].j);
    const sup = { AHG100: 'JD', AHG106: 'JD', AHG101: 'RM', AHG105: 'JD' };
    rows.forEach(r => { while (r.length < 13) r.push(''); if (sup[r[0]]) r[12] = sup[r[0]]; });
    s.catalog[1].j = JSON.stringify(rows); s.catalog[0].ver = 'T1P'; s.catalog[1].ver = 'T1P';
    s.settings[0].suppliers = [{ code: 'JD', name: 'ZHEJIANG JUDA', alias: 'China 1' }, { code: 'RM', name: 'QINGDAO RUMINO', alias: 'China 2' }];
    s.settings[0].ups = { from: { name: 'THE ONE CORP', addr1: '4265 CHURCH STREET', city: 'SANFORD', state: 'FL', zip: '32771', phone: '4078787274' } };
    s.stock = (s.stock || []).concat([{ id: 'AHG100', code: 'AHG100', qty: 160 }, { id: 'AHG101', code: 'AHG101', qty: 100 }, { id: 'AHG102', code: 'AHG102', qty: 50 }, { id: 'AHG105', code: 'AHG105', qty: 160 }, { id: 'AHG106', code: 'AHG106', qty: 0 }, { id: 'GM109', code: 'GM109', qty: 0 }]);
    s.prodExtra = [{ id: 'AHG100', unPorCaixa: 12 }, { id: 'AHG101', leadTime: 90, qtdMinCompra: 500 }];
    s.prodCusto = [{ id: 'AHG100', custo: 0.85 }, { id: 'AHG105', custo: 1 }, { id: 'AHG106', custo: 2 }];
    const inv = (no, d, lines, st) => ({ id: no, no, t: 'A', acct: '1111', store: 'ALI B/S # 1', sm: 'BRANDON', d, ym: d.substring(0, 7), lines, total: 1, st: st || 'open' });
    const L = [], A = [164, 152, 134], Aant = [140, 130, 130];
    for (let b = 1; b <= 3; b++) {
      L.push(inv('P9' + b + '00', a.m(b, 10), [{ c: 'AHG100', q: A[b - 1], p: 1 }, { c: 'AHG101', q: 90, p: 1 }, { c: 'AHG105', q: 150, p: 1 }, { c: 'AHG106', q: 100, p: 1 }]));
      L.push(inv('P9' + b + '01', a.m(b, 12), [{ c: 'FI-TEST01', d: 'SET', q: 2, p: 1, kit: [{ c: 'GM109', q: 6 }] }]));
      L.push(inv('P8' + b + '00', a.m(b + 3, 10), [{ c: 'AHG100', q: Aant[b - 1], p: 1 }]));
    }
    L.push(inv('P9999', a.m(1, 15), [{ c: 'AHG100', q: 999, p: 1 }], 'x'));   // VOID — 세지 않음
    for (let b = 4; b <= 12; b++) L.push(inv('P7' + b, a.m(b, 11), [{ c: 'GM109', q: 400, p: 1 }]));
    s.invoices = (s.invoices || []).concat(L);
    /* GM109: 창 시작 6일째 "빈 상자" 표시 · 아직 안 들어옴 → 품절일 많음 → 12개월 평균 */
    const z = a.m(3, 6);
    s.stockLog = (s.stockLog || []).concat([{ id: 'LZ1', code: 'GM109', d: z, at: z + 'T12:00:00', delta: 0, before: 0, after: 0, kind: 'adj', note: 'Caixa marcada como vazia' }]);
    /* AHG105 (= ZZPLAN-D): 보낸 발주서에 1000 */
    s.purchaseOrders = [{ id: 'PC_OLD_JD', numero: 'PC-2026-000001', fornecedor_id: 'JD', fornecedor: 'ZHEJIANG JUDA', status: 'enviado', criado_em: a.m(1, 2) + 'T10:00:00Z', enviado_em: a.m(1, 2) + 'T11:00:00Z', previsao_em: a.m(0, 28), criado_por_nome: 'X', itens: [{ id: 1, produto_id: 'AHG105', sku: 'AHG105', nome: 'AHG105', qtd_recomendada: 1000, qtd: 1000, qtd_recebida: 0, unidade: 'un', un_por_caixa: 1 }], eventos: [] }];
    s.purchaseOrders.push({ id: 'PC_X', numero: 'PC-2026-000077', fornecedor_id: 'RM', fornecedor: 'QINGDAO RUMINO', status: 'rascunho', criado_em: a.m(0, 1) + 'T09:00:00Z', criado_por_nome: 'X', itens: [{ id: 1, produto_id: 'AHG101', sku: 'AHG101', nome: 'AHG101', qtd_recomendada: 500, qtd: 500, qtd_recebida: 0, unidade: 'un', un_por_caixa: 1 }], eventos: [] });
    s.planCfg = [{ id: 'mail', emails: 'buyer@factory.cn', assunto: 'PO {pedido} — {fornecedor}', texto: 'Please confirm.', auto: '1' }];
    s.counters = (s.counters || []).concat([{ id: 'po', n: 2 }]);
  };
  const MF = 'const t=new Date();const d=new Date(t.getFullYear(),t.getMonth()-back,day);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");';
  const novaPg = async (user, extra, vp) => {
    const p = await br.newPage({ viewport: vp || { width: 1400, height: 1000 }, acceptDownloads: true }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.addInitScript(([f, m, u, ex]) => { window.__MOCK_USER__ = u; const A = { m: new Function('back', 'day', m) }; const F = new Function('s', 'a', f); const X = ex ? new Function('s', ex) : null; window.__AFTER_SEED__ = s => { F(s, A); if (X) X(s); }; },
      ['(' + seed.toString() + ')(s, a)', MF, user, extra || '']);
    await p.goto('http://127.0.0.1:8964/test/demo.html'); await p.waitForSelector('#nav button', { state: 'attached' });
    return p;
  };
  const pg = await novaPg({ email: 'luke@theonefl.com', name: 'X' });
  await pg.evaluate(() => { window.html2pdf = () => { const o = { set: () => o, from: () => o, outputPdf: async () => new Blob(['%PDF-1.4 test']) }; return o; }; });   // PDF 만드는 도구(CDN) 대신
  const noToast = () => pg.waitForFunction(() => !document.getElementById('toast').classList.contains('on'), null, { timeout: 8000 }).catch(() => {});

  log('▶ 메뉴: 재고 묶음에 🧮 발주 계획 · 🧾 발주서');
  await pg.evaluate(() => { location.hash = '#/hub/wh'; }); await pg.waitForTimeout(500);
  ok(await pg.$('[data-hub="plan"]') !== null && await pg.$('[data-hub="pocompra"]') !== null, '재고 묶음에 발주 계획 · 발주서 칸');

  log('▶ 🧮 화면 — 옛 화면 모양');
  await pg.evaluate(() => { location.hash = '#/plan'; }); await pg.waitForSelector('.pcp-cards', { timeout: 20000 });
  ok(await pg.$$eval('.pcp-cards .tile', e => e.length) === 5, '숫자 칸 5개 (지금 사기 · 곧 · 괜찮음 · 과다 · 오는 중)');
  ok(await pg.$$eval('.pcp-aba', e => e.map(x => x.dataset.pcpAba).join(',')) === 'produtos,fornecedor,revisao,gerar', '탭 4개: 상품 → 공장별 → 검토 → 만들 발주서');
  ok(!!(await pg.$('.pcp-totais')) && !!(await pg.$('.pcp-filtros')) && !!(await pg.$('.pcp-lado')) && !!(await pg.$('.pcx-analises')), '합계 띠 · 걸러보기 · 오른쪽 패널 · 분석 3개');
  const rowsShown = await pg.$$eval('tr.pcp-r', e => e.map(x => x.dataset.pid));
  ok(['AHG100', 'AHG101', 'AHG106', 'GM109'].every(c => rowsShown.includes(c)) && !rowsShown.includes('AHG105') && !rowsShown.includes('AHG102'), '"살 것만" — 살 것 있는 4개만 (오는 중 · 기록 없음은 빠짐) ' + rowsShown.join(','));
  try { await pg.screenshot({ path: path.resolve(__dirname, 'out', 'plan_desk.png'), fullPage: true }); } catch (e) {}
  ok(await pg.$eval('[data-sit="em_transito"] .val', e => e.textContent.trim()) === '1,000', '오는 중 칸 = 보낸 발주서의 1,000개');

  log('▶ 계산 — Excel 로 숫자 확인 (옛 ZZPLAN 예)');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act="pcx-xlsx"]')]);
  ok(/^purchase-planning-\d{8}\.xlsx$/.test(dl.suggestedFilename()), 'Excel 파일 이름 ' + dl.suggestedFilename());
  const buf = fs.readFileSync(await dl.path()).toString('utf8');
  const sheet = buf.slice(buf.indexOf('<worksheet', buf.indexOf('<worksheet') + 10));
  const rowOf = code => { const rs = sheet.split('<row ').slice(1); for (const r of rs) { if (r.indexOf('>' + code + '<') < 0) continue; const o = {}; r.replace(/<c r="([A-Z]+)\d+" t="(n|inlineStr)">(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g, (m, col, ty, v, s) => { o[col] = ty === 'n' ? Number(v) : s; }); return o; } return null; };
  const xa = rowOf('AHG100'), xb = rowOf('AHG101'), x6 = rowOf('AHG106'), x110 = rowOf('GM109');
  /* A: vendas 450 · anterior 400 · lead 60 · seg 30 · ciclo 30 · disp 160 · caixa 12 · custo 0.85 */
  const mA = r4(450 / D3), segA = r2(mA * 30), prA = r2(r2(mA * 60) + segA), alvoA = r2(r2(mA * 90) + segA), necA = r2(alvoA - 160), qA = Math.ceil(Math.ceil(necA) / 12) * 12;
  ok(xa && xa.E === 160 && xa.J === 60 && xa.K === segA && xa.L === prA, 'A: 재고 160 · 리드 60 · 안전 ' + segA + ' · 재주문점 ' + prA + ' (Excel ' + (xa && [xa.E, xa.J, xa.K, xa.L].join('/')) + ')');
  ok(xa && xa.N === qA && qA % 12 === 0 && xa.I === 12.5, 'A: 살 수량 ' + qA + ' (12 단위로 올림) · 추세 +12.5% (화면 ' + (xa && xa.N) + ')');
  ok(xa && Math.abs(xa.R - r2(qA * 0.85)) < 0.001 && /Buy now|지금 구매/.test(xa.P), 'A: 금액 ' + r2(qA * 0.85) + ' · 상태 지금 사기');
  if (D3 === 92) ok(segA === 146.74 && prA === 440.22 && alvoA === 586.96 && necA === 426.96 && qA === 432 && xa.M === 32.7 && xa.R === 367.2, '옛 문서의 ZZPLAN-A 숫자 그대로 (92일: 146.74 · 440.22 · 586.96 · 426.96 · 432 · 32.7 · 367.20)');
  const mB = r4(270 / D3), segB = r2(mB * 30), prB = r2(r2(mB * 90) + segB);
  ok(xb && xb.J === 90 && xb.N === 500 && xb.K === segB && xb.L === prB && xb.R == null, 'B: 아이템 리드타임 90 · 최소 구매 500 이 필요량을 이김 · 원가 없음 → 금액 없음');
  ok(x6 && x6.N === Math.ceil(r2(r2(r4(300 / D3) * 90) + r2(r4(300 / D3) * 30))), 'AHG106: 재고 0 · 살 수량 = 목표 (VOID · 세트 영향 없음)');
  const m12 = r4((36 + 9 * 400) / D12);
  ok(x110 && Math.abs(x110.H - Math.round(m12 * 30.4375 * 10) / 10) < 0.06, 'GM109: 품절일이 있어 12개월 평균 사용 (월 ' + (Math.round(m12 * 30.4375 * 10) / 10) + ' · Excel ' + (x110 && x110.H) + ') · 세트 FI-TEST01 은 구성품으로');

  log('▶ 상태 걸러보기 · 기록 없음 · 오는 중 (C · D)');
  await pg.click('[data-sit="em_transito"]'); await pg.waitForSelector('tr.pcp-r[data-pid="AHG105"]');
  ok(/pcp_transito|In transit|운송/.test(await pg.textContent('tr.pcp-r[data-pid="AHG105"]')) || await pg.$('tr.pcp-r[data-pid="AHG105"] .badge.tr') !== null, 'D: 1000 이 오는 중 → "오는 중" 상태');
  await pg.click('[data-sit="em_transito"]'); await pg.waitForTimeout(150);
  await pg.click('[data-act="pcp-avanc"]'); await pg.waitForTimeout(100);
  await pg.click('label.pcp-toggle'); await pg.waitForTimeout(300);
  await pg.fill('#pcpFBusca', 'AHG102'); await pg.press('#pcpFBusca', 'Enter'); await pg.waitForSelector('tr.pcp-r[data-pid="AHG102"]');
  ok(await pg.$('tr.pcp-r[data-pid="AHG102"] .badge.off') !== null, 'C: 판매 없음 → "기록 없음" (살 것만을 끄면 보임)');
  await pg.click('[data-act="pcp-limpar"]'); await pg.waitForSelector('tr.pcp-r[data-pid="AHG100"]');

  log('▶ 서랍 — 왜 이 수량?');
  await pg.click('tr.pcp-r[data-pid="GM109"] .pcp-nome'); await pg.waitForSelector('#pcpDrawer .pcp-porque');
  const dr = await pg.textContent('#pcpDrawer');
  ok(/12/.test(dr) && /out of stock|품절/.test(dr) && (await pg.$$eval('#pcpDrawer .pcp-mini rect', e => e.length)) === 12, '설명: 품절 → 12개월 평균 · 12개월 막대');
  await pg.click('#pcpDrawer [data-act="fechar-drawer"]'); await pg.waitForTimeout(150);
  ok(!(await pg.$('#pcpDrawer')), '서랍 닫힘');

  log('▶ 고른 것은 검색 · 다시 열기에도 남음');
  await pg.check('[data-act="pcp-sel"][data-pid="AHG100"]'); await pg.waitForTimeout(100);
  await pg.fill('#pcpFBusca', 'AHG101'); await pg.press('#pcpFBusca', 'Enter'); await pg.waitForSelector('tr.pcp-r[data-pid="AHG101"]');
  ok(!(await pg.$('tr.pcp-r[data-pid="AHG100"]')) && /\b1\b/.test(await pg.textContent('.pcp-b-n')), '검색해도 AHG100 은 고른 채 (막대 1)');
  await pg.check('[data-act="pcp-sel"][data-pid="AHG101"]'); await pg.waitForTimeout(100);
  await pg.fill('#pcpFBusca', ''); await pg.press('#pcpFBusca', 'Enter'); await pg.waitForSelector('tr.pcp-r[data-pid="AHG100"]');
  ok(await pg.$eval('[data-act="pcp-sel"][data-pid="AHG100"]', e => e.checked) && await pg.$eval('[data-act="pcp-sel"][data-pid="AHG101"]', e => e.checked), '검색을 지우면 둘 다 체크');
  await pg.reload(); await pg.waitForSelector('#nav button', { state: 'attached' }); await pg.evaluate(() => { location.hash = '#/plan/produtos'; }); await pg.waitForSelector('.pcp-cards', { timeout: 20000 });
  ok((await pg.textContent('.pcp-b-n')).trim() === '2', '새로 열어도 고른 것 2개 (이 기기 · 이 사람)');
  await pg.check('[data-act="pcp-sel"][data-pid="AHG106"]'); await pg.check('[data-act="pcp-sel"][data-pid="GM109"]'); await pg.waitForTimeout(100);
  ok(/No valid supplier|유효한 공급업체/.test(await pg.textContent('.pcp-lado')), '오른쪽 패널: 공장 없는 GM109 은 "공장 없음" 묶음');

  log('▶ 검토 경고');
  await pg.fill('.pcp-q[data-pid="AHG100"]', String(qA + 5)); await pg.press('.pcp-q[data-pid="AHG100"]', 'Tab'); await pg.waitForTimeout(150);
  ok(await pg.$eval('.pcp-q[data-pid="AHG100"]', e => e.classList.contains('ed')), '수량을 고치면 표시 · 제안 ↺');
  await pg.click('[data-pcp-aba="revisao"]'); await pg.waitForSelector('.pcp-rev-res');
  const al = await pg.textContent('[data-al="AHG100"]');
  ok(/Not a full box|박스 단위/.test(al) && /Quantity edited|수량 수정/.test(al), '검토: AHG100 상자 단위 아님 · 수량 수정됨');
  ok(/no supplier|공급업체 없음/.test(await pg.textContent('.pcp-rev-res')), '검토 요약: 공장 없음 칩');
  ok(/PC-2026-000077/.test(await pg.textContent('[data-al="AHG101"]')), '검토: AHG101 은 이미 초안 발주서 PC-2026-000077 에 있음 (경고)');
  await pg.fill('.pcp-it-q .pcp-q[data-pid="AHG106"]', '0'); await pg.press('.pcp-it-q .pcp-q[data-pid="AHG106"]', 'Tab'); await pg.waitForTimeout(150);
  ok(/Invalid quantity|잘못된 수량/.test(await pg.textContent('[data-al="AHG106"]')), '수량 0 → 잘못된 수량 (막음)');
  await pg.click('[data-pcp-aba="gerar"]'); await pg.waitForSelector('.pcp-ger-res');
  ok(await pg.$eval('.pcp-ger-bt', b => b.disabled) && !!(await pg.$('.pcp-ger-av.erro')) && !!(await pg.$('.pcp-ger-av.pend')), '만들 발주서: 잘못된 수량이 있으면 단추 잠김 · 공장 없음 경고');
  await pg.click('[data-pcp-aba="revisao"]'); await pg.waitForSelector('.pcp-rev-res');
  await pg.fill('.pcp-it-q .pcp-q[data-pid="AHG106"]', '120'); await pg.press('.pcp-it-q .pcp-q[data-pid="AHG106"]', 'Tab'); await pg.waitForTimeout(150);
  await pg.click('[data-pcp-aba="fornecedor"]'); await pg.waitForSelector('.pcp-grp');
  ok(await pg.$$eval('.pcp-grp', e => e.length) === 3 && !!(await pg.$('.pcp-grp.sem')), '공장별: China 1 · China 2 · 공장 없음');

  log('▶ 발주서 만들기 — 끊겨도 다시 누르면 빠진 것만 (같은 chave)');
  await pg.click('[data-pcp-aba="gerar"]'); await pg.waitForSelector('.pcp-ger-bt:not([disabled])');
  try { await pg.screenshot({ path: path.resolve(__dirname, 'out', 'plan_gerar.png'), fullPage: true }); } catch (e) {}
  ok(await pg.$$eval('.pcp-ger-g', e => e.length) === 2, '발주서 2개 예정 (공장마다 하나)');
  await pg.click('.pcp-ger-bt'); await pg.waitForSelector('.modal-card.pco');
  ok(/GM109/.test(await pg.textContent('.modal-card.pco .pco-aviso')), '창: 공장 없는 아이템은 빠진다고 알림');
  await pg.evaluate(() => { let fail = true; const T = window.__MOCK_STORE__.purchaseOrders; window.__MOCK_STORE__.purchaseOrders = new Proxy(T, { set(t, k, v) { if (fail && Object.keys(t).length === 3) { fail = false; throw new Error('network'); } t[k] = v; return true; } }); });
  await pg.click('[data-act="pco-confirmar"]'); await pg.waitForTimeout(600);
  ok((await pg.evaluate(() => Object.keys(window.__MOCK_STORE__.purchaseOrders).length)) === 3, '끊김: 하나만 만들어짐');
  ok(!!(await pg.$('.modal-card.pco')) && /unknown|알 수 없|Try again|다시/.test(await pg.textContent('#toast')), '창은 그대로 · "다시 눌러도 중복 안 됨" 알림');
  await noToast(); await pg.click('[data-act="pco-confirmar"]'); await pg.waitForSelector('.pcp-gerado', { timeout: 8000 });
  let POS = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.purchaseOrders).filter(p => p.id !== 'PC_OLD_JD' && p.id !== 'PC_X'));
  ok(POS.length === 2 && POS.every(p => p.status === 'rascunho') && new Set(POS.map(p => p.chave_geracao)).size === 1, '초안 2개 · 같은 chave (두 벌 안 생김)');
  ok(POS.every(p => /^PC-\d{4}-\d{6}$/.test(p.numero)) && POS[0].numero !== POS[1].numero, '번호 PC-연도-6자리 · 겹치지 않음');
  const jd = POS.find(p => p.fornecedor_id === 'JD'), rm = POS.find(p => p.fornecedor_id === 'RM');
  ok(jd && jd.itens.length === 2 && jd.itens.find(i => i.sku === 'AHG100').qtd === qA + 5 && jd.itens.find(i => i.sku === 'AHG100').qtd_recomendada === qA, 'JD: AHG100 고친 수량 · 제안 수량도 기록');
  ok(!POS.some(p => p.itens.some(i => i.sku === 'GM109')), '공장 없는 아이템은 발주서에 없음');
  ok(await pg.evaluate(id => { const c = (window.__MOCK_STORE__.poCusto || {})[id]; return !!c && Object.values(c.c).includes(0.85); }, jd.id), '단가는 poCusto 에 따로 (관리자 · 오너만)');
  ok((await pg.textContent('.pcp-b-n').catch(() => '')).trim() === '1' || !!(await pg.$('.pcp-barra')), '만든 아이템은 고른 것에서 빠짐 (공장 없는 것만 남음)');

  log('▶ 🧾 발주서 화면');
  await pg.evaluate(() => { location.hash = '#/pocompra'; }); await pg.waitForSelector('.pco-lista');
  ok(await pg.$$eval('.pco-lista tbody tr[data-pco]', e => e.length) === 4 && await pg.$$eval('[data-pco-st]', e => e.length) === 6, '목록 4줄 · 상태 칩 6개');
  await pg.fill('#pcoBusca', 'AHG106'); await pg.waitForTimeout(500);
  ok(await pg.$$eval('.pco-lista tbody tr.clic', e => e.length) === 1 && !!(await pg.$('.pco-hitrow mark')), '상품으로 찾기 → 그 상품이 든 발주서 · 찾은 글 표시');
  await pg.fill('#pcoBusca', ''); await pg.waitForTimeout(500);
  await pg.click('tr.clic[data-pco="' + jd.id + '"]'); await pg.waitForSelector('#pcpDrawer [data-act="pco-enviar"]');
  try { await pg.screenshot({ path: path.resolve(__dirname, 'out', 'pocompra_desk.png') }); } catch (e) {}
  log('  · 초안 고치기 (이유 없이 됨)');
  await pg.click('[data-act="pco-editar"]'); await pg.waitForSelector('.pco-eq');
  const it106 = jd.itens.find(i => i.sku === 'AHG106');
  await pg.fill('.pco-eq[data-item="' + it106.id + '"]', '144'); await pg.click('[data-act="pco-ed-salvar"]'); await pg.waitForTimeout(500);
  let J = await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id], jd.id);
  ok(J.itens.find(i => i.id === it106.id).qtd === 144 && J.eventos.map(e => e.tipo).join(',') === 'item_qtd,editado', '초안 고침: 수량 144 · 이력 item_qtd + editado');
  log('  · 보냄 → 오는 중');
  await noToast(); await pg.click('#pcpDrawer [data-act="pco-enviar"]'); await pg.click('#pergSim'); await pg.waitForTimeout(700);
  J = await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id], jd.id);
  ok(J.status === 'enviado' && /^\d{4}-\d{2}-\d{2}$/.test(J.previsao_em), '보냄 · 도착 예상(오늘 + 리드타임)');
  log('  · 보낸 뒤 고치기: 이유 필수 · 모두 빼기는 거부 · 뺀 줄은 남음');
  await pg.waitForSelector('#pcpDrawer [data-act="pco-editar"]'); await pg.click('[data-act="pco-editar"]'); await pg.waitForSelector('[data-pco-rm]');
  await pg.click('[data-pco-rm="' + it106.id + '"]'); await pg.waitForTimeout(150); await pg.click('[data-act="pco-ed-salvar"]'); await pg.waitForTimeout(300);
  ok(/reason|사유/.test(await pg.textContent('#toast')) && (await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id].eventos.length, jd.id)) === 2, '보낸 발주서: 이유 없으면 저장 안 됨');
  await pg.fill('#pcoEdMotivo', 'discontinued'); await noToast(); await pg.click('[data-act="pco-ed-salvar"]'); await pg.waitForSelector('#pergSim'); await pg.click('#pergSim'); await pg.waitForTimeout(600);
  J = await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id], jd.id);
  const r106 = J.itens.find(i => i.id === it106.id);
  ok(r106.removido_em && r106.removido_motivo === 'discontinued' && J.itens.length === 2 && J.eventos.map(e => e.tipo).slice(2).join(',') === 'item_removido,editado', '뺀 줄은 지우지 않고 표시(이유) · 이력 item_removido + editado');
  await pg.waitForSelector('.pco-hist'); ok(/discontinued/.test(await pg.textContent('.pco-hist')) && !!(await pg.$('tr.pco-rm')), '서랍: 이력 · 뺀 줄 회색');
  await pg.click('[data-act="pco-editar"]'); await pg.waitForSelector('[data-pco-rm]');
  const it100 = J.itens.find(i => i.sku === 'AHG100');
  await pg.click('[data-pco-rm="' + it100.id + '"]'); await pg.fill('#pcoEdMotivo', 'x'); await noToast(); await pg.click('[data-act="pco-ed-salvar"]'); await pg.waitForTimeout(300);
  ok(/every product|모든 품목/.test(await pg.textContent('#toast')), '모두 빼기 → "주문 취소를 쓰세요" 로 거부');
  await pg.click('[data-act="pco-ed-sair"]'); await pg.waitForSelector('.pco-rq');
  log('  · 받은 수량');
  ok(!(await pg.$('[data-act="pco-cancelar"]')) === false, '보냄 · 받은 것 0 → 취소 단추 있음');
  await pg.fill('.pco-rq[data-item="' + it100.id + '"]', String(qA + 99)); await pg.waitForTimeout(100);
  ok(await pg.$eval('[data-act="pco-receber"]', b => b.disabled) && await pg.$eval('.pco-rq[data-item="' + it100.id + '"]', i => i.classList.contains('bad')), '주문보다 많이 → 저장 단추 잠김');
  await pg.fill('.pco-rq[data-item="' + it100.id + '"]', '100'); await noToast(); await pg.click('[data-act="pco-receber"]'); await pg.waitForTimeout(600);
  J = await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id], jd.id);
  ok(J.status === 'recebido_parcial' && J.itens.find(i => i.id === it100.id).qtd_recebida === 100, '일부 받음 100');
  ok((await pg.evaluate(() => window.__MOCK_STORE__.stock.AHG100.qty)) === 160, '재고는 안 바뀜 (입고는 재고 화면)');
  ok(!(await pg.$('#pcpDrawer [data-act="pco-cancelar"]')) && !(await pg.$('#pcpDrawer [data-act="pco-editar"]')), '받은 것이 있으면 취소 · 고치기 없음');
  await pg.click('[data-act="pco-tudo"]'); await noToast(); await pg.click('[data-act="pco-receber"]'); await pg.waitForTimeout(600);
  ok((await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id].status, jd.id)) === 'recebido', '모두 → 다 받음 (뺀 줄은 셈에서 빠짐)');
  log('  · 초안 취소 · PDF(영어)');
  await pg.click('#pcpDrawer [data-act="fechar-drawer"]'); await pg.waitForTimeout(200);
  await pg.click('tr.clic[data-pco="' + rm.id + '"]'); await pg.waitForSelector('#pcpDrawer [data-act="pco-pdf"]');
  await pg.click('[data-act="pco-pdf"]'); await pg.waitForSelector('#prtbody .po-doc');
  const pdf = await pg.textContent('#prtbody .po-doc');
  ok(/PURCHASE ORDER|Purchase order/i.test(pdf) && /Draft/.test(pdf) && /4265 CHURCH STREET/.test(pdf) && !/Recebid|받음/.test(pdf), 'PDF: 영어 · 회사 주소(UPS 보내는 곳) · 받은 칸 없음(초안)');
  await pg.evaluate(() => { const p = document.getElementById('prt'); if (p) p.classList.remove('on'); });
  await pg.click('#pcpDrawer [data-act="pco-cancelar"]'); await pg.click('#pergSim'); await pg.waitForTimeout(600);
  ok((await pg.evaluate(id => window.__MOCK_STORE__.purchaseOrders[id].status, rm.id)) === 'cancelado', '초안 취소');

  log('▶ ✉️ 보냄으로 표시 → 메일 대기열 (PDF 첨부)');
  await pg.evaluate(() => { location.hash = '#/pocompra/PC_X'; }); await pg.waitForSelector('#pcpDrawer [data-act="pco-enviar"]', { timeout: 8000 });
  await pg.click('#pcpDrawer [data-act="pco-enviar"]'); await pg.click('#pergSim'); await pg.waitForTimeout(1200);
  const M = await pg.evaluate(() => Object.values(window.__MOCK_STORE__.notifyq || {}).filter(n => n.kind === 'poMail' && n.ref === 'PC_X'));
  ok(await pg.evaluate(id => Object.values(window.__MOCK_STORE__.notifyq || {}).some(n => n.kind === 'poMail' && n.ref === id), jd.id), 'JD 를 보냈을 때도 메일 대기열에 (자동 켜짐)');
  ok(M.length === 1 && M[0].to.join() === 'buyer@factory.cn' && M[0].subject === 'PO PC-2026-000077 — QINGDAO RUMINO' && M[0].atts[0].name === 'purchase-order-PC-2026-000077.pdf' && M[0].atts[0].b64.length > 4 && M[0].text === 'Please confirm.', '메일 대기열: 받는 사람 · 제목 틀({pedido} {fornecedor}) · 글 · PDF 첨부 ' + JSON.stringify(M.map(m => m.subject)));

  log('▶ ⚙️ 설정 — 공장 리드타임 1~365 · 메일 주소 확인');
  await pg.evaluate(() => { location.hash = '#/plan'; }); await pg.waitForSelector('.pcp-cards');
  await pg.click('[data-act="pcp-cfg"]'); await pg.waitForSelector('.pcp-cfg-in[data-fid="JD"][data-k="lead"]');
  ok((await pg.$eval('.pcp-cfg-in[data-fid="JD"][data-k="seg"]', e => e.value)) === '30' && (await pg.$eval('.pcp-cfg-in[data-fid="JD"][data-k="ciclo"]', e => e.value)) === '30' && (await pg.$eval('.pcp-cfg-in[data-fid="JD"][data-k="lead"]', e => e.value)) === '60', '기본값 60 / 30 / 30 (옛 앱과 같음)');
  await pg.fill('.pcp-cfg-in[data-fid="JD"][data-k="lead"]', '0'); await noToast(); await pg.click('#pergSim'); await pg.waitForTimeout(300);
  ok(!(await pg.evaluate(() => (window.__MOCK_STORE__.settings.app.planParams || {}).JD)), '0 일은 거부 · 저장 안 됨');
  await pg.waitForSelector('.pcp-cfg-in[data-fid="JD"][data-k="lead"]');
  await pg.fill('.pcp-cfg-in[data-fid="JD"][data-k="lead"]', '90'); await pg.fill('#pcmEmails', 'a@b.com, nao-email'); await noToast(); await pg.click('#pergSim'); await pg.waitForTimeout(300);
  ok(!(await pg.evaluate(() => (window.__MOCK_STORE__.settings.app.planParams || {}).JD)), '잘못된 메일 주소 → 저장 안 됨');
  await pg.waitForSelector('#pcmEmails'); ok((await pg.$eval('#pcmEmails', e => e.value)) === 'a@b.com, nao-email', '다시 연 창에 쓰던 것이 그대로');
  await pg.fill('.pcp-cfg-in[data-fid="JD"][data-k="lead"]', '90'); await pg.fill('#pcmEmails', 'a@b.com'); await noToast(); await pg.click('#pergSim'); await pg.waitForTimeout(800);
  ok((await pg.evaluate(() => window.__MOCK_STORE__.settings.app.planParams.JD.lead)) === 90 && (await pg.evaluate(() => window.__MOCK_STORE__.planCfg.mail.emails)) === 'a@b.com', '리드타임 90 · 메일 주소 저장');

  log('▶ ❓ 계산 방법 · PDF 보고서(영어)');
  await pg.click('[data-act="pcx-como"]'); await pg.waitForSelector('.pcx-cf'); ok(await pg.$$eval('.pcx-cf li', e => e.length) === 9, '계산 방법 9줄'); await pg.click('#pergSim');
  await pg.click('[data-act="pcx-pdf"]'); await pg.waitForSelector('#prtbody .pcx-doc');
  ok(/Purchase planning|PURCHASE PLANNING/i.test(await pg.textContent('#prtbody .doc-print')), 'PDF 보고서 영어');
  await pg.evaluate(() => { const p = document.getElementById('prt'); if (p) p.classList.remove('on'); });

  log('▶ 📱 폰 — 옆으로 밀리지 않음');
  await pg.setViewportSize({ width: 390, height: 900 }); await pg.evaluate(() => { location.hash = '#/plan/produtos'; }); await pg.waitForSelector('.pcp-cards'); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '가로 스크롤 없음');
  try { await pg.screenshot({ path: path.resolve(__dirname, 'out', 'plan_phone.png') }); } catch (e) {}

  log('▶ 권한 — 세일즈맨 · 담당자 일별');
  const p2 = await novaPg({ email: 'brandon@x.com', name: 'Brandon' }, '', { width: 430, height: 900 });
  await p2.evaluate(() => { location.hash = '#/plan'; }); await p2.waitForTimeout(800); ok(!(await p2.$('.pcp-cards')), '세일즈맨: 발주 계획 안 열림');
  await p2.evaluate(() => { location.hash = '#/pocompra'; }); await p2.waitForTimeout(500); ok(!(await p2.$('.pco-lista')), '세일즈맨: 발주서 안 열림'); await p2.close();
  const asJob = async job => {
    const p = await novaPg({ email: 'job@x.com', name: 'J' }, "s.users.push({ id: 'job@x.com', email: 'job@x.com', name: 'J', role: 'manager', job: '" + job + "', active: true });");
    await p.evaluate(() => { location.hash = '#/hub/wh'; }); await p.waitForTimeout(500);
    const tile = !!(await p.$('[data-hub="plan"]')) && !!(await p.$('[data-hub="pocompra"]'));
    await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForTimeout(1500);
    return { p, tile, open: !!(await p.$('[data-act="pcp-cfg"]')) };
  };
  const off = await asJob('office');
  ok(off.tile && off.open, '오피스 매니저: 칸 · 화면');
  ok(/—/.test(await off.p.$eval('.pcp-totais', e => e.textContent)), '오피스 매니저: 원가 · 금액은 "—" (원가는 관리자 · 오너만)');
  await off.p.click('[data-act="pcp-cfg"]'); await off.p.waitForSelector('.pcp-cfg-in[data-fid="JD"][data-k="lead"]');
  ok(!!(await off.p.$('#pergSim')), '오피스 매니저: 설정 저장 단추');
  await off.p.fill('.pcp-cfg-in[data-fid="JD"][data-k="lead"]', '45'); await off.p.click('#pergSim'); await off.p.waitForTimeout(800);
  ok((await off.p.evaluate(() => (window.__MOCK_STORE__.settings.app.planParams.JD || {}).lead)) === 45, '오피스 매니저: 저장됨'); await off.p.close();
  const whm = await asJob('whmgr');
  ok(whm.tile && whm.open, '창고 매니저: 칸 · 화면');
  await whm.p.click('[data-act="pcp-cfg"]'); await whm.p.waitForSelector('.pcp-cfg-in[data-fid="JD"][data-k="lead"]');
  ok(!(await whm.p.$('#pergSim')) && await whm.p.$eval('.pcp-cfg-in[data-fid="JD"][data-k="lead"]', e => e.disabled), '창고 매니저: 설정은 보기만'); await whm.p.close();
  for (const j of ['pick', 'acct', 'catalog', 'invoice', 'pickinv']) { const x = await asJob(j); ok(!x.tile && !x.open, j + ': 칸 · 화면 없음'); await x.p.close(); }

  log('▶ firestore.rules');
  const RULES = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  ok(/match \/purchaseOrders\/\{id\} \{ allow read, write: if staffJob\(\['office', 'whmgr'\]\); \}/.test(RULES), '발주서: 관리자 · 오너 · 오피스 · 창고 매니저만');
  ok(/match \/poCusto\/\{id\} \{ allow read, write: if isOwner\(\); \}/.test(RULES), '발주서 단가: 관리자 · 오너만 (prodCusto 와 같음)');
  ok(/match \/planCfg\/\{id\} \{ allow read: if staffJob\(\['office', 'whmgr'\]\); allow write: if staffJob\(\['office'\]\); \}/.test(RULES), '메일 설정: 보기 = 계획 쓰는 사람 · 저장 = 오피스');
  ok(/staffJob\(\['office'\]\) && request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['planParams', 'updatedAt'\]\)/.test(RULES), '설정: 오피스 매니저는 planParams 만');
  const GS = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  ok(/attachments: atts/.test(GS) && /n\.atts/.test(GS), 'Apps Script: 알림 메일에 첨부(atts)');

  ok(!errs.length, '페이지 오류 없음 ' + JSON.stringify(errs.slice(0, 3)));
  await br.close(); srv.kill();
  console.log(fails.length ? 'FAIL ' + fails.length + ': ' + fails.join(' | ') : 'PASS t270');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
