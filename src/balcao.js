/* ============================================================
 *  🏪 Shipping UPS (카운터) — 옛 THE ONE CORP WMS 의 Shipping UPS 화면을 그대로 (레이아웃 · 글꼴 · 키보드 · 문구)
 *    가게 찾기 (없으면 🆕 고객 등록) → (가게에 세일즈맨이 없으면 "누가 팔았나" 고르기) → 박스마다 무게 · 크기 (Enter 로 다음 칸, 높이에서 Enter = 저장)
 *    · Empty Display 상품으로 박스 (한 개 = 박스 하나, 상품의 배송 무게 · 크기 prodExtra) → 요금 자동 → COD → 🖨 라벨
 *    UPS 는 기존과 같이 shipq → apps-script/UPS.gs (1분 안에 처리) · 주문 없는 출고라 adhoc/{id} 에 남음
 *    요금 · 라벨이 "바로" 가 아니라 1분 안팎인 것은 UPS.gs 가 1분마다 돌기 때문 (옛 앱은 서버 함수로 즉시)
 *    라벨: GIF 는 4×6 으로 다듬어 인쇄 · ZPL · PDF (설정 settings/app.ups.labelFmt) 는 내려받기 (옛 envBaixarEtiquetas)
 *    오류 창: UPS 키 없음 · 필요한 정보 없음 · 라벨은 나왔는데 기록 실패(orphan) · 응답 없음 — 옛 문구 그대로 (balcao-txt.js)
 *    🧪 UPS 시험 서버(UPS_ENV=test)면 화면 맨 위에 노란 띠 (shipq st:'env' 로 한 번 물음 — 옛 ups-ambiente)
 * ============================================================ */
import { $, esc, money, toast, confirmBox, bt, today, printOpen, Router } from './ui.js';
import { newId } from './db.js';
import { can, isTop } from './main.js';
import { searchAccounts, patchAccountCache } from './accounts.js';
import { adrKey } from './fulfill.js';
import { bumpAccountsVer } from './mgr.js';
import { shipmentsOf, groupShipments } from './track.js';
import { SB_CSS, SH_CSS, SB2_CSS } from './balcao-css.js';
import { LANG } from './i18n.js';
import { abertasDe, marcarEnviadas } from './notesups.js';
import { D as TXT } from './balcao-txt.js';
import { filaExpedicao, paginaHTML, direta as prtDireta, seloHTML as prtSeloHTML, ligarSelo as prtLigarSelo } from './prtq.js';
/* 숫자가 끼는 문구 · Enter 같은 영어가 섞인 문구는 사전 바꿔 끼우기가 어색해서 언어별로 바로 */
export const L3 = (ko, en, pt) => LANG === 'pt' ? pt : LANG === 'en' ? en : bt(ko, en);
/** 옛 문구 (balcao-txt.js) — {n} 같은 자리는 v 로 */
const tx = (k, v) => { const r = TXT[k]; let s = r ? L3(r[0], r[1], r[2]) : k; if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(String(v[x])); }); return s; };
export const ICO = {
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  entra: '<path d="M12 3v9"/><polyline points="8 8 12 12 16 8"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  sai2: '<path d="M12 12V3"/><polyline points="8 7 12 3 16 7"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
  venda: '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L22 7H6"/>',
  busca: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>',
  filtro: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  esq: '<polyline points="15 18 9 12 15 6"/>',
  mais: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  troca: '<path d="M3 9a9 9 0 0 1 14.5-4.5L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 15a9 9 0 0 1-14.5 4.5L3 16"/><polyline points="3 21 3 16 8 16"/>',
  peso: '<path d="M6.5 8h11l2.3 12.2a1.5 1.5 0 0 1-1.5 1.8H5.7a1.5 1.5 0 0 1-1.5-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  setaH: '<path d="M3 12h18M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5"/>',
  setaV: '<path d="M12 3v18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5"/>',
  repetir: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><polyline points="3 21 3 16 8 16"/>',
  lapis: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  caixa: '<path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/>',
  print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  dir: '<polyline points="9 18 15 12 9 6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  predio: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"/>',
  tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  user: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  link: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};
export const svg = (p, n) => '<svg width="' + (n || 17) + '" height="' + (n || 17) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const num1 = n => { n = Number(n) || 0; return (Math.round(n * 10) / 10).toString(); };
export const SVCS = [['03', 'UPS Ground'], ['12', 'UPS 3 Day Select'], ['02', 'UPS 2nd Day Air'], ['59', 'UPS 2nd Day Air A.M.'], ['13', 'UPS Next Day Air Saver'], ['01', 'UPS Next Day Air'], ['14', 'UPS Next Day Air Early']];
export const svcName = c => (SVCS.find(x => x[0] === String(c)) || [c, 'UPS ' + c])[1];
export const SB_OK_MS = 2000;

let S = null;
/* 카운터 상태 — 화면을 다시 그려도 남음
 *   vend: { 가게: 세일즈맨 } — 가게에 세일즈맨이 없을 때 고른 사람 (옛 S.vendSel) · dest: { 가게: 이번 출고만의 배송지 } (옛 Editar destino)
 *   prods: 고른 Empty Display [{ c, q }] · env: 'test' | 'live' (UPS.gs 서버) · cred: false = UPS 키 없음 · dl: 내려받은 라벨 파일 이름 (시험용) */
const B = { cli: '', busca: '', cx: {}, caixas: [], svc: '03', cod: null, codValor: '', codCli: '', cot: null, cotBusy: false, cotSeq: 0, cotTimer: null, av: {}, emit: false, hist: {}, notas: {}, sel: {}, ords: {}, oSel: {},
  vend: {}, dest: {}, prods: [], prodBusca: '', ex: null, env: null, cred: null, envAsked: false, filaN: null, dl: [] };
export function register(state) { S = state; Router.on('balcao', page); }
/** ✏️ Shipping History 의 "출고 고치기" — 옛 라벨은 취소한 뒤 같은 가게 · 박스 · 서비스 · COD 로 카운터를 엶 */
export function abrirEdicao(acct, caixas, svc, cod, de) { zerar(); B.cli = acct; B.busca = ''; B.caixas = caixas.map(c => ({ peso: c.peso, c: c.c, l: c.l, a: c.a })); B.svc = svc || '03'; B.codCli = acct; B.cod = cod ? true : null; B.codValor = cod ? String(cod) : ''; B.editando = de || ''; Router.go('balcao'); }
export const _B = B;   // 시험용
/** 🧾 인보이스가 나온 주문을 이 카운터로 — 주문 화면의 🚚 출고 · UPS 출고 목록에서 (v0.8.209: 인보이스 뒤 UPS 출고를 이 화면 하나로) */
export function abrirPedido(o) { zerar(); B.cli = o.acct; B.busca = ''; B.editando = ''; B.sel = {}; delete B.ords[o.acct]; B.oSel = { [o.id]: true }; B.oPre = o.id; B.foco = 'sbP'; Router.go('balcao'); }

const acctOf = c => (S.accounts && S.accounts.byCode ? S.accounts.byCode[c] : null);
const cliAtual = () => B.cli ? acctOf(B.cli) : null;
/* 권한 — 옛 GERENTE || GERENTE1: 배송지 수정 · 고객 등록 (피킹은 안 보임) · 거래처 쓰기(규칙 opsJob)와 같은 사람만 고객 정보에 저장 */
const podeGerente = () => isTop() || can('assign');
const podeGravarCli = () => { if (S.role === 'admin' || S.role === 'owner') return true; if (S.role !== 'manager') return false; return ['office', 'acct', 'pickinv', 'invoice', 'whmgr', 'pick'].includes((S.me && S.me.job) || 'office'); };
const podeEstoque = () => can('items');

export function css() { if (document.getElementById('sbCss')) return; const st = document.createElement('style'); st.id = 'sbCss'; st.textContent = SB_CSS + SH_CSS + SB2_CSS; document.head.appendChild(st); }

/* ---------- 🧪 UPS 서버 (옛 ups-ambiente · upsSeloTesteHTML) — 시험 서버일 때만 띠, 실제(live)는 아무것도 안 붙임 ---------- */
try { const v = localStorage.getItem('theone.upsEnv'); if (v === 'test' || v === 'live') B.env = v; } catch (e) {}
function guardarEnv(env, cred) {
  if (env === 'test' || env === 'live') { B.env = env; try { localStorage.setItem('theone.upsEnv', env); } catch (e) {} }
  if (cred === true || cred === false) B.cred = cred;
  const el = document.getElementById('sbTeste'); if (el) el.innerHTML = seloTesteHTML();
}
function seloTesteHTML() { return B.env !== 'test' ? '' : '<div class="aviso ups-teste">' + svg(ICO.ajuda, 16) + '<div><b>' + esc(tx('ups_teste_tit')) + '</b>' + esc(tx('ups_teste_txt')) + '</div></div>'; }
async function pedirEnv() {
  if (B.envAsked) return; B.envAsked = true;
  const id = 'ENV-BAL-' + Date.now().toString(36);
  try { await S.DB.set('shipq', id, { st: 'env', kind: 'env', orderId: '', by: S.user.email, createdAt: new Date().toISOString() }); const x = await esperar(id, ['envdone'], [], 40); if (x) guardarEnv(x.env, x.cred); } catch (e) {}
}

/* ---------- 박스 ---------- */
const cxCompleta = () => { const c = B.cx; return Number(c.peso) > 0 && Number(c.c) > 0 && Number(c.l) > 0 && Number(c.a) > 0; };
const cxAndando = () => { const c = B.cx; return Number(c.peso) > 0 || Number(c.c) > 0 || Number(c.l) > 0 || Number(c.a) > 0; };
/** 지금 보낼 박스 — 저장한 것 + 입력 중인 것(완성됐을 때) */
export function caixasVivas() { const L = B.caixas.slice(); if (cxCompleta()) L.push({ peso: B.cx.peso, c: B.cx.c, l: B.cx.l, a: B.cx.a }); notasSel().forEach(n => L.push({ peso: n.w, c: n.l, l: n.wd, a: n.h, nota: n.id, prod: n.prod || '' })); return L; }
/** 📦 Notes UPS — 이 가게의 대기 박스 중 고른 것 (카운터 박스 다음에 붙음 — 옛 앱 순서) */
const notasSel = () => ((B.notas[B.cli] || []).filter(n => B.sel[n.id]));
function notasHTML(a) {
  const L = B.notas[a.acct];
  let h = '<h4 class="ups-h4">' + esc(tx('su_do_notes')) + (L && L.length ? ' · ' + L.length + ' <button type="button" class="btn sm" data-act="sb-notas-tudo" style="margin-left:8px">' + (L.every(n => B.sel[n.id]) ? L3('모두 빼기', 'Unmark all', 'Desmarcar todas') : L3('모두 넣기 (A)', 'Mark all (A)', 'Marcar todas (A)')) + '</button>' : '') + '</h4>';
  if (!L) return h + '<div class="graf-vazio">' + esc(tx('carregando')) + '</div>';
  if (!L.length) return h + '<div class="graf-vazio">' + esc(tx('su_sem_notes')) + '</div>';
  return h + '<div class="aviso" style="margin:0 0 10px">' + svg(ICO.caixa, 16) + '<div>' + esc(tx('su_tem', { n: L.length })) + '</div></div><div class="su-notas">' +
    L.map((n, i) => '<label class="su-nota"><input type="checkbox" data-sb-nota="' + esc(n.id) + '"' + (B.sel[n.id] ? ' checked' : '') + '><span><b>' + (i + 1) + '/' + L.length + '</b> · ' + num1(n.w) + ' lb · ' + num1(n.l) + ' × ' + num1(n.wd) + ' × ' + num1(n.h) + ' in' + (n.prod ? '<span class="su-nota-prods">' + esc(tx('su_nota_prods')) + ' ' + esc(n.prod) + '</span>' : '') + '</span></label>').join('') + '</div>' +
    '<div class="nu-enter">' + esc(tx('su_atalho')) + '</div>';
}
/* ---------- 🧾 이 가게의 출고할 주문 (인보이스 발행 · 포장 대기 = st 'done') — 고른 주문은 라벨이 나오면 📦 포장 완료(packed) · 트래킹이 붙음 → 🚛 UPS 인계 (v0.8.209)
 *   다른 주소(shipTo)로 가는 주문은 거래처 주소로 라벨이 나가면 안 되므로 여기서 고를 수 없음 → 주문 화면의 예전 출고 창 */
const ordsSel = () => ((B.ords[B.cli] || []).filter(o => B.oSel[o.id] && !o.shipTo));
function ordsHTML(a) {
  const L = B.ords[a.acct]; if (!L || !L.length) return '';
  return '<h4 class="ups-h4">🧾 ' + L3('이 가게의 출고할 인보이스', 'Invoices to ship for this store', 'Faturas a enviar desta loja') + ' · ' + L.length + '</h4><div class="su-ords">' +
    L.map(o => '<label class="su-nota"' + (o.shipTo ? ' style="opacity:.55"' : '') + '><input type="checkbox" data-sb-ord="' + esc(o.id) + '"' + (B.oSel[o.id] && !o.shipTo ? ' checked' : '') + (o.shipTo ? ' disabled' : '') + '><span><b>' + esc((o.invs || []).join(', ') || o.no || o.id) + '</b> · ' + money(o.amt || 0) + (o.pay ? ' · ' + esc(o.pay) : '') + (o.shipTo ? ' · <i>' + L3('다른 주소 — 주문 화면에서 출고', 'Other address — ship from the order', 'Outro endereço — enviar pelo pedido') + '</i>' : '') + '</span></label>').join('') +
    '<div class="nu-enter">' + L3('고른 인보이스는 라벨이 나오면 📦 포장 완료 · 트래킹이 붙고 🚛 UPS 인계로 넘어갑니다', 'Checked invoices become packed with the tracking # and move to UPS pickup', 'As faturas marcadas ficam embaladas com o rastreio e vão para a coleta UPS') + '</div></div>';
}
async function carregarOrds(a) {
  let L = []; try { L = (await S.DB.list('orders', { where: [['acct', '==', a.acct], ['st', '==', 'done']] })).filter(o => !o.void); } catch (e) { L = []; }
  L.sort((x, y) => String(x.doneAt || '').localeCompare(String(y.doneAt || '')));
  /* 처음 열 때: 주문에서 넘어왔으면 그 주문만 · 아니면 다른 주소가 아닌 것 모두 */
  if (!B.oPre) L.forEach(o => { if (!(o.id in B.oSel) && !o.shipTo) B.oSel[o.id] = true; }); B.oPre = '';
  B.ords[a.acct] = L; if (cliAtual() === a && L.length) page();
}
async function carregarNotas(a) { try { B.notas[a.acct] = await abertasDe(a.acct); } catch (e) { B.notas[a.acct] = []; } if (cliAtual() === a) page(); }
function notasTudo(avisar) { const L = B.notas[B.cli] || []; const tudo = L.every(n => B.sel[n.id]); L.forEach(n => { B.sel[n.id] = !tudo; }); if (avisar) toast(tx(tudo ? 'su_nenhuma' : 'su_todas')); page(); }
const medTxt = c => (Number(c.c) > 0 && Number(c.l) > 0 && Number(c.a) > 0) ? num1(c.c) + ' × ' + num1(c.l) + ' × ' + num1(c.a) + ' in' : '';
const assin = (a, L) => JSON.stringify(para(a)) + '#' + JSON.stringify(L.map(c => [Number(c.peso), Number(c.c), Number(c.l), Number(c.a)]));

/* ---------- 👤 누가 팔았나 (옛 vendGradeHTML · suVendDaLoja) — 가게에 세일즈맨이 없으면 박스 전에 고름 · 고른 사람은 출고(adhoc · shipq · shipments)의 sm
 *   주문 화면(v0.8.188 "기본 세일즈맨 없는 가게")과 같은 규칙: 고를 수 있는 사람은 등록된(active) 세일즈맨 · 거래처를 고칠 수 있는 사람이면 "가게 기본값으로 저장" (체크되어 있음) */
const smAtivos = () => (S.sms || []).filter(x => x && x.code && x.active !== false);
function vendDaLoja(a) { const n = String(a && a.sm || '').trim().toUpperCase(), L = smAtivos(); return n && (!L.length || L.some(x => String(x.code).toUpperCase() === n)) ? n : ''; }   // 목록을 못 읽었으면 가게 값을 믿음
const vendAtual = a => vendDaLoja(a) || B.vend[a.acct] || '';
const vendNome = c => { const x = S.smByCode && S.smByCode[c]; return x && x.name && x.name !== c ? c + ' (' + x.name + ')' : c; };
const vendIni = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0)).join('').toUpperCase();
function vendGradeHTML() {
  const L = smAtivos();
  return '<div class="panel vend-painel"><h2 class="pal-novo-h">' + svg(ICO.user, 15) + ' ' + esc(tx('vend_quem_loja')) + '</h2><p class="pal-dica">' + esc(tx('vend_sub_loja')) + '</p>' +
    (L.length ? '<div class="vend-grade">' + L.map(v => '<button type="button" class="vend-op" data-act="vend-sel" data-vend="' + esc(v.code) + '"><span class="vend-av">' + esc(vendIni(v.code)) + '</span><b>' + esc(vendNome(v.code)) + '</b></button>').join('') + '</div>' +
      (podeGravarCli() ? '<label class="vend-guardar"><input type="checkbox" id="sbVendKeep" checked> ' + esc(tx('vend_guardar')) + '</label>' : '') : '<div class="graf-vazio">' + esc(tx('vend_vazio')) + '</div>') + '</div>';
}
function vendChipHTML(a) {
  const v = vendAtual(a), daLoja = !!vendDaLoja(a); if (!v) return '';
  return '<div class="vend-chip' + (daLoja ? ' vend-chip-loja' : '') + '"><span class="vend-av">' + esc(vendIni(v)) + '</span><span class="vend-chip-t">' + esc(tx(daLoja ? 'vend_rot_loja' : 'vend_rot')) + '</span><b>' + esc(vendNome(v)) + '</b>' +
    (daLoja ? '' : '<button type="button" class="btn sm" data-act="vend-trocar">' + esc(tx('vend_trocar')) + '</button>') + '</div>';
}
async function vendEscolher(a, code, guardar) {
  B.vend[a.acct] = code; B.foco = 'sbP';
  if (guardar && podeGravarCli() && !String(a.sm || '').trim()) {
    try { await S.DB.update('accounts', a.acct, { sm: code, smAt: new Date().toISOString(), smBy: S.user.email }); patchAccountCache(S, a.acct, { sm: code }); toast(tx('vend_gravado') + ' ' + code, 'good'); } catch (e) { toast(tx('vend_nao_gravou') + ' ' + (e.code || e.message || ''), 'bad'); }
  }
  page();
}

/* ---------- ✏️ Editar destino (옛 su-editar) — 이번 출고만의 배송지 · 원하면 고객 정보에도 ---------- */
const destDe = a => B.dest[a.acct] || null;
function abrirDestino(a) {
  const d = Object.assign({ store: a.store || '', attn: a.contact || '', tel: a.tel || '', addr: a.addr || '', addr2: a.addr2 || '', city: a.city || '', state: a.state || '', zip: a.zip || '', res: false }, destDe(a) || {});
  const f = (id, k, v, full, ty) => '<div class="field' + (full ? ' full' : '') + '"><label>' + esc(tx(k)) + '</label><input id="' + id + '"' + (ty ? ' type="' + ty + '"' : '') + ' autocomplete="off" value="' + esc(v || '') + '"></div>';
  const m = modal(tx('dest_tit'), '<div class="aviso" style="margin:0 0 12px">' + svg(ICO.pin, 16) + '<div>' + esc(tx('dest_txt')) + '</div></div><div class="grid2">' +
    f('sbDNome', 'cl_nome', d.store, true) + f('sbDAttn', 'cl_contato', d.attn) + f('sbDTel', 'cl_tel', d.tel, false, 'tel') + f('sbDEnd', 'cl_end', d.addr, true) + f('sbDEnd2', 'cl_end2', d.addr2, true) +
    f('sbDCid', 'cl_cidade', d.city) + f('sbDEst', 'cl_estado', d.state) + f('sbDCep', 'cl_cep', d.zip) + '</div>' +
    '<label class="sb-mdl-ck"><input type="checkbox" id="sbDRes"' + (d.res ? ' checked' : '') + '> ' + esc(tx('dest_res')) + '</label>' +
    (podeGravarCli() ? '<label class="sb-mdl-ck"><input type="checkbox" id="sbDGrava"> ' + esc(tx('dest_gravar')) + '</label>' : ''),
    '<button type="button" class="btn" data-mdl="x">' + esc(tx('cancelar')) + '</button><button type="button" class="btn primary" id="sbDOk">' + esc(tx('salvar')) + '</button>');
  const q = id => m.el.querySelector('#' + id), v = id => String(q(id) ? q(id).value : '').trim();   /* 칸은 이 창 안에서만 찾음 */
  try { q('sbDEnd').focus(); } catch (e) {}
  q('sbDOk').onclick = async () => {
    const x = { store: v('sbDNome').toUpperCase(), attn: v('sbDAttn').toUpperCase(), tel: v('sbDTel'), addr: v('sbDEnd').toUpperCase(), addr2: v('sbDEnd2').toUpperCase(), city: v('sbDCid').toUpperCase(), state: v('sbDEst').toUpperCase().substring(0, 2), zip: v('sbDCep'), res: !!(q('sbDRes') && q('sbDRes').checked) };
    if (!x.addr || !x.city || !x.state || !x.zip) return toast(tx('dest_falta'), 'bad');
    const grava = !!(q('sbDGrava') && q('sbDGrava').checked);
    if (grava) {
      const patch = { addr: x.addr, addr2: x.addr2, city: x.city, state: x.state, zip: x.zip, tel: x.tel, contact: x.attn, addrPrev: { addr: a.addr || '', addr2: a.addr2 || '', city: a.city || '', state: a.state || '', zip: a.zip || '' }, updatedAt: new Date().toISOString(), addrBy: S.user.email };
      try { await S.DB.update('accounts', a.acct, patch); delete patch.addrPrev; patchAccountCache(S, a.acct, patch); try { await bumpAccountsVer(); } catch (e) {} toast(tx('dest_gravado'), 'good'); delete B.dest[a.acct]; }
      catch (e) { return toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
      if (x.store !== String(a.store || '').toUpperCase() || x.res) B.dest[a.acct] = { store: x.store, attn: x.attn, res: x.res };
    } else B.dest[a.acct] = x;
    delete B.av[a.acct]; B.cot = null; m.fecha(); page();
  };
}

/* ---------- COD ---------- */
const codSugerido = a => !!a && String(a.terms || '').trim().toUpperCase() === 'COD';
function codAtivo(a) { if (!a) return false; if (B.codCli !== a.acct) { B.codCli = a.acct; B.cod = null; B.codValor = ''; } return B.cod == null ? codSugerido(a) : !!B.cod; }
export function codCentavos(v) { const s = String(v == null ? '' : v).trim().replace(/,/g, ''), m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s); if (!m || m[1].length > 12) return null; return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0')); }
const codTexto = c => Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');
function codParaEnvio(a) {
  if (!codAtivo(a)) return null;
  const bruto = $('sbCodValor') ? $('sbCodValor').value : B.codValor;
  if (!String(bruto || '').trim()) return { erro: tx('su_cod_falta') };
  const c = codCentavos(bruto);
  if (c == null || c < 1) return { erro: tx('su_cod_invalido') };
  if (c > 5000000) return { erro: tx('su_cod_max') };
  return { ativo: true, valor: codTexto(c) };
}

/* ---------- UPS 요청 (shipq — UPS.gs 가 1분 안에 처리) ---------- */
function para(a) {
  const d = destDe(a) || {}, x = Object.assign({}, a, d);
  return { name: x.store || '', attn: d.attn || x.contact || x.store || '', phone: x.tel || '', email: a.email || '', addr1: x.addr || '', addr2: x.addr2 || '', addr3: '', city: x.city || '', state: String(x.state || '').toUpperCase(), zip: x.zip || '', res: !!d.res };
}
const fmtPedido = () => { const f = String((S.settings && S.settings.ups && S.settings.ups.labelFmt) || 'GIF').toUpperCase(); return ['GIF', 'ZPL', 'PDF'].includes(f) ? f : 'GIF'; };
function payload(a, L, extra) {
  return Object.assign({ orderId: '', dispId: '', adhocId: '', no: '', acct: a.acct || '', store: a.store || '', sm: vendAtual(a) || a.sm || '', invs: [], by: S.user.email, svc: B.svc, fmt: fmtPedido(),
    to: para(a), fromX: null, opt: { sat: false, sig: '', notify: false }, bill: { type: 'ship' }, desc: 'JEWELRY & ACCESSORIES',
    boxes: L.map(c => ({ w: Number(c.peso), l: Number(c.c), wd: Number(c.l), h: Number(c.a), pkg: '02', val: '', ref2: String(c.prod || '').substring(0, 35), invs: [] })),
    ref: ('#' + (a.acct || '') + ' ' + (a.store || '')).substring(0, 35) }, extra || {});
}
async function esperar(id, ok, err, max) {
  for (let i = 0; i < (max || 45); i++) { await sleep(3000); let x = null; try { x = await S.DB.get('shipq', id); } catch (e) {} if (x && ok.includes(x.st)) return x; if (x && err.includes(x.st)) return x; }
  return null;
}
/* UPS 키가 없을 때 UPS.gs 가 적는 문구 (upsToken_) */
const semCred = err => /UPS_CLIENT_ID|UPS_CLIENT_SECRET|UPS_ACCOUNT/.test(String(err || ''));

/* ---------- 요금 (자동) ---------- */
function cotarAoVivo() {
  clearTimeout(B.cotTimer);
  const a = cliAtual(); if (!a) return;
  const L = caixasVivas();
  if (!L.length) { B.cotSeq++; B.cot = null; B.cotBusy = false; return pintarPreco(); }
  const s = assin(a, L);
  if (B.cot && !B.cot.erro && B.cot.assin === s) return pintarPreco();
  B.cotBusy = true; pintarPreco();
  B.cotTimer = setTimeout(() => cotar(a, L, s), 900);
}
async function cotar(a, L, s) {
  const seq = ++B.cotSeq, id = 'RT-BAL-' + a.acct + '-' + Date.now().toString(36);
  B.cotBusy = true; pintarPreco();
  let r = null;
  try { await S.DB.set('shipq', id, Object.assign(payload(a, L), { st: 'rate', kind: 'rate', createdAt: new Date().toISOString() })); r = await esperar(id, ['ratedone'], ['rateerr'], 45); } catch (e) { r = { st: 'rateerr', err: String(e.code || e.message) }; }
  if (seq !== B.cotSeq) return;
  B.cotBusy = false;
  if (r && r.env) guardarEnv(r.env);
  if (r && r.st === 'rateerr' && semCred(r.err)) guardarEnv(null, false);
  B.cot = !r ? { erro: bt('UPS 가 답하지 않습니다 — 잠시 뒤 다시', 'No answer from UPS — try again') } : r.st === 'rateerr' ? { erro: 'UPS: ' + (r.err || '') } : { servicos: r.rates || [], ambiente: r.env || B.env || '' };
  B.cot.assin = s; B.cot.n = L.length;
  pintarPreco();
}
const servAtual = () => { const L = (B.cot && B.cot.servicos) || []; return L.find(x => String(x.svc) === String(B.svc)) || { svc: B.svc, name: svcName(B.svc), total: null }; };
const dataCurta = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? (LANG === 'pt' ? m[3] + '/' + m[2] : m[2] + '/' + m[3]) : ''; };
/* "2 dias úteis · chega 13/09" — o que a UPS souber (옛 suPrazoTxt) */
const prazo = x => { const p = []; if (x && x.days) p.push(tx('su_cot_dias', { n: x.days })); if (x && x.arrive) p.push(tx('su_cot_chega', { d: dataCurta(x.arrive) })); return p.join(' · ') || tx('su_cot_sem_prazo'); };

function pintarPreco() {
  const area = $('sbPreco'); if (!area) return;
  const L = caixasVivas(), base = B.cot && B.cot.servicos ? B.cot : null, sv = servAtual(), tem = !!(base && sv.total);
  const st = B.cotBusy ? ['esp', tx('su_cot_atualizando') + ' ' + L3('(UPS 1분 안팎)', '(about 1 min)', '(cerca de 1 min)'), 1] : B.cot && B.cot.erro ? ['erro', B.cot.erro] : base ? ['ok', tx('su_cot_agora')] : ['esp', tx('su_cot_espera')];
  area.innerHTML = '<div class="su-frete-main' + (B.cotBusy ? ' atualizando' : '') + '"><div><div class="su-frete-rot">' + esc(tx('env_frete')) + '</div>' +
    '<div class="su-frete-valor">' + (tem ? esc(money(sv.total)) : '—') + '</div><div class="su-frete-nome">' + esc(sv.name || svcName(sv.svc)) +
    /* o selo "negociada" so vale em producao (옛 suPintarPreco) */
    (tem && sv.neg && base && base.ambiente !== 'test' ? '<span class="su-tag">' + esc(tx('su_negociada')) + '</span>' : '') + '</div>' +
    '<div class="su-frete-prazo">' + (tem ? esc(prazo(sv)) : '') + '</div>' + (L.length > 1 ? '<div class="su-preco-tit">' + esc(tx('su_preco_envio', { n: L.length })) + '</div>' : '') +
    '</div><div class="su-ups-selo">UPS</div></div><div class="su-frete-st ' + st[0] + '">' + (st[2] ? '<span class="fb-spin"></span>' : '') + esc(st[1]) + '</div>';
  const det = $('sbPrecoDet'); if (det) det.innerHTML = base && base.ambiente === 'test' ? '<div class="hint">' + esc(tx('su_cot_teste')) + '</div>' : '';
  pintarOutros(); pintarResumo(L);
}
function pintarOutros() {
  const area = $('sbCotacao'); if (!area) return;
  const T = (B.cot && B.cot.servicos) || [], L = T.filter(x => String(x.svc) !== String(B.svc));
  if (B.cot && B.cot.servicos && !T.length) { area.innerHTML = '<div class="hint">' + esc(tx('su_cot_vazio')) + '</div>'; return; }
  area.innerHTML = !L.length ? '' : '<div class="su-cot' + (B.cotBusy ? ' atualizando' : '') + '">' + L.map(x => '<button type="button" class="su-cot-op" data-sb-cot="' + esc(x.svc) + '"><span class="su-cot-nome">' + esc(x.name) + '</span><span class="su-cot-prazo">' + esc(prazo(x)) + '</span><span class="su-cot-preco">' + (x.total ? esc(money(x.total)) : '') + '</span></button>').join('') + '</div>';
  area.querySelectorAll('[data-sb-cot]').forEach(b => b.onclick = () => { B.svc = b.dataset.sbCot; if ($('sbServico')) $('sbServico').value = B.svc; pintarPreco(); });
}
function pintarResumo(L) {
  const el = $('sbResumo'); if (!el) return;
  const peso = L.reduce((s, c) => s + (Number(c.peso) || 0), 0), ult = L[L.length - 1];
  el.innerHTML = L.length ? '<b>' + esc(tx('su_resumo', { n: L.length, p: num1(peso) })) + '</b><span>' + esc((medTxt(ult) || '—') + ' | ' + num1(ult.peso) + ' lb') + (L.length > 1 ? ' · ' + esc(tx('su_prev_ultima', { n: L.length })) : '') + '</span>' : '<b>' + esc(tx('su_resumo_vazio')) + '</b><span>&nbsp;</span>';
  const bt1 = document.querySelector('.sb [data-act="sb-finalizar"]');
  if (bt1) { bt1.disabled = !L.length || B.emit; bt1.innerHTML = svg(ICO.print, 17) + ' ' + esc(L.length ? tx('su_finalizar_n', { n: L.length }) : tx('su_finalizar')) + ' ' + svg(ICO.dir, 16); }
  const bc = document.querySelector('.sb [data-act="sb-cotar"]'); if (bc) bc.disabled = !L.length;
  const n = document.querySelector('.sb .ups-cli-cx b'); if (n) n.textContent = L.length;
}

/* ---------- 주소 확인 (가게를 고르면 자동, 한 번 · 확인된 주소는 거래처에 표시해 두고 다시 묻지 않음 — 옛 endereco_valid) ---------- */
const tipoTxt = c => /resid/i.test(c || '') ? tx('cl_tipo_residencial') : /commerc/i.test(c || '') ? tx('cl_tipo_comercial') : String(c || '');
const jaValido = a => !destDe(a) && a.addrOk && a.addrOk === adrKey(para(a));
export function verHTML(a) {
  if (jaValido(a)) return '<span class="cl-selo ok">✓ ' + esc(tx('cl_ver_valido')) + (a.addrCls ? ' · ' + esc(tipoTxt(a.addrCls)) : '') + '</span>';
  const v = B.av[a.acct];
  if (!v) return '<button type="button" class="btn sm" data-act="sb-ver">' + esc(tx('cl_ver_btn_curto')) + '</button>';
  if (v.st === 'wait') return '<span class="cl-selo off"><span class="fb-spin"></span> ' + esc(tx('cl_ver_consultando')) + '</span>';
  if (v.st === 'error') return '<span class="cl-selo out">' + esc(v.err || '') + '</span> <button type="button" class="btn sm" data-act="sb-ver">' + esc(tx('cl_ver_btn_curto')) + '</button>';
  const same = (v.cands || []).some(c => adrKey(c) === adrKey(para(a)));
  if (v.valid && same) return '<span class="cl-selo ok">✓ ' + esc(tx('cl_ver_valido')) + (v.cls ? ' · ' + esc(tipoTxt(v.cls)) : '') + '</span>';
  const c = (v.cands || [])[0];
  if (v.none || !c) return '<div class="su-ver-faixa out">' + svg(ICO.x, 14) + ' <b>' + esc(v.semDados ? tx('su_ver_sem_dados') : tx('cl_ver_nenhum')) + '</b> ' + esc(tx('su_ver_confira')) + '</div>';
  return '<div class="su-ver-faixa av"><div>' + svg(ICO.pin, 14) + ' <b>' + esc(tx('su_ver_sugere')) + '</b><span>' + esc([c.addr1, c.addr2].filter(Boolean).join(', ')) + '<br>' + esc([c.city, c.state, c.zip].filter(Boolean).join(', ')) + (c.cls ? ' · ' + esc(tipoTxt(c.cls)) : '') + '</span>' +
    ((v.cands || []).length > 1 ? '<i class="hint">' + esc(tx('su_ver_outros', { n: v.cands.length - 1 })) + '</i>' : '') + '</div>' +
    (can('items') || S.role === 'admin' || S.role === 'owner' ? '<button type="button" class="btn sm primary" data-act="sb-ver-aplicar">' + esc(tx('su_ver_aplicar')) + '</button>' : '') + '</div>';
}
/** UPS 주소 확인 (Notes UPS · Notes Display 의 가게 카드도 씀 — pinta: 그 화면의 다시 그리기) */
export async function verificar(a, forcar, pinta) {
  const pintarVer = pinta || pintarVer0;
  if (!a || (B.av[a.acct] && !forcar) || (!forcar && jaValido(a))) return;
  const P = para(a);
  if (!P.addr1 && !P.zip) { B.av[a.acct] = { none: true, semDados: true }; return pintarVer(); }
  B.av[a.acct] = { st: 'wait' }; pintarVer();
  const id = 'AV-BAL-' + a.acct + '-' + Date.now().toString(36);
  try { await S.DB.set('shipq', id, { st: 'av', kind: 'av', to: P, orderId: '', by: S.user.email, createdAt: new Date().toISOString() }); const x = await esperar(id, ['avdone'], ['averr'], 40); B.av[a.acct] = !x ? { st: 'error', err: bt('응답 없음', 'No answer') } : x.st === 'averr' ? { st: 'error', err: x.err } : x; }
  catch (e) { B.av[a.acct] = { st: 'error', err: String(e.code || e.message) }; }
  /* válido e igual → marca no cadastro (o selo fica para a próxima vez, enquanto o endereço não mudar) */
  const v = B.av[a.acct];
  if (v && v.valid && !destDe(a) && (v.cands || []).some(c => adrKey(c) === adrKey(para(a))) && podeGravarCli()) { const k = adrKey(para(a)); try { await S.DB.update('accounts', a.acct, { addrOk: k, addrCls: v.cls || '', addrOkAt: new Date().toISOString() }); patchAccountCache(S, a.acct, { addrOk: k, addrCls: v.cls || '' }); } catch (e) {} }
  pintarVer();
}
function pintarVer0() { const a = cliAtual(), el = document.querySelector('.sb .ups-ver'); if (a && el) { el.innerHTML = verHTML(a); ligarVer(); } }
function ligarVer() {
  const a = cliAtual(); if (!a) return;
  document.querySelectorAll('.sb [data-act="sb-ver"]').forEach(b => b.onclick = () => verificar(a, true));
  document.querySelectorAll('.sb [data-act="sb-ver-aplicar"]').forEach(b => b.onclick = async () => { if (await aplicarVer(a)) { B.cot = null; page(); } });
}
/** UPS 추천 주소를 거래처에 적용 — 바꿨으면 true (Notes UPS · Notes Display 도 씀) · 옛 주소는 addrPrev 에, 확인된 표시(addrOk)도 함께 */
export async function aplicarVer(a) {
  const v = B.av[a.acct] || {}, c = (v.cands || [])[0]; if (!c) return false;
  if (!(await confirmBox(bt('거래처 주소를 UPS 추천 주소로 바꿀까요?', 'Replace the customer address with the UPS suggestion?') + '\n' + [c.addr1, c.addr2, c.city, c.state, c.zip].filter(Boolean).join(', '), tx('su_ver_aplicar')))) return false;
  const novo = { addr: c.addr1, addr2: c.addr2 || a.addr2 || '', city: c.city, state: c.state, zip: c.zip };
  try { await S.DB.update('accounts', a.acct, Object.assign({}, novo, { addrPrev: { addr: a.addr || '', addr2: a.addr2 || '', city: a.city || '', state: a.state || '', zip: a.zip || '' }, addrOk: adrKey(Object.assign({}, para(a), { addr1: novo.addr, addr2: novo.addr2, city: novo.city, state: novo.state, zip: novo.zip })), addrCls: c.cls || v.cls || '', updatedAt: new Date().toISOString(), addrBy: S.user.email }));
    Object.assign(a, novo); delete B.dest[a.acct]; a.addrOk = adrKey(para(a)); a.addrCls = c.cls || v.cls || ''; patchAccountCache(S, a.acct, Object.assign({ addrOk: a.addrOk, addrCls: a.addrCls }, novo)); await bumpAccountsVer(); B.av[a.acct] = { valid: true, cands: [para(a)], cls: a.addrCls }; toast(tx('su_ver_aplicado'), 'good'); return true; }
  catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); return false; }
}

/* ---------- 📦 Empty Display — 한 개 = 박스 하나 (상품의 배송 무게 · 크기 prodExtra/{code}) · 라벨이 나오면 재고에서 뺌 (옛 nuProdBlocoHTML · suProdAdicionar) ---------- */
const REC_K = 'theone.sbProdRec';
const recentes = () => { try { return JSON.parse(localStorage.getItem(REC_K) || '[]').filter(Boolean); } catch (e) { return []; } };
async function carregarProdutos() {
  if (B.ex) return;
  B.ex = {};
  try { const C = await import('./catalog.js'); await C.loadCatalog(S); B.cat = C.catalog(); } catch (e) { B.cat = null; }
  try { (await S.DB.list('prodExtra')).forEach(r => { B.ex[r.id] = r; }); } catch (e) {}
  if (cliAtual()) pintarProd();
}
const prodItem = c => (B.cat && B.cat.byCode ? B.cat.byCode[c] : null);
const medida = c => { const e = (B.ex || {})[c] || {}; return { peso: Number(e.peso) || 0, c: Number(e.comp) || 0, l: Number(e.larg) || 0, a: Number(e.alt) || 0 }; };
const temMedida = c => { const m = medida(c); return m.peso > 0 && m.c > 0 && m.l > 0 && m.a > 0; };
/* so EMPTY DISPLAY (옛 nuProdPode) — o novo catálogo guarda a categoria no Level 1 / grupo; produto com peso de envio cadastrado também entra */
const prodPode = it => !!it && !it.h && !it.virt && (/EMPTY\s*DISPLAY/i.test([it.l1, it.g, it.l2].join(' ')) || ((B.ex || {})[it.c] && Number(B.ex[it.c].peso) > 0));
function prodAchados() {
  const q = String(B.prodBusca || '').trim().toUpperCase(), ja = {}; B.prods.forEach(x => { ja[x.c] = 1; });
  if (!q) return { rec: true, itens: recentes().map(prodItem).filter(it => it && !ja[it.c] && prodPode(it)).slice(0, 8) };
  const w = q.split(/\s+/).filter(Boolean);
  return { rec: false, itens: ((B.cat && B.cat.items) || []).filter(it => !ja[it.c] && prodPode(it) && w.every(t => (String(it.c) + ' ' + String(it.d || '')).toUpperCase().includes(t))).slice(0, 8) };
}
function prodResHTML() {
  const a = prodAchados();
  if (!a.itens.length) return '<div id="sbProdRes" class="nu-prod-res">' + (a.rec ? '' : '<span class="nu-prod-nada">' + esc(tx('nu_prod_nada')) + '</span>') + '</div>';
  return '<div id="sbProdRes" class="nu-prod-res">' + (a.rec ? '<span class="nu-prod-rec">' + esc(tx('nu_prod_rec')) + '</span>' : '') +
    a.itens.map(it => '<button type="button" class="nu-prod-sug" data-sb-prod="' + esc(it.c) + '" title="' + esc(it.d || it.c) + '">' + svg(ICO.mais, 12) + ' <b>' + esc(it.c) + '</b>' + (it.d && it.d !== it.c ? '<small>' + esc(it.d) + '</small>' : '') + '</button>').join('') + '</div>';
}
function prodBlocoHTML() {
  if (!podeEstoque()) return '';
  return '<div class="su-prod"><div class="nu-prod"><label class="ups-lbl" for="sbProdBusca">' + esc(tx('nu_prod_tit')) + '</label><div class="nu-prod-sel">' +
    B.prods.map(x => { const it = prodItem(x.c) || { c: x.c }, m = medida(x.c);
      return '<span class="nu-prod-chip"><b>' + esc(it.c) + '</b>' + (it.d && it.d !== it.c ? '<small class="nu-prod-cod">' + esc(it.d) + '</small>' : '') +
        (temMedida(x.c) ? '<small class="nu-prod-med">' + num1(m.peso) + ' lb · ' + esc(medTxt(m)) + '</small>' : '<small class="nu-prod-med falta">' + esc(tx('nu_prod_sem_medida')) + '</small>') +
        '<input class="nu-prod-q" type="number" inputmode="numeric" min="1" step="1" data-sb-pq="' + esc(x.c) + '" placeholder="' + esc(tx('nu_prod_qtd')) + '" aria-label="' + esc(tx('nu_prod_qtd') + ' ' + x.c) + '" value="' + esc(x.q || '') + '"><button type="button" data-sb-ptirar="' + esc(x.c) + '" title="' + esc(tx('nu_prod_tirar')) + '" aria-label="' + esc(tx('nu_prod_tirar')) + '">' + svg(ICO.x, 12) + '</button></span>'; }).join('') + '</div>' +
    '<div class="nu-prod-busca">' + svg(ICO.busca, 16) + '<input id="sbProdBusca" type="search" autocomplete="off" placeholder="' + esc(tx('nu_prod_ph')) + '" value="' + esc(B.prodBusca || '') + '"></div>' + prodResHTML() +
    (B.prods.length ? '<button type="button" class="btn primary cheio nu-prod-gravar" data-act="sb-prod-add">' + svg(ICO.check, 16) + ' ' + esc(tx('su_prod_add')) + '</button><div class="hint">' + esc(tx('su_prod_estoque')) + '</div>' : '') + '</div></div>';
}
function pintarProd() { const el = document.querySelector('.sb .su-prod'); if (!el) return; el.outerHTML = prodBlocoHTML(); ligarProd(); }
function prodAdd(c) { if (!prodItem(c)) return; B.prods = B.prods.filter(x => x.c !== c).concat([{ c, q: '' }]); B.prodBusca = ''; pintarProd(); const q = document.querySelector('.sb [data-sb-pq="' + CSS.escape(c) + '"]'); if (q) { try { q.focus(); } catch (e) {} } }
function ligarProd() {
  const pb = $('sbProdBusca'); if (!pb) return;
  pb.oninput = () => { B.prodBusca = pb.value; const r = $('sbProdRes'); if (r) { r.outerHTML = prodResHTML(); ligarProdRes(); } };
  pb.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const a = prodAchados(); if (B.prodBusca && a.itens[0]) prodAdd(a.itens[0].c); else if (B.prodBusca) toast(tx('nu_prod_nada'), 'bad'); };
  ligarProdRes();
  document.querySelectorAll('.sb [data-sb-pq]').forEach(q => { q.oninput = () => { const x = B.prods.find(p => p.c === q.dataset.sbPq); if (x) x.q = q.value; }; q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); try { $('sbProdBusca').focus(); } catch (x) {} } }; });
  document.querySelectorAll('.sb [data-sb-ptirar]').forEach(b => b.onclick = () => { B.prods = B.prods.filter(x => x.c !== b.dataset.sbPtirar); pintarProd(); });
  const g = document.querySelector('.sb [data-act="sb-prod-add"]'); if (g) g.onclick = prodAdicionar;
}
function ligarProdRes() { document.querySelectorAll('.sb [data-sb-prod]').forEach(b => b.onclick = () => prodAdd(b.dataset.sbProd)); }
function prodAdicionar() {
  if (!B.prods.length) return;
  const ruim = B.prods.find(x => { const q = Number(x.q); return !(q >= 1 && q === Math.floor(q)); });
  if (ruim) { toast(tx('nu_prod_qtd_falta'), 'bad'); const q = document.querySelector('.sb [data-sb-pq="' + CSS.escape(ruim.c) + '"]'); if (q) { try { q.focus(); } catch (e) {} } return; }
  const sem = B.prods.find(x => !temMedida(x.c)); if (sem) return toast(sem.c + ': ' + tx('nu_prod_sem_medida'), 'bad');
  let n = 0;
  B.prods.forEach(x => { const m = medida(x.c); for (let i = 0; i < Number(x.q); i++) { B.caixas.push({ peso: m.peso, c: m.c, l: m.l, a: m.a, prod: x.c, pc: x.c }); n++; } });
  try { const r = B.prods.map(x => x.c).concat(recentes()).filter((c, i, L) => L.indexOf(c) === i).slice(0, 8); localStorage.setItem(REC_K, JSON.stringify(r)); } catch (e) {}
  B.prods = []; B.prodBusca = ''; toast(tx('su_prod_ok', { n }), 'good'); page();
}

/* ---------- 화면 ---------- */
function campo(id, rot, val, ico, ph) {
  return '<div class="field"><label>' + (ico ? '<span class="ups-campo-ico">' + svg(ico, 16) + '</span>' : '') + rot + '</label><input id="' + id + '" type="number" inputmode="decimal" min="0" step="0.1"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' value="' + esc(String(val == null ? '' : val)) + '"></div>';
}
/** 받는 곳 카드 (옛 cartazLojaHTML) — 쓰는 곳: 박스 화면(cont 있음) · 세일즈맨 고르기(cont 없음) */
function cartaz(a, n) {
  const P = para(a), d = destDe(a);
  const dado = (ico, rot, corpo) => '<div class="ups-dado"><span class="ups-dado-ico">' + svg(ico, 22) + '</span><div class="ups-dado-txt"><i>' + esc(rot) + '</i><b>' + corpo + '</b></div></div>';
  const end = [P.addr1, P.addr2, [P.city, P.state].filter(Boolean).join(', ') + (P.zip ? ' ' + P.zip : '')].filter(x => String(x || '').trim()), vz = '<span class="ups-vazio">---</span>';
  const nN = (B.notas[a.acct] || []).length;
  const bts = n != null && podeGerente() ? '<button type="button" class="btn sm" data-act="sb-editar">' + svg(ICO.lapis, 14) + ' ' + esc(tx('su_editar_destino')) + '</button>' : '';
  return '<div class="ups-cli-sel cartaz"><div class="ups-cartaz-head"><span class="ups-cli-cap"><i class="su-num">2</i>' + esc(tx('su_col_destino')) + '</span><div class="ups-cartaz-bts">' + bts + '</div></div>' +
    '<div class="ups-cartaz-corpo"><div class="ups-cli-id"><div class="ups-cli-nome">' + esc(P.name || '') + '</div><span class="ups-cli-pilula">#' + esc(a.acct || '') + '</span>' +
    (n != null ? '<div class="ups-cli-cx"><b>' + n + '</b><i>' + esc(tx('su_cx_envio')) + '</i>' + (nN ? '<u>' + esc(tx('su_cx_dica', { n: nN })) + '</u>' : '') + '</div>' : '') + '</div>' +
    '<div class="ups-cli-dados">' + dado(ICO.pin, tx('cl_end'), (end.length ? end.map(esc).join('<br>') : vz) +
      (d ? '<div class="dest-ed">' + esc(tx('dest_editado')) + (d.res ? ' · ' + esc(tx('cl_tipo_residencial')) : '') + ' <button type="button" class="btn sm" data-act="sb-dest-x">' + esc(tx('dest_desfazer')) + '</button></div>' : '') + '<div class="ups-ver">' + verHTML(a) + '</div>') +
    dado(ICO.predio, tx('nu_conta_ups'), esc(a.acct || '') || vz) + dado(ICO.tel, tx('cl_tel'), P.phone ? esc(P.phone) : vz) + dado(ICO.user, tx('cl_contato'), (d && d.attn) || a.contact ? esc((d && d.attn) || a.contact) : vz) + '</div></div></div>';
}
function codHTML(a) {
  const on = codAtivo(a);
  return '<div class="su-res-bl' + (on ? ' su-cod-on' : '') + '" id="sbCodBl"><label class="su-cod-lab"><input type="checkbox" id="sbCod"' + (on ? ' checked' : '') + '> ' + esc(tx('su_cod')) + '</label>' +
    '<div class="su-cod-campo" id="sbCodCampo"' + (on ? '' : ' hidden') + '><input id="sbCodValor" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="' + esc(tx('su_cod_valor')) + '" value="' + esc(B.codValor || '') + '">' +
    '<small>' + esc(tx('su_cod_valor')) + ' · ' + esc(tx('su_cod_dica')) + '</small></div></div>';
}
function buscaHTML() {
  const q = String(B.busca || '').trim(); if (!q) return '<div id="sbBuscaRes"></div>';
  const L = searchAccounts(S.accounts || [], q, 12).filter(a => !a.inactive);
  return '<div id="sbBuscaRes">' + (L.length ? '<div class="ups-achados">' + L.map((a, i) => { const nn = B.filaN ? (B.filaN[a.acct] || 0) : 0; return '<button type="button" class="ups-cli' + (i ? '' : ' primeiro') + '" data-sb-cli="' + esc(a.acct) + '"><b>' + esc(a.store || '') + '</b><span class="ups-conta">#' + esc(a.acct) + '</span>' + (nn ? '<span class="ups-tem">' + esc(tx('su_tem', { n: nn })) + '</span>' : a.city ? '<span class="ups-tem">' + esc(a.city + (a.state ? ', ' + a.state : '')) + '</span>' : '') + '</button>'; }).join('') + '</div>' : '<div class="graf-vazio">' + esc(tx('nu_ninguem')) + '</div>') + '</div>';
}
/* 가게 찾기 결과에 "Notes UPS 에 n개 대기" (옛 su_tem) — 한 번 읽음 */
async function carregarFilaN() { if (B.filaN) return; B.filaN = {}; try { (await S.DB.list('upsnotes', { where: [['st', '==', 'open']] })).forEach(n => { B.filaN[n.acct] = (B.filaN[n.acct] || 0) + 1; }); } catch (e) {} const r = $('sbBuscaRes'); if (r && !cliAtual()) { r.outerHTML = buscaHTML(); ligarAchados(); } }
const escolher = acct => { B.cli = acct; B.busca = ''; B.cot = null; B.prods = []; B.prodBusca = ''; B.foco = 'sbP'; page(); };
function cadastrar() {
  import('./newacct.js').then(NA => NA.newAcctForm(String(B.busca || '').trim(), a => { if (!a || !a.acct) return; escolher(a.acct); })).catch(e => toast(String(e.message || e), 'bad'));
}

export async function page() {
  css();
  const a = cliAtual(), cab = (t, s, bts) => '<div class="page-head"><div><h1>' + t + '</h1><p>' + s + '</p></div>' + (bts ? '<div class="su-head-bts">' + bts + '</div>' : '') + '</div>';
  if (!can('ship')) { $('page').innerHTML = '<div class="sb">' + cab('Shipping UPS', bt('출고 권한이 없습니다', 'No shipping permission')) + '</div>'; return; }
  pedirEnv();
  const teste = '<div id="sbTeste">' + seloTesteHTML() + '</div>' + prtSeloHTML();
  setTimeout(() => prtLigarSelo(page), 0);   // 🖨 에이전트 상태 띠 (그린 뒤에 연결)
  if (!a) {
    $('page').innerHTML = '<div class="sb">' + cab('Shipping UPS', esc(tx('su_sub'))) + teste +
      '<div class="panel ups-painel"><div class="ups-passo"><label class="ups-lbl">' + esc(tx('su_conta')) + '</label><div class="ups-busca-l"><input id="sbBusca" class="ups-busca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="numeric" placeholder="' + esc(tx('su_conta_ph')) + '" value="' + esc(B.busca) + '">' +
      (podeGerente() ? '<button type="button" class="btn ups-cad" data-act="sb-cad">' + svg(ICO.mais, 15) + ' ' + esc(tx('cl_cadastrar')) + '</button>' : '') + '</div></div>' + buscaHTML() + '</div></div>';
    const inp = $('sbBusca'); const pinta = () => { $('sbBuscaRes').outerHTML = buscaHTML(); ligarAchados(); };
    inp.oninput = () => { B.busca = inp.value; pinta(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const f = document.querySelector('.sb [data-sb-cli]'); if (f) f.click(); else if (String(B.busca || '').trim()) toast(tx('nu_ninguem'), 'bad'); } };
    const cb = document.querySelector('.sb [data-act="sb-cad"]'); if (cb) cb.onclick = cadastrar;
    ligarAchados(); carregarFilaN();
    /* 바로 커서를 둠 (setTimeout 으로 미루면 스캐너의 첫 글자가 빈 곳으로 감) */
    try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
    return;
  }
  /* 👤 가게에 세일즈맨이 없음 → 박스 전에 "누가 팔았나" (옛 7/10: 가게 먼저, 세일즈맨이 없으면 그리드) */
  if (!vendAtual(a)) {
    $('page').innerHTML = '<div class="sb">' + cab('Shipping UPS', esc(tx('su_sub')), '<button type="button" class="btn" data-act="sb-trocar">' + svg(ICO.troca, 15) + ' ' + esc(tx('nu_trocar_loja')) + '</button>') + teste +
      '<div class="vend-loja">' + cartaz(a, null) + vendGradeHTML() + '</div></div>';
    document.querySelectorAll('.sb [data-act="vend-sel"]').forEach(b => b.onclick = () => vendEscolher(a, b.dataset.vend, !!($('sbVendKeep') && $('sbVendKeep').checked)));
    document.querySelectorAll('.sb [data-act="sb-trocar"]').forEach(b => b.onclick = trocarLoja);
    ligarVer(); verificar(a);
    if (!B.notas[a.acct]) carregarNotas(a);
    return;
  }
  const L = caixasVivas(), ult = B.caixas[B.caixas.length - 1];
  let h = '<div class="sb"><div class="su-tela"><div class="su-migalha">Shipping UPS <span>›</span> ' + esc(tx('su_migalha')) + '</div>' +
    cab(esc(tx('su_titulo')), esc(tx('su_sub2')),
      '<button type="button" class="btn" data-act="sb-limpar">' + svg(ICO.x, 15) + ' ' + esc(tx('su_limpar_tudo')) + '</button><button type="button" class="btn" data-act="sb-trocar">' + svg(ICO.troca, 15) + ' ' + esc(tx('nu_trocar_loja')) + '</button>') +
    vendChipHTML(a) + teste;
  if (B.editando) h += '<div class="su-editando" role="status">' + svg(ICO.lapis, 16) + '<span>' + esc(tx('su_editando', { n: B.editando })) + '</span></div>';
  h += '<div class="su-grid"><div class="ups-card ups-card-cx"><div class="ups-card-head su-card-head"><i class="su-num">1</i><div><b>' + esc(tx('su_card_caixa')) + '</b><span>' + esc(tx('nu_folga_dica')) + '</span></div>' +
    (ult ? '<button type="button" class="btn sm" data-act="sb-ultima">' + svg(ICO.repetir, 14) + ' ' + esc(tx('su_ultima')) + '</button>' : '') + '</div>' + prodBlocoHTML() +
    '<div class="su-dims-row"><div class="su-peso-grupo"><div class="su-grupo-rot">' + esc(tx('nu_peso')) + '</div><div class="su-peso-campo">' + campo('sbP', '&nbsp;', B.cx.peso, ICO.peso, 'Ex: 12.5') + '<span class="su-peso-un">lb</span></div></div>' +
    '<div class="su-dims-grupo"><div class="su-grupo-rot">' + L3('크기 (인치)', 'Size (in)', 'Dimensões (in)') + '</div><div class="su-dims-3">' + campo('sbC', L3('길이', 'Length', 'Comprimento'), B.cx.c, ICO.setaH, 'Ex: 10') + campo('sbL', L3('너비', 'Width', 'Largura'), B.cx.l, ICO.setaH, 'Ex: 8') + campo('sbA', L3('높이', 'Height', 'Altura'), B.cx.a, ICO.setaV, 'Ex: 6') + '</div></div></div>' +
    '<div class="su-cx-bts"><div class="nu-enter">' + esc(tx('su_enter_dica')) + '</div><button type="button" class="btn" data-act="sb-cx-ok">' + svg(ICO.mais, 15) + ' ' + esc(tx('su_salvar_cx')) + '</button></div>';
  if (B.caixas.length) h += '<h4 class="ups-h4">' + esc(tx('su_mais_caixas')) + ' · ' + B.caixas.length + '</h4><div class="su-caixas">' + B.caixas.map((c, i) => '<div class="su-feita"><span class="su-n">' + (i + 1) + '</span><span><b>' + num1(c.peso) + ' lb</b> · ' + esc(medTxt(c)) + (c.pc ? '<span class="su-prod-tag">' + esc(c.pc) + '</span>' : '') + '</span><button type="button" class="btn-etq" data-act="sb-mexer" data-i="' + i + '" title="' + esc(bt('고치기', 'Edit')) + '">' + svg(ICO.lapis, 15) + '</button><button type="button" class="btn-etq" data-act="sb-tirar" data-i="' + i + '" title="' + esc(bt('빼기', 'Remove')) + '">' + svg(ICO.x, 15) + '</button></div>').join('') + '</div>';
  h += notasHTML(a) + ordsHTML(a);
  const P = para(a);
  h += '</div><div class="su-col3">' + cartaz(a, L.length) +
    '<div class="su-frete" id="sbFrete"><div class="su-frete-head"><div class="su-frete-tit">' + svg(ICO.caixa, 20) + '<b>' + esc(tx('su_card_resumo')) + '</b><small>' + esc(tx('su_frete_conta')) + '</small></div><div class="su-preco" id="sbPreco"></div></div>' +
    '<div class="su-frete-corpo"><div class="su-res-bl"><i>' + esc(tx('su_caixas')) + '</i><div id="sbResumo" class="su-res-caixas"></div></div>' +
    '<div class="su-res-bl"><i>' + esc(tx('su_col_destino')) + '</i><b>' + esc(P.name || '') + ' (#' + esc(a.acct) + ')</b><span>' + esc([P.city, P.state].filter(Boolean).join(', ') + (P.zip ? ' ' + P.zip : '')) + '</span></div>' +
    '<div class="su-res-bl"><i>' + esc(tx('env_servico')) + '</i><select id="sbServico">' + SVCS.map(s => '<option value="' + s[0] + '"' + (s[0] === B.svc ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></div>' + codHTML(a) +
    '<button type="button" class="btn primary grande cheio su-imprimir" data-act="sb-finalizar"></button><div class="su-preco-det" id="sbPrecoDet"></div>' +
    '<div class="su-outros-head"><h4 class="ups-h4">' + esc(tx('su_outros')) + '</h4><button type="button" class="btn sm" data-act="sb-cotar">' + svg(ICO.repetir, 14) + ' ' + esc(tx('su_cotar')) + '</button></div><div id="sbCotacao"></div></div></div></div></div>';
  h += '<div class="panel ups-painel"><div class="ups-fila-head"><h3 class="ups-h3">' + esc(tx('su_historico')) + '</h3><button type="button" class="btn sm" data-act="sb-hist-atu">' + svg(ICO.repetir, 15) + ' ' + esc(tx('nu_atualizar')) + '</button></div><div id="sbHist">' + histHTML(a) + '</div></div></div></div>';
  const foco = document.activeElement && /^sb[PCLA]$/.test(document.activeElement.id) ? document.activeElement.id : null;
  $('page').innerHTML = h;
  ligar(a, foco);
  pintarPreco();
  if (L.length && (!B.cot || B.cot.assin !== assin(a, L))) cotarAoVivo();
  verificar(a);
  if (!B.hist[a.acct]) carregarHist(a);
  if (!B.notas[a.acct]) carregarNotas(a);
  if (!B.ords[a.acct]) carregarOrds(a);
  if (podeEstoque()) carregarProdutos();
}
function ligarAchados() { document.querySelectorAll('.sb [data-sb-cli]').forEach(b => b.onclick = () => escolher(b.dataset.sbCli)); }
function trocarLoja() { B.cli = ''; B.busca = ''; B.editando = ''; zerar(); B.sel = {}; B.oSel = {}; B.prods = []; B.prodBusca = ''; page(); }

/* ---------- 이 고객의 출고 내역 (옛 Envios deste cliente) — 날짜 · 출고번호 · 트래킹 · 박스 · 무게 · 서비스 · 운임 · 담당 · 다시 인쇄 ---------- */
function histHTML(a) {
  const L = B.hist[a.acct];
  if (!L) return '<div class="graf-vazio">' + esc(tx('carregando')) + '</div>';
  const G = groupShipments(L).slice(0, 15);
  if (!G.length) return '<div class="graf-vazio">' + esc(tx('su_sem_hist')) + '</div>';
  const th = (k, c) => '<th' + (c ? ' class="' + c + '"' : '') + '>' + esc(tx(k)) + '</th>';
  return '<div class="tbl-scroll"><table><thead><tr>' + th('data') + th('sh_col_shipment') + th('r_rastreio') + th('su_caixas', 'num') + th('nu_peso', 'num') + th('env_servico') + th('env_frete', 'num') + th('responsavel') + '<th class="acoes"></th></tr></thead><tbody>' +
    G.map(s => { const x = s.a, shp = x.shp || x.no || ''; return '<tr><td data-l="' + esc(tx('data')) + '">' + esc(x.shipDate || '') + '</td><td class="principal"><b class="sh-num">' + esc(shp || '—') + '</b>' + (x.voided ? ' <span class="badge off">VOID</span>' : '') + (x.cod ? ' <span class="badge low">COD ' + esc(money(x.cod)) + '</span>' : '') + '</td>' +
      '<td style="font-variant-numeric:tabular-nums"><a class="rastreio" href="https://www.ups.com/track?tracknum=' + encodeURIComponent(x.trk || '') + '" target="_blank" rel="noopener noreferrer">' + esc(x.trk || '—') + ' ' + svg(ICO.link, 12) + '</a></td><td class="num" data-l="' + esc(tx('su_caixas')) + '">' + s.n + '</td><td class="num" data-l="' + esc(tx('nu_peso')) + '">' + num1(s.w) + '</td><td data-l="' + esc(tx('env_servico')) + '">' + esc(x.svcName || svcName(x.svc)) + '</td><td class="num" data-l="' + esc(tx('env_frete')) + '">' + (s.cost ? esc(money(s.cost)) : '—') + '</td><td data-l="' + esc(tx('responsavel')) + '">' + esc(String(x.by || '').split('@')[0]) + '</td>' +
      '<td class="acoes">' + (x.adhocId && !x.voided ? '<button type="button" class="btn sm" data-sb-reimp="' + esc(x.adhocId) + '">' + svg(ICO.print, 14) + ' ' + esc(tx('env_reimprimir')) + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
}
async function carregarHist(a) { B.hist[a.acct] = await shipmentsOf(a.acct); const el = $('sbHist'); if (el && cliAtual() === a) { el.innerHTML = histHTML(a); ligarHist(); } }
function ligarHist() { document.querySelectorAll('.sb [data-sb-reimp]').forEach(b => b.onclick = () => reimprimir(b.dataset.sbReimp)); }
/** 다시 인쇄 — 다시 만들지 않음: shipq 에 남은 라벨을 다시 (옛 envReimprimir · 찢어진 라벨이 두 번째 요금이 되지 않게) */
async function reimprimir(id) {
  let q = null; try { q = await S.DB.get('shipq', id); } catch (e) {}
  if (!q || !(q.labels || []).some(l => l && l.img)) return toast(tx('env_sem_etiqueta'), 'bad');
  saida(q);
}

function ligar(a, foco) {
  const ids = ['sbP', 'sbC', 'sbL', 'sbA'], k = { sbP: 'peso', sbC: 'c', sbL: 'l', sbA: 'a' };
  ids.forEach((id, i) => { const el = $(id); el.oninput = () => { B.cx[k[id]] = el.value; cotarAoVivo(); };
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (i < 3) { $(ids[i + 1]).focus(); $(ids[i + 1]).select(); } else salvarCaixa(); } else if (e.key === 'Escape') { e.preventDefault(); el.blur(); } }; });
  const on = (act, f) => document.querySelectorAll('.sb [data-act="' + act + '"]').forEach(b => b.onclick = () => f(b));
  on('sb-cx-ok', salvarCaixa);
  on('sb-ultima', () => { const u = B.caixas[B.caixas.length - 1]; if (!u) return; B.cx = { peso: '', c: u.c, l: u.l, a: u.a }; B.foco = 'sbP'; page(); });
  on('sb-tirar', b => { B.caixas.splice(+b.dataset.i, 1); page(); });
  on('sb-mexer', b => { if (cxAndando()) return toast(tx('su_mexer_ocupado'), 'bad'); const c = B.caixas.splice(+b.dataset.i, 1)[0]; B.cx = { peso: c.peso, c: c.c, l: c.l, a: c.a }; B.foco = 'sbP'; page(); });
  on('sb-trocar', trocarLoja);
  on('sb-limpar', async () => { if ((B.caixas.length || cxAndando() || notasSel().length) && !(await confirmBox(tx('su_limpar_q') + '\n' + tx('su_limpar_txt'), tx('su_limpar_tudo')))) return; zerar(); B.sel = {}; B.prods = []; page(); });
  on('sb-cotar', () => { const L = caixasVivas(); if (!L.length) return toast(tx('su_sem_caixa'), 'bad'); B.cot = null; cotar(a, L, assin(a, L)); });
  on('sb-finalizar', () => finalizar());
  on('sb-notas-tudo', () => notasTudo(false));
  on('sb-editar', () => abrirDestino(a));
  on('sb-dest-x', () => { delete B.dest[a.acct]; delete B.av[a.acct]; B.cot = null; page(); });
  on('vend-trocar', () => { delete B.vend[a.acct]; page(); });
  on('sb-hist-atu', () => { delete B.hist[a.acct]; const el = $('sbHist'); if (el) el.innerHTML = histHTML(a); carregarHist(a); });
  ligarHist(); ligarProd();
  document.querySelectorAll('.sb [data-sb-nota]').forEach(c => c.onchange = () => { B.sel[c.dataset.sbNota] = c.checked; page(); });
  document.querySelectorAll('.sb [data-sb-ord]').forEach(c => c.onchange = () => { B.oSel[c.dataset.sbOrd] = c.checked; });
  ligarVer();
  const sv = $('sbServico'); sv.onchange = () => { B.svc = sv.value; pintarPreco(); };
  const cb = $('sbCod'), cv = $('sbCodValor');
  cb.onchange = () => { B.cod = cb.checked; $('sbCodCampo').hidden = !cb.checked; $('sbCodBl').classList.toggle('su-cod-on', cb.checked); if (cb.checked) { try { cv.focus(); cv.select(); } catch (e) {} } };
  cv.oninput = () => { B.codValor = cv.value; cv.classList.remove('erro'); };
  cv.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); cv.blur(); } };
  const f = B.foco || foco; B.foco = null;
  /* 바로 커서를 둠 — setTimeout 으로 미루면 빨리 치는 사람 · 스캐너의 첫 글자가 빈 곳으로 감 */
  if (f && $(f)) { try { $(f).focus(); } catch (e) {} }
}
function zerar() { B.cx = {}; B.caixas = []; B.cot = null; B.cotBusy = false; B.cotSeq++; clearTimeout(B.cotTimer); }
function salvarCaixa() {
  const c = B.cx;
  if (!(Number(c.peso) > 0)) { toast(bt('무게를 넣으세요', 'Enter the weight'), 'bad'); return $('sbP') && $('sbP').focus(); }
  if (!(Number(c.c) > 0 && Number(c.l) > 0 && Number(c.a) > 0)) { toast(bt('길이 · 너비 · 높이를 넣으세요', 'Enter length, width and height'), 'bad'); return $('sbC') && $('sbC').focus(); }
  B.caixas.push({ peso: c.peso, c: c.c, l: c.l, a: c.a });
  B.cx = {}; B.foco = 'sbP'; page();   /* 크기는 다음 박스로 넘어가지 않음 — 잰 적 없는 박스가 저장되는 것을 막음 */
}
/* 창 · 덮개가 열려 있으면 단축키를 쓰지 않음 (확인 창의 Enter 가 라벨이 되면 안 됨) */
const algoAberto = () => { const m = document.getElementById('modal'); return !!(m && m.classList.contains('on')) || !!document.querySelector('.sb-ovr') || !!(document.getElementById('prt') && document.getElementById('prt').classList.contains('on')); };
/* Esc 로 칸에서 나온 뒤 Enter = 인쇄 (칸 안의 Enter 는 절대 인쇄하지 않음) */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || location.hash.indexOf('#/balcao') !== 0 || !cliAtual() || B.emit) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
  if (algoAberto()) return;
  const b = document.querySelector('.sb [data-act="sb-finalizar"]'); if (!b || b.disabled) return;
  e.preventDefault(); finalizar();
});
/* A (칸 밖에서) = 이 가게 Notes UPS 박스 모두 넣기 / 빼기 — 물리 키(e.code) 로 (한글 자판 · 윈도우) */
document.addEventListener('keydown', e => {
  if (e.code !== 'KeyA' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || location.hash.indexOf('#/balcao') !== 0 || !cliAtual() || !(B.notas[B.cli] || []).length || algoAberto()) return;
  const t = e.target, tag = t && t.tagName; if (tag === 'INPUT' && t.type !== 'checkbox' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault(); notasTudo(true);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});

/* ---------- ⚠️ 오류 창 (옛 modalEnvioFalta · modalEnvioSemCredencial · modalEnvioOrfao) ---------- */
function modal(tit, corpo, pe) {
  const d = document.createElement('div'); d.className = 'sb sb-mdl';
  d.innerHTML = '<div class="sb-ovr" role="dialog" aria-modal="true"><div class="sb-mdl-card"><div class="modal-head"><h2>' + esc(tit) + '</h2><button type="button" class="x" data-mdl="x" aria-label="' + esc(tx('etq_fechar')) + '">' + svg(ICO.x, 17) + '</button></div><div class="sb-mdl-body">' + corpo + '</div><div class="modal-foot">' + pe + '</div></div></div>';
  document.body.appendChild(d);
  const fecha = () => { if (d.isConnected) d.remove(); };
  d.querySelectorAll('[data-mdl="x"]').forEach(b => b.onclick = fecha);
  return { el: d, fecha };
}
const fecharBt = (pri) => '<button type="button" class="btn' + (pri ? ' primary' : '') + '" data-mdl="x">' + esc(tx('etq_fechar')) + '</button>';
function modalFalta(L) { const m = modal(tx('env_falta_tit'), '<div class="aviso alerta" style="margin:0 0 12px">' + svg(ICO.ajuda, 16) + '<div>' + esc(tx('env_falta_txt')) + '</div></div><ul class="env-falta">' + L.map(k => '<li>' + esc(tx(k)) + '</li>').join('') + '</ul>', fecharBt()); m.el.classList.add('sb-falta'); return m; }
function modalSemCred(det) { const m = modal(tx('env_sem_cred_tit'), '<div class="aviso alerta" style="margin:0 0 12px">' + svg(ICO.ajuda, 16) + '<div>' + esc(tx('env_sem_cred_txt')) + '</div></div><ul class="env-falta"><li>UPS_CLIENT_ID</li><li>UPS_CLIENT_SECRET</li><li>UPS_ACCOUNT</li></ul>' + (det ? '<div class="hint">' + esc(det) + '</div>' : ''), fecharBt()); m.el.classList.add('sb-semcred'); return m; }
/** A UPS emitiu, o app não gravou — rastreio em destaque, copiar, e a etiqueta sai mesmo assim (옛 modalEnvioOrfao) */
function modalOrfao(x, err) {
  const trk = String(x.track || '').trim();
  const m = modal(tx('env_orfao_tit'), '<div class="aviso" style="margin:0 0 12px">' + svg(ICO.ajuda, 16) + '<div>' + esc(tx(x.env === 'test' ? 'env_orfao_txt_teste' : 'env_orfao_txt')) + '</div></div>' +
    '<div class="field full"><label>' + esc(tx('env_rastreio')) + '</label><input readonly id="sbOrfTrk" value="' + esc(trk) + '" style="font-size:17px;font-weight:700"></div><button type="button" class="btn sm" id="sbOrfCp">' + svg(ICO.copiar, 14) + ' ' + esc(tx('copiar')) + '</button>' +
    (err ? '<div class="hint">' + esc(err) + '</div>' : '') + dlHTML(x), fecharBt(true));
  m.el.classList.add('sb-orfao');
  const cp = m.el.querySelector('#sbOrfCp'); if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(trk); toast(tx('copiado'), 'good'); } catch (e) {} };
  return m;
}

/* ---------- 🖨 라벨 내보내기 — GIF 는 인쇄, ZPL · PDF 는 내려받기 (옛 envBaixarEtiquetas · envFormatoDaEtiqueta) ---------- */
/** 형식은 내용으로 (GIF "R0lGOD" · PDF "JVBER" · 그 밖 ZPL) — 옛 앱과 같음 */
export const fmtDe = (l, q) => { const f = String((l && l.fmt) || (q && q.fmt) || '').toUpperCase(), s = String((l && l.img) || ''); if (/^R0lGOD/.test(s)) return 'GIF'; if (/^JVBER/.test(s)) return 'PDF'; if (/^XlhB/.test(s)) return 'ZPL'; return f === 'PDF' || f === 'ZPL' ? f : 'GIF'; };   // 형식 표시가 없는 옛 기록은 GIF
const extDe = f => f === 'PDF' ? 'pdf' : f === 'GIF' ? 'gif' : 'zpl';
const tipoDe = f => f === 'PDF' ? 'application/pdf' : f === 'GIF' ? 'image/gif' : 'text/plain';
const nomeArq = (l, i, f) => 'ups_' + (l.trk || 'etiqueta') + '_' + (i + 1) + '.' + extDe(f);
function blobUrl(b64, f) { const bin = atob(b64), buf = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k); return URL.createObjectURL(new Blob([buf], { type: tipoDe(f) })); }
/** 내려받을 라벨의 링크 (덮개 · orphan 창) — 내려받기가 막혀도 다시 누를 수 있게 */
function dlHTML(q) {
  const L = (q.labels || []).map((l, i) => ({ l, i, f: fmtDe(l, q) })).filter(x => x.l && x.l.img && x.f !== 'GIF'); if (!L.length) return '';
  return '<div class="sb-dl">' + L.map(x => { let u = ''; try { u = blobUrl(x.l.img, x.f); } catch (e) {} return u ? '<a href="' + u + '" download="' + esc(nomeArq(x.l, x.i, x.f)) + '" data-sb-dl="' + esc(x.f) + '">' + esc(tx('env_baixar')) + ' ' + esc(x.f) + ' · ' + esc(x.l.trk || String(x.i + 1)) + '</a>' : ''; }).join('') + '</div>';
}
export function baixar(q) {
  const L = (q.labels || []).map((l, i) => ({ l, i, f: fmtDe(l, q) })).filter(x => x.l && x.l.img && x.f !== 'GIF');
  L.forEach(x => { try { const u = blobUrl(x.l.img, x.f), a = document.createElement('a'); a.href = u; a.download = nomeArq(x.l, x.i, x.f); document.body.appendChild(a); a.click(); B.dl.push(a.download); setTimeout(() => { URL.revokeObjectURL(u); if (a.parentNode) a.parentNode.removeChild(a); }, 600); } catch (e) {} });
  return L.length;
}
/** 라벨 내보내기 — GIF 는 imprimir, 나머지는 baixar. 돌려주는 값 { imp, dl } */
function saida(q) { if (prtDireta()) { const z = (q.labels || []).map((l, i) => ({ l, i })).filter(x => x.l && x.l.img && fmtDe(x.l, q) === 'ZPL'); if (z.length && filaExpedicao(z.map(x => ({ titulo: 'UPS ' + (x.l.trk || x.i + 1), zpl: atob(x.l.img) })), 'etiqueta_ups')) { const rest = (q.labels || []).filter(l => !(l && l.img && fmtDe(l, q) === 'ZPL')); const r = saida(Object.assign({}, q, { labels: rest })); return { imp: r.imp + z.length, dl: r.dl }; } }
  const gifs = (q.labels || []).filter(l => l && l.img && fmtDe(l, q) === 'GIF'); if (gifs.length) imprimir(Object.assign({}, q, { labels: gifs })); return { imp: gifs.length, dl: baixar(q) }; }

/* ---------- 출고 (옛 suFinalizar) ---------- */
async function finalizar() {
  if (B.emit) return;
  const a = cliAtual(); if (!a) return;
  if (!cxCompleta() && cxAndando()) return toast(tx('su_cx_falta'), 'bad');
  const L = caixasVivas(); if (!L.length) return toast(tx('su_sem_caixa'), 'bad');
  /* 필요한 정보 (옛 rpc_envio_dados_cliente.faltando) — UPS 에 보내기 전에 여기서 */
  const P = para(a), falta = [];
  if (!String(P.name).trim()) falta.push('env_f_cliente'); if (!String(P.addr1).trim()) falta.push('cl_end'); if (!String(P.city).trim()) falta.push('cl_cidade'); if (!String(P.state).trim()) falta.push('cl_estado'); if (!String(P.zip).trim()) falta.push('cl_cep');
  if (L.some(c => !(Number(c.peso) > 0))) falta.push('env_f_peso');
  const F = (S.settings && S.settings.ups && S.settings.ups.from) || null; if (F && !String(F.addr1 || '').trim()) falta.push('env_f_remetente'); if (F && !String(F.zip || '').trim()) falta.push('env_f_remetente_cep');
  if (falta.length) return modalFalta(falta);
  if (B.cred === false) return modalSemCred('');
  const cod = codParaEnvio(a);
  if (cod && cod.erro) { const ce = $('sbCodValor'); if (ce) { ce.classList.add('erro'); ce.focus(); } return toast(cod.erro, 'bad'); }
  if (!String(P.phone).trim() && B.svc === '14') toast(tx('env_aviso_tel'), 'bad');
  B.emit = true; pintarResumo(L);
  const fecha = overlay('wait', esc(tx('env_gerando')), tx('env_gerando_sub', { n: L.length }) + ' · ' + L3('1~2분 걸립니다', 'takes 1–2 min', 'leva 1–2 min'));
  const id = newId('X'), now = new Date().toISOString(), no = 'ADHOC-' + today().replace(/-/g, '').substring(2) + '-' + id.slice(-4).toUpperCase(), sm = vendAtual(a) || a.sm || '';
  let x = null;
  try {
    const OS = ordsSel();
    await S.DB.set('adhoc', id, { id, no, col: 'adhoc', st: 'open', store: P.name || a.store || '', acct: a.acct, sm, smPicked: !vendDaLoja(a) && sm ? sm : '', invs: [].concat(...OS.map(o => o.invs || [])), orderIds: OS.map(o => o.id), desc: 'Shipping UPS', src: 'balcao', noteIds: notasSel().map(n => n.id), prods: L.filter(c => c.pc).map(c => c.pc), createdBy: S.user.email, createdAt: now, updatedAt: now, to: P });
    await S.DB.set('shipq', id, Object.assign(payload(a, L, { adhocId: id, no, cod: cod || null }), { id, st: 'wait', createdAt: now }));
    x = await esperar(id, ['done'], ['error'], 60);
  } catch (e) { x = { st: 'error', err: String(e.code || e.message) }; }
  fecha(); B.emit = false;
  if (x && x.env) guardarEnv(x.env);
  if (!x) { pintarResumo(caixasVivas()); return overlay('erro', esc(tx('env_falhou')), tx('env_sem_resposta'), true); }
  if (x.st !== 'done') {
    pintarResumo(caixasVivas());
    if (x.orphan && (x.labels || []).length) { saida(x); return modalOrfao(x, x.err || ''); }
    if (semCred(x.err)) { guardarEnv(null, false); return modalSemCred(x.err); }
    if (/받는 주소가 부족|address/i.test(String(x.err || '')) && /부족|incomplete|missing/i.test(String(x.err || ''))) return modalFalta(['cl_end', 'cl_cidade', 'cl_estado', 'cl_cep']);
    return overlay('erro', esc(tx('env_falhou')), 'UPS: ' + (x.err || ''), true);
  }
  B.cred = true;
  let gravou = true, errGrava = '';
  try { await S.DB.update('adhoc', id, { track: x.track, shipVia: 'UPS', boxes: (x.labels || []).length, shipCost: x.charge || 0, st: 'shipped', shippedAt: new Date().toISOString(), shippedBy: S.user.email, updatedAt: new Date().toISOString() }); } catch (e) { gravou = false; errGrava = String(e.code || e.message); }
  /* 🧾 고른 주문 → 📦 포장 완료 + 트래킹 (예전 출고 창과 같은 칸 — 🚛 UPS 인계 · 배송 조회 · 출고 취소가 그대로 됨) */
  const OS2 = ordsSel(), at2 = new Date().toISOString();
  for (let i = 0; i < OS2.length; i++) { try { await S.DB.update('orders', OS2[i].id, { st: 'packed', packAt: at2, packBy: S.user.email, shipVia: 'UPS', boxes: (x.labels || []).length, track: x.track || '', shipCost: i ? 0 : (x.charge || 0), shipId: id, updatedAt: at2 }); } catch (e) {} }
  if (OS2.length) { OS2.forEach(o => delete B.oSel[o.id]); delete B.ords[a.acct]; }
  const nIds = notasSel().map(n => n.id); if (nIds.length) { try { await marcarEnviadas(nIds, id, x.track); } catch (e) {} delete B.notas[a.acct]; B.sel = {}; }
  /* 📦 Empty Display 박스 → 재고에서 (라벨이 나온 뒤에만 · 모자라면 있는 만큼 + 알림 — stock.js moveStock partial) */
  const pcs = {}; L.forEach(c => { if (c.pc) pcs[c.pc] = (pcs[c.pc] || 0) + 1; });
  if (Object.keys(pcs).length) { try { const St = await import('./stock.js'); await St.moveStock(Object.keys(pcs).map(c => ({ c, delta: -pcs[c] })), 'out', id, 'Shipping UPS ' + no + ' · ' + (x.track || '').split(' ')[0], { partial: true, origem: 'shipping' }); } catch (e) { toast(tx('su_prod_baixa_falhou') + ' ' + (e.code || e.message || ''), 'bad'); } }
  const out = saida(x);
  if (!gravou) return modalOrfao(Object.assign({}, x, { env: x.env || B.env }), errGrava);
  if (B.editando) toast(tx('su_editando_ok', { n: B.editando }), 'good');
  B.cli = ''; B.busca = ''; B.cod = null; B.codValor = ''; B.codCli = ''; B.editando = ''; zerar(); delete B.hist[a.acct]; delete B.dest[a.acct]; delete B.vend[a.acct]; B.filaN = null;
  let voltou = false; const voltar = () => { if (voltou) return; voltou = true; if (location.hash.indexOf('#/balcao') === 0) page(); };
  const n = (x.labels || []).length;
  const sub = [tx('env_ok_shp') + ' ' + no, out.dl && !out.imp ? tx('env_ok_baixadas', { n }) : tx('env_ok_sub', { n })].concat(x.charge ? [tx('env_frete') + ' ' + money(x.charge)] : []).concat(cod ? [tx('env_cod') + ' ' + money(cod.valor)] : []).join(' · ');
  const f2 = overlay('ok', esc(tx('env_ok', { r: (x.track || '').split(' ')[0] })), sub, false, voltar, out.dl ? dlHTML(x) : '');
  setTimeout(() => { f2(); voltar(); }, SB_OK_MS);
}
/** 🖨 라벨 — UPS GIF 를 4×6 세로로 돌리고 아래 띠를 자르고 흑백으로 (옛 앱과 같은 처리: 열전사에서 흐려지지 않게) */
export function imprimir(q) {
  const L = (q.labels || []).filter(l => l && l.img && fmtDe(l, q) === 'GIF'); if (!L.length) return;
  const prontas = []; let pend = L.length;
  const norm = im => { const deit = im.naturalWidth > im.naturalHeight, w = deit ? im.naturalHeight : im.naturalWidth; let h = deit ? im.naturalWidth : im.naturalHeight; const alvo = Math.round(w * 1.5); if (h > alvo) h = alvo;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (deit) { g.translate(w, 0); g.rotate(Math.PI / 2); } g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h), p = d.data; for (let i = 0; i < p.length; i += 4) { const v = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 < 128 ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; } g.putImageData(d, 0, 0); return c.toDataURL('image/png'); };
  const fim = () => { if (--pend) return;
    /* 🖨 출고 PC 에이전트로 (옛 etqFilaExpedicao 'etiqueta_ups') — 이미 흑백이라 pixelated (203dpi 로 다시 그릴 때 회색 테두리가 생겨 가는 선이 사라지지 않게) · 라벨 하나 = 일 하나 */
    if (filaExpedicao(prontas.map((s, i) => ({ titulo: 'UPS ' + (L[i].trk || ''), html: paginaHTML('.etq-pag img{display:block;width:4in;height:6in;image-rendering:pixelated}', ['<img src="' + s + '" alt="">'], 4, 6) })), 'etiqueta_ups')) return;
    printOpen('<style>@page{size:4in 6in;margin:0}.sblbl{width:4in;height:6in;page-break-after:always;break-after:page;overflow:hidden}.sblbl img{display:block;width:4in;height:6in}</style>' + prontas.map(s => '<div class="sblbl"><img src="' + s + '" alt=""></div>').join('')); };
  L.forEach((l, i) => { const im = new Image(), src = 'data:image/gif;base64,' + l.img; im.onload = () => { try { prontas[i] = norm(im); } catch (e) { prontas[i] = src; } fim(); }; im.onerror = () => { prontas[i] = src; fim(); }; im.src = src; });
}
/** 덮개 (기다림 · 성공 · 오류) — tit 는 HTML (이미 esc), sub 는 글 · extra 는 HTML (내려받기 링크) */
function overlay(tipo, tit, sub, fechavel, aoFechar, extra) {
  const d = document.createElement('div'); d.className = 'sb'; d.style.cssText = 'padding:0;margin:0;min-height:0;background:none';
  d.innerHTML = '<div class="sb-ovr"><div class="sb-ok' + (tipo === 'erro' ? ' erro' : '') + '"><div class="sb-ok-ic">' + (tipo === 'wait' ? '<span class="fb-spin" style="width:24px;height:24px;margin:0"></span>' : svg(tipo === 'erro' ? ICO.x : '<polyline points="20 6 9 17 4 12"/>', 28)) + '</div><b>' + tit + '</b><div style="color:var(--muted)">' + esc(sub || '') + '</div>' + (extra || '') + (fechavel ? '<button type="button" class="btn" style="margin-top:14px">OK</button>' : '') + '</div></div>';
  document.body.appendChild(d);
  const fecha = () => { if (d.isConnected) d.remove(); if (aoFechar) aoFechar(); };
  if (tipo !== 'wait') d.onclick = e => { if (e.target && e.target.closest && e.target.closest('a[download]')) return; fecha(); };
  return fecha;
}
