/* ============================================================
 *  🧮 발주 계획 (#/plan) — 옛 THE ONE CORP WMS 의 "Planejamento de Compras" 를 그대로 (telaPlanCompras · pcp* · pcx*)
 *    탭 4개: 상품 → 공장별 → 검토 → 만들 발주서 · 오른쪽 패널(고른 것 공장별) · 아래 막대 · 상품 서랍(계산 설명 · 12개월) · ⚙️ 설정(공장 리드타임 + 메일)
 *    위 숫자 칸 5개(누르면 걸러보기) · 합계 띠 · 걸러보기(공장 · 분류 · 상태 · 찾기 + 고급: 기간 · 리드타임 · 얼마 동안 · 통로 · 살 것만)
 *    표(정렬 · 50개씩 · 쪽) · 분석 3개(많이 살 것 · 수요 vs 예상 재고 · 공장별) · ❓ 계산 방법 · Excel · PDF(영어 · A4)
 *    고른 것은 검색 · 쪽을 넘어도 남음 — 이 기기 · 이 사람마다 (localStorage pcp_sel_<이메일>, 옛 "opção A")
 *  계산 = 옛 plan_compras_base (docs/planejamento-compras.sql + plan-compras-ruptura + toggle-sem-historico) 를 아이템마다 그대로 — calcBase():
 *    창 = 지난 N 개의 끝난 달 (3 · 6 · 12, 기본 3) · 이전 창 = 그 앞 N 달 (추세) · 12개월 = 끝난 12달
 *    품절일(ruptura) = 창 안에서 "Caixa marcada como vazia" 부터 다음 입고(recv +) / "Caixa deixou de estar vazia" 까지 (stockLog) — 창 일수 − 1 을 넘지 않음
 *    media_janela = 창 판매 ÷ (창 일수 − 품절일) · media_12m = 12개월 판매 ÷ 12개월 일수 · 품절일 ≥ 1 이고 12개월이 크면 12개월 (media_origem '12m')
 *    demanda_lt = 평균 × 리드타임 · seguranca = max(평균 × 안전 일수, 손으로 정한 최소) · ponto_rep = demanda_lt + seguranca
 *    disponivel = 재고 − 예약(새 앱엔 없음 = 0) + 오는 중(보낸 · 일부 받은 발주서의 남은 것) · dias_cobertura = disponivel ÷ 평균
 *    alvo = 평균 × (리드타임 + 주기) + seguranca · necessidade = max(alvo − disponivel, 0)
 *    qtd_comprar = 0 (필요 0 · 평균 0) 아니면 ceil(max(ceil(필요), 최소 구매)) 를 상자 단위로 올림 · data_ideal = max(오늘, 오늘 + floor((disponivel − ponto_rep) ÷ 평균))
 *    status = sem_historico(평균 0) · em_transito(오는 중이 덮음) · comprar_agora(남은 날 < 리드타임) · comprar_breve(필요 > 0) · excesso(> 180일) · saudavel
 *    기본값: 리드타임 60 · 안전 30 · 주기 30 (옛 fornecedores 기본) — 공장마다 ⚙️ 설정 (settings/app.planParams)
 *  자료 (옛 표 → 새 앱)
 *    produtos = 카탈로그 (숨김 · 가상 빼고) · 이름 = 설명(없으면 코드) · 분류 = Level 1 · 통로 = 위치 · 공장 = 아이템 sup · 사진 = ph
 *    vendas(월별) = 인보이스 줄 (VOID 빼고 · 세트는 구성품) 을 달마다 · 재고 = stock/{code}.qty · 손으로 정한 최소 = stock.min (옛 produto_minimo.manual)
 *    prodExtra/{code}.{ unidade:'un'|'dz', unPorCaixa, qtdMinCompra, leadTime } = 옛 produtos.unidade · un_por_caixa · qtd_minima_compra · lead_time_dias
 *    원가 = prodCusto (관리자 · 오너만) — 못 보는 역할은 원가 · 금액 칸이 "—" 이고 원가 경고를 안 띄움
 *  발주서 만들기 = pocompra.js gerarPedidos (옛 rpc_pedido_compra_gerar — 같은 chave 면 두 벌 안 생김)
 * ============================================================ */
import { $, Router, esc, busy } from './ui.js';
import { loadCatalog, catalog, locOf, levelsOf, thumb } from './catalog.js';
import { invoicesBetween } from './invoicing.js';
import * as Stock from './stock.js';
import { CORREDORES, corrDe, normCod } from './etq.js';
import * as B from './plan-base.js';
import * as PO from './pocompra.js';
import { printOpen } from './ui.js';

const { t, ti, te, tiu, numFmt, brl, dataBR, dataEN, opt, ICO, svg, pcuSigla, pcuCaixa, pcuSiglaConj, pcuQtd, pcuTexto, pcuNumHTML, pcuSufHTML, pcpCmpSku, aviso } = B;
export const canPlan = B.canPlan;
export const DEF = B.DEF;
let S = null;
export function register(state) {
  S = state; B.init(state); PO.register(state); Router.on('plan', page);
  Router.up.plan = () => { if (B.drawerAberto()) { fecharDrawer(); return true; } return false; };
  Router.upHas.plan = () => B.drawerAberto();
}

/* ============================================================
 *  계산 (옛 plan_compras_base) — 한 아이템. 화면 · 시험이 같은 함수
 * ============================================================ */
const rnd = (x, n) => { const k = Math.pow(10, n); return Math.round((Number(x) || 0) * k) / k; };
/** x = { qtd, reservado, em_transito, un_por_caixa, qtd_minima_compra, custo, lead_time, dias_seguranca, dias_ciclo, dias_janela, vendas_janela, vendas_anterior, vendas_12m, dias_12m, dias_ruptura, minimo_manual, hoje } */
export function calcBase(x) {
  const o = Object.assign({}, x), upc = Math.max(Number(x.un_por_caixa) || 1, 1);
  o.un_por_caixa = upc; o.reservado = Number(x.reservado) || 0; o.em_transito = Number(x.em_transito) || 0; o.qtd = Number(x.qtd) || 0;
  o.dias_ruptura = Math.min(rnd(x.dias_ruptura || 0, 1), x.dias_janela - 1);
  o.media_janela = (x.dias_janela - o.dias_ruptura) ? rnd(x.vendas_janela / (x.dias_janela - o.dias_ruptura), 4) : null;
  o.media_12m = x.dias_12m ? rnd((x.vendas_12m || 0) / x.dias_12m, 4) : null;
  o.disponivel = o.qtd - o.reservado + o.em_transito;
  const usa12 = o.dias_ruptura >= 1 && (o.media_12m || 0) > (o.media_janela || 0);
  o.media_dia = usa12 ? o.media_12m : (o.media_janela || 0);
  o.media_origem = usa12 ? '12m' : 'janela';
  o.tendencia = x.vendas_anterior > 0 ? rnd((x.vendas_janela - x.vendas_anterior) / x.vendas_anterior, 3) : null;
  o.demanda_lt = rnd(o.media_dia * x.lead_time, 2);
  o.minimo_manual = x.minimo_manual == null ? null : Number(x.minimo_manual);
  o.seguranca = Math.max(rnd(o.media_dia * x.dias_seguranca, 2), o.minimo_manual || 0);
  o.ponto_rep = rnd(o.demanda_lt + o.seguranca, 2);
  o.dias_cobertura = o.media_dia > 0 ? rnd(o.disponivel / o.media_dia, 1) : null;
  o.alvo = rnd(rnd(o.media_dia * (x.lead_time + x.dias_ciclo), 2) + o.seguranca, 2);
  o.necessidade = Math.max(rnd(o.alvo - o.disponivel, 2), 0);
  o.qtd_comprar = (o.necessidade <= 0 || o.media_dia === 0) ? 0 : Math.ceil(Math.max(Math.ceil(o.necessidade), Number(x.qtd_minima_compra) || 0) / upc) * upc;
  o.media_mes = rnd(o.media_dia * 30.4375, 1);
  const hoje = x.hoje || B.hojeISO();
  if (o.qtd_comprar > 0) { const d = new Date(hoje + 'T12:00:00'); d.setDate(d.getDate() + Math.max(0, Math.floor((o.disponivel - o.ponto_rep) / o.media_dia))); o.data_ideal = B.ymdLocal(d); } else o.data_ideal = null;
  o.valor_est = o.qtd_comprar > 0 && Number(x.custo) > 0 ? rnd(o.qtd_comprar * Number(x.custo), 2) : null;
  o.status = o.media_dia === 0 ? 'sem_historico'
    : o.em_transito > 0 && o.necessidade === 0 && (o.alvo - (o.qtd - o.reservado)) > 0 ? 'em_transito'
    : o.dias_cobertura < x.lead_time ? 'comprar_agora'
    : o.necessidade > 0 ? 'comprar_breve'
    : o.dias_cobertura > 180 ? 'excesso' : 'saudavel';
  return o;
}

/* ---------- 날짜 — 끝난 달 (옛 date_trunc('month', current_date) − N months) ---------- */
const mesIni = back => { const d = new Date(); return B.ymdLocal(new Date(d.getFullYear(), d.getMonth() - back, 1)); };
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);
export function janela(m) { const fim = mesIni(0); return { m, ini: mesIni(m), fim, ini_ant: mesIni(2 * m), ini12: mesIni(12), dias: diasEntre(mesIni(m), fim), dias12: diasEntre(mesIni(12), fim) }; }

/* ---------- 품절일 (옛 rmarca · rfim · rev · rup) ---------- */
const MARCA = 'Caixa marcada como vazia', DESMARCA = 'Caixa deixou de estar vazia';
/** logs: 이 아이템의 stockLog · [ini, fim) 안에서 품절이었던 날 (소수) */
export function diasRuptura(logs, ini, fim, agoraMs) {
  const L = (logs || []).map(l => ({ t: Date.parse(l.at || (l.d + 'T12:00:00')), marca: l.note === MARCA, fimEv: l.note === DESMARCA || (l.kind === 'recv' && Number(l.delta) > 0) })).filter(l => !isNaN(l.t)).sort((a, b) => a.t - b.t);
  const evs = L.filter(l => l.marca).map(k => { const f = L.find(x => x.t > k.t && x.fimEv); return { ini: k.t, fim: f ? f.t : null }; });
  const vivos = evs.filter(c => !evs.some(c2 => c2.ini < c.ini && (c2.fim == null || c2.fim > c.ini)));
  const A = Date.parse(ini + 'T00:00:00'), Bf = Date.parse(fim + 'T00:00:00'), now = agoraMs || Date.now();
  return vivos.reduce((s, e) => s + Math.max(0, (Math.min(e.fim == null ? now : e.fim, Bf) - Math.max(e.ini, A)) / 864e5), 0);
}

/* ============================================================
 *  자료 모으기 (한 번 읽고 기억 · ↻ 로 새로)
 * ============================================================ */
let RAW = null, RAW_P = null, BASE = { key: '', rows: [], by: {} };
const OPEN_ST = ['enviado', 'recebido_parcial'];
async function lerRaw(force) {
  await loadCatalog(S, !!force);
  const C = catalog(), j24 = mesIni(24), fim = mesIni(0);
  const [qtd, extra, custos, invs, pos, marcas] = await Promise.all([
    Stock.stockAll(!!force).catch(() => ({})),
    S.DB.list('prodExtra').catch(() => []),
    B.custoVisivel() ? B.lerCustos() : Promise.resolve({ ok: false, m: {} }),
    invoicesBetween(S, j24, B.ymdLocal(new Date(Date.parse(fim + 'T12:00:00') - 864e5))).catch(() => []),
    S.DB.list('purchaseOrders').catch(() => []),
    S.DB.list('stockLog', { where: [['note', '==', MARCA]] }).catch(() => [])
  ]);
  /* 품절 표시가 있었던 아이템만 그 움직임을 더 읽음 (끝나는 때를 찾으려고) */
  const codes = Array.from(new Set(marcas.map(l => String(l.code || '')).filter(Boolean))), logs = {};
  for (let i = 0; i < codes.length; i += 30) { const ch = codes.slice(i, i + 30); try { (await S.DB.list('stockLog', { where: [['code', 'in', ch]] })).forEach(l => { (logs[l.code] = logs[l.code] || []).push(l); }); } catch (e) {} }
  const vendas = {};   // code → { 'YYYY-MM': qtd }
  invs.filter(v => v && v.st !== 'x' && !v.void).forEach(v => {
    const k = String(v.d || '').substring(0, 7); if (!k) return;
    Stock.movesOfLines(v.lines, 1).forEach(m => { const c = String(m.c || '').toUpperCase(); if (!c) return; const o = vendas[c] = vendas[c] || {}; o[k] = (o[k] || 0) + m.delta; });
  });
  const ex = {}; extra.forEach(r => { ex[r.id] = r; });
  RAW = { items: ((C && C.items) || []).filter(x => !x.h && !x.virt), qtd, ex, custo: custos.m, custoOk: !!custos.ok, vendas, pos, logs, at: Date.now(), ver: (RAW ? RAW.ver : 0) + 1 };
  BASE = { key: '', rows: [], by: {} };
  return RAW;
}
export function invalidar() { RAW = null; }
async function garantirRaw(force) { if (RAW && !force) return RAW; if (!RAW_P || force) RAW_P = lerRaw(force).finally(() => { RAW_P = null; }); return RAW_P; }
const somaMeses = (o, de, ate) => { let s = 0; if (!o) return 0; Object.keys(o).forEach(k => { if (k >= de.substring(0, 7) && k < ate.substring(0, 7)) s += o[k]; }); return s; };
/** 옛 plan_compras_base(p_meses, p_ciclo) */
export function base(meses, ciclo) {
  const key = RAW.ver + '|' + meses + '|' + (ciclo || '');
  if (BASE.key === key) return BASE.rows;
  const J = janela(meses), tr = {};
  RAW.pos.filter(p => OPEN_ST.includes(p.status)).forEach(p => (p.itens || []).forEach(i => { if (i.removido_em) return; tr[i.produto_id] = (tr[i.produto_id] || 0) + Math.max(0, (Number(i.qtd) || 0) - (Number(i.qtd_recebida) || 0)); }));
  const rows = RAW.items.map(x => {
    const c = x.c, e = RAW.ex[c] || {}, sup = x.sup || '', pr = B.parOf(sup), v = RAW.vendas[c];
    const loc = locOf(x), L1 = levelsOf(x, 'l1')[0] || '';
    const r = calcBase({ qtd: Number(RAW.qtd[c]) || 0, reservado: 0, em_transito: tr[c] || 0, un_por_caixa: e.unPorCaixa, qtd_minima_compra: Number(e.qtdMinCompra) > 0 ? Number(e.qtdMinCompra) : null,
      custo: RAW.custo[c] != null ? RAW.custo[c] : null, lead_time: Number(e.leadTime) >= 1 ? Number(e.leadTime) : pr.lead, dias_seguranca: pr.seg, dias_ciclo: Number(ciclo) || pr.cyc,
      dias_janela: J.dias, vendas_janela: somaMeses(v, J.ini, J.fim), vendas_anterior: somaMeses(v, J.ini_ant, J.ini), vendas_12m: somaMeses(v, J.ini12, J.fim), dias_12m: J.dias12,
      dias_ruptura: RAW.logs[c] ? diasRuptura(RAW.logs[c], J.ini, J.fim) : 0, minimo_manual: Stock.minManual ? Stock.minManual(c) : null });
    return Object.assign(r, { produto_id: c, sku: c, nome: x.d || c, categoria_id: L1, categoria: L1, corredor: corrDe(loc), fornecedor_id: sup || null, fornecedor: sup ? B.fornNome(sup) : null, foto_thumb: x.ph ? thumb(x.ph, 120) : null, unidade: e.unidade === 'dz' ? 'dz' : 'un', custo: RAW.custo[c] != null ? RAW.custo[c] : null });
  });
  const by = {}; rows.forEach(r => { by[r.produto_id] = r; });
  BASE = { key, rows, by };
  return rows;
}
export const _raw = () => RAW;

/* ---------- 옛 rpc_plan_compras · _resumo · _sku ---------- */
function filtrar(rows, f, comStatus) {
  const forn = f.fornecedor, q = String(f.busca || '').trim(), qn = normCod(q), ql = q.toLowerCase();
  return rows.filter(b => (!forn || (forn === 'sem' ? !b.fornecedor_id : b.fornecedor_id === forn)) && (!f.categoria || b.categoria_id === f.categoria) && (!f.corredor || b.corredor === f.corredor) && (!f.lead || b.lead_time === Number(f.lead)) &&
    (!q || normCod(b.sku).indexOf(qn) >= 0 || String(b.nome).toLowerCase().indexOf(ql) >= 0 || String(b.fornecedor || '').toLowerCase().indexOf(ql) >= 0) &&
    (!comStatus || (f.status ? b.status === f.status : (!f.so_comprar || b.qtd_comprar > 0))));
}
const cmpCol = (a, b, col, dir) => { const x = a[col], y = b[col]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }); return dir === 'asc' ? r : -r; };
export function rpcPlanCompras(f, pag, pp, ordem, dir) {
  const L = filtrar(base(f.meses || 3, f.ciclo), f, true).slice();
  ordem = ordem || 'qtd_comprar'; dir = dir === 'asc' ? 'asc' : 'desc';
  L.sort((a, b) => cmpCol(a, b, ordem, dir) || cmpCol(a, b, 'dias_cobertura', 'asc') || pcpCmpSku(a.sku, b.sku));
  const n = !pp || pp <= 0 ? 5000 : Math.min(pp, 5000), p = Math.max(1, pag || 1);
  return { total: L.length, pagina: p, por_pagina: n, linhas: L.slice((p - 1) * n, p * n) };
}
export function rpcResumo(f) {
  const J = janela(f.meses || 3), b0 = filtrar(base(f.meses || 3, f.ciclo), f, false);
  const cards = { comprar_agora: 0, comprar_breve: 0, saudavel: 0, excesso: 0, em_transito: 0, pecas_transito: 0 };
  b0.forEach(b => { if (cards[b.status] != null) cards[b.status]++; cards.pecas_transito += b.em_transito; });
  const uni = b0.filter(b => (!f.status || b.status === f.status) && (f.status || !f.so_comprar || b.qtd_comprar > 0));
  const compra = uni.filter(b => b.qtd_comprar > 0);
  const totais = { skus_comprar: compra.length, pecas: compra.reduce((a, b) => a + b.qtd_comprar, 0), valor: uni.reduce((a, b) => a + (b.valor_est || 0), 0), skus_sem_custo: compra.filter(b => b.valor_est == null).length };
  const fg = {}; uni.forEach(b => { const k = b.fornecedor_id || ''; const o = fg[k] = fg[k] || { fornecedor_id: b.fornecedor_id, fornecedor: b.fornecedor, lead_time: b.lead_time, skus: 0, pecas: 0, valor: 0 }; o.lead_time = Math.min(o.lead_time, b.lead_time); if (b.qtd_comprar > 0) o.skus++; o.pecas += b.qtd_comprar; o.valor += b.valor_est || 0; });
  const fornecedores = Object.values(fg).sort((a, b) => b.pecas - a.pecas || (a.fornecedor == null) - (b.fornecedor == null) || String(a.fornecedor || '').localeCompare(String(b.fornecedor || '')));
  const top = compra.slice().sort((a, b) => b.qtd_comprar - a.qtd_comprar || pcpCmpSku(a.sku, b.sku)).slice(0, 10).map(b => ({ produto_id: b.produto_id, sku: b.sku, nome: b.nome, qtd_comprar: b.qtd_comprar, status: b.status }));
  const serie = []; const ids = uni;
  for (let i = J.m; i >= 1; i--) { const k = mesIni(i).substring(0, 7); serie.push({ mes: k, vendas: ids.reduce((a, b) => a + ((RAW.vendas[b.produto_id] || {})[k] || 0), 0), demanda: null, estoque: null }); }
  const md = uni.reduce((a, b) => a + b.media_dia, 0), disp = uni.reduce((a, b) => a + b.disponivel, 0); let acum = 0;
  for (let i = 0; i < 6; i++) { const d = new Date(); const ini = new Date(d.getFullYear(), d.getMonth() + i, 1), nx = new Date(d.getFullYear(), d.getMonth() + i + 1, 1); const dias = Math.round((nx - ini) / 864e5); acum += dias; serie.push({ mes: B.ymdLocal(ini).substring(0, 7), vendas: null, demanda: Math.round(md * dias), estoque: Math.max(Math.round(disp - md * acum), 0) }); }
  return { cards, totais, fornecedores, top, serie, meses: J.m, ciclo: f.ciclo || null, dias_janela: J.dias };
}
export function rpcSku(id, meses, ciclo) {
  const rows = base(meses || 3, ciclo), b = BASE.by[id]; if (!b) throw new Error('Produto nao encontrado.');
  const v12 = []; for (let i = 12; i >= 1; i--) { const k = mesIni(i).substring(0, 7); v12.push({ mes: k, qtd: (RAW.vendas[id] || {})[k] || 0 }); }
  const ped = []; RAW.pos.filter(p => ['rascunho', 'enviado', 'recebido_parcial'].includes(p.status)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).forEach(p => (p.itens || []).forEach(i => { if (i.produto_id === id && !i.removido_em) ped.push({ pedido_id: p.id, numero: p.numero, status: p.status, qtd: i.qtd, qtd_recebida: i.qtd_recebida || 0, previsao_em: p.previsao_em || null }); }));
  const ks = ['vendas_janela', 'dias_janela', 'media_dia', 'lead_time', 'demanda_lt', 'dias_seguranca', 'seguranca', 'minimo_manual', 'ponto_rep', 'dias_ciclo', 'alvo', 'qtd', 'reservado', 'em_transito', 'disponivel', 'necessidade', 'un_por_caixa', 'qtd_minima_compra', 'qtd_comprar', 'custo', 'valor_est', 'dias_ruptura', 'media_janela', 'media_12m', 'media_origem'];
  const ex = {}; ks.forEach(k => { ex[k] = b[k]; });
  void rows; return { sku: b, vendas12: v12, pedidos_abertos: ped, explicacao: ex };
}

/* ============================================================
 *  상태 (옛 S.pcp* · DADOS.pcp*)
 * ============================================================ */
const filtrosPadrao = () => ({ fornecedor: '', categoria: '', corredor: '', status: '', lead: '', ciclo: '', busca: '', so_comprar: true, meses: 3 });
const P = { F: null, Form: null, Pag: 1, Ord: 'sku', Dir: 'asc', Sel: null, Aba: 'produtos', GrpAb: {}, Avanc: false, FiltrosAbertos: false, TodosIds: null, TodosChave: null, Gerado: null, Ped: null, Sku: null };
const DD = { resumo: null, lista: null, chave: null, erro: null, quando: null, abertos: {} };
export const _P = P; export const _DD = DD;

/* ---------- 고른 것 (옛 pcpSel* — localStorage, 사람마다) ---------- */
const selChave = () => 'pcp_sel_' + String((S.user && S.user.email) || 'x').toLowerCase();
function selItem(x) {
  return { produto_id: String(x.produto_id), sku: x.sku, nome: x.nome, fornecedor_id: x.fornecedor_id, fornecedor: x.fornecedor, qtd_comprar: Number(x.qtd_comprar) || 0, qtd_edit: x.qtd_edit != null ? Number(x.qtd_edit) : null,
    custo: x.custo != null ? Number(x.custo) : null, un_por_caixa: x.un_por_caixa, unidade: x.unidade, qtd: x.qtd != null ? Number(x.qtd) : null, reservado: x.reservado != null ? Number(x.reservado) : null, em_transito: x.em_transito != null ? Number(x.em_transito) : null,
    necessidade: x.necessidade != null ? Number(x.necessidade) : null, qtd_minima_compra: x.qtd_minima_compra != null ? Number(x.qtd_minima_compra) : null, status: x.status || null, foto_thumb: x.foto_thumb || null, categoria: x.categoria || null };
}
function selSalvar() { try { localStorage.setItem(selChave(), JSON.stringify(P.Sel || {})); } catch (e) {} }
function selLer() { try { const o = JSON.parse(localStorage.getItem(selChave()) || '{}'), r = {}; Object.keys(o || {}).forEach(k => { if (o[k] && o[k].produto_id) r[k] = selItem(o[k]); }); return r; } catch (e) { return {}; } }
/** 옛 pcpSelSincronizar — 제안 · 공장 · 원가 등은 새로 읽은 것으로, 손으로 쓴 수량(qtd_edit)은 그대로 */
function selSincronizar(linhas) {
  let mexeu = false;
  (linhas || []).forEach(x => {
    const it = P.Sel && P.Sel[String(x.produto_id)]; if (!it) return;
    if (it.qtd_comprar !== (Number(x.qtd_comprar) || 0)) { mexeu = true; it.qtd_comprar = Number(x.qtd_comprar) || 0; }
    if (it.unidade !== x.unidade || it.un_por_caixa !== x.un_por_caixa || it.qtd !== Number(x.qtd) || String(it.fornecedor_id || '') !== String(x.fornecedor_id || '') || it.status !== x.status || Number(it.custo) !== Number(x.custo)) mexeu = true;
    Object.assign(it, { unidade: x.unidade, un_por_caixa: x.un_por_caixa, fornecedor_id: x.fornecedor_id, fornecedor: x.fornecedor, nome: x.nome || it.nome, custo: x.custo != null ? Number(x.custo) : null, status: x.status || null, foto_thumb: x.foto_thumb || null, categoria: x.categoria || null,
      qtd_minima_compra: x.qtd_minima_compra != null ? Number(x.qtd_minima_compra) : null, necessidade: x.necessidade != null ? Number(x.necessidade) : null, qtd: Number(x.qtd), reservado: Number(x.reservado) || 0, em_transito: Number(x.em_transito) || 0 });
  });
  if (mexeu) selSalvar();
}
const selLista = () => Object.keys(P.Sel || {}).map(k => P.Sel[k]);
const selQtd = it => Number(it.qtd_edit != null ? it.qtd_edit : it.qtd_comprar) || 0;
const custoOk = it => it != null && it.custo != null && Number(it.custo) > 0;
const qtdValida = it => { const q = selQtd(it); return q > 0 && Math.round(q) === q; };
const verCusto = () => !!(RAW && RAW.custoOk);
const selEstoque = it => it.qtd != null ? { disp: (Number(it.qtd) || 0) - (Number(it.reservado) || 0), tr: Number(it.em_transito) || 0 } : null;

/* ---------- 걸러보기 → "RPC" ---------- */
function filtrosRPC() {
  const f = P.F || filtrosPadrao(), o = { so_comprar: !!f.so_comprar, meses: Number(f.meses) || 3 };
  if (f.fornecedor) o.fornecedor = f.fornecedor; if (f.categoria) o.categoria = f.categoria; if (f.corredor) o.corredor = f.corredor; if (f.status) o.status = f.status;
  if (f.lead) o.lead = Number(f.lead); if (f.ciclo) o.ciclo = Number(f.ciclo); if (f.busca && String(f.busca).trim()) o.busca = String(f.busca).trim();
  return o;
}
const chaveAtual = () => JSON.stringify([filtrosRPC(), P.Pag, P.Ord, P.Dir, RAW ? RAW.ver : 0]);
/** 옛 pcpCarregar — 자료는 이미 읽혀 있으니 계산만 */
function calcular(force) {
  const k = chaveAtual(); if (!force && DD.chave === k && DD.resumo) return;
  const f = filtrosRPC();
  try {
    DD.resumo = rpcResumo(f); DD.lista = rpcPlanCompras(f, P.Pag || 1, 50, P.Ord || 'qtd_comprar', P.Dir || 'desc'); DD.chave = k; DD.erro = null; DD.quando = new Date(RAW.at);
    selSincronizar(base(f.meses, f.ciclo));
    abertosCalc();
  } catch (e) { DD.erro = String(e && e.message || e); DD.resumo = null; DD.lista = null; }
}
/** 옛 pcpAbertosCarregar — 고른 상품이 이미 들어 있는 진행 중 발주서 */
function abertosCalc() {
  const out = {}; (RAW ? RAW.pos : []).filter(p => ['rascunho', 'enviado', 'recebido_parcial'].includes(p.status)).forEach(p => (p.itens || []).forEach(i => { if (i.removido_em) return; (out[i.produto_id] = out[i.produto_id] || []).push({ produto_id: i.produto_id, numero: p.numero, status: p.status, qtd: i.qtd }); }));
  DD.abertos = out;
}
const linhaPorId = pid => ((DD.lista || {}).linhas || []).find(x => String(x.produto_id) === String(pid)) || (BASE.by[pid] || null);

/* ============================================================
 *  화면 (옛 telaPlanCompras)
 * ============================================================ */
const ehAqui = () => location.hash.indexOf('#/plan') === 0;
async function page(arg) {
  B.injetarCss();
  if (!P.F) P.F = filtrosPadrao(); if (!P.Form) P.Form = JSON.parse(JSON.stringify(P.F));
  if (!P.Sel) P.Sel = selLer();
  P.Sku = null;
  if (arg && ['produtos', 'fornecedor', 'revisao', 'gerar'].includes(arg)) P.Aba = arg;
  if (!RAW && canPlan()) {
    render();
    try { await garantirRaw(false); } catch (e) { DD.erro = String(e && e.message || e); }
    PO.cfgCarregar(false);
  }
  render();
}
function cab() {
  return '<div class="page-head"><div class="pcp-ico">' + svg(ICO.compra, 20) + '</div><div><h1>' + esc(t('nav_plancompras')) + '</h1><p>' + esc(t('pcp_sub')) + '</p></div>';
}
function acoesHTML() {
  const L = DD.lista || {}, temLista = (L.linhas || []).some(x => x.qtd_comprar > 0), temSel = Object.keys(P.Sel || {}).length > 0, pode = temSel || temLista;
  return '<button type="button" class="btn" data-act="pcx-como">' + svg(ICO.ajuda, 15) + ' ' + esc(t('pcx_como')) + '</button>' +
    '<button type="button" class="btn" data-act="pcx-xlsx">' + svg(ICO.down, 15) + ' ' + esc(t('pcx_exp_xlsx')) + '</button><button type="button" class="btn" data-act="pcx-pdf">' + svg(ICO.print, 15) + ' ' + esc(t('pcx_exp_pdf')) + '</button>' +
    '<button type="button" class="btn" data-act="pcp-cfg" title="' + esc(t('pcp_cfg')) + '">' + svg(ICO.cfg, 15) + ' ' + esc(t('pcp_cfg')) + '</button>' +
    '<button type="button" class="btn primary" data-act="pcp-gerar"' + (pode ? '' : ' disabled title="' + esc(t('pco_vazio')) + '"') + '>' + svg(ICO.mais, 15) + ' ' + esc(t('pco_gerar')) + '</button>';
}
function render() {
  if (!ehAqui()) return;
  let h = cab();
  if (!canPlan()) { $('page').innerHTML = '<div class="sb pcp-raiz"><div id="conteudo">' + h + '</div><div class="placeholder">' + svg(ICO.lock, 40) + '<b>' + esc(t('pcp_restrito')) + '</b></div></div></div>'; return; }
  if (RAW) calcular(false);
  h += '<div class="actions">' + acoesHTML() + '</div></div>';
  const ae = document.activeElement, foco = ae && ae.id && $('page').contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') ? { id: ae.id, pos: ae.selectionStart } : null;
  $('page').innerHTML = '<div class="sb pcp-raiz"><div id="conteudo"><div class="pcp-tela' + (Object.keys(P.Sel).length ? ' pcp-com-sel' : '') + '">' + h + corpoHTML() + '</div></div></div>';
  if (foco && $(foco.id)) { const n = $(foco.id); try { n.focus(); if (foco.pos != null && n.setSelectionRange) n.setSelectionRange(foco.pos, foco.pos); } catch (e) {} }
  ligar();
  if (P.Sku) pintarDrawer();
}

/* ---------- 고른 것 묶음 (옛 pcpTotUnid · pcpGrupoTot · pcpGruposSel · pcpFornInfo · pcpRevOrdem) ---------- */
function totUnid(itens) { const por = {}, ordem = []; (itens || []).forEach(it => { const s = pcuSigla(it); if (por[s] == null) { por[s] = 0; ordem.push(s); } por[s] += qtdValida(it) ? selQtd(it) : 0; }); if (!ordem.length) return '0'; return ordem.map(s => numFmt(por[s]) + ' ' + s).join(' · '); }
function grupoTot(itens) { const tt = { n: (itens || []).length, valor: 0, temValor: false, semCusto: 0, unid: totUnid(itens) }; (itens || []).forEach(it => { if (!custoOk(it)) { tt.semCusto++; return; } if (qtdValida(it)) { tt.valor += selQtd(it) * Number(it.custo); tt.temValor = true; } }); if (!verCusto()) tt.semCusto = 0; return tt; }
function gruposSel(itens) {
  const g = {}, ordem = [];
  (itens || selLista()).forEach(it => { const k = it.fornecedor_id ? String(it.fornecedor_id) : 'sem'; if (!g[k]) { g[k] = { id: it.fornecedor_id ? String(it.fornecedor_id) : null, nome: it.fornecedor || '', itens: [] }; ordem.push(k); } g[k].itens.push(it); });
  return ordem.map(k => { g[k].itens.sort((a, b) => pcpCmpSku(a.sku, b.sku)); return g[k]; }).sort((a, b) => (a.id == null) - (b.id == null) || String(a.nome).localeCompare(String(b.nome)));
}
function fornInfo(id) { const lead = B.parOf(id).lead, prev = new Date(); prev.setDate(prev.getDate() + lead); return { lead, prev: dataBR(prev.toISOString()) }; }
const revOrdem = sel => (sel || []).slice().sort((a, b) => String(a.fornecedor || '￿').localeCompare(String(b.fornecedor || '￿')) || pcpCmpSku(a.sku, b.sku));

/* ---------- 검토 경고 (옛 pcpAlertas) — 수량만 막고 나머지는 경고 ---------- */
function alertas(it) {
  const a = [], q = selQtd(it), u = Number(it.un_por_caixa) || 1, m = Number(it.qtd_minima_compra) || 0, ab = DD.abertos[String(it.produto_id)];
  if (!qtdValida(it)) a.push({ k: 'qtd', n: 'erro' });
  if (!it.fornecedor_id) a.push({ k: 'forn', n: 'pend' });
  if (verCusto() && !custoOk(it)) a.push({ k: 'custo', n: 'aviso' });
  if (u > 1 && q > 0 && q % u) a.push({ k: 'caixa', n: 'aviso', u });
  if (m > 0 && q > 0 && q < m) a.push({ k: 'minimo', n: 'aviso', m });
  if (ab && ab.length) a.push({ k: 'aberto', n: 'aviso', ped: ab });
  if (it.qtd_edit != null && Number(it.qtd_edit) !== Number(it.qtd_comprar)) a.push({ k: 'editado', n: 'info' });
  return a;
}
function alertaTxt(a) {
  if (a.k === 'caixa') return ti('pcp_al_caixa', { u: numFmt(a.u) });
  if (a.k === 'minimo') return ti('pcp_al_minimo', { m: numFmt(a.m) });
  if (a.k === 'aberto') return ti('pcp_al_aberto', { p: a.ped.map(x => x.numero + ' (' + t('pco_st_' + x.status) + ')').join(', ') });
  return t('pcp_al_' + a.k);
}
function alertasHTML(it) { const a = alertas(it); if (!a.length) return '<span class="pcp-al ok">' + esc(t('pcp_al_ok')) + '</span>'; return a.map(x => '<span class="pcp-al ' + x.n + '">' + esc(alertaTxt(x)) + '</span>').join(''); }
function pendChipsHTML(itens, comForn) {
  const cont = {}, cls = { qtd: 'erro', forn: 'pend', editado: 'info' };
  (itens || []).forEach(it => alertas(it).forEach(a => { cont[a.k] = (cont[a.k] || 0) + 1; }));
  return ['qtd', 'forn', 'custo', 'caixa', 'minimo', 'aberto', 'editado'].filter(k => cont[k] && (comForn || k !== 'forn')).map(k => '<span class="pcp-al ' + (cls[k] || 'aviso') + '">' + esc(numFmt(cont[k]) + ' ' + t('pcp_alc_' + k)) + '</span>').join('');
}

/* ---------- 조각 (옛 pcpThumbHTML · pcpCustoHTML · pcpQtdInputHTML · pcpItensTabHTML …) ---------- */
const thumbHTML = x => x && x.foto_thumb ? '<img class="pcp-th" loading="lazy" src="' + esc(x.foto_thumb) + '" alt="">' : '<span class="pcp-th pcp-th-v">' + svg(ICO.prod, 14) + '</span>';
const custoHTML = x => !verCusto() ? '<span class="pcp-semcusto" title="' + esc(t('pcp_custo_oculto')) + '">—</span>' : custoOk(x) ? esc(brl(Number(x.custo))) : '<span class="pcp-semcusto">' + esc(t('pcp_sem_custo_v')) + '</span>';
function qtdInputHTML(x, q) {
  const pid = esc(String(x.produto_id)), it = P.Sel[String(x.produto_id)] || null, ed = it && it.qtd_edit != null && Number(it.qtd_edit) !== Number(it.qtd_comprar);
  const val = q != null ? q : it ? selQtd(it) : Number(x.qtd_comprar) || 0, bad = it && !qtdValida(it), cx = pcuCaixa(x, Number(val) || 0);
  return '<span class="pcp-qw"><input type="number" min="0" step="1" inputmode="numeric" class="pcp-q' + (ed ? ' ed' : '') + (bad ? ' bad' : '') + '" data-pid="' + pid + '" value="' + esc(String(val)) + '" aria-label="' + esc(t('pcp_c_sug')) + '">' + pcuSufHTML(x) + '</span>' +
    (cx ? '<small class="pcp-qcx">' + esc(cx) + '</small>' : '') +
    (ed ? '<small class="pcp-qsug">' + esc(ti('pcp_sug_era', { n: numFmt(x.qtd_comprar) })) + ' <button type="button" class="pcp-qrest" data-act="pcp-q-rest" data-pid="' + pid + '" title="' + esc(t('pcp_restaurar')) + '" aria-label="' + esc(t('pcp_restaurar')) + '">↺</button></small>' : '');
}
function itensTabHTML(itens, op) {
  op = op || {};
  let h = '<div class="pcp-itw"><table class="pcp-it' + (op.forn ? ' rev' : '') + '"><thead><tr><th>' + esc(t('pcp_c_prod')) + '</th>' + (op.forn ? '<th>' + esc(t('pcp_c_forn')) + '</th>' : '') +
    '<th class="num">' + esc(t('pcl_estoque')) + '</th><th class="num">' + esc(t('pco_recom')) + '</th><th class="num">' + esc(t('pcp_c_final')) + '</th><th>' + esc(t('pcp_c_unid')) + '</th><th class="num">' + esc(t('pcp_c_custo')) + '</th><th class="num">' + esc(t('pcp_c_valor')) + '</th><th>' + esc(t('pcp_c_alertas')) + '</th><th></th></tr></thead><tbody>';
  h += itens.map(it => {
    const id = esc(String(it.produto_id)), est = selEstoque(it), v = verCusto() && custoOk(it) && qtdValida(it) ? selQtd(it) * Number(it.custo) : null, temCad = !!(BASE.by[it.produto_id]);
    return '<tr data-pid="' + id + '"><td class="pcp-it-p">' + thumbHTML(it) + '<span><b>' + esc(it.nome || it.sku || '') + '</b><span class="pcp-sku">' + esc(it.sku || '') + '</span></span></td>' +
      (op.forn ? '<td class="pcp-it-f" data-l="' + esc(t('pcp_c_forn')) + '">' + (it.fornecedor ? esc(it.fornecedor) : '<span class="pcp-fchip sem">' + esc(t('pcp_f_sem_forn')) + '</span>') + '</td>' : '') +
      '<td class="num pcl-est" data-l="' + esc(t('pcl_estoque')) + '">' + (est ? pcuNumHTML(it, est.disp) + (est.tr > 0 ? '<small>' + esc(tiu('pcl_transito', { n: pcuQtd(it, est.tr) })) + '</small>' : '') : '—') + '</td>' +
      '<td class="num pcp-it-sug" data-l="' + esc(t('pco_recom')) + '">' + pcuNumHTML(it, it.qtd_comprar) + '</td>' +
      '<td class="num pcp-it-q" data-l="' + esc(t('pcp_c_final')) + '">' + qtdInputHTML(it) + '</td>' +
      '<td class="pcp-it-u" data-l="' + esc(t('pcp_c_unid')) + '">' + esc(pcuTexto(it)) + '</td>' +
      '<td class="num" data-l="' + esc(t('pcp_c_custo')) + '">' + custoHTML(it) + '</td>' +
      '<td class="num pcp-it-v" data-vl="' + id + '" data-l="' + esc(t('pcp_c_valor')) + '">' + (v == null ? '—' : esc(brl(v))) + '</td>' +
      '<td class="pcp-it-al" data-al="' + id + '">' + alertasHTML(it) + '</td>' +
      '<td class="pcp-it-x">' + (op.cad && !it.fornecedor_id && temCad ? '<button type="button" class="btn sm" data-act="pcp-cad" data-pid="' + id + '">' + esc(t('pcp_cad')) + '</button>' : '') +
      '<button type="button" class="pcp-x" data-act="pcp-tirar" data-pid="' + id + '" title="' + esc(t('pcp_tirar_sel')) + '" aria-label="' + esc(t('pcp_tirar_sel')) + '">' + svg(ICO.x, 14) + '</button></td></tr>';
  }).join('');
  return h + '</tbody></table></div>';
}
const vazioSelHTML = () => '<div class="pcp-pn pcp-vazio-sel">' + svg(ICO.compra, 40) + '<b>' + esc(t('pcp_vazio_sel')) + '</b><span>' + esc(t('pcp_vazio_sel_sub')) + '</span><button type="button" class="btn primary" data-pcp-aba="produtos">' + esc(t('pcp_ir_prod')) + '</button></div>';
const valorTxt = tt => tt.temValor ? esc(brl(tt.valor)) : '—';

/* ---- 공장별 탭 ---- */
function grupoCabHTML(g) {
  const tt = grupoTot(g.itens), sem = g.id == null, ab = !sem && !!P.GrpAb[g.id], fi = sem ? null : fornInfo(g.id);
  return '<button type="button" class="pcp-grp-h" data-gh="' + (sem ? 'sem' : esc(g.id)) + '"' + (sem ? '' : ' data-pcp-grp="' + esc(g.id) + '" aria-expanded="' + ab + '"') + '>' +
    '<span class="pcp-grp-ico">' + svg(sem ? ICO.alerta : ICO.cubo, 18) + '</span><span class="pcp-grp-n"><b>' + esc(sem ? t('pcp_sem_tit') : g.nome) + '</b><small>' + esc(ti('pcp_grp_sel', { n: numFmt(tt.n) })) + (fi ? ' · ' + esc(ti('pcp_grp_lead', { d: numFmt(fi.lead), p: fi.prev })) : '') + '</small></span>' +
    '<span class="pcp-grp-k"><small>' + esc(t('pcp_qtd_total')) + '</small><b>' + esc(tt.unid) + '</b></span>' +
    '<span class="pcp-grp-k"><small>' + esc(t('pcp_valor_est')) + '</small><b>' + valorTxt(tt) + '</b>' + (tt.semCusto && tt.temValor ? '<em class="pcp-parcial">' + esc(t('pcp_custo_parcial')) + '</em>' : '') + '</span>' +
    '<span class="pcp-grp-p">' + pendChipsHTML(g.itens, false) + '</span>' + (sem ? '' : '<span class="pcp-grp-chev">' + svg(ICO.dir, 16) + '</span>') + '</button>';
}
function abaFornHTML() {
  const sel = selLista(); if (!sel.length) return vazioSelHTML();
  const gs = gruposSel(sel), com = gs.filter(g => g.id != null), todos = com.length && com.every(g => P.GrpAb[g.id]);
  let h = '<div class="pcp-pn"><div class="pcp-pn-h"><div><h3>' + esc(t('pcp_forn_tit')) + '</h3><p>' + esc(t('pcp_forn_sub')) + '</p></div>' + (com.length ? '<button type="button" class="btn sm" data-act="pcp-grp-todos">' + esc(t(todos ? 'pcp_grp_fechar' : 'pcp_grp_todos')) + '</button>' : '') + '</div>';
  h += gs.map(g => { const sem = g.id == null, ab = sem || !!P.GrpAb[g.id]; return '<section class="pcp-grp' + (sem ? ' sem' : '') + (ab ? ' ab' : '') + '" data-grp="' + (sem ? 'sem' : esc(g.id)) + '">' + grupoCabHTML(g) + (sem ? '<p class="pcp-sem-sub">' + esc(t('pcp_sem_sub')) + '</p>' : '') + (ab ? itensTabHTML(g.itens, { cad: sem }) : '') + '</section>'; }).join('');
  return h + '</div>';
}
/* ---- 검토 탭 ---- */
const revResumoHTML = itens => { const c = pendChipsHTML(itens, true); return '<div class="pcp-rev-res" data-rev-res="1">' + (c || '<span class="pcp-al ok">' + esc(t('pcp_rev_ok')) + '</span>') + '</div>'; };
function abaRevisaoHTML() { const sel = selLista(); if (!sel.length) return vazioSelHTML(); const itens = revOrdem(sel); return '<div class="pcp-pn"><div class="pcp-pn-h"><div><h3>' + esc(t('pcp_rev_tit')) + '</h3><p>' + esc(t('pcp_rev_sub')) + '</p></div></div>' + revResumoHTML(itens) + itensTabHTML(itens, { forn: true, cad: true }) + '</div>'; }
/* ---- 만들 발주서 탭 ---- */
const gerKpiHTML = (rot, val, sub, cls) => '<div class="pcp-ger-k' + (cls ? ' ' + cls : '') + '"><small>' + esc(t(rot)) + '</small><b>' + esc(val) + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</div>';
function geradoHTML() {
  const G = P.Gerado, peds = G.pedidos || [];
  return '<div class="pcp-gerado" role="status"><div class="pcp-gerado-h"><span class="pcp-gerado-ic">' + svg(ICO.check, 20) + '</span><div><b>' + esc(ti('pcp_gerado_tit', { n: numFmt(peds.length) })) + '</b><small>' + esc(t(G.repetido ? 'pcp_ped_repetido' : 'pcp_gerado_sub')) + '</small></div><button type="button" class="pcp-x" data-act="pcp-gerado-fechar" title="' + esc(t('pcp_fechar')) + '" aria-label="' + esc(t('pcp_fechar')) + '">' + svg(ICO.x, 14) + '</button></div>' +
    '<ul class="pcp-gerado-l">' + peds.map(p => '<li><b>' + esc(p.numero || '') + '</b><span>' + esc(p.fornecedor || '') + '</span><small>' + esc(ti('pcp_ped_linha', { i: numFmt(p.n_itens), p: numFmt(p.pecas) })) + '</small><button type="button" class="btn sm" data-act="pcp-ped-abrir" data-id="' + esc(String(p.id)) + '">' + esc(t('pcp_ger_abrir')) + '</button></li>').join('') + '</ul><button type="button" class="btn sm" data-act="pcp-ped-lista">' + esc(t('pcp_ger_lista')) + '</button></div>';
}
function abaGerarHTML() {
  let h = P.Gerado ? geradoHTML() : ''; const sel = selLista();
  if (!sel.length) return h || vazioSelHTML();
  const gs = gruposSel(sel), com = gs.filter(g => g.id != null), sem = gs.filter(g => g.id == null)[0], itensCom = [].concat(...com.map(g => g.itens)), inval = itensCom.filter(it => !qtdValida(it)).length, tt = grupoTot(itensCom);
  h += '<div class="pcp-pn"><div class="pcp-pn-h"><div><h3>' + esc(t('pcp_ger_tit')) + '</h3><p>' + esc(t('pcp_ger_sub')) + '</p></div></div><div class="pcp-ger-res">' +
    gerKpiHTML('pcp_ger_prod', numFmt(itensCom.length)) + gerKpiHTML('pcp_qtd_total', tt.unid) + gerKpiHTML('pcp_ger_forns', numFmt(com.length)) + gerKpiHTML('pcp_ger_peds', numFmt(com.length)) +
    gerKpiHTML('pcp_ger_valor', tt.temValor ? brl(tt.valor) : '—', tt.semCusto ? ti('pcp_custo_parcial_n', { n: numFmt(tt.semCusto) }) : '', tt.semCusto ? 'parcial' : '') + '</div>';
  if (sem) h += '<div class="pcp-ger-av pend">' + svg(ICO.alerta, 16) + '<span>' + esc(ti('pcp_ger_sem', { n: numFmt(sem.itens.length) })) + '</span><button type="button" class="btn sm" data-pcp-aba="fornecedor">' + esc(t('pcp_ger_ver')) + '</button></div>';
  if (inval) h += '<div class="pcp-ger-av erro">' + svg(ICO.alerta, 16) + '<span>' + esc(ti('pcp_ger_inval', { n: numFmt(inval) })) + '</span><button type="button" class="btn sm" data-pcp-aba="revisao">' + esc(t('pcp_ger_corrigir')) + '</button></div>';
  h += '<div class="pcp-ger-l">' + com.map(g => { const gt = grupoTot(g.itens), fi = fornInfo(g.id);
    return '<div class="pcp-ger-g" data-fid="' + esc(g.id) + '"><span class="pcp-grp-ico">' + svg(ICO.doc, 18) + '</span><span class="pcp-grp-n"><b>' + esc(g.nome) + '</b><small>' + esc(ti('pcp_grp_lead', { d: numFmt(fi.lead), p: fi.prev })) + '</small></span>' +
      '<span class="pcp-grp-k"><small>' + esc(t('pcp_ger_prod_c')) + '</small><b>' + numFmt(gt.n) + '</b></span><span class="pcp-grp-k"><small>' + esc(t('pcp_qtd_total')) + '</small><b>' + esc(gt.unid) + '</b></span>' +
      '<span class="pcp-grp-k"><small>' + esc(t('pcp_valor_est')) + '</small><b>' + valorTxt(gt) + '</b>' + (gt.semCusto && gt.temValor ? '<em class="pcp-parcial">' + esc(t('pcp_custo_parcial')) + '</em>' : '') + '</span>' +
      '<span class="pcp-grp-p">' + pendChipsHTML(g.itens, false) + '</span><button type="button" class="btn sm" data-act="pcp-grp-rev" data-fid="' + esc(g.id) + '">' + esc(t('pcp_ger_ver')) + '</button></div>'; }).join('') + '</div>';
  h += '<div class="pcp-ger-foot"><p>' + esc(t('pcp_ger_nota')) + '</p><button type="button" class="btn primary pcp-ger-bt" data-act="pcp-gerar-conf"' + (inval || !com.length ? ' disabled' : '') + '>' + svg(ICO.check, 16) + ' ' + esc(t('pcp_ger_bt')) + '</button></div>';
  return h + '</div>';
}
/* ---- 상품 탭 오른쪽 패널 ---- */
function ladoHTML() {
  const sel = selLista(), gs = gruposSel(sel), semCusto = verCusto() ? sel.filter(it => !custoOk(it)).length : 0, semForn = sel.filter(it => !it.fornecedor_id).length;
  let h = '<aside class="pcp-lado"><div class="pcp-lado-h"><h3>' + esc(t('pcp_lado_tit')) + '</h3><p>' + esc(t('pcp_lado_sub')) + '</p></div>';
  if (!sel.length) h += '<div class="pcp-lado-v">' + esc(t('pcp_lado_vazio')) + '</div>';
  else h += '<div class="pcp-lado-l">' + gs.map(g => { const tt = grupoTot(g.itens), sem = g.id == null;
    return '<button type="button" class="pcp-lg' + (sem ? ' sem' : '') + '" data-act="pcp-grp-rev" data-fid="' + (sem ? 'sem' : esc(g.id)) + '"><span class="pcp-grp-ico">' + svg(sem ? ICO.alerta : ICO.cubo, 16) + '</span><span class="pcp-lg-n"><b>' + esc(sem ? t('pcp_sem_tit') : g.nome) + '</b><small>' + esc(ti('pcp_grp_sel', { n: numFmt(tt.n) })) + '</small></span><span class="pcp-lg-q"><b>' + esc(tt.unid) + '</b><small>' + (tt.temValor ? esc(brl(tt.valor)) + (tt.semCusto ? ' · ' + esc(t('pcp_custo_parcial')) : '') : '—') + '</small></span>' + svg(ICO.dir, 14) + '</button>'; }).join('') + '</div>';
  if (semCusto) h += '<div class="pcp-lado-av">' + svg(ICO.alerta, 16) + '<div><b>' + esc(ti('pcp_lado_semcusto', { n: numFmt(semCusto) })) + '</b><small>' + esc(t('pcp_lado_semcusto_sub')) + '</small></div></div>';
  if (semForn) h += '<div class="pcp-lado-av">' + svg(ICO.alerta, 16) + '<div><b>' + esc(ti('pcp_lado_semforn', { n: numFmt(semForn) })) + '</b><small>' + esc(t('pcp_lado_semforn_sub')) + '</small></div></div>';
  return h + '</aside>';
}
/* ---- 탭 · 아래 막대 ---- */
function abasHTML() {
  const sel = selLista(), gs = gruposSel(sel), nPed = gs.filter(g => g.id != null).length, tot = Number((DD.lista || {}).total) || 0, aba = P.Aba || 'produtos';
  const it = [['produtos', ICO.compra, 'pcp_aba_prod', tot], ['fornecedor', ICO.cubo, 'pcp_aba_forn', gs.length], ['revisao', ICO.lapis, 'pcp_aba_rev', sel.length], ['gerar', ICO.doc, 'pcp_aba_gerar', nPed]];
  return '<div class="pcp-abas" role="tablist">' + it.map(a => '<button type="button" role="tab" class="pcp-aba' + (aba === a[0] ? ' on' : '') + '" data-pcp-aba="' + a[0] + '" aria-selected="' + (aba === a[0]) + '">' + svg(a[1], 18) + '<span>' + esc(t(a[2])) + '</span><b class="pcp-aba-n">(' + numFmt(a[3]) + ')</b></button>').join('') + '</div>';
}
function barraHTML() {
  const sel = selLista(); if (!sel.length) return '<div class="pcp-barra-w"></div>';
  const aba = P.Aba || 'produtos', tt = grupoTot(sel), com = sel.filter(it => it.fornecedor_id), nPed = gruposSel(com).length, inval = com.some(it => !qtdValida(it));
  const bt = aba === 'gerar'
    ? '<button type="button" class="btn primary pcp-b-go" data-act="pcp-gerar-conf"' + (inval || !nPed ? ' disabled' : '') + '>' + svg(ICO.check, 16) + ' ' + esc(ti('pcp_bt_gerar_n', { n: numFmt(nPed) })) + '</button>'
    : '<button type="button" class="btn primary pcp-b-go" data-pcp-aba="' + (aba === 'revisao' ? 'gerar' : 'revisao') + '">' + esc(t(aba === 'revisao' ? 'pcp_bt_continuar' : 'pcp_bt_revisar')) + ' ' + svg(ICO.dir, 16) + '</button>';
  return '<div class="pcp-barra-w"><div class="pcp-barra"><div class="pcp-b-sel"><b><span class="pcp-b-n">' + numFmt(sel.length) + '</span> ' + esc(t('pcp_b_sel')) + '</b><small>' + esc(t('pcp_b_sub')) + '</small><button type="button" class="pcp-b-limpar" data-act="pcp-sel-limpar">' + esc(t('pcp_sel_limpar')) + '</button></div>' +
    '<div class="pcp-b-k"><small>' + esc(t('pcp_qtd_total')) + '</small><b class="pcp-b-q">' + esc(tt.unid) + '</b></div><div class="pcp-b-k"><small>' + esc(t('pcp_valor_est')) + '</small><b class="pcp-b-v">' + valorTxt(tt) + '</b>' +
    (tt.semCusto && tt.temValor ? '<em class="pcp-parcial">' + svg(ICO.alerta, 13) + ' ' + esc(t('pcp_custo_parcial')) + '</em>' : '') + '</div>' + bt + '</div></div>';
}

/* ---------- 다시 그리지 않고 바꾸기 (옛 pcpTroca · pcpRepintarResumo · pcpRepintarQtd) — 수량 칸의 커서를 지킴 ---------- */
function troca(sel, html) { const a = document.querySelector('.pcp-tela ' + sel); if (!a) return; const d = document.createElement('div'); d.innerHTML = html; if (d.firstElementChild) a.parentNode.replaceChild(d.firstElementChild, a); else a.parentNode.removeChild(a); }
function repintarResumo() {
  const root = document.querySelector('.pcp-tela'); if (!root) return;
  root.classList.toggle('pcp-com-sel', selLista().length > 0);
  troca('.pcp-barra-w', barraHTML()); troca('.pcp-abas', abasHTML()); troca('.pcp-lado', ladoHTML());
  const L = DD.lista || {}, linhas = L.linhas || [], gb = document.querySelector('[data-act="pcp-gerar"]');
  if (gb) gb.disabled = !(selLista().length || linhas.some(x => x.qtd_comprar > 0));
  root.querySelectorAll('tr.pcp-r').forEach(tr => { const on = !!P.Sel[tr.getAttribute('data-pid')], cb = tr.querySelector('[data-act="pcp-sel"]'); tr.classList.toggle('sel', on); if (cb) cb.checked = on; });
  const cabc = root.querySelector('[data-act="pcp-sel-pag"]'); if (cabc) cabc.checked = !!linhas.length && linhas.every(x => P.Sel[String(x.produto_id)]);
  const td = root.querySelector('[data-act="pcp-sel-todos"]'); if (td) td.checked = todosAtivo();
  let gs = null;
  root.querySelectorAll('[data-gh]').forEach(el => { gs = gs || gruposSel(selLista()); const k = el.getAttribute('data-gh'), g = gs.find(x => (x.id == null ? 'sem' : x.id) === k); if (!g) return; const d = document.createElement('div'); d.innerHTML = grupoCabHTML(g); el.parentNode.replaceChild(d.firstElementChild, el); });
  root.querySelectorAll('[data-al]').forEach(el => { const it = P.Sel[el.getAttribute('data-al')]; if (it) el.innerHTML = alertasHTML(it); });
  root.querySelectorAll('[data-vl]').forEach(el => { const it = P.Sel[el.getAttribute('data-vl')]; if (it) el.innerHTML = verCusto() && custoOk(it) && qtdValida(it) ? esc(brl(selQtd(it) * Number(it.custo))) : '—'; });
  if (root.querySelector('[data-rev-res]')) troca('[data-rev-res]', revResumoHTML(selLista()));
}
function repintarQtd(pid) { const it = P.Sel[pid], x = it || linhaPorId(pid); if (!x) return; document.querySelectorAll('.pcp-tela .pcp-q[data-pid="' + pid + '"]').forEach(inp => { if (inp === document.activeElement) return; const cel = inp.closest('td'); if (cel) cel.innerHTML = qtdInputHTML(x); }); }
/** 옛 pcpQtdDigitada — 수량을 쓰면 고른 것에 들어감 · 비우고 나가면 제안으로 (0 으로 만들지 않음) */
function qtdDigitada(inp, fim) {
  const pid = inp.getAttribute('data-pid'), raw = String(inp.value).trim(); let it = P.Sel[pid];
  if (!it) { const x = linhaPorId(pid); if (!x || (raw === '' && !fim)) return; it = P.Sel[pid] = selItem(x); }
  if (raw === '') { if (!fim) return; it.qtd_edit = null; inp.value = String(it.qtd_comprar); }
  else { const v = Number(raw); it.qtd_edit = isFinite(v) ? v : 0; }
  if (it.qtd_edit != null && Number(it.qtd_edit) === Number(it.qtd_comprar)) it.qtd_edit = null;
  inp.classList.toggle('ed', it.qtd_edit != null); inp.classList.toggle('bad', !qtdValida(it));
  selSalvar(); repintarResumo(); if (fim) setTimeout(() => repintarQtd(pid), 0);
}
/* ---------- 결과 모두 고르기 (옛 pcpSelTodos) — 걸러진 것 전부 (쪽만이 아님) · 5,000 까지 · 빠진 것은 말함 ---------- */
const todosChaveAtual = () => JSON.stringify(filtrosRPC());
const todosAtivo = () => !!P.TodosChave && P.TodosChave === todosChaveAtual() && (P.TodosIds || []).length > 0 && P.TodosIds.every(id => P.Sel[id]);
function selTodos(on) {
  if (!on) { (P.TodosIds || []).forEach(id => { delete P.Sel[id]; }); P.TodosIds = null; P.TodosChave = null; selSalvar(); return render(); }
  const r = rpcPlanCompras(filtrosRPC(), 1, 0, P.Ord || 'qtd_comprar', P.Dir || 'desc'), linhas = r.linhas, total = r.total, ids = []; let fora = 0;
  linhas.forEach(x => { if (!(Number(x.qtd_comprar) > 0)) { fora++; return; } const id = String(x.produto_id); if (!P.Sel[id]) P.Sel[id] = selItem(x); ids.push(id); });
  P.TodosIds = ids; P.TodosChave = todosChaveAtual(); selSalvar();
  let msg = ti('pcp_todos_ok', { n: numFmt(ids.length) }); if (fora) msg += ' ' + ti('pcp_todos_fora', { n: numFmt(fora) }); if (total > linhas.length) msg += ' ' + ti('pcp_todos_teto', { n: numFmt(linhas.length), t: numFmt(total) });
  aviso(msg, total > linhas.length); render();
}
function selLimpar() {
  const n = Object.keys(P.Sel || {}).length, fim = () => { P.Sel = {}; P.TodosIds = null; P.TodosChave = null; selSalvar(); render(); };
  if (n < 2) return fim();
  B.pergunta({ titulo: t('pcp_sel_limpar_tit'), texto: ti('pcp_sel_limpar_txt', { n: numFmt(n) }), sim: t('pcp_sel_limpar'), nao: t('pco_cancelar'), onSim: fim });
}
function irAba(aba) { P.Aba = aba; render(); const ab = document.querySelector('.pcp-tela .pcp-abas'); if (ab) { const top = ab.getBoundingClientRect().top + window.scrollY - 8; if (window.scrollY > top) window.scrollTo(0, top); } }
function irGrupo(fid) { if (fid !== 'sem' && fid) P.GrpAb[fid] = true; irAba('fornecedor'); const el = document.querySelector('.pcp-tela [data-grp="' + (fid || 'sem') + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }
function gerarClique() { if (Object.keys(P.Sel || {}).length) return irAba('gerar'); abrirPedido(); }
function gerarConfAbrir() {
  const sel = selLista(), com = sel.filter(it => it.fornecedor_id), inval = com.filter(it => !qtdValida(it)).length;
  if (!com.length) return aviso(t('pcp_ger_nada'), true);
  if (inval) { aviso(ti('pcp_ger_inval', { n: numFmt(inval) }), true); return irAba('revisao'); }
  montarPedido(sel, false);
}
function irPedido(id) { location.hash = '#/pocompra' + (id ? '/' + encodeURIComponent(id) : ''); }
function menuPos(d) {
  document.querySelectorAll('.pcp-tela details.pcp-mn[open]').forEach(o => { if (o !== d) o.removeAttribute('open'); });
  const m = d.querySelector('.pcp-mn-l'), r = d.querySelector('summary').getBoundingClientRect(); if (!m) return;
  m.style.position = 'fixed'; const w = m.offsetWidth || 220, h = m.offsetHeight || 120; let top = r.bottom + 4; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  m.style.top = top + 'px'; m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
}

/* ---------- 발주서 만들기 창 (옛 pcpAbrirPedido · pcpMontarPedido · pcpPedidoPintar · pcpPedidoRecalcular · pcpPedidoConfirmar) ---------- */
function abrirPedido() {
  const sel = selLista(); if (sel.length) return montarPedido(sel, false);
  const r = rpcPlanCompras(filtrosRPC(), 1, 200, 'qtd_comprar', 'desc'), linhas = r.linhas.filter(x => x.qtd_comprar > 0);
  if (!linhas.length) return aviso(t('pco_vazio'), true);
  montarPedido(linhas, r.total > 200);
}
function montarPedido(linhas, truncado) {
  const itens = [], semForn = [];
  linhas.forEach(x => { const q = x.qtd_edit != null ? Number(x.qtd_edit) : Number(x.qtd_comprar); if (!(q > 0)) return;
    const it = { produto_id: String(x.produto_id), sku: x.sku, nome: x.nome, fornecedor_id: x.fornecedor_id, fornecedor: x.fornecedor, qtd_recomendada: Number(x.qtd_comprar) || 0, qtd: q, custo: verCusto() && x.custo != null && Number(x.custo) > 0 ? Number(x.custo) : null, un_por_caixa: x.un_por_caixa, unidade: x.unidade };
    (x.fornecedor_id ? itens : semForn).push(it); });
  P.Ped = { itens, semForn, truncado: !!truncado, chave: B.uuidNovo() || PO_KEY() }; pedidoPintar();
}
const PO_KEY = () => 'G' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function pedidoGrupos() {
  const g = {}, ordem = [];
  (P.Ped.itens || []).forEach(it => { if (!g[it.fornecedor_id]) { g[it.fornecedor_id] = { id: it.fornecedor_id, nome: it.fornecedor, itens: [] }; ordem.push(it.fornecedor_id); } g[it.fornecedor_id].itens.push(it); });
  ordem.forEach(k => g[k].itens.sort((x, y) => pcpCmpSku(x.sku, y.sku)));
  return ordem.map(k => g[k]).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
}
let MW = null;
function pedidoPintar() {
  const Pd = P.Ped, grupos = pedidoGrupos();
  let h = '<div class="modal-head"><div><h2>' + esc(t('pco_tit')) + '</h2><p class="hint">' + esc(t('pco_sub')) + '</p></div><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body pco-body">';
  if (Pd.truncado) h += '<div class="pco-aviso">' + esc(ti('pco_truncado', { n: numFmt(Pd.itens.length + Pd.semForn.length) })) + '</div>';
  if (Pd.semForn.length) h += '<div class="pco-aviso">' + esc(ti('pco_sem_forn', { n: numFmt(Pd.semForn.length), s: Pd.semForn.map(x => x.sku).join(', ') })) + '</div>';
  grupos.forEach(g => { const lead = B.parOf(g.id).lead, prev = new Date(); prev.setDate(prev.getDate() + lead);
    h += '<div class="pco-grupo" data-forn="' + esc(g.id) + '"><div class="pco-gh"><b>' + esc(g.nome) + '</b><span class="tag">' + esc(t('pco_lead')) + ' ' + lead + ' ' + esc(t('pcp_dias')) + '</span><span class="tag">' + esc(t('pco_prev')) + ' ' + esc(dataBR(prev.toISOString())) + '</span><span class="tt"><small class="pco-gres"></small><b class="pco-gtot"></b></span></div>' +
      '<table class="pco-tbl"><thead><tr><th>' + esc(t('pcp_c_prod')) + '</th><th>SKU</th><th class="num">' + esc(t('pco_recom')) + '</th><th class="num">' + esc(t('pco_pedido')) + '</th><th class="num">' + esc(t('pco_custo')) + '</th><th class="num">' + esc(t('pco_total')) + '</th></tr></thead><tbody>' +
      g.itens.map(it => '<tr data-pid="' + esc(it.produto_id) + '"><td>' + esc(it.nome || '') + '</td><td><span class="pcp-sku">' + esc(it.sku || '') + '</span></td><td class="num pco-rec">' + pcuNumHTML(it, it.qtd_recomendada) + '</td><td class="num"><input type="number" min="1" inputmode="numeric" class="pco-q' + (it.qtd !== it.qtd_recomendada ? ' ed' : '') + '" data-pid="' + esc(it.produto_id) + '" value="' + it.qtd + '">' + pcuSufHTML(it) + '</td><td class="num">' + (it.custo == null ? esc(verCusto() ? t('pco_sem_custo') : '—') : esc(brl(it.custo))) + '</td><td class="num"><b class="pco-lt"></b></td></tr>').join('') + '</tbody></table></div>'; });
  h += '</div><div class="modal-foot pco-foot"><div class="pco-rod"></div><span class="r"><button class="btn" data-act="fechar-modal">' + esc(t('pco_cancelar')) + '</button><button class="btn primary" data-act="pco-confirmar">' + esc(t('pco_confirmar')) + '</button></span></div>';
  MW = B.abrirModalPcp(h, 'pco');
  MW.querySelectorAll('.pco-q').forEach(i => i.addEventListener('input', pedidoRecalcular));
  MW.querySelector('[data-act="pco-confirmar"]').addEventListener('click', pedidoConfirmar);
  pedidoRecalcular();
}
function pedidoRecalcular() {
  const Pd = P.Ped, porId = {}, efetivo = {}; let ok = true, pecas = 0, valor = 0, temValor = false;
  Pd.itens.forEach(it => { porId[it.produto_id] = it; efetivo[it.produto_id] = it.qtd; });
  MW.querySelectorAll('.pco-q').forEach(i => { const it = porId[i.getAttribute('data-pid')], v = parseInt(i.value, 10); if (!it) return;
    if (!(v > 0)) { ok = false; efetivo[it.produto_id] = 0; } else { it.qtd = v; efetivo[it.produto_id] = v; }
    i.classList.toggle('ed', v > 0 && v !== it.qtd_recomendada); const lt = i.closest('tr').querySelector('.pco-lt'); if (lt) lt.textContent = it.custo == null || !(v > 0) ? '—' : brl(v * it.custo); });
  MW.querySelectorAll('.pco-grupo').forEach(g => { const fid = g.getAttribute('data-forn'), its = Pd.itens.filter(x => String(x.fornecedor_id) === fid); let gp = 0, gv = 0, gtem = false;
    its.forEach(it => { const q = efetivo[it.produto_id]; gp += q; if (it.custo != null) { gv += q * it.custo; gtem = true; } });
    g.querySelector('.pco-gres').textContent = tiu('pco_grupo_res', { i: numFmt(its.length), p: numFmt(gp), u: pcuSiglaConj(its) }); g.querySelector('.pco-gtot').textContent = gtem ? brl(gv) : '—';
    pecas += gp; valor += gv; if (gtem) temValor = true; });
  const parcial = temValor && Pd.itens.some(it => it.custo == null);
  MW.querySelector('.pco-rod').textContent = tiu('pco_rodape', { n: numFmt(pedidoGrupos().length), p: numFmt(pecas), v: temValor ? brl(valor) + (parcial ? ' (' + t('pcp_custo_parcial') + ')' : '') : '—', u: pcuSiglaConj(Pd.itens) });
  const b = MW.querySelector('[data-act="pco-confirmar"]'); if (b) b.disabled = !ok || !Pd.itens.length;
}
let CRIANDO = false;
/** 옛 pcpPedidoConfirmar — 한 번 누른 것의 chave 로: 다시 눌러도(응답이 끊겨도) 이미 만든 것을 돌려줌 */
async function pedidoConfirmar() {
  if (CRIANDO) return; pedidoRecalcular();
  const b = MW.querySelector('[data-act="pco-confirmar"]'); if (b.disabled) return;
  const Pd = P.Ped, itens = Pd.itens.map(it => ({ produto_id: it.produto_id, qtd: it.qtd, qtd_recomendada: it.qtd_recomendada }));
  const volta = () => { CRIANDO = false; b.disabled = false; b.textContent = t('pco_confirmar'); };
  CRIANDO = true; b.disabled = true; b.textContent = t('pco_criando');
  let r;
  try { r = await PO.gerarPedidos(itens, Pd.chave, id => BASE.by[id] || null, verCusto()); }
  catch (e) { volta(); return aviso(e && e.pco ? String(e.message) + ' ' + t('pco_nada_criado') : t('pco_incerto'), true); }
  CRIANDO = false;
  const peds = r.pedidos, usados = Pd.itens.map(it => String(it.produto_id));
  B.fecharModal(); usados.forEach(id => { delete P.Sel[id]; }); selSalvar();
  P.Gerado = { pedidos: peds, repetido: !!r.repetido }; P.Aba = 'gerar'; P.Ped = null; P.TodosIds = null; P.TodosChave = null;
  aviso(ti('pco_ok_criado', { n: numFmt(peds.length), l: peds.map(p => p.numero + ' (' + p.fornecedor + ', ' + numFmt(p.pecas) + ')').join(' · ') }));
  PO.invalidar(); busy(true); try { await garantirRaw(true); } catch (e) {} busy(false); DD.chave = null; render();
}

/* ---------- 상태 카드 · 합계 · 몸통 (옛 pcpCardsHTML · pcpTotaisHTML · pcpCorpoHTML) ---------- */
const PCP_STATUS = [['comprar_agora', 'pcp_agora', 'pcp_agora_sub', 'out', 'pcp-red'], ['comprar_breve', 'pcp_breve', 'pcp_breve_sub', 'low', 'pcp-amb'], ['saudavel', 'pcp_saudavel', 'pcp_saudavel_sub', 'ok', 'pcp-grn'], ['excesso', 'pcp_excesso', 'pcp_excesso_sub', 'high', 'pcp-blu'], ['em_transito', 'pcp_transito', 'pcp_transito_sub', 'tr', 'pcp-pur']];
const CARD_ICO = { comprar_agora: 'alerta', comprar_breve: 'relogio', saudavel: 'check', excesso: 'cubo', em_transito: 'entra' };
function cardsHTML(r) { const c = r.cards || {}; return '<div class="tiles pcp-cards">' + PCP_STATUS.map(s => { const v = s[0] === 'em_transito' ? c.pecas_transito : c[s[0]], on = P.F.status === s[0]; return '<button type="button" class="tile clic ' + s[4] + (on ? ' on' : '') + '" data-act="pcp-card" data-sit="' + s[0] + '" aria-pressed="' + on + '"><span class="pcp-cico">' + svg(ICO[CARD_ICO[s[0]]] || ICO.compra, 20) + '</span><span class="pcp-ctx"><div class="val">' + numFmt(v || 0) + '</div><div class="lbl">' + esc(t(s[1])) + '</div><div class="sub">' + esc(t(s[2])) + '</div></span></button>'; }).join('') + '</div>'; }
function totaisHTML(r) {
  const tt = r.totais || {}, c = r.cards || {}, semCusto = Number(tt.skus_sem_custo) || 0, skus = Number(tt.skus_comprar) || 0;
  return '<div class="pcp-totais"><div><div class="l">' + esc(t('pcp_t_skus')) + '</div><div class="v">' + numFmt(skus) + '</div><div class="s">' + esc(ti('pcp_agora_breve', { a: numFmt(c.comprar_agora || 0), b: numFmt(c.comprar_breve || 0) })) + '</div></div>' +
    '<div><div class="l">' + esc(t('pcp_t_pecas')) + '</div><div class="v">' + numFmt(tt.pecas || 0) + '<small>' + esc(t('pcp_t_pecas_un')) + '</small></div><div class="s">' + esc(t('pcp_t_arred')) + '</div></div>' +
    '<div><div class="l">' + esc(t('pcp_t_valor')) + '</div><div class="v">' + (verCusto() ? esc(brl(Number(tt.valor) || 0)) : '—') + '</div><div class="s">' + (!verCusto() ? esc(t('pcp_custo_oculto')) : semCusto > 0 ? '<em class="pcp-aviso">' + esc(ti('pcp_sem_custo_n', { n: numFmt(semCusto), t: numFmt(skus) })) + '</em>' : esc(t('pcp_t_sem_custo_ok'))) + '</div></div></div>';
}
function corpoHTML() {
  if (DD.erro) return '<div class="pcp-erro">' + svg(ICO.sai2, 18) + '<div><b>' + esc(t('pcp_erro')) + '</b><div class="pcp-erro-det">' + esc(DD.erro) + '</div></div><button type="button" class="btn sm" data-act="pcp-tentar">' + esc(t('pcp_tentar')) + '</button></div>';
  if (!DD.resumo) return '<div class="placeholder">' + esc(t('pcp_carregando')) + '</div>';
  const aba = P.Aba || 'produtos'; let corpo;
  if (aba === 'fornecedor') corpo = abaFornHTML(); else if (aba === 'revisao') corpo = abaRevisaoHTML(); else if (aba === 'gerar') corpo = abaGerarHTML();
  else corpo = '<div class="pcp-prod-g"><div class="pcp-prod-m">' + totaisHTML(DD.resumo) + filtrosHTML() + tabelaHTML() + '</div>' + ladoHTML() + '</div>' + analisesHTML(DD.resumo);
  return cardsHTML(DD.resumo) + abasHTML() + '<div class="pcp-aba-c" data-aba="' + esc(aba) + '">' + corpo + '</div>' + barraHTML();
}
function badge(s) { const m = { comprar_agora: ['out', 'pcp_agora'], comprar_breve: ['low', 'pcp_breve'], saudavel: ['ok', 'pcp_saudavel'], excesso: ['high', 'pcp_excesso'], em_transito: ['tr', 'pcp_transito'], sem_historico: ['off', 'pcp_sem_hist'] }[s] || ['off', 'pcp_sem_hist']; return '<span class="badge ' + m[0] + '">' + esc(t(m[1])) + '</span>'; }
function tendHTML(v) { if (v == null) return '<span class="pcp-tend fl">—</span>'; const p = Math.round(Number(v) * 100), cls = p > 2 ? 'up' : p < -2 ? 'dn' : 'fl'; return '<span class="pcp-tend ' + cls + '">' + (cls === 'up' ? '▲ ' : cls === 'dn' ? '▼ ' : '→ ') + Math.abs(p) + '%</span>'; }
const estHTML = x => { const q = Number(x.qtd) || 0; if (!q) return '0'; const cx = pcuCaixa(x, q); return esc(pcuQtd(x, q)) + (cx ? '<small>' + esc(cx) + '</small>' : ''); };

/* ---------- 걸러보기 (옛 pcpFiltrosHTML) ---------- */
function filtrosHTML() {
  const f = P.Form; let nAv = 0, nTodos = 0;
  ['fornecedor', 'categoria', 'status'].forEach(k => { if (P.F[k]) nTodos++; }); ['lead', 'ciclo', 'corredor'].forEach(k => { if (P.F[k]) { nAv++; nTodos++; } });
  if (!P.F.so_comprar) { nAv++; nTodos++; } if (Number(P.F.meses) !== 3) { nAv++; nTodos++; } if (P.F.busca) nTodos++;
  const fs = B.forns(BASE.rows.map(r => r.fornecedor_id)).sort((a, b) => String(a.nome).localeCompare(String(b.nome))), leads = {}; fs.forEach(x => { if (x.lead_time_dias) leads[x.lead_time_dias] = 1; });
  const cats = Array.from(new Set(BASE.rows.map(r => r.categoria).filter(Boolean))).sort();
  const sel = (id, rot, ops) => '<div class="pcp-fc"><label for="' + id + '">' + esc(t(rot)) + '</label><select class="flt" id="' + id + '">' + ops + '</select></div>', av = !!P.Avanc || nAv > 0;
  return '<div class="panel pcp-filtros' + (P.FiltrosAbertos ? ' aberto' : '') + '"><button type="button" class="btn pcp-filtros-bt" data-act="pcp-filtros">' + svg(ICO.filtro, 15) + ' ' + esc(t('pcp_filtros')) + (nTodos ? ' <span class="pcp-fn">' + nTodos + '</span>' : '') + '</button>' +
    '<div class="pcp-frow">' +
    sel('pcpFForn', 'pcp_f_forn', opt('', t('pcp_f_todos'), f.fornecedor) + fs.map(x => opt(String(x.id), x.nome, f.fornecedor)).join('') + opt('sem', t('pcp_f_sem_forn'), f.fornecedor)) +
    sel('pcpFCat', 'pcp_f_cat', opt('', t('pcp_f_todas'), f.categoria) + cats.map(x => opt(x, x, f.categoria)).join('')) +
    sel('pcpFStatus', 'pcp_f_status', opt('', t('pcp_f_todos'), f.status) + PCP_STATUS.map(s => opt(s[0], t(s[1]), f.status)).join('') + opt('sem_historico', t('pcp_sem_hist'), f.status)) +
    '<div class="pcp-fbusca"><span class="pcp-fbusca-i">' + svg(ICO.busca, 14) + '</span><input class="flt" id="pcpFBusca" autocomplete="off" placeholder="' + esc(t('pcp_f_busca')) + '" value="' + esc(f.busca || '') + '"><button type="button" class="pcp-fbusca-bt" data-act="pcp-aplicar" title="' + esc(t('pcp_buscar')) + '" aria-label="' + esc(t('pcp_buscar')) + '">' + esc(t('pcp_buscar')) + '</button></div>' +
    '<button type="button" class="btn pcp-avanc-bt' + (av ? ' on' : '') + '" data-act="pcp-avanc" title="' + esc(t('pcp_avanc')) + '" aria-label="' + esc(t('pcp_avanc')) + '" aria-expanded="' + av + '">' + svg(ICO.ajuste || ICO.filtro, 16) + '<span class="pcp-avanc-t">' + esc(t('pcp_avanc')) + '</span>' + (nAv ? '<span class="pcp-fn">' + nAv + '</span>' : '') + '</button></div>' +
    '<div class="pcp-favanc' + (av ? ' on' : '') + '">' +
    sel('pcpFMeses', 'pcp_f_periodo', opt('3', t('pcp_f_3m'), String(f.meses)) + opt('6', t('pcp_f_6m'), String(f.meses)) + opt('12', t('pcp_f_12m'), String(f.meses))) +
    sel('pcpFLead', 'pcp_f_lead', opt('', t('pcp_f_todos'), String(f.lead || '')) + Object.keys(leads).sort((a, b) => a - b).map(d => opt(d, d + ' ' + t('pcp_dias'), String(f.lead || ''))).join('')) +
    sel('pcpFCiclo', 'pcp_f_ciclo', opt('', t('pcp_f_ciclo_padrao'), String(f.ciclo || '')) + [30, 60, 90, 120, 180].map(d => opt(String(d), d + ' ' + t('pcp_dias'), String(f.ciclo || ''))).join('')) +
    sel('pcpFCorr', 'pcp_f_corr', opt('', t('pcp_f_todos'), f.corredor) + (CORREDORES || []).map(c => opt(c, c, f.corredor)).join('')) +
    '<label class="pcp-toggle' + (f.so_comprar ? ' on' : '') + '"><input type="checkbox" id="pcpFSo"' + (f.so_comprar ? ' checked' : '') + '><i></i>' + esc(t('pcp_f_so')) + '</label>' +
    '<div class="pcp-fright"><button type="button" class="btn sm" data-act="pcp-limpar">' + esc(t('pcp_f_limpar')) + '</button></div></div></div>';
}
function lerForm() { const g = id => { const e = $(id); return e ? e.value : ''; }; P.Form = { fornecedor: g('pcpFForn'), categoria: g('pcpFCat'), corredor: g('pcpFCorr'), status: g('pcpFStatus'), lead: g('pcpFLead'), ciclo: g('pcpFCiclo'), busca: g('pcpFBusca'), so_comprar: !!($('pcpFSo') && $('pcpFSo').checked), meses: Number(g('pcpFMeses')) || 3 }; }
function aplicar(muda) { if (muda) Object.keys(muda).forEach(k => { P.F[k] = muda[k]; }); P.Form = JSON.parse(JSON.stringify(P.F)); P.Pag = 1; render(); }
function aplicarForm() { lerForm(); P.F = JSON.parse(JSON.stringify(P.Form)); aplicar(); }

/* ---------- 표 (옛 pcpLinhaHTML · pcpTabelaHTML) ---------- */
const PCP_COLS = [['pcp_c_prod', 'nome', 'pcp-hp'], ['pcp_c_sku', 'sku', 'pcp-hs'], ['pcp_c_forn', 'fornecedor', 'pcp-hf'], ['pcp_c_est2', 'qtd', 'num pcp-he'], ['pcp_c_nec', null, 'num pcp-hn'], ['pcp_c_sug', 'qtd_comprar', 'num pcp-hq'], ['pcp_c_custo', null, 'num pcp-hc'], ['pcp_c_valor', 'valor_est', 'num pcp-hv'], ['pcp_c_acoes', null, 'c pcp-ha']];
const PCP_ORDENS = [['sku', 'asc', 'pcp_o_sku'], ['qtd_comprar', 'desc', 'pcp_o_prio'], ['dias_cobertura', 'asc', 'pcp_o_cob'], ['data_ideal', 'asc', 'pcp_o_data'], ['valor_est', 'desc', 'pcp_o_valor'], ['nome', 'asc', 'pcp_o_nome'], ['fornecedor', 'asc', 'pcp_o_forn']];
function linhaHTML(x) {
  const id = String(x.produto_id), it = P.Sel[id], sel = !!it, sug = Number(x.qtd_comprar) || 0, q = it ? selQtd(it) : sug, nec = Math.ceil(Number(x.necessidade) || 0);
  const v = verCusto() && custoOk(x) && q > 0 && Math.round(q) === q ? q * Number(x.custo) : null, cob = x.dias_cobertura == null ? '—' : numFmt(Math.round(Number(x.dias_cobertura))), tip = ti('pcp_est_tip', { r: numFmt(x.reservado || 0), t: numFmt(x.em_transito || 0), d: cob });
  return '<tr class="pcp-r clic' + (sel ? ' sel' : '') + '" data-pid="' + esc(id) + '"><td class="chk"><input type="checkbox" data-act="pcp-sel" data-pid="' + esc(id) + '"' + (sel ? ' checked' : '') + ' aria-label="' + esc(x.sku || '') + '"></td>' +
    '<td class="pcp-cp"><div class="pcp-pc">' + thumbHTML(x) + '<div class="pcp-pc-t"><b class="pcp-nome">' + esc(x.nome || '') + '</b><small class="pcp-sub">' + esc([x.categoria, x.corredor].filter(Boolean).join(' · ')) + '</small>' + badge(x.status) + '</div></div></td>' +
    '<td class="pcp-cs"><span class="pcp-sku">' + esc(x.sku || '') + '</span></td>' +
    '<td class="pcp-cf">' + (x.fornecedor ? '<span class="pcp-fchip">' + esc(x.fornecedor) + '</span>' : '<span class="pcp-fchip sem">' + esc(t('pcp_f_sem_forn')) + '</span>') + '</td>' +
    '<td class="num pcp-ce" data-l="' + esc(t('pcp_c_est2')) + '" title="' + esc(tip) + '">' + estHTML(x) + '</td>' +
    '<td class="num pcp-cn" data-l="' + esc(t('pcp_c_nec')) + '">' + (nec > 0 ? esc(pcuQtd(x, nec)) : '0') + '</td>' +
    '<td class="num pcp-cq" data-l="' + esc(t('pcp_c_sug')) + '">' + (sug > 0 || sel ? qtdInputHTML(x) : '<span class="pcp-zero">0</span>') + '</td>' +
    '<td class="num pcp-cc" data-l="' + esc(t('pcp_c_custo')) + '">' + custoHTML(x) + '</td>' +
    '<td class="num pcp-cv" data-l="' + esc(t('pcp_c_valor')) + '"' + (sel ? ' data-vl="' + esc(id) + '"' : '') + '>' + (v == null ? '—' : esc(brl(v))) + '</td>' +
    '<td class="c pcp-ca"><details class="pcp-mn"><summary aria-label="' + esc(t('pcp_c_acoes')) + '" title="' + esc(t('pcp_c_acoes')) + '">' + svg(ICO.pontos, 18) + '</summary><div class="pcp-mn-l"><button type="button" data-act="pcp-ver" data-pid="' + esc(id) + '">' + esc(t('pcp_ver_det')) + '</button>' +
    (it && it.qtd_edit != null ? '<button type="button" data-act="pcp-q-rest" data-pid="' + esc(id) + '">' + esc(t('pcp_restaurar')) + '</button>' : '') + '<button type="button" data-act="pcp-sel-tg" data-pid="' + esc(id) + '">' + esc(t(sel ? 'pcp_tirar_sel' : 'pcp_add_sel')) + '</button></div></details></td></tr>';
}
function paginasVisiveis(atual, total) { const r = []; let i; if (total <= 7) { for (i = 1; i <= total; i++) r.push(i); return r; } let de = Math.max(2, atual - 1), ate = Math.min(total - 1, atual + 1); if (atual <= 3) { de = 2; ate = 4; } if (atual >= total - 2) { de = total - 3; ate = total - 1; } r.push(1); if (de > 2) r.push('…'); for (i = de; i <= ate; i++) r.push(i); if (ate < total - 1) r.push('…'); r.push(total); return r; }
function tabelaHTML() {
  const L = DD.lista || { total: 0, linhas: [] }, linhas = L.linhas || [], total = Number(L.total) || 0, pag = P.Pag || 1, pp = 50, de = total ? (pag - 1) * pp + 1 : 0, ate = Math.min(pag * pp, total), npags = Math.max(1, Math.ceil(total / pp));
  const todasPag = linhas.length && linhas.every(x => P.Sel[String(x.produto_id)]), ordAtual = (P.Ord || 'qtd_comprar') + ':' + (P.Dir || 'desc'), temOrd = PCP_ORDENS.some(o => o[0] + ':' + o[1] === ordAtual);
  let h = '<div class="panel pcp-painel"><div class="pcp-tb"><label class="pcp-todos"><input type="checkbox" data-act="pcp-sel-todos"' + (todosAtivo() ? ' checked' : '') + (total ? '' : ' disabled') + '><span>' + esc(ti('pcp_todos_n', { n: numFmt(total) })) + '</span></label>' +
    '<span class="pcp-tb-r"><label class="pcp-ordl" for="pcpOrdSel">' + esc(t('pcp_ord')) + '</label><select class="flt" id="pcpOrdSel">' + (temOrd ? '' : opt(ordAtual, t('pcp_o_outro'), ordAtual)) + PCP_ORDENS.map(o => opt(o[0] + ':' + o[1], t(o[2]), ordAtual)).join('') + '</select>' +
    '<button type="button" class="btn sm pcp-rec" data-act="pcp-recarregar" title="' + esc(t('pcp_atualizar')) + (DD.quando ? ' · ' + esc(t('pcp_atualizado')) + ': ' + esc(B.dataCurtaHora(DD.quando.toISOString())) : '') + '" aria-label="' + esc(t('pcp_atualizar')) + '">' + svg(ICO.repetir, 14) + '</button></span></div>';
  if (!linhas.length) h += '<div class="placeholder">' + svg(ICO.compra, 40) + '<b>' + esc(t('pcp_vazio')) + '</b><span>' + esc(t('pcp_vazio_sub')) + '</span></div>';
  else {
    h += '<div class="pcp-tw"><table class="pcp-tbl pcp-t2"><thead><tr><th class="chk"><input type="checkbox" data-act="pcp-sel-pag" aria-label="' + esc(t('pcp_sel_pag')) + '"' + (todasPag ? ' checked' : '') + '></th>';
    PCP_COLS.forEach(c => { const on = c[1] && P.Ord === c[1]; h += c[1] ? '<th class="sortable ' + c[2] + (on ? ' sorted' : '') + '" data-ord="' + c[1] + '">' + esc(t(c[0])) + '<span class="arw' + (on && P.Dir === 'asc' ? ' up' : '') + '"></span></th>' : '<th class="' + c[2] + '">' + esc(t(c[0])) + '</th>'; });
    h += '</tr></thead><tbody>' + linhas.map(linhaHTML).join('') + '</tbody></table></div>';
  }
  h += '<div class="pcp-pager">' + esc(ti('pcp_mostrando', { a: numFmt(de), b: numFmt(ate), n: numFmt(total) })) + '<span class="pg"><button type="button" class="cl-pg" data-pcp-nav="prev"' + (pag <= 1 ? ' disabled' : '') + ' aria-label="‹">‹</button>' +
    paginasVisiveis(pag, npags).map(p => p === '…' ? '<span class="cl-pg-el">…</span>' : '<button type="button" class="cl-pg' + (p === pag ? ' on' : '') + '" data-pg="' + p + '">' + p + '</button>').join('') +
    '<button type="button" class="cl-pg" data-pcp-nav="next"' + (pag >= npags ? ' disabled' : '') + ' aria-label="›">›</button></span></div></div>';
  return h;
}

/* ---------- 이벤트 (옛 pcpLigar · pcpClique · pcpMudou) ---------- */
let MENU_DOC = false;
const DO_CABECALHO = { 'pcp-cfg': 1, 'pcp-gerar': 1, 'pcx-como': 1, 'pcx-xlsx': 1, 'pcx-pdf': 1 };
function ligar() {
  const c = $('conteudo'), root = c && c.querySelector('.pcp-tela'); if (!root) return;
  const um = (sel, fn) => { const b = c.querySelector(sel); if (b) b.addEventListener('click', () => fn(b)); };
  um('[data-act="pcp-cfg"]', () => abrirConfig()); um('[data-act="pcp-gerar"]', () => gerarClique()); um('[data-act="pcx-como"]', () => comoFunciona());
  um('[data-act="pcx-xlsx"]', b => exportar('xlsx', b)); um('[data-act="pcx-pdf"]', b => exportar('pdf', b));
  root.addEventListener('click', clique); root.addEventListener('change', mudou);
  root.addEventListener('input', e => { const el = e.target; if (el && el.classList && el.classList.contains('pcp-q')) qtdDigitada(el, false); });
  root.addEventListener('keydown', e => { const el = e.target; if (e.key !== 'Enter' || !el) return; if (el.id === 'pcpFBusca') { e.preventDefault(); aplicarForm(); return; } if (el.classList && el.classList.contains('pcp-q')) { e.preventDefault(); el.blur(); } });
  root.addEventListener('toggle', e => { const d = e.target; if (d && d.classList && d.classList.contains('pcp-mn') && d.open) menuPos(d); }, true);
  if (!MENU_DOC) { MENU_DOC = true; document.addEventListener('click', e => { const dentro = e.target && e.target.closest && e.target.closest('details.pcp-mn'); document.querySelectorAll('.pcp-tela details.pcp-mn[open]').forEach(d => { if (d !== dentro) d.removeAttribute('open'); }); }); }
}
async function recarregar() { busy(true); try { await garantirRaw(true); } catch (e) { DD.erro = String(e && e.message || e); } busy(false); DD.chave = null; render(); }
function clique(e) {
  const alvo = e.target && e.target.closest ? e.target : null; if (!alvo) return;
  const aba = alvo.closest('[data-pcp-aba]'); if (aba) return irAba(aba.getAttribute('data-pcp-aba'));
  const grp = alvo.closest('[data-pcp-grp]'); if (grp) { const gid = grp.getAttribute('data-pcp-grp'); P.GrpAb[gid] = !P.GrpAb[gid]; return render(); }
  const th = alvo.closest('.pcp-tbl th[data-ord]');
  if (th) { const o = th.getAttribute('data-ord'); if (P.Ord === o) P.Dir = P.Dir === 'asc' ? 'desc' : 'asc'; else { P.Ord = o; P.Dir = o === 'qtd_comprar' || o === 'valor_est' ? 'desc' : 'asc'; } P.Pag = 1; return render(); }
  const pg = alvo.closest('.pcp-pager [data-pg]'); if (pg) { if (pg.disabled) return; P.Pag = Number(pg.getAttribute('data-pg')) || 1; return render(); }
  const nav = alvo.closest('.pcp-pager [data-pcp-nav]'); if (nav) { if (nav.disabled) return; P.Pag = Math.max(1, (P.Pag || 1) + (nav.getAttribute('data-pcp-nav') === 'next' ? 1 : -1)); return render(); }
  const ca = alvo.closest('[data-act]'), act = ca ? ca.getAttribute('data-act') : '';
  if (act && DO_CABECALHO[act]) return;
  const chk = alvo.closest('.pcp-tbl td.chk'); if (chk && alvo.tagName !== 'INPUT') { const cb = chk.querySelector('input'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); } return; }
  const pid = ca ? ca.getAttribute('data-pid') : null;
  const fecharMn = () => { const d = ca.closest('details'); if (d) d.removeAttribute('open'); };
  switch (act) {
    case 'pcp-card': { const s = ca.getAttribute('data-sit'); return aplicar({ status: P.F.status === s ? '' : s }); }
    case 'pcp-tentar': case 'pcp-recarregar': return recarregar();
    case 'pcp-aplicar': return aplicarForm();
    case 'pcp-limpar': P.F = filtrosPadrao(); return aplicar();
    case 'pcp-filtros': { P.FiltrosAbertos = !P.FiltrosAbertos; const f = document.querySelector('.pcp-tela .pcp-filtros'); if (f) f.classList.toggle('aberto', P.FiltrosAbertos); return; }
    case 'pcp-avanc': { P.Avanc = !P.Avanc; const fa = document.querySelector('.pcp-tela .pcp-favanc'); if (fa) fa.classList.toggle('on', P.Avanc); ca.classList.toggle('on', P.Avanc); return; }
    case 'pcx-sku': case 'pcp-ver': fecharMn(); return abrirSku(pid);
    case 'pcx-forn': { const fid = ca.getAttribute('data-fid'); return aplicar({ fornecedor: P.F.fornecedor === fid ? '' : fid }); }
    case 'pcp-sel-tg': fecharMn(); if (P.Sel[pid]) { delete P.Sel[pid]; P.TodosChave = null; } else { const x = linhaPorId(pid); if (x) P.Sel[pid] = selItem(x); } selSalvar(); return render();
    case 'pcp-q-rest': fecharMn(); if (P.Sel[pid]) { P.Sel[pid].qtd_edit = null; selSalvar(); } return render();
    case 'pcp-tirar': delete P.Sel[pid]; P.TodosChave = null; selSalvar(); return render();
    case 'pcp-cad': location.hash = '#/produtos/' + encodeURIComponent('p/' + pid); return;
    case 'pcp-sel-limpar': return selLimpar();
    case 'pcp-grp-todos': { const com = gruposSel(selLista()).filter(g => g.id != null), abrir = !com.every(g => P.GrpAb[g.id]); com.forEach(g => { P.GrpAb[g.id] = abrir; }); return render(); }
    case 'pcp-grp-rev': return irGrupo(ca.getAttribute('data-fid'));
    case 'pcp-gerar-conf': if (ca.disabled) return; return gerarConfAbrir();
    case 'pcp-gerado-fechar': P.Gerado = null; return render();
    case 'pcp-ped-abrir': return irPedido(ca.getAttribute('data-id'));
    case 'pcp-ped-lista': return irPedido(null);
  }
  if (act) return;
  const tr = alvo.closest('.pcp-tbl tbody tr.pcp-r'); if (tr && !alvo.closest('input, button, select, label, details, a')) abrirSku(tr.getAttribute('data-pid'));
}
function mudou(e) {
  const el = e.target; if (!el) return;
  const act = el.getAttribute && el.getAttribute('data-act');
  if (act === 'pcp-sel') { const pid = el.getAttribute('data-pid'); if (el.checked) { const x = linhaPorId(pid); if (x && !P.Sel[pid]) P.Sel[pid] = selItem(x); } else { delete P.Sel[pid]; P.TodosChave = null; } selSalvar(); return repintarResumo(); }
  if (act === 'pcp-sel-pag') { ((DD.lista || {}).linhas || []).forEach(x => { const id = String(x.produto_id); if (el.checked) { if (!P.Sel[id]) P.Sel[id] = selItem(x); } else delete P.Sel[id]; }); if (!el.checked) P.TodosChave = null; selSalvar(); return render(); }
  if (act === 'pcp-sel-todos') return selTodos(el.checked);
  if (el.classList && el.classList.contains('pcp-q')) return qtdDigitada(el, true);
  if (el.id === 'pcpOrdSel') { const p = String(el.value).split(':'); P.Ord = p[0] || 'qtd_comprar'; P.Dir = p[1] || 'desc'; P.Pag = 1; return render(); }
  if (el.id === 'pcpFSo') el.parentNode.classList.toggle('on', el.checked);
  if (/^pcpF(Forn|Cat|Status|Meses|Lead|Ciclo|Corr|So)$/.test(el.id || '')) aplicarForm();
}

/* ---------- 상품 서랍 (옛 pcpAbrirSku · pcpDrawerHTML · pcpPorqueHTML · pcpMiniHTML) ---------- */
const N1 = v => v == null ? '—' : numFmt(Math.round(Number(v) * 10) / 10, 1);
const N0 = v => v == null ? '—' : numFmt(Math.round(Number(v)));
function abrirSku(id) { if (!id) return; P.Sku = String(id); pintarDrawer(); }
function fecharDrawer() { P.Sku = null; B.drawerFechar(); }
function porqueHTML(x, e) {
  if (!(e.qtd_comprar > 0)) return '<div class="pcp-porque"><h4>' + esc(t('pcp_d_porque_tit')) + '</h4><div class="pcp-nada">' + esc(t('pcp_d_nada')) + '</div></div>';
  const m = N1(e.media_dia), passos = [
    ti(e.media_origem === '12m' ? 'pcp_d_p1f' : Number(e.dias_ruptura) > 0 ? 'pcp_d_p1r' : 'pcp_d_p1', { v: numFmt(e.vendas_janela), d: numFmt(e.dias_janela), r: N1(e.dias_ruptura), m }),
    ti('pcp_d_p2', { m, l: numFmt(e.lead_time), r: N0(e.demanda_lt) }),
    e.minimo_manual && Number(e.minimo_manual) >= Number(e.seguranca) ? ti('pcp_d_p3m', { r: N0(e.seguranca), p: N0(e.ponto_rep) }) : ti('pcp_d_p3', { m, s: numFmt(e.dias_seguranca), r: N0(e.seguranca), p: N0(e.ponto_rep) }),
    ti('pcp_d_p4', { m, lc: numFmt(Number(e.lead_time) + Number(e.dias_ciclo)), s: N0(e.seguranca), a: N0(e.alvo) }),
    ti('pcp_d_p5', { q: numFmt(e.qtd), r: numFmt(e.reservado), t: numFmt(e.em_transito), d: numFmt(e.disponivel) })
  ], u = Number(e.un_por_caixa) || 1, nec = N0(e.necessidade), a = N0(e.alvo), d = numFmt(e.disponivel), q = numFmt(e.qtd_comprar);
  passos.push(u > 1 ? ti('pcp_d_p6cx', { a, d, n: nec, u: numFmt(u), q, c: numFmt(Math.round(e.qtd_comprar / u)) }) : e.qtd_minima_compra && Number(e.qtd_comprar) > Math.ceil(Number(e.necessidade)) ? ti('pcp_d_p6min', { a, d, n: nec, q }) : ti('pcp_d_p6', { a, d, n: q }));
  return '<div class="pcp-porque"><h4>' + esc(t('pcp_d_porque_tit')) + '</h4><p>' + esc(ti('pcp_d_p_intro', { f: x.fornecedor || '—', l: numFmt(e.lead_time), s: numFmt(e.dias_seguranca), c: numFmt(e.dias_ciclo) })) + '</p><ol>' + passos.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol>' +
    '<div class="pcp-custo">' + esc(!verCusto() ? t('pcp_custo_oculto') : e.custo != null && Number(e.custo) > 0 ? ti('pcp_d_custo', { c: brl(Number(e.custo)), v: brl(Number(e.valor_est) || 0) }) : t('pcp_d_sem_custo')) + '</div></div>';
}
function miniHTML(v12) {
  const max = Math.max(1, ...v12.map(m => Number(m.qtd) || 0)), W = 520, bw = 26, gap = 14;
  return '<svg class="pcp-mini" viewBox="0 0 ' + W + ' 110" width="100%" height="110">' + v12.map((m, i) => { const h = Math.round((Number(m.qtd) || 0) / max * 76), x = 20 + i * (bw + gap); return '<rect x="' + x + '" y="' + (100 - h) + '" width="' + bw + '" height="' + h + '" fill="#1b6ec2" opacity=".85"><title>' + esc(m.mes + ': ' + numFmt(m.qtd || 0)) + '</title></rect><text x="' + (x + bw / 2) + '" y="109" font-size="9.5" fill="#6b7785" text-anchor="middle">' + esc(String(m.mes).slice(5)) + '</text>'; }).join('') + '<line x1="10" x2="' + (W - 10) + '" y1="100" y2="100" stroke="#cfd6dd"/></svg>';
}
function drawerHTML(dados) {
  const x = dados.sku, e = dados.explicacao || {}, kv = (l, v) => '<div><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div></div>', agora = x.status === 'comprar_agora', temCompra = x.qtd_comprar > 0, dIdeal = x.data_ideal ? dataBR(x.data_ideal + 'T12:00:00') : '—';
  const hero = temCompra ? '<div class="pcp-hero' + (agora ? '' : ' breve') + '"><div class="big">' + numFmt(x.qtd_comprar) + '<small>' + esc(t('pcp_t_pecas_un').toUpperCase()) + '</small></div><div class="txt"><b>' + esc(ti(agora ? 'pcp_d_hero_agora' : 'pcp_d_hero_breve', { d: dIdeal })) + '</b>' + (agora ? esc(ti('pcp_d_hero_txt', { c: N0(x.dias_cobertura), l: numFmt(x.lead_time), d: dIdeal })) : '') + '</div></div>'
    : '<div class="pcp-hero ok"><div class="big">0<small>' + esc(t('pcp_t_pecas_un').toUpperCase()) + '</small></div><div class="txt">' + badge(x.status) + '</div></div>';
  return hero +
    '<div class="pcp-sec"><h4>' + esc(t('pcp_d_estoque')) + '</h4><div class="pcp-kv">' + kv(t('pcp_d_em_est'), numFmt(x.qtd)) + kv(t('pcp_d_reservado'), numFmt(x.reservado)) + kv(t('pcp_d_transito'), numFmt(x.em_transito)) + kv(t('pcp_d_disp'), numFmt(x.disponivel)) + kv(t('pcp_d_cob'), x.dias_cobertura == null ? '—' : N0(x.dias_cobertura) + ' <small>' + esc(t('pcp_dias')) + '</small>') + kv(t('pcp_d_pr'), N0(x.ponto_rep)) + '</div></div>' +
    '<div class="pcp-sec"><h4>' + esc(t('pcp_d_vendas')) + '</h4><div class="pcp-kv">' + kv(t('pcp_d_media_mes'), N0(x.media_mes)) + kv(t('pcp_d_media_dia'), N1(x.media_dia) + ' <small>' + esc(t('pcp_d_pcdia')) + '</small>') + kv(t('pcp_d_tend'), tendHTML(x.tendencia)) + '</div><div class="pcp-mini-tit">' + esc(t('pcp_d_12m')) + '</div>' + miniHTML(dados.vendas12 || []) + '</div>' +
    porqueHTML(x, e) +
    '<div class="pcp-sec"><h4>' + esc(t('pcp_d_pedidos')) + '</h4>' + ((dados.pedidos_abertos || []).length ? dados.pedidos_abertos.map(p => '<div class="pcp-ped">' + esc(ti('pcp_d_ped_linha', { n: p.numero, s: t('pco_st_' + p.status), q: numFmt(p.qtd), r: numFmt(p.qtd_recebida || 0) })) + (p.previsao_em ? ' · ' + esc(dataBR(p.previsao_em + 'T12:00:00')) : '') + '</div>').join('') : '<div class="pcp-sem-ped">' + esc(t('pcp_d_sem_pedidos')) + '</div>') + '</div>';
}
function pintarDrawer() {
  if (!P.Sku || !RAW) return;
  let dados = null; try { dados = rpcSku(P.Sku, Number(P.F.meses) || 3, Number(P.F.ciclo) || null); } catch (e) { dados = { erro: String(e.message || e) }; }
  const linha = (dados && dados.sku) || linhaPorId(P.Sku) || {};
  const corpo = dados.erro ? '<div class="pcp-erro">' + svg(ICO.sai2, 18) + '<div><b>' + esc(t('pcp_erro')) + '</b></div></div>' : drawerHTML(dados);
  B.drawerAbrir('<div class="dr-head"><div class="dr-top"><div class="thumb pcp-thumb pcp-dr-thumb">' + (linha.foto_thumb ? '<img src="' + esc(linha.foto_thumb) + '" alt="" width="40" height="40" style="object-fit:cover;border-radius:6px">' : svg(ICO.prod, 18)) + '</div><div><h2>' + esc(linha.nome || '') + '</h2><div class="meta"><span class="pcp-sku">' + esc(linha.sku || '') + '</span> · ' + esc(linha.fornecedor || '—') + (linha.categoria ? ' · ' + esc(linha.categoria) : '') + (linha.corredor ? ' · ' + esc(linha.corredor) : '') + '</div></div>' +
    '<button class="x" data-act="fechar-drawer" aria-label="' + esc(t('pcp_d_fechar')) + '">' + svg(ICO.x, 17) + '</button></div></div><div class="dr-body">' + corpo + '</div>', e => { if (e.target.closest('[data-act="fechar-drawer"]')) fecharDrawer(); });
}

/* ---------- 분석 (옛 pcxAnalisesHTML · pcxTopHTML · pcxSerieHTML · pcxFornHTML · pcxComoFunciona) ---------- */
const analisesHTML = r => '<div class="pcx-analises">' + topHTML(r) + serieHTML(r) + fornHTML(r) + '</div>';
function topHTML(r) {
  const top = (r.top || []).filter(x => x.qtd_comprar > 0), max = top.length ? Number(top[0].qtd_comprar) : 1;
  return '<div class="panel pcx-p"><h3>' + esc(t('pcx_top')) + '</h3>' + (top.length ? '<div class="pcx-rank">' + top.map((x, i) => '<button type="button" class="pcx-r" data-act="pcx-sku" data-pid="' + esc(x.produto_id) + '"><i>' + (i + 1) + '</i><div class="nm"><b>' + esc(x.nome || x.sku) + '</b><small>' + esc(x.sku || '') + '</small><span class="pcx-bar" style="--w:' + Math.round(100 * Number(x.qtd_comprar) / max) + '%"></span></div><div class="q">' + numFmt(x.qtd_comprar) + '</div></button>').join('') + '</div>' : '<div class="pcx-vazio">' + esc(t('pcx_top_vazio')) + '</div>') + '</div>';
}
function serieHTML(r) {
  const s = r.serie || [], W = 560, H = 190, T = 18, Bt = 26, L = 44, R = 10, n = s.length;
  if (!n) return '<div class="panel pcx-p"><h3>' + esc(t('pcx_serie')) + '</h3><div class="pcx-vazio">' + esc(t('pcx_top_vazio')) + '</div></div>';
  const vals = []; s.forEach(m => ['vendas', 'demanda', 'estoque'].forEach(c => { if (m[c] != null) vals.push(Number(m[c])); }));
  const max = Math.max(1, ...vals), passo = Math.pow(10, Math.floor(Math.log(max) / Math.LN10)); let topo = Math.ceil(max / passo) * passo; const tick = Math.max(1, Math.ceil(topo / 4)); topo = tick * 4;
  const cw = (W - L - R) / n, bw = Math.min(26, cw * 0.5), y = v => T + (H - T - Bt) * (1 - v / topo), nReais = s.filter(m => m.vendas != null).length;
  let g = '<svg class="pcx-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img">';
  for (let k = 0; k <= 4; k++) { const v = tick * k; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="#e3e7eb"/><text x="' + (L - 6) + '" y="' + (y(v) + 3).toFixed(1) + '" font-size="9.5" fill="#6b7785" text-anchor="end">' + numFmt(Math.round(v)) + '</text>'; }
  const pts = [];
  s.forEach((m, i) => { const x = L + cw * i + cw / 2, mes = String(m.mes).slice(5) + '/' + String(m.mes).slice(2, 4);
    if (m.vendas != null) g += '<rect class="pcx-b-v" x="' + (x - bw / 2).toFixed(1) + '" y="' + y(Number(m.vendas)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y(0) - y(Number(m.vendas))).toFixed(1) + '" fill="#1b6ec2"><title>' + esc(mes + ': ' + numFmt(m.vendas)) + '</title></rect>';
    if (m.demanda != null) g += '<rect class="pcx-b-d" x="' + (x - bw / 2).toFixed(1) + '" y="' + y(Number(m.demanda)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y(0) - y(Number(m.demanda))).toFixed(1) + '" fill="#8fb8e6"><title>' + esc(mes + ': ' + numFmt(m.demanda)) + '</title></rect>';
    if (m.estoque != null) pts.push([x, y(Number(m.estoque)), m.estoque]);
    g += '<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" font-size="9.5" fill="#6b7785" text-anchor="middle">' + esc(mes) + '</text>'; });
  if (pts.length) g += '<polyline class="pcx-l-e" fill="none" stroke="#128a5b" stroke-width="2.5" points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' + pts.map(p => '<circle class="pcx-pt" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="#128a5b"><title>' + esc(numFmt(p[2])) + '</title></circle>').join('');
  if (nReais && nReais < n) { const xh = L + cw * nReais; g += '<line class="pcx-hoje" x1="' + xh.toFixed(1) + '" x2="' + xh.toFixed(1) + '" y1="' + (T - 6) + '" y2="' + y(0).toFixed(1) + '" stroke="#c1352c" stroke-dasharray="4 3"/><text x="' + (xh + 4).toFixed(1) + '" y="' + (T - 8) + '" font-size="9.5" fill="#c1352c" font-weight="700">' + esc(t('pcx_hoje')) + '</text>'; }
  g += '</svg>';
  return '<div class="panel pcx-p pcx-serie"><h3>' + esc(t('pcx_serie')) + '<span class="tag">' + esc(ti('pcx_serie_meses', { n: numFmt(r.meses || 3) })) + '</span></h3><div class="pcx-leg"><span><i style="background:#1b6ec2"></i>' + esc(t('pcx_l_vendas')) + '</span><span><i style="background:#8fb8e6"></i>' + esc(t('pcx_l_demanda')) + '</span><span><i style="background:#128a5b"></i>' + esc(t('pcx_l_estoque')) + '</span></div>' + g + '<div class="pcx-nota">' + esc(t('pcx_serie_sub')) + '</div></div>';
}
function fornHTML(r) {
  const fs = (r.fornecedores || []).filter(f => f.skus > 0 || f.pecas > 0), max = Math.max(1, ...fs.map(f => Number(f.pecas) || 0)), sel = String((P.F || {}).fornecedor || ''); let ts = 0, tp = 0;
  fs.forEach(f => { ts += Number(f.skus) || 0; tp += Number(f.pecas) || 0; });
  return '<div class="panel pcx-p"><h3>' + esc(t('pcx_forn')) + '</h3>' + (fs.length ? '<div class="pcx-forn">' + fs.map(f => { const id = f.fornecedor_id == null ? 'sem' : String(f.fornecedor_id), sem = id === 'sem';
    return '<button type="button" class="pcx-f' + (sem ? ' sem' : '') + (sel === id ? ' on' : '') + '" data-act="pcx-forn" data-fid="' + esc(id) + '"><b>' + esc(sem ? t('pcx_forn_sem') : f.fornecedor) + '</b><span class="n"><b>' + esc(ti('pcx_forn_linha', { s: numFmt(f.skus), p: numFmt(f.pecas) })) + '</b><small>' + (verCusto() && Number(f.valor) > 0 ? esc(brl(Number(f.valor))) : '—') + '</small></span><small class="s">' + esc(sem ? t('pcx_forn_sem_sub') : ti('pcx_forn_lead', { d: numFmt(f.lead_time || 60) })) + '</small><span class="pcx-bar" style="--w:' + Math.round(100 * (Number(f.pecas) || 0) / max) + '%"></span></button>'; }).join('') +
    '<div class="tot"><span>' + esc(t('pcx_forn_total')) + '</span><b>' + esc(ti('pcx_forn_tot', { s: numFmt(ts), p: numFmt(tp) })) + '</b></div></div>' : '<div class="pcx-vazio">' + esc(t('pcx_forn_vazio')) + '</div>') + '</div>';
}
function comoFunciona() { B.pergunta({ titulo: t('pcx_cf_tit'), html: '<ol class="pcx-cf">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => '<li>' + esc(t('pcx_cf_' + i)) + '</li>').join('') + '</ol>', umBotao: true, sim: t('pcp_d_fechar') }); }

/* ---------- ⚙️ 설정 (옛 pcpPintarConfig · pcpSalvarConfig) — 공장 리드타임 · 안전 · 주기 + 메일 ---------- */
let RASCUNHO = null;
async function abrirConfig() { await PO.cfgCarregar(false); pintarConfig(); }
function pintarConfig() {
  const can = B.canCfg(), fs = B.forns(BASE.rows.map(r => r.fornecedor_id)).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const inp = (id, k, v) => '<input type="number" min="1" max="365" inputmode="numeric" class="flt pcp-cfg-in" data-fid="' + esc(id) + '" data-k="' + k + '" value="' + esc(v == null ? '' : v) + '"' + (can ? '' : ' disabled') + '>';
  let html = '<div class="pcp-cfg-rol"><p class="pcp-cfg-sub">' + esc(t('pcp_cfg_sub')) + '</p><div class="pcp-cfg-cab"><span></span><span>' + esc(t('pcp_cfg_lead')) + '</span><span>' + esc(t('pcp_cfg_seg')) + '</span><span>' + esc(t('pcp_cfg_ciclo')) + '</span></div>' +
    fs.map(f => '<div class="pcp-cfg-l"><b>' + esc(f.nome) + '</b>' + inp(f.id, 'lead', f.lead_time_dias) + inp(f.id, 'seg', f.dias_seguranca) + inp(f.id, 'ciclo', f.dias_ciclo) + '</div>').join('');
  const c = RASCUNHO || PO.cfgAtual() || {}, dis = can ? '' : ' disabled';
  html += '<div class="pcm-bloco"><h4>' + esc(t('pcm_tit')) + '</h4><p class="pcp-cfg-sub">' + esc(t('pcm_sub')) + '</p>' +
    '<label class="pcm-l"><span>' + esc(t('pcm_emails')) + '</span><input type="text" id="pcmEmails" class="flt" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(t('pcm_emails_ph')) + '" value="' + esc(c.emails || '') + '"' + dis + '></label>' +
    '<label class="pcm-l"><span>' + esc(t('pcm_assunto')) + '</span><input type="text" id="pcmAssunto" class="flt" value="' + esc(c.assunto || '') + '"' + dis + '><i class="pcm-dica">' + esc(t('pcm_assunto_dica')) + '</i></label>' +
    '<label class="pcm-l"><span>' + esc(t('pcm_texto')) + '</span><textarea id="pcmTexto" class="flt pcm-ta" rows="6"' + dis + '>' + esc(c.texto || '') + '</textarea></label>' +
    '<label class="pcm-auto"><input type="checkbox" id="pcmAuto"' + (String(c.auto) === '1' ? ' checked' : '') + dis + '><span>' + esc(t('pcm_auto')) + '</span></label>' + PO.pcmUltimoHTML() + '</div></div>';
  const w = B.pergunta({ titulo: t('pcp_cfg'), html, sim: t('pcp_cfg_salvar'), nao: t('pcp_d_fechar'), onSim: w2 => { salvarConfig(w2); } });
  if (!can) { const s = w.querySelector('#pergSim'); if (s) s.remove(); }
}
async function salvarConfig(w) {
  const fs = B.forns(BASE.rows.map(r => r.fornecedor_id)), mudou = []; let ok = true;
  fs.forEach(f => { const g = k => { const e = w.querySelector('.pcp-cfg-in[data-fid="' + f.id + '"][data-k="' + k + '"]'); return e ? Number(e.value) : null; }, lead = g('lead'), seg = g('seg'), ciclo = g('ciclo');
    if (lead == null) return; if (!(lead >= 1 && lead <= 365) || !(seg >= 0 && seg <= 365) || !(ciclo >= 1 && ciclo <= 365)) ok = false;
    if (lead !== Number(f.lead_time_dias) || seg !== Number(f.dias_seguranca) || ciclo !== Number(f.dias_ciclo)) mudou.push({ f, lead, seg, ciclo }); });
  const em = w.querySelector('#pcmEmails'); let cfg = null;
  if (em) { const auto = w.querySelector('#pcmAuto') && w.querySelector('#pcmAuto').checked ? '1' : '0', lidos = PO.pcmLerEmails(em.value);
    cfg = { emails: lidos.bons.join(', '), assunto: (w.querySelector('#pcmAssunto') || {}).value || '', texto: (w.querySelector('#pcmTexto') || {}).value || '', auto };
    RASCUNHO = { emails: em.value, assunto: cfg.assunto, texto: cfg.texto, auto };
    if (!ok) { aviso(t('pcp_cfg_erro'), true); return setTimeout(pintarConfig, 0); }
    if (lidos.ruins.length) { aviso(ti('pcm_email_ruim', { e: lidos.ruins[0] }), true); return setTimeout(pintarConfig, 0); }
    if (auto === '1' && !lidos.bons.length) { aviso(t('pcm_sem_email'), true); return setTimeout(pintarConfig, 0); } }
  else if (!ok) { aviso(t('pcp_cfg_erro'), true); return setTimeout(pintarConfig, 0); }
  RASCUNHO = null;
  try {
    const old = PO.cfgAtual() || {};
    if (cfg && (cfg.emails !== (old.emails || '') || cfg.assunto !== (old.assunto || '') || cfg.texto !== (old.texto || '') || cfg.auto !== String(old.auto || '0'))) await PO.cfgSalvar(cfg);
    if (mudou.length) {
      const next = Object.assign({}, (S.settings && S.settings.planParams) || {});
      mudou.forEach(m => { next[m.f.id] = { lead: m.lead, seg: m.seg, cyc: m.ciclo }; });
      await S.DB.batch([{ op: 'merge', col: 'settings', id: 'app', data: { planParams: next } }]);
      S.settings.planParams = next; BASE = { key: '', rows: [], by: {} }; DD.chave = null;
      aviso(t('pcp_cfg_ok')); render();
    }
  } catch (e) { aviso(String(e.code || e.message || e) || t('pcp_cfg_erro'), true); }
}

/* ---------- ⬇️ Excel · PDF (옛 pcx* — 지금 걸러보기 · 정렬 그대로, 고른 것과 상관없이) ---------- */
const CRC = (() => { const tb = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const utf8 = s => new TextEncoder().encode(s);
function zipStored(arqs) {
  const partes = [], central = []; let off = 0; const hoje = new Date(), dt = ((hoje.getHours() << 11) | (hoje.getMinutes() << 5) | (hoje.getSeconds() >> 1)) & 0xFFFF, dd = (((hoje.getFullYear() - 1980) << 9) | ((hoje.getMonth() + 1) << 5) | hoje.getDate()) & 0xFFFF;
  const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  arqs.forEach(a => { const nome = utf8(a.nome), dados = a.bytes, crc = crc32(dados), loc = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dt), u16(dd), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0)));
    partes.push(loc, nome, dados); central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dt), u16(dd), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nome); off += loc.length + nome.length + dados.length; });
  const cdLen = central.reduce((s, x) => s + x.length, 0), fim = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(arqs.length), u16(arqs.length), u32(cdLen), u32(off), u16(0)));
  const out = new Uint8Array(off + cdLen + fim.length); let p = 0; partes.concat(central, [fim]).forEach(x => { out.set(x, p); p += x.length; }); return out;
}
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colRef = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function sheetXml(linhas) { let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'; linhas.forEach((l, r) => { x += '<row r="' + (r + 1) + '">'; l.forEach((c, i) => { if (c == null || c === '') return; const ref = colRef(i) + (r + 1); x += typeof c === 'number' && isFinite(c) ? '<c r="' + ref + '" t="n"><v>' + c + '</v></c>' : '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(c) + '</t></is></c>'; }); x += '</row>'; }); return x + '</sheetData></worksheet>'; }
export function xlsx(abas) {
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + abas.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + abas.map((a, i) => '<sheet name="' + xmlEsc(String(a.nome).slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>';
  const wbr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + abas.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '</Relationships>';
  const arqs = [{ nome: '[Content_Types].xml', bytes: utf8(ct) }, { nome: '_rels/.rels', bytes: utf8(rels) }, { nome: 'xl/workbook.xml', bytes: utf8(wb) }, { nome: 'xl/_rels/workbook.xml.rels', bytes: utf8(wbr) }];
  abas.forEach((a, i) => arqs.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', bytes: utf8(sheetXml(a.linhas)) }));
  return new Blob([zipStored(arqs)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function baixar(blob, nome) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = nome; a.rel = 'noopener'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); try { URL.revokeObjectURL(url); } catch (e) {} }, 6e4); }
const pcxRef = () => { const d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); };
const STXT = { comprar_agora: 'pcp_agora', comprar_breve: 'pcp_breve', saudavel: 'pcp_saudavel', excesso: 'pcp_excesso', em_transito: 'pcp_transito', sem_historico: 'pcp_sem_hist' };
const statusTxt = (s, fn) => (fn || t)(STXT[s] || 'pcp_sem_hist');
function filtrosTexto(fn) {
  const tt = fn || t, f = P.F || {}, p = [];
  if (f.fornecedor) p.push(tt('pcp_f_forn') + ': ' + (f.fornecedor === 'sem' ? tt('pcp_f_sem_forn') : B.fornNome(f.fornecedor) || f.fornecedor));
  if (f.categoria) p.push(tt('pcp_f_cat') + ': ' + f.categoria); if (f.status) p.push(tt('pcp_f_status') + ': ' + tt(STXT[f.status] || f.status));
  if (f.lead) p.push(tt('pcp_f_lead') + ': ' + f.lead + ' ' + tt('pcp_dias')); if (f.ciclo) p.push(tt('pcp_f_ciclo') + ': ' + f.ciclo + ' ' + tt('pcp_dias')); if (f.corredor) p.push(tt('pcp_f_corr') + ': ' + f.corredor); if (f.busca) p.push('"' + f.busca + '"'); if (f.so_comprar) p.push(tt('pcp_f_so'));
  return p.length ? p.join(' · ') : tt('pcx_x_sem_filtro');
}
const colunasXlsx = () => [['pcp_c_prod', 'nome'], ['pcp_c_sku', 'sku'], ['pcp_c_und', 'unidade'], ['pcp_c_forn', 'fornecedor'], ['pcp_c_est', 'qtd', 1], ['pcp_c_res', 'reservado', 1], ['pcp_d_transito', 'em_transito', 1], ['pcp_c_media', 'media_mes', 1], ['pcp_c_tend', 'tendencia', 1], ['pcp_c_lead', 'lead_time', 1], ['pcp_c_seg', 'seguranca', 1], ['pcp_c_pr', 'ponto_rep', 1], ['pcp_c_dias', 'dias_cobertura', 1], ['pcp_c_qtd', 'qtd_comprar', 1], ['pcp_c_data', 'data_ideal'], ['pcp_c_status', 'status'], ['pco_custo', 'custo', 1], ['pcp_t_valor', 'valor_est', 1]];
function linhasExport() { const r = rpcPlanCompras(filtrosRPC(), 1, 0, P.Ord || 'qtd_comprar', P.Dir || 'desc'), L = r.linhas; if (!L.length) { aviso(t('pcx_exp_vazio'), true); return null; } if (r.total > L.length) aviso(t('pcx_exp_teto'), true); return L; }
export function exportar(tipo) {
  const L = linhasExport(); if (!L) return;
  const r = DD.resumo || {}, tt = r.totais || {}, nForn = (r.fornecedores || []).filter(f => f.skus > 0).length, vc = verCusto();
  if (tipo === 'xlsx') {
    const cols = colunasXlsx().filter(c => vc || (c[1] !== 'custo' && c[1] !== 'valor_est')), cab = cols.map(c => c[1] === 'tendencia' ? t(c[0]) + ' (%)' : t(c[0]));
    const dados = L.map(x => cols.map(c => { const v = x[c[1]]; return c[1] === 'unidade' ? pcuTexto(x) : c[1] === 'status' ? statusTxt(v) : c[1] === 'tendencia' ? (v == null ? '' : Math.round(Number(v) * 1000) / 10) : c[2] ? (v == null ? '' : Number(v)) : (v == null ? '' : String(v)); }));
    const resumo = [[t('pcx_x_skus'), Number(tt.skus_comprar) || 0], [t('pcx_x_pecas'), Number(tt.pecas) || 0]].concat(vc ? [[t('pcx_x_valor'), Number(tt.valor) || 0]] : []).concat([[t('pcx_x_forns'), nForn], [t('pcx_x_periodo'), ti('pcx_serie_meses', { n: numFmt(r.meses || 3) })], [t('pcx_x_filtros'), filtrosTexto()], [t('pcx_x_quando'), new Date().toISOString().replace('T', ' ').slice(0, 16)]]);
    baixar(xlsx([{ nome: t('pcx_x_resumo'), linhas: resumo }, { nome: t('pcx_x_dados'), linhas: [cab].concat(dados) }]), 'purchase-planning-' + pcxRef() + '.xlsx');
  } else pdfRel(L, tt, nForn);
}
function celula(x, c) { const v = x[c[1]]; return c[1] === 'qtd' || c[1] === 'qtd_comprar' ? pcuQtd(x, Number(v) || 0, te) : c[1] === 'status' ? statusTxt(v, te) : c[1] === 'data_ideal' ? (v && x.qtd_comprar > 0 ? dataEN(v) : '—') : c[1] === 'valor_est' ? (v == null ? '—' : brl(Number(v))) : c[2] ? (v == null ? '—' : numFmt(Math.round(Number(v)))) : (v == null ? '—' : String(v)); }
export function docDados(L, tt, nForn) {
  const vc = verCusto(), cols = [['pcp_c_sku', 'sku'], ['pcp_c_prod', 'nome'], ['pcp_c_forn', 'fornecedor'], ['pcp_c_est', 'qtd', 1], ['pcp_d_transito', 'em_transito', 1], ['pcp_c_media', 'media_mes', 1], ['pcp_c_dias', 'dias_cobertura', 1], ['pcp_c_qtd', 'qtd_comprar', 1], ['pcp_c_data', 'data_ideal'], ['pcp_c_status', 'status']].concat(vc ? [['pcp_t_valor', 'valor_est', 1]] : []);
  const num = []; cols.forEach((c, i) => { if (c[2]) num.push(i + 1); });
  return { num, marca: te('marca_longa'), titulo: te('pcx_pdf_tit'), subtitulo: te('pcx_pdf_sub') + ' · ' + L.length, filtros: filtrosTexto(te), rodape: te('marca_longa') + ' · ' + te('pcx_pdf_rodape'), arquivo: 'purchase-planning-' + pcxRef(),
    meta: [[te('pcx_x_quando'), dataEN(new Date().toISOString())], [te('pcx_x_skus'), numFmt(tt.skus_comprar || 0)], [te('pcx_x_pecas'), numFmt(tt.pecas || 0)]].concat(vc ? [[te('pcx_x_valor'), brl(Number(tt.valor) || 0)]] : []).concat([[te('pcx_x_forns'), String(nForn)]]),
    cabecalho: ['#'].concat(cols.map(c => te(c[0]))), linhas: L.map((x, i) => [String(i + 1)].concat(cols.map(c => celula(x, c)))) };
}
function pdfRel(L, tt, nForn) {
  const d = docDados(L, tt, nForn), cls = i => i === 0 ? 'rn' : d.num.indexOf(i) >= 0 ? 'num' : '';
  const h = '<div class="doc-print pa4"><div class="doc-topo"><div><div class="doc-marca">' + esc(d.marca) + '</div><div class="doc-tipo">' + esc(d.titulo) + '</div></div><div class="doc-meta">' + d.meta.map(m => '<div><span>' + esc(m[0]) + '</span><b>' + esc(m[1]) + '</b></div>').join('') + '</div></div>' +
    '<div class="doc-sub">' + esc(d.subtitulo) + '<div class="doc-flt">' + esc(d.filtros) + '</div></div><table class="doc-tbl pcx-doc"><thead><tr>' + d.cabecalho.map((c, i) => '<th' + (i === 2 ? ' style="width:28%"' : '') + ' class="' + cls(i) + '">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
    d.linhas.map(l => '<tr>' + l.map((c, i) => '<td class="' + cls(i) + '">' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table><div class="doc-pe">' + esc(d.rodape) + '</div></div>';
  B.injetarCss(); printOpen(h, d.arquivo);
}
