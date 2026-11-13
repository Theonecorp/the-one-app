/* ============================================================
 *  🧮 발주 계획 · 🧾 발주서 공용 — 옛 THE ONE CORP WMS 의 pcp* · pco* 가 같이 쓰던 것 (plan.js · pocompra.js)
 *    문구 t · ti · te · tie · tiu (옛 앱과 같은 규칙: ti/tie 는 {칸} 이 비면 빈 글) · 숫자 numFmt(en-US) · 돈 brl($ en-US)
 *    단위 pcuSigla · pcuCaixa · pcuSiglaConj · pcuQtd · pcuTexto · pcuNumHTML · pcuSufHTML (옛 5DB · 5DG)
 *    권한 canPlan (옛 pcpPode = GERENTE || GERENTE1 → 새 앱: 관리자 · 오너 · 오피스 매니저 · 창고 매니저)
 *    공장 설정 parOf (settings/app.planParams — 옛 fornecedores.lead_time_dias · dias_seguranca · dias_ciclo, 기본 60 / 30 / 30)
 *    창 pergunta (옛 pergunta() — 열린 채로 onSim 을 부르고 닫음) · CSS 넣기
 * ============================================================ */
import { esc, toast } from './ui.js';
import { S as MAIN, isTop, isOwner, myJobs } from './main.js';
import * as E from './etq.js';
import { L3 } from './balcao.js';
import { supLabel, suppliers } from './stock.js';
import { PM_DOC_CSS } from './produtos-css.js';
import { PCP_CSS, PCP_DOC_CSS } from './plan-css.js';
import { D, DI } from './plan-txt.js';

let S = null;
let LIGADO = false;
export function init(state) {
  S = state; E.init(state);
  /* 다른 화면으로 가면 서랍 · 창을 닫음 (옛 앱은 화면을 바꾸면 서랍이 닫혔음) — 발주 계획 ↔ 발주서 사이는 각 화면이 정함 */
  if (!LIGADO && typeof window !== 'undefined') { LIGADO = true; window.addEventListener('hashchange', () => { document.querySelectorAll('.pcp-dw').forEach(x => x.remove()); document.querySelectorAll('.es-mw.pcp-raiz').forEach(x => x.remove()); }); }
}
export const st = () => S || MAIN;

/* ---------- 권한 ---------- */
/** 누가 쓰나 — 관리자 · 오너 · 오피스 매니저 · 창고 매니저 (옛 pcpPode = GERENTE || GERENTE1) */
export const canPlan = () => { const s = S || MAIN; if (!s) return false; if (isTop()) return true; return s.role === 'manager' && myJobs().some(j => ['office', 'whmgr'].includes(j)); };
/** 공장 설정 · 메일 설정 저장 — 규칙 staffJob(['office']) 과 같게 (창고 매니저는 보기만) */
export const canCfg = () => isTop() || myJobs().includes('office');

/* ---------- 문구 (옛 t · ti · te · tie · tiu) ---------- */
/* 새 앱에서 더한 문구 (옛 앱에 없던 상황 — 원가를 못 보는 역할 · 메일 대기열) */
export const PLUS = {
  pcp_custo_oculto: ['원가는 관리자 · 오너만 봅니다', 'Cost is visible to admin and owner only', 'Custo visível só para o administrador e o dono'],
  pcm_fila: ['마지막 발송: {d} · 메일 대기열에서 보내는 중 ({n}명)', 'Last send: {d} · waiting in the mail queue ({n} recipients)', 'Último envio: {d} · na fila de e-mail ({n} destinatários)'],
  pcm_pdf_erro: ['발주서 PDF 를 만들지 못해 메일을 보내지 않았습니다', 'Could not build the PO PDF — e-mail not sent', 'Não consegui montar o PDF do pedido — e-mail não enviado'],
  pcm_pdf_grande: ['발주서 PDF 가 너무 커서 메일에 붙일 수 없습니다 — PDF 를 받아 직접 보내세요', 'The PO PDF is too large to attach — download it and send it yourself', 'O PDF do pedido é grande demais para anexar — baixe e envie você mesmo']
};
const pick = (o, k) => (o[k] ? L3(o[k][0], o[k][1], o[k][2]) : null);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, a) => (v && v[a] != null ? v[a] : ''));
export const t = (k, v) => { const s = pick(D, k) || pick(PLUS, k) || pick(DI, k); return s == null ? k : (v ? fill(s, v) : s); };
export const ti = (k, v) => { const s = pick(DI, k) || pick(PLUS, k) || pick(D, k); return s == null ? '' : fill(s, v); };
export const te = k => (D[k] ? D[k][1] : PLUS[k] ? PLUS[k][1] : DI[k] ? DI[k][1] : k);
export const tie = (k, v) => fill(DI[k] ? DI[k][1] : D[k] ? D[k][1] : '', v);
export const tiu = (k, v, fn) => (fn || ti)(k, v).replace(/ {2,}/g, ' ').replace(/ +·/g, ' ·').trim();
export const numFmt = (n, d) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
export const brl = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const dataBR = E.dataBR, horaCurta = E.horaCurta;
export const dataEN = v => { if (!v) return ''; const s = String(v); const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
export const dataCurtaHora = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const h = E.horaCurta(iso); return d.toDateString() === new Date().toDateString() ? h : d.toLocaleDateString() + ' ' + h; };
export const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
export const ymdLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const hojeISO = () => ymdLocal(new Date());
export function uuidNovo() {
  try {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    if (window.crypto && crypto.getRandomValues) { const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128; const h = Array.prototype.map.call(b, x => ('0' + x.toString(16)).slice(-2)).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
  } catch (e) {}
  return null;
}
export const quem = () => E.quem();
export function aviso(msg, ruim) { toast(msg, ruim ? 'bad' : 'good'); }

/* ---------- 아이콘 (옛 ICO — etq.js 에 없는 것만 더함) ---------- */
export const ICO = Object.assign({}, E.ICO, {
  compra: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  cfg: '<circle cx="12" cy="12" r="3"/><path d="M20.3 14.6a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.93-1.16l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.1 14h-.1a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.15-2.93l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.87 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20.9 10h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-.6.6z"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  lapis: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  repetir: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><polyline points="3 21 3 16 8 16"/>'
});
export const svg = (p, n) => E.svg(p, n);

/* ---------- CSS ---------- */
export function injetarCss() {
  E.injetarCss();
  if (!document.getElementById('pcpCss')) { const s = document.createElement('style'); s.id = 'pcpCss'; s.textContent = PCP_CSS; document.head.appendChild(s); }
  if (!document.getElementById('pcpDocCss')) { const s = document.createElement('style'); s.id = 'pcpDocCss'; s.textContent = PM_DOC_CSS + PCP_DOC_CSS; document.head.appendChild(s); }
}

/* ---------- 공장 (옛 fornecedores) — settings/app.suppliers + 아이템의 sup · 설정 planParams ---------- */
export const DEF = { lead: 60, seg: 30, cyc: 30 };
const params = () => (st().settings && st().settings.planParams) || {};
export const parOf = sup => { const p = (sup && params()[sup]) || {}; return { lead: +p.lead || DEF.lead, seg: p.seg != null && p.seg !== '' ? +p.seg : DEF.seg, cyc: +p.cyc || DEF.cyc }; };
export const fornNome = c => (c ? supLabel(c) : '');
/** 옛 DADOS.forns — { id, nome, lead_time_dias, dias_seguranca, dias_ciclo } (공장 목록 + 아이템에 적힌 코드) */
export function forns(extraCodes) {
  const set = new Set(suppliers().map(f => f.code).filter(Boolean)); (extraCodes || []).forEach(c => { if (c) set.add(c); });
  return Array.from(set).map(c => { const p = parOf(c); return { id: c, nome: fornNome(c), lead_time_dias: p.lead, dias_seguranca: p.seg, dias_ciclo: p.cyc }; });
}

/* ---------- 단위 (옛 pcuSigla · pcuCaixa · pcuSiglaConj · pcuQtd · pcuTexto · pcuNumHTML · pcuSufHTML) ---------- */
export const pcuSigla = (x, fn) => (fn || t)(String(x && x.unidade || 'un') === 'dz' ? 'und_dz' : 'un_curto');
export function pcuCaixa(x, q, fn) { const u = Number(x && x.un_por_caixa) || 1; if (!(u > 1) || !(q > 0)) return ''; return (fn === te ? tie : ti)('pcp_cx', { c: numFmt(q / u), u: numFmt(u) }); }
export function pcuSiglaConj(itens, fn) { const f = fn || t; let und = null; for (let i = 0; i < (itens || []).length; i++) { const s = pcuSigla(itens[i], f); if (und === null) und = s; else if (und !== s) return ''; } return und === null ? f('un_curto') : und; }
export const pcuQtd = (x, q, fn) => numFmt(q) + ' ' + pcuSigla(x, fn);
export function pcuTexto(x, fn) { const f = fn || t, u = Number(x && x.un_por_caixa) || 1; return pcuSigla(x, f) + (u > 1 ? ' · ' + (f === te ? tie : ti)('und_por_caixa', { n: numFmt(u) }) : ''); }
export function pcuNumHTML(x, q, fn) { const n = Number(q) || 0, cx = pcuCaixa(x, n, fn); return esc(pcuQtd(x, n, fn)) + (cx ? '<small>' + esc(cx) + '</small>' : ''); }
export const pcuSufHTML = (x, fn) => '<i class="pco-un">' + esc(pcuSigla(x, fn)) + '</i>';
/** 옛 pcpCmpSku — 같은 SKU 순서 (14KAKG2 가 14KAKG10 앞) */
export const pcpCmpSku = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
export const pcoVivos = itens => (itens || []).filter(it => !it.removido_em);
/** 옛 pcoBadge */
export function pcoBadge(s) { const m = { rascunho: 'off', enviado: 'high', recebido_parcial: 'low', recebido: 'ok', cancelado: 'out' }; return '<span class="badge ' + (m[s] || 'off') + '">' + esc(t('pco_st_' + s)) + '</span>'; }

/* ---------- 창 (옛 pergunta) — .sb.pcp-raiz 안 .modal-card ---------- */
export function pergunta(cfg) {
  const w = E.abrirModal('<div class="modal-head"><h2>' + esc(cfg.titulo || '') + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body">' + (cfg.texto ? '<p style="margin:0 0 10px">' + esc(cfg.texto) + '</p>' : '') + (cfg.html || '') + '</div>' +
    '<div class="modal-foot">' + (cfg.umBotao ? '' : '<button class="btn" data-act="fechar-modal" id="pergNao">' + esc(cfg.nao || t('pco_cancelar')) + '</button>') + '<button class="btn ' + (cfg.perigo ? 'perigo danger' : 'primary') + '" id="pergSim"' + (cfg.umBotao ? ' style="margin-left:auto"' : '') + '>' + esc(cfg.sim || 'OK') + '</button></div>', cfg.cls);
  w.classList.add('pcp-raiz'); w.querySelector('.modal-card').id = 'pergCard';
  w.querySelector('#pergSim').onclick = () => { const r = cfg.onSim ? cfg.onSim(w) : null; if (r !== false) E.fecharModal(); };
  return w;
}
export const fecharModal = () => E.fecharModal();
export const abrirModalPcp = (html, cls) => { const w = E.abrirModal(html); w.classList.add('pcp-raiz'); const c = w.querySelector('.modal-card'); if (cls) c.classList.add(cls); return w; };

/* ---------- 서랍 (옛 #drawer · .drawer) — body 아래 .sb.pcp-raiz ---------- */
export function drawerAbrir(html, onClick) {
  let w = document.querySelector('.pcp-dw');
  if (!w) {
    w = document.createElement('div'); w.className = 'sb pcp-raiz pcp-dw'; w.style.cssText = 'position:fixed;inset:0;z-index:170;padding:0;margin:0;min-height:0;background:transparent';
    w.innerHTML = '<div class="scrim show" data-act="fechar-drawer"></div><div class="drawer show" id="pcpDrawer"></div>';
    document.body.appendChild(w);
  }
  w.onclick = onClick || null;
  document.getElementById('pcpDrawer').innerHTML = html;
  return document.getElementById('pcpDrawer');
}
export function drawerFechar() { document.querySelectorAll('.pcp-dw').forEach(x => x.remove()); }
export const drawerAberto = () => !!document.querySelector('.pcp-dw');

/* ---------- 원가 (prodCusto — 관리자 · 오너만 읽음) ---------- */
export async function lerCustos() {
  const s = st(), m = {};
  try { (await s.DB.list('prodCusto')).forEach(r => { if (r.custo != null && r.custo !== '') m[r.id] = Number(r.custo) || 0; }); return { ok: true, m }; }
  catch (e) { return { ok: false, m }; }
}
export const custoVisivel = () => isOwner();   // 규칙 prodCusto = isOwner() 와 같은 사람 (못 읽으면 lerCustos 가 ok:false)
