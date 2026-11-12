/* ============================================================
 *  📦 Shipping History — 옛 THE ONE CORP WMS 의 Shipping History 화면을 그대로
 *    카드 6개(누르면 필터) · 기간 칩 · 검색 · 필터 · 목록(페이지) · 오른쪽 상세(탭 5개)
 *    데이터는 shipments(박스마다 한 문서)를 track.js 의 groupShipments 로 출고 단위로 묶음
 *    라벨은 shipq/{주문 id 또는 adhoc id} 의 labels — 박스마다 다시 인쇄 · 기록은 첫 박스 문서의 log
 *    취소(void)는 주문 없는 출고(카운터 · 임의 출고)만: 주문 출고는 주문 화면의 UPS 창에서
 * ============================================================ */
import { $, esc, money, toast, confirmBox, today, addDays, Router } from './ui.js';
import { can } from './main.js';
import { groupShipments } from './track.js';
import { ICO, svg, css, L3, num1, svcName, imprimir, abrirEdicao } from './balcao.js';

let S = null;
const H = { per: '30', de: '', ate: '', q: '', st: '', cli: '', serv: '', cod: '', sm: '', pag: 1, por: 25, sel: '', aba: 'geral', lista: null, chave: '', filtrosAb: false, busy: {} };
export const _H = H;   // 시험용
export function register(state) { S = state; Router.on('shiphist', page); }

const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hoje = () => today();
function periodo() {
  if (H.per === 'pers') return { de: H.de || addDays(hoje(), -29), ate: H.ate || hoje() };
  if (H.per === 'hoje') return { de: hoje(), ate: hoje() };
  return { de: addDays(hoje(), -(Number(H.per) || 30) + 1), ate: hoje() };
}
/* ---------- 상태 (옛 앱과 같은 이름) ---------- */
function stDe(s) {
  if (s.st === 'void') return 'void';
  if (s.st === 'dlv') return 'entregue';
  if (s.boxes.some(x => !x.voided && /exception|delay|return/i.test(x.status || ''))) return 'excecao';
  if (s.st === 'go') return 'em_transito';
  return 'emitido';
}
const ST_TXT = {
  entregue: () => L3('배달 완료', 'Delivered', 'Entregue'), em_transito: () => L3('운송 중', 'In transit', 'Em trânsito'), emitido: () => L3('라벨 생성', 'Label created', 'Etiqueta emitida'),
  excecao: () => L3('문제 있음', 'Exception', 'Exceção'), void: () => 'VOID', andando: () => L3('운송 중 + 라벨', 'In transit + label', 'Em trânsito + emitida'), validos: () => L3('취소 빼고 전부', 'All but voided', 'Todos menos anulados')
};
const ST_CLS = { entregue: 'ok', em_transito: 'cresc', excecao: 'out', emitido: 'av', void: 'void' };
const stHTML = st => '<span class="badge sh-st ' + (ST_CLS[st] || 'off') + '">' + esc(ST_TXT[st] ? ST_TXT[st]() : st) + '</span>';
const stCasa = (e, f) => !f || (f === 'validos' ? e.st !== 'void' : f === 'andando' ? (e.st === 'em_transito' || e.st === 'emitido') : e.st === f);

/** 출고 한 건 — 화면이 쓰는 모양으로 */
function envio(s) {
  const a = s.a, acc = a.acct && S.accounts && S.accounts.byCode ? S.accounts.byCode[a.acct] : null;
  const to = String(a.to || '').split(',').map(x => x.trim());
  return { key: s.key, g: s, a, st: stDe(s), no: a.no || a.trk, trk: a.trk, data: a.shipDate || '', at: a.at || '', acct: a.acct || '', cli: a.store || (acc && acc.store) || '', sm: String(a.sm || '').toUpperCase(),
    cidade: (acc && acc.city) || to[1] || '', estado: (acc && acc.state) || to[2] || '', end: (acc ? [acc.addr, acc.addr2].filter(Boolean).join(', ') : to[0] || ''), cep: (acc && acc.zip) || to[3] || '', tel: (acc && acc.tel) || '',
    serv: a.svcName || svcName(a.svc), n: s.n, peso: s.w, custo: s.cost, cod: Number(a.cod) || 0, by: a.by || '', job: a.orderId || a.adhocId || '', pedido: a.orderId ? a.no : '', invs: a.invs || [] };
}
async function carregar() {
  const p = periodo(), chave = p.de + '|' + p.ate;
  if (H.lista && H.chave === chave) return;
  H.lista = null; H.chave = chave;
  let L = [];
  try { L = isStaff() ? await S.DB.list('shipments', { where: [['shipDate', '>=', p.de]] }) : (await S.DB.list('shipments', { where: [['sm', '==', mySm()]] })).filter(x => (x.shipDate || '') >= p.de); }
  catch (e) { H.erro = String(e.code || e.message); }
  if (H.chave !== chave) return;
  H.lista = groupShipments(L.filter(x => !p.ate || (x.shipDate || '') <= p.ate)).map(envio);
}
function filtrados() {
  const q = String(H.q || '').trim().toUpperCase();
  return (H.lista || []).filter(e => stCasa(e, H.st) && (!H.cli || e.acct === H.cli) && (!H.serv || e.serv === H.serv) && (!H.sm || e.sm === H.sm) &&
    (!H.cod || (H.cod === 'com' ? e.cod > 0 : !e.cod)) &&
    (!q || [e.no, e.cli, e.acct, e.cidade, e.estado].concat(e.g.boxes.map(x => x.trk), e.invs).some(v => String(v || '').toUpperCase().includes(q))));
}
const caixas = L => L.reduce((s, e) => s + (Number(e.n) || 0), 0);

/* ---------- 화면 ---------- */
function kpi(ico, cor, valor, rot, sub, st, per) {
  const on = st && H.st === st && (!per || H.per === per), n = String(valor).length, tam = n > 11 ? ' v-xl' : n > 8 ? ' v-l' : '';
  const at = st ? ' data-act="sh-kpi" data-st="' + st + '"' + (per ? ' data-per="' + per + '"' : '') + ' role="button" tabindex="0" aria-pressed="' + (on ? 'true' : 'false') + '"' : '';
  return '<div class="fin-kpi nu-kpi' + tam + (st ? ' sh-kpi-bt' + (on ? ' on' : '') : '') + '"' + at + '><div class="fin-kpi-ico ' + cor + '">' + svg(ico, 19) + '</div><div class="fin-kpi-c"><span class="lbl">' + esc(rot) + '</span><b>' + esc(valor) + '</b><span class="sub"><i class="nu-delta n">' + esc(sub) + '</i></span></div></div>';
}
function kpisHTML() {
  const vivos = (H.lista || []).filter(e => e.st !== 'void'), hj = vivos.filter(e => e.data === hoje()), noP = L3('기간 안', 'in period', 'no período');
  const tr = vivos.filter(e => e.st === 'em_transito' || e.st === 'emitido'), en = vivos.filter(e => e.st === 'entregue'), ex = vivos.filter(e => e.st === 'excecao');
  return '<div class="nu-kpis sh-kpis' + (isStaff() ? '' : ' sh-kpis-5') + '">' +
    kpi(ICO.caixa, '', String(caixas(vivos)), L3('나간 박스', 'Boxes shipped', 'Caixas despachadas'), noP, 'validos') +
    kpi(ICO.relogio, 'x', String(caixas(hj)), L3('오늘 박스', 'Boxes today', 'Caixas hoje'), hoje(), 'validos', 'hoje') +
    kpi(ICO.entra, 'a', String(caixas(tr)), L3('운송 중 박스', 'Boxes in transit', 'Caixas em trânsito'), L3('라벨 + 이동 중', 'label + moving', 'emitidas + andando'), 'andando') +
    kpi(ICO.check, 'g', String(caixas(en)), L3('배달된 박스', 'Boxes delivered', 'Caixas entregues'), noP, 'entregue') +
    kpi(ICO.sai2, ex.length ? 'r' : '', String(caixas(ex)), L3('문제 박스', 'Boxes with exception', 'Caixas com exceção'), noP, 'excecao') +
    (isStaff() ? kpi(ICO.venda, 'g', money(vivos.reduce((s, e) => s + e.custo, 0)), L3('운임 합계', 'Freight cost', 'Custo de frete'), noP) : '') + '</div>';
}
function opcoes(id, rot, val, L, todos) { return '<div class="field"><label>' + esc(rot) + '</label><select id="' + id + '"><option value="">' + esc(todos) + '</option>' + L.map(o => '<option value="' + esc(o.v) + '"' + (o.v === val ? ' selected' : '') + '>' + esc(o.r) + '</option>').join('') + '</select></div>'; }
const nFiltros = () => [H.st, H.cli, H.serv, H.cod, H.sm].filter(Boolean).length;
function filtrosHTML() {
  const base = H.lista || [], vi = {}, clis = [], servs = [], sms = [];
  base.forEach(e => { if (e.acct && !vi['C' + e.acct]) { vi['C' + e.acct] = 1; clis.push({ v: e.acct, r: '#' + e.acct + ' · ' + e.cli }); } if (e.serv && !vi['S' + e.serv]) { vi['S' + e.serv] = 1; servs.push({ v: e.serv, r: e.serv }); } if (e.sm && !vi['M' + e.sm]) { vi['M' + e.sm] = 1; sms.push({ v: e.sm, r: e.sm }); } });
  const ord = a => a.sort((x, y) => String(x.r).localeCompare(String(y.r))), p = periodo();
  return '<div class="sh-filtros-top"><div class="nu-chips">' + [['hoje', L3('오늘', 'Today', 'Hoje')], ['7', L3('7일', '7 days', '7 dias')], ['30', L3('30일', '30 days', '30 dias')], ['90', L3('90일', '90 days', '90 dias')], ['pers', L3('날짜 고르기', 'Custom', 'Personalizado')]]
      .map(c => '<button type="button" class="nu-chip' + (H.per === c[0] ? ' on' : '') + '" data-act="sh-per" data-p="' + c[0] + '">' + esc(c[1]) + '</button>').join('') + '</div>' +
    '<div class="sh-busca-linha"><div class="sh-busca-wrap">' + svg(ICO.busca, 16) + '<input id="shBusca" autocomplete="off" placeholder="' + esc(L3('주문 · 운송장 · 가게 · 계정 · 도시', 'Order · tracking · store · account · city', 'Pedido · tracking · loja · conta · cidade')) + '" value="' + esc(H.q) + '"></div>' +
    '<button type="button" class="btn sh-filtro-bt' + (H.filtrosAb ? ' on' : '') + '" data-act="sh-filtros-ab">' + svg(ICO.filtro, 17) + '<span>' + esc(L3('필터', 'Filters', 'Filtros')) + '</span>' + (nFiltros() ? '<i class="sh-filtro-n">' + nFiltros() + '</i>' : '') + '</button></div></div>' +
    '<div class="nu-filtros sh-filtros' + (H.filtrosAb ? ' aberto' : '') + '">' +
    (H.per === 'pers' ? '<div class="field per"><label>' + esc(L3('기간', 'Period', 'Período')) + '</label><div class="nu-per-campos"><input type="date" id="shDe" value="' + esc(p.de) + '"><input type="date" id="shAte" value="' + esc(p.ate) + '"></div></div>'
      : '<div class="field per"><label>' + esc(L3('기간', 'Period', 'Período')) + '</label><div class="sh-per-txt">' + esc(p.de + ' – ' + p.ate) + '</div></div>') +
    opcoes('shCli', L3('가게', 'Store', 'Cliente'), H.cli, ord(clis), L3('전부', 'All', 'Todos')) +
    opcoes('shServ', L3('서비스', 'Service', 'Serviço'), H.serv, ord(servs), L3('전부', 'All', 'Todos')) +
    opcoes('shSt', L3('상태', 'Status', 'Status'), H.st, ['validos', 'andando', 'emitido', 'em_transito', 'entregue', 'excecao', 'void'].map(s => ({ v: s, r: ST_TXT[s]() })), L3('전부', 'All', 'Todos')) +
    opcoes('shCod', 'COD', H.cod, [{ v: 'com', r: L3('COD 만', 'Only COD', 'Só com COD') }, { v: 'sem', r: L3('COD 아님', 'No COD', 'Sem COD') }], L3('전부', 'All', 'Todos')) +
    (isStaff() ? opcoes('shSm', L3('세일즈맨', 'Salesman', 'Vendedor'), H.sm, ord(sms), L3('전부', 'All', 'Todos')) : '') +
    '<div class="field sh-limpar"><label>&nbsp;</label><button type="button" class="btn" data-act="sh-limpar">' + svg(ICO.repetir, 14) + ' ' + esc(L3('필터 지우기', 'Clear filters', 'Limpar filtros')) + '</button></div></div>';
}
function linhaHTML(e) {
  const sel = H.sel === e.key, dest = [e.cidade, e.estado].filter(Boolean).join(', ') || '—';
  return '<tr class="sh-l' + (sel ? ' sel' : '') + '" data-envio="' + esc(e.key) + '"><td>' + esc(e.data) + '</td><td class="principal"><b class="sh-num">' + esc(e.no) + '</b>' + (e.cod ? ' <span class="sh-cod-tag">COD ' + esc(money(e.cod)) + '</span>' : '') +
    '<div class="sh-mob"><span class="sh-mob-st">' + stHTML(e.st) + '</span><span class="sh-mob-cli">' + esc((e.acct ? '#' + e.acct + ' · ' : '') + e.cli) + '</span><span class="sh-mob-info">' + esc(['UPS', e.data, e.n + ' ' + L3('박스', 'box(es)', 'caixa(s)')].join(' · ')) + (e.custo ? ' · ' + esc(money(e.custo)) : '') + '</span></div></td>' +
    '<td>' + (e.acct ? '<b>#' + esc(e.acct) + '</b> ' : '') + esc(e.cli) + (e.sm ? ' <span class="vend-tag">' + esc(e.sm) + '</span>' : '') + '</td><td>' + esc(dest) + '</td><td><span class="sh-transp">UPS</span></td><td>' + esc(e.serv) + '</td>' +
    '<td class="num">' + e.n + '</td><td class="num">' + (e.peso ? num1(e.peso) + ' lb' : '—') + '</td><td class="num">' + (e.custo ? esc(money(e.custo)) : '—') + '</td>' +
    '<td style="font-variant-numeric:tabular-nums"><a class="rastreio" href="https://www.ups.com/track?tracknum=' + encodeURIComponent(e.trk) + '" target="_blank" rel="noopener noreferrer">' + esc(e.trk) + '</a>' + (e.g.boxes.length > 1 ? ' <span class="hint">+' + (e.g.boxes.length - 1) + '</span>' : '') + '</td>' +
    '<td>' + stHTML(e.st) + '</td><td class="acoes"><button type="button" class="btn sm" data-act="sh-ver" data-envio="' + esc(e.key) + '">' + svg(ICO.olho, 14) + '</button></td></tr>';
}
function corpoHTML() {
  if (!H.lista) return '<div class="panel ups-painel sh-lista"><div class="graf-vazio">' + esc(H.erro ? H.erro : L3('읽는 중…', 'Loading…', 'Carregando…')) + '</div></div>';
  const L = filtrados(), pags = Math.max(1, Math.ceil(L.length / H.por)); H.pag = Math.min(Math.max(1, H.pag), pags);
  const de = (H.pag - 1) * H.por, pg = L.slice(de, de + H.por);
  let h = '<div class="panel ups-painel sh-lista">';
  if (H.cod === 'com') { const v = L.filter(e => e.st !== 'void'); h += '<div class="sh-cod-resumo"><b>' + esc(L3('COD ' + v.length + '건 · 받을 돈 ' + money(v.reduce((s, e) => s + e.cod, 0)), v.length + ' COD shipment(s) · ' + money(v.reduce((s, e) => s + e.cod, 0)) + ' to collect', v.length + ' envio(s) COD · ' + money(v.reduce((s, e) => s + e.cod, 0)) + ' a cobrar na entrega')) + '</b><span>' + esc(L3('VOID 는 빼고', 'voided not counted', 'anulados não entram')) + '</span></div>'; }
  if (!L.length) return h + '<div class="graf-vazio">' + esc(L3('이 기간에 출고가 없습니다', 'No shipments in this period', 'Nenhum envio no período')) + '</div></div>';
  h += '<div class="tbl-scroll"><table class="sh-tbl sem-resize"><thead><tr><th>' + esc(L3('날짜', 'Date', 'Data')) + '</th><th>' + esc(L3('출고', 'Shipment', 'Envio')) + '</th><th>' + esc(L3('가게', 'Store', 'Cliente')) + '</th><th>' + esc(L3('받는 곳', 'Destination', 'Destino')) + '</th><th>' + esc(L3('운송사', 'Carrier', 'Transportadora')) + '</th><th>' + esc(L3('서비스', 'Service', 'Serviço')) + '</th><th class="num">' + esc(L3('박스', 'Boxes', 'Caixas')) + '</th><th class="num">' + esc(L3('무게', 'Weight', 'Peso')) + '</th><th class="num">' + esc(L3('운임', 'Freight', 'Frete')) + '</th><th>Tracking</th><th>' + esc(L3('상태', 'Status', 'Status')) + '</th><th class="acoes"></th></tr></thead><tbody>' + pg.map(linhaHTML).join('') + '</tbody></table></div>';
  h += '<div class="sh-pag"><span>' + esc(L3((de + 1) + '–' + Math.min(de + H.por, L.length) + ' / ' + L.length + ' 출고', 'Showing ' + (de + 1) + '–' + Math.min(de + H.por, L.length) + ' of ' + L.length + ' shipments', 'Mostrando ' + (de + 1) + '–' + Math.min(de + H.por, L.length) + ' de ' + L.length + ' envios')) + '</span><div class="sh-pag-bts">' +
    '<button type="button" class="btn sm" data-act="sh-pag" data-pag="' + (H.pag - 1) + '"' + (H.pag <= 1 ? ' disabled' : '') + '>' + svg(ICO.esq, 13) + '</button><b>' + H.pag + ' / ' + pags + '</b><button type="button" class="btn sm" data-act="sh-pag" data-pag="' + (H.pag + 1) + '"' + (H.pag >= pags ? ' disabled' : '') + '>' + svg(ICO.dir, 13) + '</button>' +
    '<select id="shPor">' + [10, 25, 50, 100].map(n => '<option value="' + n + '"' + (n === H.por ? ' selected' : '') + '>' + n + ' ' + esc(L3('개씩', 'per page', 'por página')) + '</option>').join('') + '</select></div></div>';
  return h + '</div>';
}
/* ---------- 상세 ---------- */
const par = (rot, v, full) => '<div class="sh-par' + (full ? ' full' : '') + '"><i>' + esc(rot) + '</i><b>' + v + '</b></div>';
const selecionado = () => (H.lista || []).find(e => e.key === H.sel) || null;
const podeVoid = e => isStaff() && can('ship') && e.st === 'emitido' && !e.pedido && !!e.job;
const podeEditar = e => podeVoid(e) && !!(e.acct && S.accounts.byCode && S.accounts.byCode[e.acct]);
function acoesHTML(e) {
  if (!isStaff()) return '';
  const b = [];
  if (e.job && e.st !== 'void') b.push('<button type="button" class="btn" data-act="sh-ir-etq">' + svg(ICO.print, 14) + ' ' + esc(L3('다시 인쇄', 'Reprint', 'Reimprimir')) + '</button>');
  if (e.st !== 'void' && e.st !== 'entregue') b.push('<button type="button" class="btn" data-act="sh-rastrear">' + svg(ICO.repetir, 14) + ' ' + esc(L3('배송 조회', 'Update tracking', 'Atualizar rastreio')) + '</button>');
  if (podeEditar(e)) b.push('<button type="button" class="btn" data-act="sh-editar">' + svg(ICO.lapis, 14) + ' ' + esc(L3('출고 고치기', 'Edit shipment', 'Editar envio')) + '</button>');
  if (podeVoid(e)) b.push('<button type="button" class="btn danger" data-act="sh-cancelar">' + svg(ICO.x, 14) + ' ' + esc(L3('취소 (VOID)', 'Cancel (void)', 'Cancelar (void)')) + '</button>');
  return b.length ? '<div class="sh-acoes">' + b.join('') + '</div>' : '';
}
function abaHTML(e, aba) {
  const topo = '<div class="sh-carrier"><div class="sh-carrier-logo">UPS</div><div><b>' + esc(e.serv) + '</b><span>Tracking: <code class="sh-rast">' + esc(e.trk) + '</code> <button type="button" class="sh-copiar" data-copiar="' + esc(e.g.boxes.map(x => x.trk).join(' ')) + '">' + svg(ICO.copiar, 13) + '</button></span></div><a class="btn sm" href="https://www.ups.com/track?tracknum=' + encodeURIComponent(e.trk) + '" target="_blank" rel="noopener noreferrer">ups.com ' + svg(ICO.link, 12) + '</a></div>';
  const B = e.g.boxes;
  if (aba === 'geral') {
    const dims = B.map((x, i) => '<span class="sh-dim"><em>' + (x.box || i + 1) + '</em>' + esc(String(x.dims || '—').replace(/×/g, ' × ')) + (Number(x.w) ? '<small>' + num1(x.w) + ' lb</small>' : '') + '</span>');
    const dl = e.a.deliveredAt ? '<div class="sh-par sh-entrega ok"><i>' + esc(L3('배달', 'Delivered', 'Entregue em')) + '</i><b>' + esc(e.a.deliveredAt) + (e.a.receivedBy ? ' · ' + esc(e.a.receivedBy) : '') + '</b></div>' : '<div class="sh-par sh-entrega"><i>' + esc(L3('예상 배달', 'Expected delivery', 'Entrega prevista')) + '</i><b>' + esc(e.a.eta || '—') + '</b></div>';
    return topo + '<div class="sh-grid">' + par(L3('출고일', 'Ship date', 'Data do envio'), esc(e.data + (e.at ? ' ' + String(e.at).substring(11, 16) : ''))) + dl +
      par(L3('주문', 'Order', 'Pedido'), e.pedido ? '<b>' + esc(e.pedido) + '</b>' + (e.invs.length ? ' · ' + esc(e.invs.join(', ')) : '') : '<span class="hint">' + esc(L3('주문 없음', 'No order', 'Sem pedido') + ' · ' + e.no) + '</span>') +
      par(L3('가게', 'Store', 'Cliente'), (e.acct ? '#' + esc(e.acct) + ' · ' : '') + esc(e.cli || '—')) + par(L3('세일즈맨', 'Salesman', 'Vendedor'), esc(e.sm || '—')) +
      par(L3('주소', 'Address', 'Endereço'), esc(e.end) + '<br>' + esc([e.cidade, e.estado, e.cep].filter(Boolean).join(', ')), true) +
      par(L3('계정', 'Account', 'Código da loja'), e.acct ? '#' + esc(e.acct) : '—') + par(L3('전화', 'Phone', 'Telefone'), esc(e.tel || '—')) +
      par(L3('무게', 'Weight', 'Peso'), e.peso ? num1(e.peso) + ' lb' : '—') + par(L3('박스', 'Boxes', 'Caixas'), String(e.n)) +
      par(L3('크기', 'Dimensions', 'Dimensões'), dims.length ? '<span class="sh-dims">' + dims.join('') + '</span>' : '—', true) +
      (e.cod ? par('COD', '<b>' + esc(money(e.cod)) + '</b> · ' + esc(L3('배달 때 받을 돈', 'to collect on delivery', 'a cobrar na entrega'))) : '') +
      par(L3('담당', 'By', 'Responsável'), esc(String(e.by || '—').split('@')[0])) + '</div>' + acoesHTML(e);
  }
  if (aba === 'tracking') {
    let ev = []; B.forEach(x => (x.events || []).forEach(v => ev.push(Object.assign({ bx: x.box || 1 }, v)))); ev.sort((x, y) => ((y.d || '') + (y.t || '')).localeCompare((x.d || '') + (x.t || '')));
    return topo + '<div class="sh-timeline">' + (ev.length ? ev.map(v => '<div class="sh-ev' + (v.st === 'D' ? ' ok' : v.st === 'X' ? ' out' : '') + '"><span class="sh-dot"></span><div><b>' + esc(v.desc || v.st || '') + (B.length > 1 ? ' · ' + esc(L3('박스', 'box', 'caixa')) + ' ' + v.bx : '') + '</b><small>' + esc((v.d || '') + ' ' + (v.t || '') + (v.loc ? ' · ' + v.loc : '')) + '</small></div></div>').join('') : '<div class="graf-vazio">' + esc(L3('아직 스캔 기록이 없습니다', 'No scans yet', 'Ainda sem leitura da UPS')) + '</div>') + '</div>' + acoesHTML(e);
  }
  if (aba === 'custos') {
    const lista = Number(e.a.list) || 0, eco = lista > e.custo ? lista - e.custo : 0;
    return topo + '<div class="sh-custos">' + (lista ? '<div><span>' + esc(L3('UPS 공시 요금', 'UPS list rate', 'Cotação UPS')) + '</span><b>' + esc(money(lista)) + '</b></div>' : '') +
      '<div class="neg"><span>' + esc(L3('협상 요금', 'Negotiated rate', 'Tarifa negociada')) + '</span><b>' + (e.custo ? esc(money(e.custo)) : '—') + '</b></div>' + (eco ? '<div><span>' + esc(L3('절감', 'Savings', 'Economia')) + '</span><b>−' + esc(money(eco)) + '</b></div>' : '') +
      (e.cod ? '<div><span>COD</span><b>' + esc(money(e.cod)) + '</b></div>' : '') + '<div class="tot"><span>' + esc(L3('합계', 'Total', 'Total')) + '</span><b>' + (e.custo ? esc(money(e.custo)) : '—') + '</b></div></div>';
  }
  if (aba === 'etiqueta') {
    if (!e.job) return topo + '<div class="graf-vazio">' + esc(L3('저장된 라벨이 없습니다 (앱 밖에서 만든 출고)', 'No saved label (shipped outside the app)', 'Etiqueta não guardada (envio feito fora do app)')) + '</div>';
    const vale = e.st !== 'void' && isStaff(), bz = k => H.busy[e.key + ':' + k];
    return topo + (e.st === 'void' ? '<div class="aviso alerta" style="margin:12px 0">' + esc(L3('취소된 라벨 — 보기만, 인쇄 안 됨', 'Voided label — view only', 'Etiqueta anulada — só para ver, não imprime')) + '</div>' : '') +
      '<div class="sh-vols">' + B.map((x, i) => '<div class="sh-vol"><b>' + esc(L3('박스', 'Box', 'Caixa')) + ' ' + (x.box || i + 1) + '/' + e.n + '</b><span>' + esc(x.trk) + ' · ' + (Number(x.w) ? num1(x.w) + ' lb' : '') + '</span>' +
        (vale ? '<button type="button" class="btn sm" data-act="sh-reimp" data-box="' + (x.box || i + 1) + '"' + (bz(x.box || i + 1) || bz('*') ? ' disabled' : '') + '>' + svg(ICO.print, 13) + ' ' + esc(bz(x.box || i + 1) ? L3('인쇄 중…', 'Printing…', 'Imprimindo…') : L3('다시 인쇄', 'Reprint', 'Reimprimir')) + '</button>' : '') + '</div>').join('') + '</div>' +
      (vale && B.length > 1 ? '<div class="sh-etq-bts"><button type="button" class="btn primary" data-act="sh-reimp" data-box="*"' + (bz('*') ? ' disabled' : '') + '>' + svg(ICO.print, 14) + ' ' + esc(bz('*') ? L3('인쇄 중…', 'Printing…', 'Imprimindo…') : L3('전부 다시 인쇄', 'Reprint all', 'Reimprimir todas')) + '</button></div>' : '');
  }
  const log = [{ at: e.at || e.data, t: L3('라벨 만듦', 'Label created', 'Etiqueta criada'), by: e.by }].concat((e.a.log || []).map(l => ({ at: l.at, by: l.by, t: l.t === 'void' ? L3('취소 (VOID)', 'Voided', 'Anulada (void)') : l.t === 'edit' ? L3('고쳐서 다시 만듦', 'Edited and recreated', 'Editada e emitida de novo') : L3('다시 인쇄', 'Reprinted', 'Reimpressa') + (l.box ? ' · ' + L3('박스', 'box', 'caixa') + ' ' + l.box : ' · ' + L3('전부', 'all', 'todas')) })));
  if (e.a.deliveredAt) log.push({ at: e.a.deliveredAt, t: L3('배달 완료', 'Delivered', 'Entregue'), by: e.a.receivedBy || '' });
  log.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  return topo + '<div class="sh-aud">' + log.map(l => '<div><b>' + esc(l.t) + '</b><span>' + esc(String(l.at || '').replace('T', ' ').substring(0, 16) + (l.by ? ' · ' + String(l.by).split('@')[0] : '')) + '</span></div>').join('') + '</div>';
}
function detHTML() {
  const e = selecionado(); if (!e) return '';
  const abas = [['geral', L3('개요', 'Overview', 'Visão geral')], ['tracking', 'Tracking'], ['custos', L3('비용', 'Costs', 'Custos')], ['etiqueta', L3('라벨', 'Label', 'Etiqueta')], ['hist', L3('기록', 'History', 'Histórico')]];
  return '<div class="sh-det-head"><div><b class="sh-det-num">' + esc(e.no) + '</b> ' + stHTML(e.st) + (e.cod ? ' <span class="sh-cod-tag">COD</span>' : '') + '</div><button type="button" class="x" data-act="sh-fechar">' + svg(ICO.x, 16) + '</button></div>' +
    '<div class="sh-abas">' + abas.map(a => '<button type="button" class="sh-aba' + (H.aba === a[0] ? ' on' : '') + '" data-act="sh-aba" data-aba="' + a[0] + '">' + esc(a[1]) + '</button>').join('') + '</div><div class="sh-det-corpo" id="shDetCorpo">' + abaHTML(e, H.aba) + '</div>';
}

export async function page() {
  css();
  const cab = '<div class="page-head nu-head sh-head"><div><h1>Shipping History</h1><p>' + esc(L3('UPS 로 나간 출고 전부 — 카드를 누르면 그 상태만', 'Every UPS shipment — tap a card to filter', 'Todos os envios pela UPS — clique num cartão para filtrar')) + '</p></div>' +
    (isStaff() ? '<div class="nu-head-dir sh-head-bts actions"><button type="button" class="btn" data-act="sh-rastrear-todos">' + svg(ICO.repetir, 15) + ' ' + esc(L3('배송 조회', 'Update tracking', 'Atualizar rastreio')) + '</button>' + (can('ship') ? '<button type="button" class="btn primary" data-act="sh-novo">' + svg(ICO.mais, 15) + ' Shipping UPS</button>' : '') + '</div>' : '') + '</div>';
  const pinta = () => { $('page').innerHTML = '<div class="sb">' + cab + '<div class="sh-tela' + (H.sel ? ' com-det' : '') + '"><div class="sh-main">' + kpisHTML() + '<div class="panel ups-painel sh-filtros-box" id="shFiltros">' + filtrosHTML() + '</div><div id="shCorpo">' + corpoHTML() + '</div></div><aside class="sh-det" id="shDet">' + (H.sel ? detHTML() : '') + '</aside></div></div>'; ligar(); };
  pinta();
  const ch = H.chave; await carregar(); if (location.hash.indexOf('#/shiphist') === 0 && (H.chave !== ch || H.lista)) pinta();
}
const repintar = () => { const c = $('shCorpo'); if (c) { c.innerHTML = corpoHTML(); ligarCorpo(); } };
function ligarCorpo() {
  document.querySelectorAll('.sb .sh-l, .sb [data-act="sh-ver"]').forEach(r => r.onclick = ev => { ev.stopPropagation(); H.sel = r.dataset.envio; H.aba = 'geral'; page(); });
  document.querySelectorAll('.sb [data-act="sh-pag"]').forEach(b => b.onclick = () => { H.pag = Number(b.dataset.pag) || 1; repintar(); });
  const por = $('shPor'); if (por) por.onchange = () => { H.por = Number(por.value) || 25; H.pag = 1; repintar(); };
}
function ligar() {
  const on = (act, f) => document.querySelectorAll('.sb [data-act="' + act + '"]').forEach(b => b.onclick = ev => { ev.stopPropagation(); f(b); });
  on('sh-kpi', b => { const st = b.dataset.st, per = b.dataset.per || ''; const ligado = H.st === st && (!per || H.per === per); H.cli = ''; H.serv = ''; H.cod = ''; H.sm = ''; H.q = ''; H.st = ligado ? '' : st; if (per && !ligado) H.per = per; H.pag = 1; page(); });
  document.querySelectorAll('.sb [data-act="sh-kpi"]').forEach(b => b.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); b.click(); } });
  on('sh-per', b => { H.per = b.dataset.p; H.pag = 1; page(); });
  on('sh-filtros-ab', () => { H.filtrosAb = !H.filtrosAb; page(); });
  on('sh-limpar', () => { H.st = H.cli = H.serv = H.cod = H.sm = H.q = ''; H.pag = 1; page(); });
  on('sh-fechar', () => { H.sel = ''; page(); });
  on('sh-aba', b => { H.aba = b.dataset.aba; page(); });
  on('sh-ir-etq', () => { H.aba = 'etiqueta'; page(); });
  on('sh-novo', () => Router.go('balcao'));
  on('sh-reimp', b => reimprimir(selecionado(), b.dataset.box));
  on('sh-rastrear', () => { const e = selecionado(); if (e) rastrear(e.g.boxes.map(x => x.trk)); });
  on('sh-rastrear-todos', () => rastrear([].concat(...filtrados().filter(e => e.st !== 'void' && e.st !== 'entregue').map(e => e.g.boxes.map(x => x.trk))).slice(0, 25)));
  on('sh-cancelar', () => cancelar(selecionado(), false));
  on('sh-editar', () => cancelar(selecionado(), true));
  document.querySelectorAll('.sb [data-copiar]').forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.copiar); toast(L3('복사했습니다', 'Copied', 'Copiado')); } catch (e) {} });
  const bu = $('shBusca'); if (bu) bu.oninput = () => { H.q = bu.value; H.pag = 1; repintar(); };
  [['shCli', 'cli'], ['shServ', 'serv'], ['shSt', 'st'], ['shCod', 'cod'], ['shSm', 'sm']].forEach(([id, k]) => { const el = $(id); if (el) el.onchange = () => { H[k] = el.value; H.pag = 1; page(); }; });
  const de = $('shDe'), ate = $('shAte');
  if (de) de.onchange = () => { H.de = de.value; page(); }; if (ate) ate.onchange = () => { H.ate = ate.value; page(); };
  ligarCorpo();
}

/* ---------- 행동 ---------- */
async function addLog(e, item) { const lead = e.g.boxes[0]; try { const cur = await S.DB.get('shipments', lead.trk); const log = ((cur && cur.log) || []).concat([item]); await S.DB.update('shipments', lead.trk, { log }); lead.log = log; e.a.log = log; } catch (er) {} }
async function reimprimir(e, box) {
  if (!e || !e.job || e.st === 'void') return;
  const k = e.key + ':' + box; if (H.busy[k] || H.busy[e.key + ':*']) return;
  H.busy[k] = true; page();
  try {
    const q = await S.DB.get('shipq', e.job), L = ((q && q.labels) || []).filter(l => l && l.img);
    const want = box === '*' ? L : L.filter((l, i) => String(i + 1) === String(box) || l.trk === (e.g.boxes.find(x => String(x.box) === String(box)) || {}).trk);
    if (!want.length) toast(L3('저장된 라벨이 없습니다', 'No saved label', 'Etiqueta não encontrada'), 'bad');
    else { imprimir({ labels: want }); await addLog(e, { t: 'reimp', box: box === '*' ? 0 : Number(box), by: S.user.email, at: new Date().toISOString() }); }
  } catch (er) { toast(String(er.code || er.message), 'bad'); }
  setTimeout(() => { delete H.busy[k]; if (location.hash.indexOf('#/shiphist') === 0) page(); }, 5000);
  page();
}
async function rastrear(trks) {
  if (!trks.length) return toast(L3('조회할 출고가 없습니다', 'Nothing to track', 'Nada para rastrear'), 'bad');
  toast(L3('UPS 에 묻는 중… (최대 1분)', 'Asking UPS… (up to 1 min)', 'Consultando a UPS… (até 1 min)'));
  const id = 'TRK-' + Date.now().toString(36);
  try { await S.DB.set('shipq', id, { st: 'trk', kind: 'trk', trks, by: S.user.email, createdAt: new Date().toISOString() }); for (let i = 0; i < 30; i++) { await sleep(3000); const x = await S.DB.get('shipq', id); if (x && x.st === 'trkdone') break; } }
  catch (er) { return toast(String(er.code || er.message), 'bad'); }
  H.chave = ''; await carregar(); if (location.hash.indexOf('#/shiphist') === 0) page();
  toast(L3('배송 상태를 새로 받았습니다', 'Tracking updated', 'Rastreio atualizado'), 'good');
}
/** 🚫 VOID — UPS 에 라벨 취소 (주문 없는 출고만). 고치기면 끝난 뒤 같은 가게 · 박스로 카운터를 엶 */
async function cancelar(e, editar) {
  if (!e || !podeVoid(e)) return;
  const msg = editar ? L3('이 라벨을 UPS 에서 취소(VOID)하고 같은 가게 · 박스로 새로 만들까요? 붙인 라벨은 버려 주세요.', 'Void this label at UPS and recreate it with the same store and boxes?', 'Anular (void) esta etiqueta na UPS e abrir o Shipping UPS com a mesma loja e caixas para emitir de novo? Jogue fora a etiqueta colada.')
    : L3('이 라벨을 UPS 에서 취소(VOID)할까요? 붙인 라벨은 버려 주세요.', 'Void this label at UPS?', 'Anular (void) esta etiqueta na UPS? Jogue fora a etiqueta colada.');
  if (!(await confirmBox(msg + ' (' + e.trk + ')', editar ? L3('취소하고 고치기', 'Void and edit', 'Anular e editar') : L3('취소 (VOID)', 'Void', 'Anular (void)')))) return;
  toast(L3('UPS 에 취소 요청 중… (1분 안팎)', 'Voiding at UPS… (about 1 min)', 'Anulando na UPS… (cerca de 1 min)'));
  let x = null;
  try { await S.DB.update('shipq', e.job, { st: 'void', voidBy: S.user.email, voidAt: new Date().toISOString() }); for (let i = 0; i < 40; i++) { await sleep(3000); x = await S.DB.get('shipq', e.job); if (x && (x.st === 'voided' || x.st === 'voiderr')) break; } }
  catch (er) { return toast(String(er.code || er.message), 'bad'); }
  if (!x || x.st !== 'voided') return toast(L3('UPS 가 취소를 거부했습니다', 'UPS refused the void', 'A UPS recusou a anulação') + (x && x.err ? ': ' + x.err : ''), 'bad');
  const now = new Date().toISOString();
  for (const b of e.g.boxes) { try { await S.DB.update('shipments', b.trk, { voided: true, voidAt: now, voidBy: S.user.email }); b.voided = true; } catch (er) {} }
  await addLog(e, { t: editar ? 'edit' : 'void', by: S.user.email, at: now });
  try { if (e.a.adhocId) await S.DB.update('adhoc', e.a.adhocId, { st: 'void', voidAt: now, voidBy: S.user.email, updatedAt: now }); } catch (er) {}
  H.chave = '';
  if (editar) return abrirEdicao(e.acct, e.g.boxes.map(b => { const d = String(b.dims || '').split('×').map(Number); return { peso: b.w, c: d[0] || '', l: d[1] || '', a: d[2] || '' }; }), e.a.svc, e.cod || '', e.no);
  toast('VOID · ' + e.trk, 'good'); await carregar(); page();
}
