/* ============================================================
 *  🏪 Shipping UPS (카운터) — 옛 THE ONE CORP WMS 의 Shipping UPS 화면을 그대로 (레이아웃 · 글꼴 · 키보드)
 *    가게 찾기 → 박스마다 무게 · 크기 (Enter 로 다음 칸, 높이에서 Enter = 저장) → 요금 자동 → COD → 🖨 라벨
 *    UPS 는 기존과 같이 shipq → apps-script/UPS.gs (1분 안에 처리) · 주문 없는 출고라 adhoc/{id} 에 남음
 *    요금 · 라벨이 "바로" 가 아니라 1분 안팎인 것은 UPS.gs 가 1분마다 돌기 때문 (옛 앱은 서버 함수로 즉시)
 * ============================================================ */
import { $, esc, money, toast, confirmBox, bt, today, printOpen, Router } from './ui.js';
import { newId } from './db.js';
import { can } from './main.js';
import { searchAccounts } from './accounts.js';
import { adrKey } from './fulfill.js';
import { bumpAccountsVer } from './mgr.js';
import { shipmentsOf, groupShipments } from './track.js';
import { SB_CSS, SH_CSS } from './balcao-css.js';
import { LANG } from './i18n.js';
import { abertasDe, marcarEnviadas } from './notesups.js';
/* 숫자가 끼는 문구 · Enter 같은 영어가 섞인 문구는 사전 바꿔 끼우기가 어색해서 언어별로 바로 */
export const L3 = (ko, en, pt) => LANG === 'pt' ? pt : LANG === 'en' ? en : bt(ko, en);
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
/* 카운터 상태 — 화면을 다시 그려도 남음 */
const B = { cli: '', busca: '', cx: {}, caixas: [], svc: '03', cod: null, codValor: '', codCli: '', cot: null, cotBusy: false, cotSeq: 0, cotTimer: null, av: {}, emit: false, hist: {}, notas: {}, sel: {}, ords: {}, oSel: {} };
export function register(state) { S = state; Router.on('balcao', page); }
/** ✏️ Shipping History 의 "출고 고치기" — 옛 라벨은 취소한 뒤 같은 가게 · 박스 · 서비스 · COD 로 카운터를 엶 */
export function abrirEdicao(acct, caixas, svc, cod, de) { zerar(); B.cli = acct; B.busca = ''; B.caixas = caixas.map(c => ({ peso: c.peso, c: c.c, l: c.l, a: c.a })); B.svc = svc || '03'; B.codCli = acct; B.cod = cod ? true : null; B.codValor = cod ? String(cod) : ''; B.editando = de || ''; Router.go('balcao'); }
export const _B = B;   // 시험용
/** 🧾 인보이스가 나온 주문을 이 카운터로 — 주문 화면의 🚚 출고 · UPS 출고 목록에서 (v0.8.209: 인보이스 뒤 UPS 출고를 이 화면 하나로) */
export function abrirPedido(o) { zerar(); B.cli = o.acct; B.busca = ''; B.editando = ''; B.sel = {}; delete B.ords[o.acct]; B.oSel = { [o.id]: true }; B.oPre = o.id; B.foco = 'sbP'; Router.go('balcao'); }

const acctOf = c => (S.accounts && S.accounts.byCode ? S.accounts.byCode[c] : null);
const cliAtual = () => B.cli ? acctOf(B.cli) : null;

export function css() { if (document.getElementById('sbCss')) return; const st = document.createElement('style'); st.id = 'sbCss'; st.textContent = SB_CSS + SH_CSS; document.head.appendChild(st); }

/* ---------- 박스 ---------- */
const cxCompleta = () => { const c = B.cx; return Number(c.peso) > 0 && Number(c.c) > 0 && Number(c.l) > 0 && Number(c.a) > 0; };
const cxAndando = () => { const c = B.cx; return Number(c.peso) > 0 || Number(c.c) > 0 || Number(c.l) > 0 || Number(c.a) > 0; };
/** 지금 보낼 박스 — 저장한 것 + 입력 중인 것(완성됐을 때) */
export function caixasVivas() { const L = B.caixas.slice(); if (cxCompleta()) L.push({ peso: B.cx.peso, c: B.cx.c, l: B.cx.l, a: B.cx.a }); notasSel().forEach(n => L.push({ peso: n.w, c: n.l, l: n.wd, a: n.h, nota: n.id, prod: n.prod || '' })); return L; }
/** 📦 Notes UPS — 이 가게의 대기 박스 중 고른 것 (카운터 박스 다음에 붙음 — 옛 앱 순서) */
const notasSel = () => ((B.notas[B.cli] || []).filter(n => B.sel[n.id]));
function notasHTML(a) {
  const L = B.notas[a.acct]; if (!L || !L.length) return '';
  const tudo = L.every(n => B.sel[n.id]);
  return '<h4 class="ups-h4">Notes UPS · ' + L.length + ' <button type="button" class="btn sm" data-act="sb-notas-tudo" style="margin-left:8px">' + (tudo ? L3('모두 빼기', 'Unmark all', 'Desmarcar todas') : L3('모두 넣기 (A)', 'Mark all (A)', 'Marcar todas (A)')) + '</button></h4><div class="su-notas">' +
    L.map((n, i) => '<label class="su-nota"><input type="checkbox" data-sb-nota="' + esc(n.id) + '"' + (B.sel[n.id] ? ' checked' : '') + '><span><b>' + (i + 1) + '/' + L.length + '</b> · ' + num1(n.w) + ' lb · ' + num1(n.l) + ' × ' + num1(n.wd) + ' × ' + num1(n.h) + ' in' + (n.prod ? '<span class="su-nota-prods">' + esc(n.prod) + '</span>' : '') + '</span></label>').join('') + '</div>';
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
async function carregarNotas(a) { try { B.notas[a.acct] = await abertasDe(a.acct); } catch (e) { B.notas[a.acct] = []; } if (cliAtual() === a && (B.notas[a.acct] || []).length) page(); }
function notasTudo() { const L = B.notas[B.cli] || []; const tudo = L.every(n => B.sel[n.id]); L.forEach(n => { B.sel[n.id] = !tudo; }); page(); }
const medTxt = c => (Number(c.c) > 0 && Number(c.l) > 0 && Number(c.a) > 0) ? num1(c.c) + ' × ' + num1(c.l) + ' × ' + num1(c.a) + ' in' : '';
const assin = (a, L) => [a.acct, a.addr, a.addr2, a.city, a.state, a.zip].join('|') + '#' + JSON.stringify(L.map(c => [Number(c.peso), Number(c.c), Number(c.l), Number(c.a)]));

/* ---------- COD ---------- */
const codSugerido = a => !!a && String(a.terms || '').trim().toUpperCase() === 'COD';
function codAtivo(a) { if (!a) return false; if (B.codCli !== a.acct) { B.codCli = a.acct; B.cod = null; B.codValor = ''; } return B.cod == null ? codSugerido(a) : !!B.cod; }
export function codCentavos(v) { const s = String(v == null ? '' : v).trim().replace(/,/g, ''), m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s); if (!m || m[1].length > 12) return null; return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0')); }
const codTexto = c => Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');
function codParaEnvio(a) {
  if (!codAtivo(a)) return null;
  const bruto = $('sbCodValor') ? $('sbCodValor').value : B.codValor;
  if (!String(bruto || '').trim()) return { erro: bt('COD: 받을 금액을 넣으세요', 'COD: enter the amount to collect') };
  const c = codCentavos(bruto);
  if (c == null || c < 1) return { erro: bt('COD 금액이 맞지 않습니다', 'COD amount is not valid') };
  if (c > 5000000) return { erro: bt('COD 는 박스 하나에 $50,000 까지', 'COD is limited to $50,000 per box') };
  return { ativo: true, valor: codTexto(c) };
}

/* ---------- UPS 요청 (shipq — UPS.gs 가 1분 안에 처리) ---------- */
function para(a) { return { name: a.store || '', attn: a.store || '', phone: a.tel || '', email: a.email || '', addr1: a.addr || '', addr2: a.addr2 || '', addr3: '', city: a.city || '', state: String(a.state || '').toUpperCase(), zip: a.zip || '', res: false }; }
function payload(a, L, extra) {
  return Object.assign({ orderId: '', dispId: '', adhocId: '', no: '', acct: a.acct || '', store: a.store || '', sm: a.sm || '', invs: [], by: S.user.email, svc: B.svc,
    to: para(a), fromX: null, opt: { sat: false, sig: '', notify: false }, bill: { type: 'ship' }, desc: 'JEWELRY & ACCESSORIES',
    boxes: L.map(c => ({ w: Number(c.peso), l: Number(c.c), wd: Number(c.l), h: Number(c.a), pkg: '02', val: '', ref2: String(c.prod || '').substring(0, 35), invs: [] })),
    ref: ('#' + (a.acct || '') + ' ' + (a.store || '')).substring(0, 35) }, extra || {});
}
async function esperar(id, ok, err, max) {
  for (let i = 0; i < (max || 45); i++) { await sleep(3000); let x = null; try { x = await S.DB.get('shipq', id); } catch (e) {} if (x && ok.includes(x.st)) return x; if (x && err.includes(x.st)) return x; }
  return null;
}

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
  B.cot = !r ? { erro: bt('UPS 가 답하지 않습니다 — 잠시 뒤 다시', 'No answer from UPS — try again') } : r.st === 'rateerr' ? { erro: 'UPS: ' + (r.err || '') } : { servicos: r.rates || [], ambiente: r.env || '' };
  B.cot.assin = s; B.cot.n = L.length;
  pintarPreco();
}
const servAtual = () => { const L = (B.cot && B.cot.servicos) || []; return L.find(x => String(x.svc) === String(B.svc)) || { svc: B.svc, name: svcName(B.svc), total: null }; };
const prazo = x => x && x.days ? x.days + ' ' + bt('영업일', 'business days') : bt('도착일 정보 없음', 'no transit time');

function pintarPreco() {
  const area = $('sbPreco'); if (!area) return;
  const L = caixasVivas(), base = B.cot && B.cot.servicos ? B.cot : null, sv = servAtual(), tem = !!(base && sv.total);
  const st = B.cotBusy ? ['esp', L3('요금 다시 받는 중… (UPS 1분 안팎)', 'Updating rate… (about 1 min)', 'Atualizando cotação… (cerca de 1 min)'), 1] : B.cot && B.cot.erro ? ['erro', B.cot.erro] : base ? ['ok', bt('방금 받은 요금', 'Rate updated now')] : ['esp', bt('박스를 넣으면 요금이 나옵니다', 'Add a box to see the rate')];
  area.innerHTML = '<div class="su-frete-main' + (B.cotBusy ? ' atualizando' : '') + '"><div><div class="su-frete-rot">' + bt('운임', 'Freight') + '</div>' +
    '<div class="su-frete-valor">' + (tem ? esc(money(sv.total)) : '—') + '</div><div class="su-frete-nome">' + esc(sv.name || svcName(sv.svc)) + '</div>' +
    '<div class="su-frete-prazo">' + (tem ? esc(prazo(sv)) : '') + '</div>' + (L.length > 1 ? '<div class="su-preco-tit">' + L3('박스 ' + L.length + '개 합계', 'Total for ' + L.length + ' boxes', 'Total de ' + L.length + ' caixas') + '</div>' : '') +
    '</div><div class="su-ups-selo">UPS</div></div><div class="su-frete-st ' + st[0] + '">' + (st[2] ? '<span class="fb-spin"></span>' : '') + esc(st[1]) + '</div>';
  const det = $('sbPrecoDet'); if (det) det.innerHTML = base && base.ambiente === 'test' ? '<div class="hint">' + bt('시험 서버 요금입니다 (UPS_ENV=test)', 'Test-server rate (UPS_ENV=test)') + '</div>' : '';
  pintarOutros(); pintarResumo(L);
}
function pintarOutros() {
  const area = $('sbCotacao'); if (!area) return;
  const L = ((B.cot && B.cot.servicos) || []).filter(x => String(x.svc) !== String(B.svc));
  area.innerHTML = !L.length ? '' : '<div class="su-cot' + (B.cotBusy ? ' atualizando' : '') + '">' + L.map(x => '<button type="button" class="su-cot-op" data-sb-cot="' + esc(x.svc) + '"><span class="su-cot-nome">' + esc(x.name) + '</span><span class="su-cot-prazo">' + esc(prazo(x)) + '</span><span class="su-cot-preco">' + esc(money(x.total)) + '</span></button>').join('') + '</div>';
  area.querySelectorAll('[data-sb-cot]').forEach(b => b.onclick = () => { B.svc = b.dataset.sbCot; if ($('sbServico')) $('sbServico').value = B.svc; pintarPreco(); });
}
function pintarResumo(L) {
  const el = $('sbResumo'); if (!el) return;
  const peso = L.reduce((s, c) => s + (Number(c.peso) || 0), 0), ult = L[L.length - 1];
  el.innerHTML = L.length ? '<b>' + L3(L.length + '박스 · ' + num1(peso) + ' lb', L.length + ' box(es) · ' + num1(peso) + ' lb', L.length + (L.length > 1 ? ' caixas · ' : ' caixa · ') + num1(peso) + ' lb') + '</b><span>' + esc((medTxt(ult) || '—') + ' | ' + num1(ult.peso) + ' lb') + (L.length > 1 ? ' · ' + bt('마지막 박스', 'last box') : '') + '</span>' : '<b>' + bt('아직 박스가 없습니다', 'No boxes yet') + '</b><span>&nbsp;</span>';
  const bt1 = document.querySelector('.sb [data-act="sb-finalizar"]');
  if (bt1) { bt1.disabled = !L.length || B.emit; bt1.innerHTML = svg(ICO.print, 17) + ' ' + (L.length ? L3('라벨 ' + L.length + '장 인쇄', 'Print ' + L.length + ' label(s)', 'Imprimir ' + L.length + (L.length > 1 ? ' etiquetas' : ' etiqueta')) : bt('라벨 인쇄', 'Print label')) + ' ' + svg(ICO.dir, 16); }
  const bc = document.querySelector('.sb [data-act="sb-cotar"]'); if (bc) bc.disabled = !L.length;
  const n = document.querySelector('.sb .ups-cli-cx b'); if (n) n.textContent = L.length;
}

/* ---------- 주소 확인 (가게를 고르면 자동, 한 번) ---------- */
function verHTML(a) {
  const v = B.av[a.acct];
  if (!v) return '<button type="button" class="btn sm" data-act="sb-ver">' + L3('UPS 로 확인', 'Verify with UPS', 'Verificar na UPS') + '</button>';
  if (v.st === 'wait') return '<span class="cl-selo off"><span class="fb-spin"></span> ' + L3('UPS 에 묻는 중…', 'Asking UPS…', 'Consultando a UPS…') + '</span>';
  if (v.st === 'error') return '<span class="cl-selo out">' + esc(v.err || '') + '</span> <button type="button" class="btn sm" data-act="sb-ver">' + bt('다시', 'Retry') + '</button>';
  const same = (v.cands || []).some(c => adrKey(c) === adrKey(para(a)));
  if (v.valid && same) return '<span class="cl-selo ok">✓ ' + L3('UPS 확인된 주소', 'Address validated by UPS', 'Endereço validado pela UPS') + (v.cls ? ' · ' + esc(v.cls) : '') + '</span>';
  const c = (v.cands || [])[0];
  if (v.none || !c) return '<div class="su-ver-faixa out">' + svg(ICO.x, 14) + ' <b>' + L3('UPS 가 이 주소를 찾지 못했습니다', 'UPS could not find this address', 'A UPS não encontrou este endereço') + '</b> ' + bt('라벨 전에 확인하세요', 'check before printing') + '</div>';
  return '<div class="su-ver-faixa av"><div>' + svg(ICO.pin, 14) + ' <b>' + L3('UPS 추천 주소', 'UPS suggests', 'A UPS sugere') + '</b><span>' + esc([c.addr1, c.addr2].filter(Boolean).join(', ')) + '<br>' + esc([c.city, c.state, c.zip].filter(Boolean).join(', ')) + '</span></div>' +
    (can('items') || S.role === 'admin' || S.role === 'owner' ? '<button type="button" class="btn sm primary" data-act="sb-ver-aplicar">' + bt('거래처에 적용', 'Apply') + '</button>' : '') + '</div>';
}
async function verificar(a, forcar) {
  if (!a || (B.av[a.acct] && !forcar)) return;
  if (!a.addr || !a.zip) { B.av[a.acct] = { none: true }; return pintarVer(); }
  B.av[a.acct] = { st: 'wait' }; pintarVer();
  const id = 'AV-BAL-' + a.acct + '-' + Date.now().toString(36);
  try { await S.DB.set('shipq', id, { st: 'av', kind: 'av', to: para(a), orderId: '', by: S.user.email, createdAt: new Date().toISOString() }); const x = await esperar(id, ['avdone'], ['averr'], 40); B.av[a.acct] = !x ? { st: 'error', err: bt('응답 없음', 'No answer') } : x.st === 'averr' ? { st: 'error', err: x.err } : x; }
  catch (e) { B.av[a.acct] = { st: 'error', err: String(e.code || e.message) }; }
  pintarVer();
}
function pintarVer() { const a = cliAtual(), el = document.querySelector('.sb .ups-ver'); if (a && el) { el.innerHTML = verHTML(a); ligarVer(); } }
function ligarVer() {
  const a = cliAtual(); if (!a) return;
  document.querySelectorAll('.sb [data-act="sb-ver"]').forEach(b => b.onclick = () => verificar(a, true));
  document.querySelectorAll('.sb [data-act="sb-ver-aplicar"]').forEach(b => b.onclick = async () => {
    const c = (B.av[a.acct].cands || [])[0]; if (!c) return;
    if (!(await confirmBox(bt('거래처 주소를 UPS 추천 주소로 바꿀까요?', 'Replace the customer address with the UPS suggestion?') + '\n' + [c.addr1, c.addr2, c.city, c.state, c.zip].filter(Boolean).join(', '), bt('적용', 'Apply')))) return;
    try { await S.DB.update('accounts', a.acct, { addr: c.addr1, addr2: c.addr2 || a.addr2 || '', city: c.city, state: c.state, zip: c.zip, updatedAt: new Date().toISOString(), addrBy: S.user.email }); Object.assign(a, { addr: c.addr1, addr2: c.addr2 || a.addr2 || '', city: c.city, state: c.state, zip: c.zip }); await bumpAccountsVer(); B.av[a.acct] = { valid: true, cands: [para(a)] }; B.cot = null; toast(bt('주소를 바꿨습니다', 'Address updated'), 'good'); page(); }
    catch (e) { toast(bt('실패', 'Failed') + ': ' + (e.code || e.message), 'bad'); }
  });
}

/* ---------- 화면 ---------- */
function campo(id, rot, val, ico, ph) {
  return '<div class="field"><label>' + (ico ? '<span class="ups-campo-ico">' + svg(ico, 16) + '</span>' : '') + rot + '</label><input id="' + id + '" type="number" inputmode="decimal" min="0" step="0.1"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' value="' + esc(String(val == null ? '' : val)) + '"></div>';
}
function cartaz(a, n) {
  const dado = (ico, rot, corpo) => '<div class="ups-dado"><span class="ups-dado-ico">' + svg(ico, 22) + '</span><div class="ups-dado-txt"><i>' + rot + '</i><b>' + corpo + '</b></div></div>';
  const end = [a.addr, a.addr2, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(x => String(x || '').trim()), vz = '<span class="ups-vazio">---</span>';
  const sm = String(a.sm || '').toUpperCase(), smN = sm && S.smByCode && S.smByCode[sm] && S.smByCode[sm].name ? sm + ' (' + S.smByCode[sm].name + ')' : sm;
  return '<div class="ups-cli-sel cartaz"><div class="ups-cartaz-head"><span class="ups-cli-cap"><i class="su-num">2</i>' + bt('받는 곳', 'Destination') + '</span><div class="ups-cartaz-bts"></div></div>' +
    '<div class="ups-cartaz-corpo"><div class="ups-cli-id"><div class="ups-cli-nome">' + esc(a.store || '') + '</div><span class="ups-cli-pilula">#' + esc(a.acct || '') + '</span>' +
    '<div class="ups-cli-cx"><b>' + n + '</b><i>' + bt('이번 출고 박스', 'boxes in this shipment') + '</i></div></div>' +
    '<div class="ups-cli-dados">' + dado(ICO.pin, bt('주소', 'Address'), (end.length ? end.map(esc).join('<br>') : vz) + '<div class="ups-ver">' + verHTML(a) + '</div>') +
    dado(ICO.predio, bt('계정', 'Account'), esc(a.acct || '') || vz) + dado(ICO.tel, bt('전화', 'Phone'), a.tel ? esc(a.tel) : vz) + dado(ICO.user, bt('세일즈맨', 'Salesman'), smN ? esc(smN) : vz) + '</div></div></div>';
}
function codHTML(a) {
  const on = codAtivo(a);
  return '<div class="su-res-bl' + (on ? ' su-cod-on' : '') + '" id="sbCodBl"><label class="su-cod-lab"><input type="checkbox" id="sbCod"' + (on ? ' checked' : '') + '> COD · Collect on Delivery</label>' +
    '<div class="su-cod-campo" id="sbCodCampo"' + (on ? '' : ' hidden') + '><input id="sbCodValor" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + esc(B.codValor || '') + '">' +
    '<small>' + bt('받을 금액 (USD) · 체크 · 머니 오더 (현금 아님) · 첫 박스에 전부', 'Amount to collect (USD) · check or money order (not cash) · all on the first box') + '</small></div></div>';
}
function buscaHTML() {
  const q = String(B.busca || '').trim(); if (!q) return '<div id="sbBuscaRes"></div>';
  const L = searchAccounts(S.accounts || [], q, 12).filter(a => !a.inactive);
  return '<div id="sbBuscaRes">' + (L.length ? '<div class="ups-achados">' + L.map((a, i) => '<button type="button" class="ups-cli' + (i ? '' : ' primeiro') + '" data-sb-cli="' + esc(a.acct) + '"><b>' + esc(a.store || '') + '</b><span class="ups-conta">#' + esc(a.acct) + '</span>' + (a.city ? '<span class="ups-tem">' + esc(a.city + (a.state ? ', ' + a.state : '')) + '</span>' : '') + '</button>').join('') + '</div>' : '<div class="graf-vazio">' + bt('찾는 가게가 없습니다', 'No store found') + '</div>') + '</div>';
}

export async function page() {
  css();
  const a = cliAtual(), cab = (t, s, bts) => '<div class="page-head"><div><h1>' + t + '</h1><p>' + s + '</p></div>' + (bts ? '<div class="su-head-bts">' + bts + '</div>' : '') + '</div>';
  if (!can('ship')) { $('page').innerHTML = '<div class="sb">' + cab('Shipping UPS', bt('출고 권한이 없습니다', 'No shipping permission')) + '</div>'; return; }
  if (!a) {
    $('page').innerHTML = '<div class="sb">' + cab('Shipping UPS', bt('가게를 찾아 박스를 넣고 UPS 라벨을 인쇄합니다', 'Find the store, add boxes, print the UPS label')) +
      '<div class="panel ups-painel"><div class="ups-passo"><label class="ups-lbl">' + bt('가게 계정 · 이름', 'Store account or name') + '</label><div class="ups-busca-l"><input id="sbBusca" class="ups-busca" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(bt('계정 번호 또는 가게 이름', 'Account number or store name')) + '" value="' + esc(B.busca) + '"></div></div>' + buscaHTML() + '</div></div>';
    const inp = $('sbBusca'); const pinta = () => { $('sbBuscaRes').outerHTML = buscaHTML(); ligarAchados(); };
    inp.oninput = () => { B.busca = inp.value; pinta(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { const f = document.querySelector('.sb [data-sb-cli]'); if (f) f.click(); } };
    ligarAchados(); setTimeout(() => { try { inp.focus(); } catch (e) {} }, 0);
    return;
  }
  const L = caixasVivas(), ult = B.caixas[B.caixas.length - 1];
  let h = '<div class="sb"><div class="su-tela"><div class="su-migalha">Shipping UPS <span>›</span> ' + bt('출고', 'Shipment') + '</div>' +
    cab(L3('UPS 출고', 'UPS shipment', 'Envio UPS'), bt('박스마다 무게와 크기 → 라벨 인쇄', 'Weight and size per box → print'),
      '<button type="button" class="btn" data-act="sb-limpar">' + svg(ICO.x, 15) + ' ' + bt('모두 지우기', 'Clear all') + '</button><button type="button" class="btn" data-act="sb-trocar">' + svg(ICO.troca, 15) + ' ' + bt('가게 바꾸기', 'Change store') + '</button>');
  if (B.editando) h += '<div class="aviso alerta" style="margin-bottom:14px">' + svg(ICO.lapis, 16) + '<div>' + esc(L3('고치는 중: ' + B.editando + ' — 옛 라벨은 취소됐습니다. 새 라벨을 인쇄하세요', 'Editing ' + B.editando + ' — the old label was voided. Print the new one', 'Editando ' + B.editando + ' — a etiqueta antiga foi anulada (void). Imprima a nova')) + '</div></div>';
  h += '<div class="su-grid"><div class="ups-card ups-card-cx"><div class="ups-card-head su-card-head"><i class="su-num">1</i><div><b>' + bt('박스 무게 · 크기', 'Box weight and size') + '</b><span>' + bt('잰 그대로 넣으세요', 'Enter as measured') + '</span></div>' +
    (ult ? '<button type="button" class="btn sm" data-act="sb-ultima">' + svg(ICO.repetir, 14) + ' ' + bt('지난 박스 크기 쓰기', 'Use last box size') + '</button>' : '') + '</div>' +
    '<div class="su-dims-row"><div class="su-peso-grupo"><div class="su-grupo-rot">' + bt('무게', 'Weight') + '</div><div class="su-peso-campo">' + campo('sbP', ' ', B.cx.peso, ICO.peso, 'Ex: 12.5') + '<span class="su-peso-un">lb</span></div></div>' +
    '<div class="su-dims-grupo"><div class="su-grupo-rot">' + bt('크기 (인치)', 'Size (in)') + '</div><div class="su-dims-3">' + campo('sbC', bt('길이', 'Length'), B.cx.c, ICO.setaH, 'Ex: 10') + campo('sbL', bt('너비', 'Width'), B.cx.l, ICO.setaH, 'Ex: 8') + campo('sbA', bt('높이', 'Height'), B.cx.a, ICO.setaV, 'Ex: 6') + '</div></div></div>' +
    '<div class="su-cx-bts"><div class="nu-enter">' + L3('Enter 로 다음 칸 · 높이에서 Enter = 박스 저장 · Esc 뒤 Enter = 라벨 인쇄', 'Enter = next field · Enter on height saves the box · Esc then Enter prints', 'Enter = próximo campo · Enter na altura salva a caixa · Esc e depois Enter imprime') + '</div><button type="button" class="btn" data-act="sb-cx-ok">' + svg(ICO.mais, 15) + ' ' + bt('박스 저장', 'Save box') + '</button></div>';
  if (B.caixas.length) h += '<h4 class="ups-h4">' + bt('저장한 박스', 'Saved boxes') + ' · ' + B.caixas.length + '</h4><div class="su-caixas">' + B.caixas.map((c, i) => '<div class="su-feita"><span class="su-n">' + (i + 1) + '</span><span><b>' + num1(c.peso) + ' lb</b> · ' + esc(medTxt(c)) + '</span><button type="button" class="btn-etq" data-act="sb-mexer" data-i="' + i + '" title="' + esc(bt('고치기', 'Edit')) + '">' + svg(ICO.lapis, 15) + '</button><button type="button" class="btn-etq" data-act="sb-tirar" data-i="' + i + '" title="' + esc(bt('빼기', 'Remove')) + '">' + svg(ICO.x, 15) + '</button></div>').join('') + '</div>';
  h += notasHTML(a) + ordsHTML(a);
  h += '</div><div class="su-col3">' + cartaz(a, L.length) +
    '<div class="su-frete" id="sbFrete"><div class="su-frete-head"><div class="su-frete-tit">' + svg(ICO.caixa, 20) + '<b>' + bt('출고 요약', 'Shipment summary') + '</b><small>' + bt('우리 UPS 계정으로 청구', 'Billed to our UPS account') + '</small></div><div class="su-preco" id="sbPreco"></div></div>' +
    '<div class="su-frete-corpo"><div class="su-res-bl"><i>' + bt('박스', 'Boxes') + '</i><div id="sbResumo" class="su-res-caixas"></div></div>' +
    '<div class="su-res-bl"><i>' + bt('받는 곳', 'Destination') + '</i><b>' + esc(a.store || '') + ' (#' + esc(a.acct) + ')</b><span>' + esc([a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')) + '</span></div>' +
    '<div class="su-res-bl"><i>' + bt('서비스', 'Service') + '</i><select id="sbServico">' + SVCS.map(s => '<option value="' + s[0] + '"' + (s[0] === B.svc ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></div>' + codHTML(a) +
    '<button type="button" class="btn primary grande cheio su-imprimir" data-act="sb-finalizar"></button><div class="su-preco-det" id="sbPrecoDet"></div>' +
    '<div class="su-outros-head"><h4 class="ups-h4">' + bt('다른 서비스', 'Other services') + '</h4><button type="button" class="btn sm" data-act="sb-cotar">' + svg(ICO.repetir, 14) + ' ' + bt('요금 다시', 'Re-quote') + '</button></div><div id="sbCotacao"></div></div></div></div></div>';
  h += '<div class="panel ups-painel"><div class="ups-fila-head"><h3 class="ups-h3">' + bt('이 가게 출고 기록', 'Shipments to this store') + '</h3></div><div id="sbHist">' + histHTML(a) + '</div></div></div></div>';
  const foco = document.activeElement && /^sb[PCLA]$/.test(document.activeElement.id) ? document.activeElement.id : null;
  $('page').innerHTML = h;
  ligar(a, foco);
  pintarPreco();
  if (L.length && (!B.cot || B.cot.assin !== assin(a, L))) cotarAoVivo();
  verificar(a);
  if (!B.hist[a.acct]) carregarHist(a);
  if (!B.notas[a.acct]) carregarNotas(a);
  if (!B.ords[a.acct]) carregarOrds(a);
}
function ligarAchados() { document.querySelectorAll('.sb [data-sb-cli]').forEach(b => b.onclick = () => { B.cli = b.dataset.sbCli; B.busca = ''; B.cot = null; B.foco = 'sbP'; page(); }); }

function histHTML(a) {
  const L = B.hist[a.acct];
  if (!L) return '<div class="graf-vazio">' + bt('읽는 중…', 'Loading…') + '</div>';
  const G = groupShipments(L).slice(0, 15);
  if (!G.length) return '<div class="graf-vazio">' + bt('아직 출고 기록이 없습니다', 'No shipments yet') + '</div>';
  return '<div class="tbl-scroll"><table><thead><tr><th>' + bt('날짜', 'Date') + '</th><th>' + bt('운송장', 'Tracking') + '</th><th class="num">' + bt('박스', 'Boxes') + '</th><th class="num">' + bt('무게', 'Weight') + '</th><th>' + bt('서비스', 'Service') + '</th><th class="num">' + bt('운임', 'Freight') + '</th><th>' + bt('담당', 'By') + '</th></tr></thead><tbody>' +
    G.map(s => { const x = s.a; return '<tr><td>' + esc(x.shipDate || '') + '</td><td style="font-variant-numeric:tabular-nums"><a class="rastreio" href="https://www.ups.com/track?tracknum=' + encodeURIComponent(x.trk || '') + '" target="_blank" rel="noopener noreferrer">' + esc(x.trk || '—') + ' ' + svg(ICO.link, 12) + '</a>' + (x.voided ? ' <span class="badge off">VOID</span>' : '') + (x.cod ? ' <span class="badge low">COD ' + esc(money(x.cod)) + '</span>' : '') + '</td><td class="num">' + s.n + '</td><td class="num">' + num1(s.w) + '</td><td>' + esc(x.svcName || svcName(x.svc)) + '</td><td class="num">' + (s.cost ? esc(money(s.cost)) : '—') + '</td><td>' + esc(String(x.by || '').split('@')[0]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
}
async function carregarHist(a) { B.hist[a.acct] = await shipmentsOf(a.acct); const el = $('sbHist'); if (el && cliAtual() === a) el.innerHTML = histHTML(a); }

function ligar(a, foco) {
  const ids = ['sbP', 'sbC', 'sbL', 'sbA'], k = { sbP: 'peso', sbC: 'c', sbL: 'l', sbA: 'a' };
  ids.forEach((id, i) => { const el = $(id); el.oninput = () => { B.cx[k[id]] = el.value; cotarAoVivo(); };
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (i < 3) { $(ids[i + 1]).focus(); $(ids[i + 1]).select(); } else salvarCaixa(); } else if (e.key === 'Escape') { e.preventDefault(); el.blur(); } }; });
  const q = sel => document.querySelector('.sb ' + sel), on = (act, f) => document.querySelectorAll('.sb [data-act="' + act + '"]').forEach(b => b.onclick = () => f(b));
  on('sb-cx-ok', salvarCaixa);
  on('sb-ultima', () => { const u = B.caixas[B.caixas.length - 1]; if (!u) return; B.cx = { peso: '', c: u.c, l: u.l, a: u.a }; B.foco = 'sbP'; page(); });
  on('sb-tirar', b => { B.caixas.splice(+b.dataset.i, 1); page(); });
  on('sb-mexer', b => { if (cxAndando()) return toast(bt('지금 입력 중인 박스를 먼저 저장하거나 지우세요', 'Save or clear the box being typed first'), 'bad'); B.cx = Object.assign({}, B.caixas[+b.dataset.i]); B.caixas.splice(+b.dataset.i, 1); B.foco = 'sbP'; page(); });
  on('sb-trocar', () => { B.cli = ''; B.busca = ''; B.editando = ''; zerar(); B.sel = {}; B.oSel = {}; page(); });
  on('sb-limpar', async () => { if ((B.caixas.length || cxAndando()) && !(await confirmBox(bt('박스를 모두 지울까요?', 'Clear all boxes?'), bt('지우기', 'Clear')))) return; zerar(); page(); });
  on('sb-cotar', () => { const L = caixasVivas(); if (!L.length) return toast(bt('박스가 없습니다', 'No boxes'), 'bad'); B.cot = null; cotar(a, L, assin(a, L)); });
  on('sb-finalizar', () => finalizar());
  on('sb-notas-tudo', notasTudo);
  document.querySelectorAll('.sb [data-sb-nota]').forEach(c => c.onchange = () => { B.sel[c.dataset.sbNota] = c.checked; page(); });
  document.querySelectorAll('.sb [data-sb-ord]').forEach(c => c.onchange = () => { B.oSel[c.dataset.sbOrd] = c.checked; });
  ligarVer();
  const sv = $('sbServico'); sv.onchange = () => { B.svc = sv.value; pintarPreco(); };
  const cb = $('sbCod'), cv = $('sbCodValor');
  cb.onchange = () => { B.cod = cb.checked; $('sbCodCampo').hidden = !cb.checked; $('sbCodBl').classList.toggle('su-cod-on', cb.checked); if (cb.checked) { try { cv.focus(); } catch (e) {} } };
  cv.oninput = () => { B.codValor = cv.value; cv.classList.remove('erro'); };
  cv.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); cv.blur(); } };
  const f = B.foco || foco; B.foco = null;
  /* 바로 커서를 둠 — setTimeout 으로 미루면 빨리 치는 사람 · 스캐너의 첫 글자가 빈 곳으로 감 */
  if (f && $(f)) { try { $(f).focus(); } catch (e) {} }
  if (!q('.su-tela')) return;
}
function zerar() { B.cx = {}; B.caixas = []; B.cot = null; B.cotBusy = false; B.cotSeq++; clearTimeout(B.cotTimer); }
function salvarCaixa() {
  const c = B.cx;
  if (!(Number(c.peso) > 0)) { toast(bt('무게를 넣으세요', 'Enter the weight'), 'bad'); return $('sbP') && $('sbP').focus(); }
  if (!(Number(c.c) > 0 && Number(c.l) > 0 && Number(c.a) > 0)) { toast(bt('길이 · 너비 · 높이를 넣으세요', 'Enter length, width and height'), 'bad'); return $('sbC') && $('sbC').focus(); }
  B.caixas.push({ peso: c.peso, c: c.c, l: c.l, a: c.a });
  B.cx = {}; B.foco = 'sbP'; page();   /* 크기는 다음 박스로 넘어가지 않음 — 잰 적 없는 박스가 저장되는 것을 막음 */
}
/* Esc 로 칸에서 나온 뒤 Enter = 인쇄 (칸 안의 Enter 는 절대 인쇄하지 않음) */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.repeat || location.hash.indexOf('#/balcao') !== 0 || !cliAtual()) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
  if (document.querySelector('.ovl.on, #mbox:not(:empty)') && document.querySelector('.ovl.on')) return;
  e.preventDefault(); finalizar();
});
/* A (칸 밖에서) = 이 가게 Notes UPS 박스 모두 넣기 / 빼기 */
document.addEventListener('keydown', e => {
  if (e.code !== 'KeyA' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || location.hash.indexOf('#/balcao') !== 0 || !cliAtual() || !(B.notas[B.cli] || []).length) return;
  const t = e.target, tag = t && t.tagName; if (tag === 'INPUT' && t.type !== 'checkbox' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault(); notasTudo();
});

async function finalizar() {
  if (B.emit) return;
  const a = cliAtual(); if (!a) return;
  if (!cxCompleta() && cxAndando()) return toast(bt('입력 중인 박스를 다 채우거나 지우세요', 'Finish or clear the box being typed'), 'bad');
  const L = caixasVivas(); if (!L.length) return toast(bt('박스가 없습니다', 'No boxes'), 'bad');
  if (!a.addr || !a.city || !a.state || !a.zip) return toast(bt('거래처 주소가 부족합니다 (주소 · City · State · ZIP)', 'Customer address is incomplete'), 'bad');
  const cod = codParaEnvio(a);
  if (cod && cod.erro) { const ce = $('sbCodValor'); if (ce) { ce.classList.add('erro'); ce.focus(); } return toast(cod.erro, 'bad'); }
  B.emit = true; pintarResumo(L);
  const fecha = overlay('wait', L3('UPS 라벨 만드는 중…', 'Creating UPS labels…', 'Gerando etiquetas UPS…'), L3('박스 ' + L.length + '개 · 1~2분 걸립니다', L.length + ' box(es) · takes 1–2 min', L.length + ' caixa(s) · leva 1–2 min'));
  const id = newId('X'), now = new Date().toISOString(), no = 'ADHOC-' + today().replace(/-/g, '').substring(2) + '-' + id.slice(-4).toUpperCase();
  let x = null;
  try {
    const OS = ordsSel();
    await S.DB.set('adhoc', id, { id, no, col: 'adhoc', st: 'open', store: a.store || '', acct: a.acct, sm: a.sm || '', invs: [].concat(...OS.map(o => o.invs || [])), orderIds: OS.map(o => o.id), desc: 'Shipping UPS', src: 'balcao', noteIds: notasSel().map(n => n.id), createdBy: S.user.email, createdAt: now, updatedAt: now, to: para(a) });
    await S.DB.set('shipq', id, Object.assign(payload(a, L, { adhocId: id, no, cod: cod || null }), { id, st: 'wait', createdAt: now }));
    x = await esperar(id, ['done'], ['error'], 60);
  } catch (e) { x = { st: 'error', err: String(e.code || e.message) }; }
  fecha(); B.emit = false;
  if (!x || x.st !== 'done') { pintarResumo(caixasVivas()); return overlay('erro', bt('라벨을 만들지 못했습니다', 'Label not created'), x ? 'UPS: ' + (x.err || '') : bt('응답이 없습니다 — 배송 조회에서 확인하세요 (다시 누르면 라벨이 두 번 생길 수 있음)', 'No answer — check Tracking before trying again'), true); }
  try { await S.DB.update('adhoc', id, { track: x.track, shipVia: 'UPS', boxes: (x.labels || []).length, shipCost: x.charge || 0, st: 'shipped', shippedAt: new Date().toISOString(), shippedBy: S.user.email, updatedAt: new Date().toISOString() }); } catch (e) {}
  /* 🧾 고른 주문 → 📦 포장 완료 + 트래킹 (예전 출고 창과 같은 칸 — 🚛 UPS 인계 · 배송 조회 · 출고 취소가 그대로 됨) */
  const OS2 = ordsSel(), at2 = new Date().toISOString();
  for (let i = 0; i < OS2.length; i++) { try { await S.DB.update('orders', OS2[i].id, { st: 'packed', packAt: at2, packBy: S.user.email, shipVia: 'UPS', boxes: (x.labels || []).length, track: x.track || '', shipCost: i ? 0 : (x.charge || 0), shipId: id, updatedAt: at2 }); } catch (e) {} }
  if (OS2.length) { OS2.forEach(o => delete B.oSel[o.id]); delete B.ords[a.acct]; }
  const nIds = notasSel().map(n => n.id); if (nIds.length) { try { await marcarEnviadas(nIds, id, x.track); } catch (e) {} delete B.notas[a.acct]; B.sel = {}; }
  imprimir(x);
  B.cli = ''; B.busca = ''; B.cod = null; B.codValor = ''; B.codCli = ''; B.editando = ''; zerar(); delete B.hist[a.acct];
  let voltou = false; const voltar = () => { if (voltou) return; voltou = true; if (location.hash.indexOf('#/balcao') === 0) page(); };
  const f2 = overlay('ok', '✅ ' + L3('라벨 ' + (x.labels || []).length + '장', (x.labels || []).length + ' label(s)', (x.labels || []).length + ' etiqueta(s)'), (x.track || '') + (x.charge ? ' · ' + money(x.charge) : '') + (cod ? ' · COD $' + cod.valor : ''), false, voltar);
  setTimeout(() => { f2(); voltar(); }, SB_OK_MS);
}
/** 🖨 라벨 — UPS GIF 를 4×6 세로로 돌리고 아래 띠를 자르고 흑백으로 (옛 앱과 같은 처리: 열전사에서 흐려지지 않게) */
export function imprimir(q) {
  const L = (q.labels || []).filter(l => l && l.img); if (!L.length) return;
  const prontas = []; let pend = L.length;
  const norm = im => { const deit = im.naturalWidth > im.naturalHeight, w = deit ? im.naturalHeight : im.naturalWidth; let h = deit ? im.naturalWidth : im.naturalHeight; const alvo = Math.round(w * 1.5); if (h > alvo) h = alvo;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (deit) { g.translate(w, 0); g.rotate(Math.PI / 2); } g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h), p = d.data; for (let i = 0; i < p.length; i += 4) { const v = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 < 128 ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; } g.putImageData(d, 0, 0); return c.toDataURL('image/png'); };
  const fim = () => { if (--pend) return; printOpen('<style>@page{size:4in 6in;margin:0}.sblbl{width:4in;height:6in;page-break-after:always;break-after:page;overflow:hidden}.sblbl img{display:block;width:4in;height:6in}</style>' + prontas.map(s => '<div class="sblbl"><img src="' + s + '" alt=""></div>').join('')); };
  L.forEach((l, i) => { const im = new Image(), src = 'data:image/gif;base64,' + l.img; im.onload = () => { try { prontas[i] = norm(im); } catch (e) { prontas[i] = src; } fim(); }; im.onerror = () => { prontas[i] = src; fim(); }; im.src = src; });
}
function overlay(tipo, tit, sub, fechavel, aoFechar) {
  const d = document.createElement('div'); d.className = 'sb'; d.style.cssText = 'padding:0;margin:0;min-height:0;background:none';
  d.innerHTML = '<div class="sb-ovr"><div class="sb-ok' + (tipo === 'erro' ? ' erro' : '') + '"><div class="sb-ok-ic">' + (tipo === 'wait' ? '<span class="fb-spin" style="width:24px;height:24px;margin:0"></span>' : svg(tipo === 'erro' ? ICO.x : '<polyline points="20 6 9 17 4 12"/>', 28)) + '</div><b>' + tit + '</b><div style="color:var(--muted)">' + esc(sub || '') + '</div>' + (fechavel ? '<button type="button" class="btn" style="margin-top:14px">OK</button>' : '') + '</div></div>';
  document.body.appendChild(d);
  const fecha = () => { if (d.isConnected) d.remove(); if (aoFechar) aoFechar(); };
  if (tipo !== 'wait') d.onclick = fecha;
  return fecha;
}
