/* ============================================================
 *  🖼 Notes Display (#/displays) — 옛 THE ONE CORP WMS 의 Notes Display 화면을 그대로 (흐름 · 레이아웃 · 글 · 단추)
 *    옛 앱에서 Notes UPS 와 한 가족 (머리 · 숫자 칸 · 가게 찾기 · 가게 카드 · 라벨 · 박스 합치기는 notesups.js 의 것을 같이 씀)
 *    화면: 숫자 3개(대기 — 박스 수 · 준비 중 — 박스 수 · 24시간 안에 끝남) + 폰 FAB
 *          [새 요청] → 가게 → Empty Display 찾기 → 고른 상품의 − N + → "요청에 넣기" → 다음 상품 … · "Outros"(카탈로그에 없는 것 — 글) · 준비 날짜(꼭) → "요청 보내기"
 *          두 칸: 준비 대기(가게마다 카드 하나 — 여러 요청이 모임 · 준비 날짜 순 · 늦음/오늘 색) | 끝남(지난 24시간 · 요청마다 카드)
 *          카드 단추: 준비 시작(맡기 — 먼저 누른 사람 · 늦은 사람은 누가 맡았는지 봄) · 끝내기 · 놓기 · 취소 — 그 가게의 열린 줄 전부에
 *          끝내기 = 단위(개)마다 Notes UPS 박스 하나(상품의 배송 무게 · 크기 — prodExtra) → 새 박스 라벨(6×4, 전체 수 없이) 인쇄 · Outros 는 "무게로 끝내기"(무게 · 크기 직접)
 *          줄 고르기 → "한 박스로 합치기"(같은 가게 · 무게 · 크기 직접 · 얼마씩 넣을지) · 끝남 카드 고르기 → 그 박스들을 Notes UPS 에서 합치기
 *  자료 (옛 notas_display 줄을 그대로 — 나중에 옛 자료를 1:1 로 옮길 수 있게)
 *    notasDisplay/{id} = { id, grupo(한 번 보낸 요청 = 첫 줄 id), acct, store, sm, code(카탈로그 코드 — 옛 produto_id · Outros 는 ''), nome, texto(Outros 글),
 *                          qtd, qtdFeita, paraEm('YYYY-MM-DD'), status: 'pendente'|'preparando'|'concluido'|'cancelado',
 *                          peso, comp, larg, alt(보낼 때의 배송 무게 · 크기 — 끝낼 때는 prodExtra 를 다시 읽고, 없으면 이것),
 *                          criadoEm, criadoPor, criadoPorNome, iniciadaPor, iniciadaPorNome, iniciadaEm, concluidaEm, concluidaPor, concluidaPorNome,
 *                          canceladaEm, canceladaPor, fimEm(끝나거나 취소된 때 — "지난 24시간" 칸), notaIds:[upsnotes id], orderId, orderNo, legado(옛 displays id) }
 *    박스 = notesups.js 의 upsnotes (src 'display' · prods · ndIds) — Notes UPS 대기 줄에 들어가고 Shipping UPS(balcao.js)가 그 가게 박스로 집음
 *    맡기 · 끝내기 · 놓기 · 취소 · 합치기는 쓰기 직전에 S.DB.fresh 로 다시 읽음 · firestore.rules 가 남이 맡은 줄을 다른 사람으로 덮어쓰지 못하게 막음
 *  예전 displays 문서(이 화면의 이전 판 — v0.8.164~): 열린 것(open · prep · hold · done)은 쓰기 권한이 있는 사람이 화면을 열 때 notasDisplay 줄로 옮김(migrate on read)
 *    — 상품마다 한 줄 · open/hold → pendente · prep/done → preparando(시작한 사람 그대로) · 무게 · 크기는 그 문서의 것 · 원래 문서는 st 'migr' + migradoEm 만 바뀜 (지우지 않음)
 *    끝난 것(notes · shipped · x)은 그대로 두고 화면에 보이지 않음 (그 박스는 이미 Notes UPS · UPS 에 있음)
 *  주문 창의 "🖼 Notes Display" (fulfill.js → form) = 이 화면의 새 요청 칸을 그 가게로 열고, 세일즈맨이 요청한 종류 · 개수 · 설명을 Outros 줄로 미리 넣음 (주문 번호가 줄에 남음)
 *  권한: notesups.js 의 mexe(옛 podeMexerEstoque) = 보내기 · 시작 · 합치기 / 끝내기 · 놓기 = 시작한 사람 또는 gerente(옛 GERENTE · GERENTE1) / 취소 = 보낸 사람 · 시작한 사람 · gerente
 *  옮기지 않음: 옛 Painel 의 Notes Display 카드(새 앱 대시보드는 숫자 타일만) · 옛 avisar(push) 대신 앱 안 메시지(창고)
 * ============================================================ */
import { $, esc, toast, Router, busy, today } from './ui.js';
import { newId } from './db.js';
import { loadCatalog, catalog, levelsOf } from './catalog.js';
import { reqLabel, reqClean, reqNoteClean } from './reqs.js';
import * as Msg from './msg.js';
import * as E from './etq.js';
import * as NU from './notesups.js';
import { L3 as L } from './balcao.js';

/* notesups.js 의 것을 부를 때마다 (모듈이 서로 가져오므로 처음 읽을 때 꺼내 두지 않음) */
const N = NU.N, ICO = NU.ICO, t = (k, v) => NU.t(k, v), svg = (p, n) => NU.svg(p, n), numFmt = n => NU.numFmt(n), dataBR = s => NU.dataBR(s), horaCurta = s => NU.horaCurta(s),
  quem = () => NU.quem(), mexe = () => NU.mexe(), gerente = () => NU.gerente(), eu = () => NU.eu(), agora = () => NU.agora();
let S = null;
export function register(state) { S = state; Router.on('displays', page); }
/* 예전 판이 내보내던 것 (다른 화면이 아직 부를 수 있게) */
export const canWrite = () => !!S && NU.mexe();
export const canShip = () => !!S && NU.mexe();

const ND = { lista: null, esc: null, prods: [], busca: '', para: '', sel: {}, cx: {}, orderId: '', orderNo: '', voo: {}, gravando: false, ok: null };
export const _ND = ND;   // 시험용

/* ---------- 상품 — 옛 categoria "EMPTY DISPLAY" (카탈로그의 분류 · 옛 앱의 그 분류 코드) ---------- */
const OLD_ED = ['EMWALL1', 'LB2', 'EMP-1046', 'EMLOC4', 'EMFLNO', 'H4INSERT', 'SB5ACZ3', 'EMC15INCH', 'EMC4INT', 'EMC13INT', 'EMC15INT', 'EMBCBCV', 'EMTAINT', 'EMFLINT', 'EMFLBG', 'EMWALL2', 'EMOIL01', 'FLSIDE36', 'FWIDE01', 'EMHOOK', 'EMTAPE', 'EMLOC2', 'EMBCTCV', 'LB1', 'LB3', 'SHORGLASS', 'EMC13INCH', 'EMBCT', 'SBELE3', 'EMC4', 'LD(STACKABLE)'];
const ehED = x => OLD_ED.indexOf(String(x.c || '').toUpperCase()) >= 0 || [x.g].concat(levelsOf(x, 'l1')).some(v => /EMPTY\s*DISPLAY/i.test(String(v || '')));
function prodsED() {
  if (ND.ok) return ND.ok;
  const C = catalog(); ND.ok = C ? C.items.filter(x => !x.h && !x.virt && ehED(x)).map(x => ({ id: x.c, sku: x.c, nome: x.d || x.c })) : [];
  return ND.ok;
}
const prodPorId = id => prodsED().find(p => p.id === id) || null;
const medDe = code => { const e = NU.extraDe(code); return e && Number(e.peso) > 0 ? { peso: Number(e.peso), comp: Number(e.comp) || 0, larg: Number(e.larg) || 0, alt: Number(e.alt) || 0 } : null; };
/** 줄의 배송 무게 · 크기 — 상품의 지금 것(prodExtra) → 보낼 때 적어 둔 것 */
const medLinha = x => (x.code && medDe(x.code)) || (Number(x.peso) > 0 ? { peso: Number(x.peso), comp: Number(x.comp) || 0, larg: Number(x.larg) || 0, alt: Number(x.alt) || 0 } : null);
const ehOutro = x => !x.code && !(Number(x.peso) > 0);
const medTxtM = m => m ? numFmt(m.peso) + ' lb · ' + NU.medidaTxt(m.comp, m.larg, m.alt) : '';
const nomeDe = x => x.nome || x.texto || x.code || '';

/* ---------- 자료 (옛 v_notas_display — 열린 것 + 24시간 안에 끝난 것) ---------- */
const desde24 = () => new Date(Date.now() - 864e5).toISOString();
async function ler() {
  try {
    if (S.DB.fresh) S.DB.fresh('notasDisplay');
    const A = await S.DB.list('notasDisplay', { where: [['status', 'in', ['pendente', 'preparando']]] });
    const B = await S.DB.list('notasDisplay', { where: [['fimEm', '>=', desde24()]] });
    const m = {}; A.concat(B).forEach(x => { m[x.id] = x; });
    ND.lista = Object.values(m).sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')) || String(a.id).localeCompare(String(b.id)));
  } catch (e) { ND.lista = ND.lista || []; }
}
const lerUm = async id => { try { if (S.DB.fresh) S.DB.fresh('notasDisplay'); return await S.DB.get('notasDisplay', id); } catch (e) { return null; } };
/** 예전 displays 문서 → notasDisplay 줄 (열린 것만 · 한 번) */
async function migrar() {
  if (!mexe()) return;
  let L = []; try { L = (await S.DB.list('displays', { where: [['st', 'in', ['open', 'prep', 'hold', 'done']]] })); } catch (e) { return; }
  for (const d of L) {
    const ops = [], g = 'NDL-' + d.id, prep = d.st === 'prep' || d.st === 'done', por = d.st === 'done' ? (d.doneBy || d.prepBy) : d.prepBy, porN = d.st === 'done' ? (d.doneByName || d.prepByName) : d.prepByName;
    if (await lerUm(g + '-0')) { try { await S.DB.update('displays', d.id, { st: 'migr', migradoEm: agora() }); } catch (e) {} continue; }
    (d.items || []).forEach((x, i) => {
      const peso = Number(x.w) || 0, code = x.c || '', outro = !code && !(peso > 0);
      ops.push({ op: 'set', col: 'notasDisplay', id: g + '-' + i, data: { id: g + '-' + i, grupo: g + '-0', acct: d.acct || '', store: d.store || '', sm: d.sm || '', code, nome: outro ? '' : x.n, texto: outro ? [x.n, x.note].filter(Boolean).join(' — ') : (x.note || ''),
        qtd: Number(x.q) || 1, qtdFeita: 0, paraEm: d.due || '', status: prep ? 'preparando' : 'pendente', peso, comp: Number(x.l) || 0, larg: Number(x.wd) || 0, alt: Number(x.h) || 0,
        criadoEm: d.createdAt || agora(), criadoPor: d.createdBy || '', criadoPorNome: d.createdByName || '', iniciadaPor: prep ? String(por || '').toLowerCase() : '', iniciadaPorNome: prep ? (porN || por || '') : '', iniciadaEm: prep ? (d.prepAt || d.doneAt || '') : '',
        notaIds: [], orderId: d.orderId || '', orderNo: d.orderNo || '', legado: d.id } });
    });
    ops.push({ op: 'update', col: 'displays', id: d.id, data: { st: 'migr', migradoEm: agora(), migradoGrupo: g + '-0' } });
    try { await S.DB.batch(ops); } catch (e) {}
  }
}

/* ---------- 묶기 · 순서 (옛 ndGrupos · ndPorLoja · ndAbertos) ---------- */
const grupoDe = x => String(x && (x.grupo || x.id));
const aberto = x => x.status === 'pendente' || x.status === 'preparando';
const lojaDe = x => x && x.acct ? 'c' + x.acct : 'g' + grupoDe(x);
const agrupa = (L, f) => { const m = {}, o = []; L.forEach(x => { const k = f(x); if (!m[k]) { m[k] = []; o.push(k); } m[k].push(x); }); return o.map(k => m[k]); };
const abertos = () => (ND.lista || []).filter(aberto).slice().sort((a, b) => { const x = String(a.paraEm || '9999'), y = String(b.paraEm || '9999'); return x < y ? -1 : x > y ? 1 : String(a.criadoEm || '') < String(b.criadoEm || '') ? -1 : 1; });
const porId = id => (ND.lista || []).find(x => x.id === id);
const meu = x => !!x.iniciadaPor && x.iniciadaPor === eu();
const podeDono = x => mexe() && (meu(x) || gerente());
const resta = x => Math.max(0, (Number(x.qtd) || 0) - (Number(x.qtdFeita) || 0));
const podeUnir = x => mexe() && (x.status === 'pendente' || (x.status === 'preparando' && podeDono(x)));
const ndHoje = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) { return today(); } };
const dataTxt = d => d ? dataBR(String(d).slice(0, 10) + 'T12:00:00') : '';
const paraCls = d => { if (!d) return ''; const h = ndHoje(), x = String(d).slice(0, 10); return x < h ? 'atrasado' : x === h ? 'hoje' : ''; };
function paraHTML(x) { if (!x.paraEm) return ''; const c = paraCls(x.paraEm); return '<span class="nd-para ' + c + '">' + esc(t('nd_para_curto') + ' ' + dataTxt(x.paraEm)) + (c ? ' · ' + esc(t(c === 'atrasado' ? 'nd_atrasado' : 'nd_hoje')) : '') + '</span>'; }

/* ---------- 새 요청 (옛 ndProdBlocoHTML · nuProdResHTML · ndStepHTML) ---------- */
const ehOutros = q => /^(outr|other|기타)/i.test(String(q || '').trim());
function achadosProd() {
  const q = String(ND.busca || '').trim(), ja = {}; ND.prods.forEach(x => { ja[x.id] = 1; }); if (ND.esc) ja[ND.esc.id] = 1;
  if (!q) return { rec: true, itens: [] };
  const tl = q.toLowerCase(), cod = E.normCod(q);
  return { rec: false, itens: prodsED().filter(p => !ja[p.id] && ((p.nome + ' ' + p.sku).toLowerCase().indexOf(tl) >= 0 || (cod && E.normCod(p.sku).indexOf(cod) >= 0))).slice(0, 8) };
}
const outroBt = () => '<button type="button" class="nu-prod-sug nu-prod-outro" data-act="nu-prod-outro">' + svg(ICO.mais, 12) + ' <b>' + esc(t('nd_outro_bt')) + '</b></button>';
function prodResHTML() {
  const a = achadosProd(), o = outroBt();
  if (ehOutros(ND.busca)) return '<div id="nuProdRes" class="nu-prod-res">' + o + '</div>';
  if (!a.itens.length) return '<div id="nuProdRes" class="nu-prod-res">' + (a.rec ? '' : '<span class="nu-prod-nada">' + esc(t('nu_prod_nada')) + '</span>') + o + '</div>';
  return '<div id="nuProdRes" class="nu-prod-res">' + a.itens.map(x => '<button type="button" class="nu-prod-sug" data-act="nu-prod-add" data-id="' + esc(x.id) + '" title="' + esc(x.sku || x.nome) + '">' + svg(ICO.mais, 12) + ' <b>' + esc(x.nome || x.sku) + '</b>' + (x.sku && x.nome && x.nome !== x.sku ? '<small>' + esc(x.sku) + '</small>' : '') + '</button>').join('') + o + '</div>';
}
const stepHTML = (k, v) => '<div class="nd-step"><button type="button" data-act="nd-q" data-q="' + esc(k) + '" data-d="-1" aria-label="' + esc(t('nd_menos')) + '">−</button><input class="nd-step-in" type="number" inputmode="numeric" min="1" max="60" step="1" data-q="' + esc(k) + '" aria-label="' + esc(t('nu_prod_qtd')) + '" value="' + esc(String(v || '')) + '"><button type="button" data-act="nd-q" data-q="' + esc(k) + '" data-d="1" aria-label="' + esc(t('nd_mais')) + '">+</button></div>';
const nomeHTML = x => '<b>' + esc(x.nome || x.sku) + '</b>' + (x.sku && x.nome && x.nome !== x.sku ? '<small>' + esc(x.sku) + '</small>' : '');
const medSpan = id => { const m = medDe(id); return m ? '<span class="nd-med">' + esc(medTxtM(m)) + '</span>' : '<span class="nd-med falta">' + esc(t('nu_prod_sem_medida')) + '</span>'; };
function blocoHTML() {
  const L = ND.prods, e = ND.esc, cx = L.reduce((a, x) => a + (Number(x.qtd) || 0), 0);
  let h = '<div class="nu-prod nd-prod"><label class="ups-lbl" for="nuProdBusca">' + esc(t('nu_prod_tit')) + '</label><div class="nu-prod-busca">' + svg(ICO.busca, 16) + '<input id="nuProdBusca" type="search" autocomplete="off" placeholder="' + esc(t('nu_prod_ph')) + '" value="' + esc(ND.busca || '') + '"></div>' + prodResHTML();
  if (e) h += '<div class="nd-esc"><div class="nd-esc-nome">' + nomeHTML(e) + medSpan(e.id) + '</div><div class="nd-esc-q"><span>' + esc(t('nd_quantas')) + '</span>' + stepHTML('esc', e.qtd) + '</div>' +
    '<div class="nd-esc-bts"><button type="button" class="btn" data-act="nd-esc-x">' + esc(t('cancelar')) + '</button><button type="button" class="btn primary" data-act="nd-esc-ok">' + svg(ICO.mais, 15) + ' ' + esc(t('nd_adicionar')) + '</button></div></div>';
  if (L.length) {
    h += '<div class="nd-lista"><div class="nd-lista-h"><b>' + esc(t('nd_nesta')) + '</b><span>' + esc(t('nd_lista_tot', { p: L.length, c: cx })) + '</span></div>' +
      L.map(x => '<div class="nd-lin' + (x.livre ? ' livre' : '') + '"><div class="nd-lin-nome">' + (x.livre ? '<span class="nd-outro-tag">' + esc(t('nd_outro')) + '</span><textarea class="nu-prod-txt" data-id="' + esc(x.id) + '" rows="2" maxlength="300" placeholder="' + esc(t('nd_outro_ph')) + '" aria-label="' + esc(t('nd_outro_ph')) + '">' + esc(x.texto || '') + '</textarea>' : nomeHTML(x) + medSpan(x.id)) + '</div>' + stepHTML(x.id, x.qtd) +
        '<button type="button" class="nd-tirar" data-act="nu-prod-tirar" data-id="' + esc(x.id) + '" title="' + esc(t('nu_prod_tirar')) + '" aria-label="' + esc(t('nu_prod_tirar')) + '">' + svg(ICO.x, 16) + '</button></div>').join('') + '</div>' +
      '<label class="nd-para-l"><span>' + esc(t('nd_para')) + '</span><input type="date" id="ndPara" min="' + ndHoje() + '" value="' + esc(ND.para || ndHoje()) + '"></label>' +
      '<button type="button" class="btn primary cheio nu-prod-gravar" data-act="nu-prod-gravar">' + svg(ICO.check, 16) + ' ' + esc(t('nd_lancar_n', { c: cx })) + '</button>';
  } else if (!e) h += '<p class="nd-dica">' + esc(t('nd_dica')) + '</p>';
  return h + '</div>';
}
function prodRepintar() { const r = $('nuProdRes'); if (!r) return; const m = document.createElement('div'); m.innerHTML = prodResHTML(); r.replaceWith(m.firstChild); }
function escolher(id) {
  const p = prodPorId(id); if (!p) return;
  ND.esc = { id: p.id, sku: p.sku, nome: p.nome, qtd: '1' }; ND.busca = ''; render();
  const q = document.querySelector('.nd-esc .nd-step-in'); if (q) { try { q.focus(); q.select(); } catch (e) {} }
}
/** 고른 것을 목록에 — 같은 상품이면 수를 더함 */
function escOk(quieto) {
  const e = ND.esc; if (!e) return true;
  const q = Number(e.qtd);
  if (!(q >= 1 && q === Math.floor(q))) { if (!quieto) { toast(t('nu_prod_qtd_falta'), 'bad'); const i = document.querySelector('.nd-esc .nd-step-in'); if (i) i.focus(); } return false; }
  const ja = ND.prods.find(x => x.id === e.id);
  if (ja) ja.qtd = String((Number(ja.qtd) || 0) + q); else ND.prods.push({ id: e.id, sku: e.sku, nome: e.nome, qtd: String(q) });
  ND.esc = null; if (quieto) return true;
  render(); const b = $('nuProdBusca'); if (b) b.focus(); return true;
}
function qtdMudar(k, d) { const al = k === 'esc' ? ND.esc : ND.prods.find(x => x.id === k); if (!al) return; al.qtd = String(Math.min(60, Math.max(1, (Math.floor(Number(al.qtd)) || 0) + d))); render(); }
function prodOutro() { const id = 'txt' + Date.now(); ND.prods.push({ id, livre: true, texto: '', qtd: '1' }); ND.busca = ''; render(); const e = document.querySelector('.nu-prod-txt[data-id="' + id + '"]'); if (e) e.focus(); }
/** 옛 nuProdGravarCaixas → rpc_notas_display_lancar_data — 요청 하나 = 그룹 하나 */
async function lancar() {
  const cli = NU.acctOf(N.cli); if (!cli) return toast(t('nu_escolha_cliente'), 'bad');
  if (ND.esc && !escOk(true)) return toast(t('nu_prod_qtd_falta'), 'bad');
  if (ND.gravando || !ND.prods.length) return;
  const ruim = ND.prods.find(x => { const q = Number(x.qtd); return !(q >= 1 && q === Math.floor(q)); });
  if (ruim) { toast(t('nu_prod_qtd_falta'), 'bad'); const q = document.querySelector('.nd-step-in[data-q="' + ruim.id + '"]'); if (q) q.focus(); return; }
  const semTxt = ND.prods.find(x => x.livre && !String(x.texto || '').trim());
  if (semTxt) { toast(t('nd_outro_falta'), 'bad'); const et = document.querySelector('.nu-prod-txt[data-id="' + semTxt.id + '"]'); if (et) et.focus(); return; }
  const semMed = ND.prods.find(x => !x.livre && !medDe(x.id)); if (semMed) return toast((semMed.sku || '') + ': ' + t('nu_prod_sem_medida'), 'bad');
  const para = ($('ndPara') || {}).value || ND.para || '';
  if (!para) return toast(t('nd_para_falta'), 'bad');
  if (para < ndHoje()) return toast(L('준비 날짜는 지난 날일 수 없습니다.', 'The preparation date cannot be in the past.', 'A data de preparacao nao pode ser no passado.'), 'bad');
  const tot = ND.prods.reduce((a, x) => a + Number(x.qtd), 0); if (tot > 60) return toast(L('한 번에 최대 60 박스.', 'At most 60 boxes at once.', 'No máximo 60 caixas de uma vez.'), 'bad');
  ND.gravando = true;
  const now = agora(), ids = ND.prods.map(() => newId('ND')), g = ids[0];
  const ops = ND.prods.map((x, i) => { const m = x.livre ? null : medDe(x.id); return { op: 'set', col: 'notasDisplay', id: ids[i], data: { id: ids[i], grupo: g, acct: cli.acct, store: cli.store || '', sm: cli.sm || '', code: x.livre ? '' : x.id, nome: x.livre ? '' : (x.nome || x.sku), texto: x.livre ? String(x.texto).trim() : '', qtd: Number(x.qtd), qtdFeita: 0, paraEm: para, status: 'pendente',
    peso: m ? m.peso : 0, comp: m ? m.comp : 0, larg: m ? m.larg : 0, alt: m ? m.alt : 0, criadoEm: now, criadoPor: eu(), criadoPorNome: quem(), iniciadaPor: '', iniciadaPorNome: '', iniciadaEm: '', notaIds: [], orderId: ND.orderId || '', orderNo: ND.orderNo || '' } }; });
  try { await S.DB.batch(ops); } catch (e) { ND.gravando = false; return toast(String(e.code || e.message || t('nu_prod_erro')), 'bad'); }
  ND.gravando = false;
  /* 창고에 알림 (옛 avisar — 앱 안 메시지) */
  try { Msg.sendMsg({ to: 'g:wh', toLabel: L('창고', 'Warehouse', 'Depósito'), text: 'Notes Display: ' + tot + ' ' + t('nd_caixas') + '\n' + (cli.store || '') + ' · ' + ND.prods.map(x => (x.livre ? x.texto : x.nome || x.sku) + ' ×' + x.qtd).join(', '), ref: { id: 'displays', label: '🖼 Notes Display' }, quiet: true }); } catch (e) {}
  ND.esc = null; ND.prods = []; ND.busca = ''; ND.para = ''; ND.orderId = ''; ND.orderNo = '';
  N.cli = ''; N.busca = ''; N.novo = true;   // 보내면 가게가 화면에서 빠지고 가게 찾기로 (옛 02/11/2026)
  toast(t('nd_lancado'), 'good');
  await ler(); render();
}

/* ---------- 카드 (옛 ndGrupoHTML) ---------- */
function grupoHTML(itens) {
  const x0 = itens[0], ab = itens.filter(aberto), prep = ab.find(x => x.status === 'preparando'),
    st = !ab.length ? (itens.some(x => x.status === 'concluido') ? 'concluido' : 'cancelado') : prep ? 'preparando' : 'pendente',
    id = esc(x0.id), cx = (ab.length ? ab : itens).reduce((a, x) => a + (ab.length ? resta(x) : Number(x.qtd) || 0), 0), dono = prep ? podeDono(prep) : false;
  let ac = '';
  if (st === 'pendente') ac = mexe() ? '<button type="button" class="btn primary rp-ini" data-act="nd-iniciar" data-id="' + id + '">' + esc(t('nd_iniciar')) + '</button><button type="button" class="btn sm rp-canc" data-act="nd-cancelar" data-id="' + id + '">' + esc(t('rp_cancelar')) + '</button>' : '';
  else if (st === 'preparando') ac = '<span class="rp-iniciado" title="' + esc(t('rp_iniciada_as', { h: horaCurta(prep.iniciadaEm) })) + '">' + esc(t('nd_prep_por') + ' ' + (prep.iniciadaPorNome || '—') + (meu(prep) ? ' (' + t('rp_voce') + ')' : '')) + '</span>' +
    (dono ? '<button type="button" class="btn primary rp-ini" data-act="nd-concluir" data-id="' + id + '">' + svg(ICO.check, 15) + ' ' + esc(t(ab.length > 1 ? 'nd_concluir_todos' : 'nd_concluir')) + '</button><button type="button" class="btn sm" data-act="nd-liberar" data-id="' + id + '">' + esc(t('rp_liberar')) + '</button><button type="button" class="btn sm rp-canc" data-act="nd-cancelar" data-id="' + id + '">' + esc(t('rp_cancelar')) + '</button>' : '') +
    (ab.some(x => x.status === 'pendente') && mexe() ? '<button type="button" class="btn sm" data-act="nd-iniciar" data-id="' + id + '">' + esc(t('nd_iniciar')) + '</button>' : '');
  else ac = '<span class="badge ' + (st === 'concluido' ? 'ok' : 'vazia') + '">' + esc(t(st === 'concluido' ? 'nd_foi' : 'nd_cancelado')) + '</span>';
  const linhas = itens.map(x => { const ab1 = aberto(x), m = medLinha(x);
    return '<div class="nd-g-lin' + (ab1 ? '' : ' fora') + '" data-nd="' + esc(x.id) + '">' + (ab1 && podeUnir(x) ? '<input type="checkbox" class="nd-chk" data-act="nd-marcar" data-id="' + esc(x.id) + '" title="' + esc(t('nd_unir_marcar')) + '" aria-label="' + esc(t('nd_unir_marcar')) + '"' + (ND.sel[x.id] ? ' checked' : '') + '>' : '') +
      '<span class="nd-g-nome">' + (ehOutro(x) ? '<span class="nd-outro-tag">' + esc(t('nd_outro')) + '</span> ' : '') + '<b>' + esc(nomeDe(x) + ' ×' + (ab1 ? resta(x) : x.qtd)) + '</b>' + (m ? '<small>' + esc(medTxtM(m)) + '</small>' : '') +
      (ab1 && Number(x.qtdFeita) > 0 ? '<small>' + esc(numFmt(x.qtdFeita) + '/' + numFmt(x.qtd) + ' ' + t('nd_foi')) + '</small>' : '') + (!ab1 && ab.length ? '<small>' + esc(t(x.status === 'concluido' ? 'nd_foi' : 'nd_cancelado')) + '</small>' : '') + '</span>' +
      (ehOutro(x) && x.status === 'preparando' && podeDono(x) ? '<button type="button" class="btn sm" data-act="nd-concluir-outro" data-id="' + esc(x.id) + '">' + esc(t('nd_concluir_outro')) + '</button>' : '') + '</div>'; }).join('');
  const cxs = st === 'concluido' && mexe() ? caixasDoCartao(itens.filter(x => x.status === 'concluido')) : [], cxMarc = cxs.length && cxs.every(n => ND.cx[n.id]);
  return '<div class="rp-item nd-item nd-grupo' + (st === 'preparando' ? ' nd-prep' : '') + '" data-nd-grupo="' + esc(grupoDe(x0)) + '" data-nd-loja="' + esc(x0.acct || '') + '"><div class="rp-info nd-g-info"><div class="nd-g-cab">' +
    (cxs.length ? '<input type="checkbox" class="nd-chk nd-cx-chk" data-act="nd-cx-marcar" data-grupo="' + esc(grupoDe(x0)) + '" title="' + esc(t('nu_unir_marcar')) + '" aria-label="' + esc(t('nu_unir_marcar')) + '"' + (cxMarc ? ' checked' : '') + '>' : '') +
    '<b>' + esc([x0.store, x0.acct].filter(Boolean).join(' · ')) + '</b><span class="nd-g-n">' + esc(t('nd_g_tot', { p: itens.length, c: cx })) + '</span></div><div class="nd-g-lista">' + linhas + '</div>' +
    (cxs.length ? '<span class="nd-cx-n">' + esc(t('nu_unir_no_chao', { n: cxs.length })) + '</span>' : '') + (ab.length ? paraHTML(x0) : '') +
    '<span class="rp-hora">' + esc((x0.criadoPorNome || String(x0.criadoPor || '').split('@')[0] || '—') + ' · ' + dataBR(x0.criadoEm)) + (x0.orderNo ? ' · ' + esc(x0.orderNo) : '') + '</span></div><div class="rp-acao">' + ac + '</div></div>';
}
const selecionados = () => abertos().filter(x => ND.sel[x.id] && podeUnir(x));
function unirBarraHTML() { const s = selecionados(); if (!s.length) return ''; return '<div class="nd-unir-barra"><b>' + numFmt(s.length) + ' ' + esc(t('nd_unir_n')) + '</b><button type="button" class="btn primary" data-act="nd-unir">' + svg(ICO.caixa, 15) + ' ' + esc(t('nd_unir')) + '</button><button type="button" class="btn sm" data-act="nd-unir-limpar">' + esc(t('nd_unir_limpar')) + '</button></div>'; }
function caixasDoCartao(itens) { const ids = []; itens.forEach(x => (x.notaIds || []).forEach(id => { if (ids.indexOf(id) < 0) ids.push(id); })); return (N.fila || []).filter(n => ids.indexOf(n.id) >= 0); }
const cxSelecionadas = () => (N.fila || []).filter(n => ND.cx[n.id]);
function cxBarraHTML() { const s = cxSelecionadas(); if (!s.length) return ''; return '<div class="nd-unir-barra nd-cx-barra"><b>' + esc(t('nu_unir_n', { n: s.length })) + '</b><button type="button" class="btn primary" data-act="nd-cx-unir"' + (s.length < 2 ? ' disabled' : '') + '>' + svg(ICO.caixa, 15) + ' ' + esc(t('nu_unir')) + '</button><button type="button" class="btn sm" data-act="nd-cx-limpar">' + esc(t('nd_unir_limpar')) + '</button></div>'; }

/* ====================  TELA (옛 telaNotesDisplay)  ==================== */
let PARAR = null;
async function page() {
  NU.injetarCss(); N.render = render;
  if (!mexe() && !(S.role === 'admin' || S.role === 'owner')) { $('page').innerHTML = '<div class="sb nu-raiz nd-raiz"><div id="conteudo" class="nu-tela">' + NU.cabecalhoHTML(true) + '<div class="aviso alerta">' + esc(L('사무실 · 창고 담당만 쓰는 화면입니다', 'For office and warehouse staff', 'Só para escritório e depósito')) + '</div></div></div>'; return; }
  if (!ND.lista) $('page').innerHTML = '<div class="sb nu-raiz nd-raiz"><div id="conteudo" class="nu-tela">' + NU.cabecalhoHTML(true) + '<div class="placeholder">' + esc(t('carregando')) + '</div></div></div>';
  try { await loadCatalog(S); } catch (e) {} ND.ok = null;
  await NU.carregarExtra(true);
  await migrar();
  await ler(); await NU.carregarFila(true);
  if (location.hash.indexOf('#/displays') !== 0) return;
  render();
  vigiar();
}
/** 실시간 (옛 ndAoVivo) — 이 화면에 있는 동안만 */
function vigiar() {
  if (PARAR) { PARAR(); PARAR = null; }
  if (!S.DB.watch) return;
  let primeiro = true;
  try { PARAR = S.DB.watch('notasDisplay', { where: [['status', 'in', ['pendente', 'preparando']]] }, () => { if (location.hash.indexOf('#/displays') !== 0) { if (PARAR) { PARAR(); PARAR = null; } return; } if (primeiro) { primeiro = false; return; } ler().then(() => { if (!NU.ocupado() && location.hash.indexOf('#/displays') === 0) render(); }); }); } catch (e) { PARAR = null; }
}
function render() {
  if (location.hash.indexOf('#/displays') !== 0) return;
  const cli = N.cli ? NU.acctOf(N.cli) || { acct: N.cli, store: '' } : null, ab = abertos(), daLoja = cli ? ab.filter(x => x.acct === cli.acct) : ab,
    feitos = (ND.lista || []).filter(x => x.status === 'concluido' || x.status === 'cancelado'), gAb = agrupa(ab, lojaDe), gPrep = gAb.filter(g => g.some(x => x.status === 'preparando')).length,
    nCx = l => l.reduce((a, x) => a + resta(x), 0);
  let h = NU.cabecalhoHTML(true) + '<div class="nu-kpis">' +
    NU.kpiHTML(ICO.relogio, 'a', numFmt(gAb.length - gPrep), t('nd_kpi_ag'), '<i class="nu-delta n">' + esc(numFmt(nCx(ab.filter(x => x.status === 'pendente'))) + ' ' + t('nd_caixas')) + '</i>') +
    NU.kpiHTML(ICO.caixa, 'x', numFmt(gPrep), t('nd_kpi_prep'), '<i class="nu-delta n">' + esc(numFmt(nCx(ab.filter(x => x.status === 'preparando'))) + ' ' + t('nd_caixas')) + '</i>') +
    NU.kpiHTML(ICO.check, 'g', numFmt(agrupa(feitos.filter(x => x.status === 'concluido'), grupoDe).length), t('nd_kpi_feitos'), '') +
    '<button type="button" class="nu-nova fab-cel" data-act="nu-novo">' + svg(ICO.caixa, 24) + '<span>' + esc(t('nd_novo')) + '</span></button></div>';
  if (N.novo || cli) h += cli ? NU.lancarHTML(cli, blocoHTML(), { n: daLoja.length, rot: t('nd_cx_loja') }) : NU.escolherLojaHTML(true);
  h += '<div class="rp-grade nd-grade"><div class="panel rp-sec rp-ag"><div class="rp-cab"><span class="rp-dot warn"></span><h2>' + esc(t('nd_ag')) + '</h2><span class="rp-n">' + numFmt(gAb.length) + '</span></div><p class="rp-sub">' + esc(t('nd_ag_sub')) + '</p>' + unirBarraHTML() +
    (ab.length ? gAb.map(grupoHTML).join('') : '<div class="graf-vazio">' + esc(t('nd_vazio')) + '</div>') +
    '</div><div class="panel rp-sec rp-em"><div class="rp-cab"><span class="rp-dot ok"></span><h2>' + esc(t('nd_feitos')) + '</h2><span class="rp-n">' + numFmt(agrupa(feitos, grupoDe).length) + '</span></div>' + cxBarraHTML() +
    (feitos.length ? agrupa(feitos.slice().reverse(), grupoDe).map(grupoHTML).join('') : '<div class="graf-vazio">' + esc(t('nd_feitos_vazio')) + '</div>') + '</div></div>';
  $('page').innerHTML = '<div class="sb nu-raiz nd-raiz"><div id="conteudo" class="nu-tela">' + h + '</div></div>';
  ligar();
  if (cli) NU.verificarAuto(cli);
}
function ligar() {
  const raiz = document.querySelector('#page .sb.nd-raiz'); if (!raiz) return;
  NU.ligarComum(raiz);
  const dp = $('ndPara'); if (dp) dp.addEventListener('change', () => { ND.para = dp.value; });
  document.querySelectorAll('#page .nd-step-in').forEach(q => { const k = q.dataset.q;
    q.addEventListener('input', () => { if (k === 'esc') { if (ND.esc) ND.esc.qtd = q.value; return; } const x = ND.prods.find(y => y.id === k); if (x) x.qtd = q.value; });
    q.addEventListener('keydown', ev => { if (ev.key !== 'Enter') return; ev.preventDefault(); if (k === 'esc') return escOk(); const b = $('nuProdBusca'); if (b) b.focus(); }); });
  document.querySelectorAll('#page .nu-prod-txt').forEach(e => e.addEventListener('input', () => { const x = ND.prods.find(y => y.id === e.dataset.id); if (x) x.texto = e.value; }));
  const pb = $('nuProdBusca');
  if (pb) {
    pb.addEventListener('input', () => { ND.busca = pb.value; prodRepintar(); });
    pb.addEventListener('keydown', ev => { if (ev.key !== 'Enter') return; ev.preventDefault(); const a = achadosProd(); if (ehOutros(ND.busca)) prodOutro(); else if (ND.busca && a.itens[0]) escolher(a.itens[0].id); else if (ND.busca) toast(t('nu_prod_nada'), 'bad'); });
  }
  raiz.addEventListener('click', clique);
  raiz.addEventListener('change', ev => { const c = ev.target.closest('input[type=checkbox][data-act]'); if (!c) return;
    if (c.dataset.act === 'nd-marcar') return marcar(c.dataset.id, c.checked);
    if (c.dataset.act === 'nd-cx-marcar') return cxMarcar(c.dataset.grupo); });
}
function marcar(id, on) {
  const x = porId(id); if (!x) return;
  if (!on) delete ND.sel[id];
  else { const outra = selecionados().find(y => y.acct !== x.acct); if (outra) { toast(t('nd_unir_loja'), 'bad'); return render(); } ND.sel[id] = 1; }
  render();
}
function cxMarcar(g) {
  const cxs = caixasDoCartao((ND.lista || []).filter(x => grupoDe(x) === String(g) && x.status === 'concluido')); if (!cxs.length) return;
  if (cxs.every(n => ND.cx[n.id])) cxs.forEach(n => { delete ND.cx[n.id]; });
  else { const outra = cxSelecionadas().find(n => n.acct !== cxs[0].acct); if (outra) { toast(t('nu_unir_loja'), 'bad'); return render(); } cxs.forEach(n => { ND.cx[n.id] = 1; }); }
  render();
}
async function clique(ev) {
  const el = ev.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.act;
  if (NU.acaoComum(a, el)) return;
  if (a === 'nu-trocar') { N.cli = ''; ND.esc = null; ND.prods = []; ND.busca = ''; N.busca = ''; N.novo = true; return render(); }
  if (a === 'nu-prod-add') return escolher(el.dataset.id);
  if (a === 'nu-prod-gravar') return lancar();
  if (a === 'nd-q') return qtdMudar(el.dataset.q, Number(el.dataset.d) || 0);
  if (a === 'nd-esc-ok') return escOk();
  if (a === 'nd-esc-x') { ND.esc = null; return render(); }
  if (a === 'nu-prod-outro') return prodOutro();
  if (a === 'nu-prod-tirar') { ND.prods = ND.prods.filter(x => x.id !== el.dataset.id); return render(); }
  if (a === 'nd-concluir-outro') { const x = porId(el.dataset.id); if (x) unir(null, [x]); return; }
  if (a === 'nd-iniciar' || a === 'nd-liberar' || a === 'nd-cancelar' || a === 'nd-concluir') return acao(a.slice(3), el.dataset.id, el);
  if (a === 'nd-unir') return unir();
  if (a === 'nd-unir-limpar') { ND.sel = {}; return render(); }
  if (a === 'nd-cx-unir') { await NU.unirCaixas(cxSelecionadas().map(n => n.id)); ND.cx = {}; await ler(); return render(); }
  if (a === 'nd-cx-limpar') { ND.cx = {}; return render(); }
}

/* ---------- 카드 동작 (옛 ndAcao → rpc_notas_display_grupo · 가게의 열린 줄 전부 · 요청(그룹)마다 따로) ---------- */
async function acao(ac, id, bt) {
  const x = porId(id) || {}, g = lojaDe(x.id ? x : { id }), abL = (ND.lista || []).filter(y => aberto(y) && lojaDe(y) === g),
    resumo = abL.map(y => nomeDe(y) + ' ×' + resta(y)).join(', ');
  if (ND.voo[g]) return;
  if (ac === 'liberar') { if (!(await E.pergunta({ titulo: t('rp_lib_tit'), texto: resumo + ' — ' + t('nd_lib_txt'), sim: t('rp_liberar'), nao: t('cancelar'), cls: 'nu-m' }))) return; }
  if (ac === 'cancelar') { if (!(await E.pergunta({ titulo: t('nd_cancel_tit'), texto: resumo + ' — ' + t('nd_cancel_txt'), sim: t('rp_cancelar'), nao: t('cancelar'), perigo: true, cls: 'nu-m' }))) return; }
  if (ac === 'concluir') {
    const comProd = abL.filter(y => y.status === 'preparando' && !ehOutro(y));
    if (!comProd.length) { const ou = abL.filter(y => ehOutro(y) && y.status === 'preparando'); if (ou.length) unir(null, ou.slice(0, 1)); return; }
    if (!(await E.pergunta({ titulo: t('nd_concluir_tit'), texto: resumo + ' · ' + (x.store || '') + ' — ' + t('nd_concluir_txt'), sim: t('nd_concluir'), nao: t('cancelar'), cls: 'nu-m' }))) return;
  }
  ND.voo[g] = 1; if (bt) bt.disabled = true;
  let r = null;
  try { r = await fazer(ac, abL); } catch (e) { r = { ok: false, erro: String(e.message || e) }; }
  delete ND.voo[g];
  await ler();
  if (ac === 'iniciar') { if (!r.ok && r.motivo === 'ja_iniciada') await aviso(t('nd_ja') + ' ' + (r.nome || '—')); else if (!r.ok) toast(r.erro || t('nd_erro'), 'bad'); return render(); }
  if (ac === 'liberar' || ac === 'cancelar') { if (!r.ok) toast(r.erro || t('nd_nao_pode'), 'bad'); return render(); }
  if (!r.ok) { toast(r.erro || t('nd_erro'), 'bad'); return render(); }
  await NU.carregarFila(true); render();
  NU.imprimirNovas(r.docs); toast((r.caixas || 0) + ' ' + t('nd_ok'), 'good');
  if (r.outros) aviso(t('nd_falta_outro'));
}
function aviso(txt) { return new Promise(res => { const w = E.abrirModal('<div class="modal-head"><h2>' + esc(t('nav_notesdisplay')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p style="margin:0" id="ndAvisoTxt">' + esc(txt) + '</p></div><div class="modal-foot"><button class="btn primary" data-act="fechar-modal" id="ndAvisoOk">OK</button></div>', 'nu-m'); w.addEventListener('click', e => { if (e.target.closest('[data-act="fechar-modal"]')) res(); }); }); }
/** 한 가게의 열린 줄 — 요청(그룹)마다 따로 · 쓰기 직전 다시 읽음 */
async function fazer(ac, abL) {
  const alvo = { iniciar: 'pendente', liberar: 'preparando', concluir: 'preparando' }[ac], gs = [];
  abL.forEach(y => { const k = grupoDe(y); if ((!alvo || y.status === alvo) && gs.indexOf(k) < 0) gs.push(k); });
  const tot = { ok: false, docs: [], caixas: 0, outros: 0 }; let motivo = '', nome = '';
  if (S.DB.fresh) S.DB.fresh('notasDisplay');
  for (const k of gs) {
    const rows = []; for (const y of abL.filter(z => grupoDe(z) === k)) { const f = await S.DB.get('notasDisplay', y.id); if (f && aberto(f)) rows.push(f); }
    const ops = [], now = agora();
    if (ac === 'iniciar') {
      const outro = rows.find(f => f.status === 'preparando' && f.iniciadaPor && f.iniciadaPor !== eu());
      if (outro) { motivo = motivo || 'ja_iniciada'; nome = nome || outro.iniciadaPorNome; continue; }
      rows.filter(f => f.status === 'pendente').forEach(f => ops.push({ op: 'update', col: 'notasDisplay', id: f.id, data: { status: 'preparando', iniciadaPor: eu(), iniciadaPorNome: quem(), iniciadaEm: now } }));
    } else if (ac === 'liberar') {
      const L2 = rows.filter(f => f.status === 'preparando'); if (L2.some(f => f.iniciadaPor !== eu() && !gerente())) { motivo = motivo || 'nao_pode'; continue; }
      L2.forEach(f => ops.push({ op: 'update', col: 'notasDisplay', id: f.id, data: { status: 'pendente', iniciadaPor: '', iniciadaPorNome: '', iniciadaEm: '' } }));
    } else if (ac === 'cancelar') {
      if (rows.some(f => !(f.criadoPor === eu() || f.iniciadaPor === eu() || gerente()))) { motivo = motivo || 'nao_pode'; continue; }
      rows.forEach(f => ops.push({ op: 'update', col: 'notasDisplay', id: f.id, data: { status: 'cancelado', canceladaEm: now, canceladaPor: eu(), fimEm: now } }));
    } else {
      for (const f of rows.filter(r => r.status === 'preparando')) {
        if (f.iniciadaPor !== eu() && !gerente()) { motivo = motivo || 'nao_pode'; continue; }
        if (ehOutro(f)) { tot.outros++; continue; }
        const m = medLinha(f); if (!m) throw new Error((f.code || f.nome) + ': ' + t('nu_prod_sem_medida'));
        const novos = []; for (let i = 0; i < resta(f); i++) novos.push(NU.novaCaixa({ acct: f.acct, store: f.store || '', sm: f.sm || '', w: m.peso, l: m.comp, wd: m.larg, h: m.alt, prods: [{ c: f.code, n: f.nome || f.code, q: 1 }], texto: '', ndIds: [f.id] }));
        novos.forEach(d => ops.push({ op: 'set', col: 'upsnotes', id: d.id, data: d }));
        ops.push({ op: 'update', col: 'notasDisplay', id: f.id, data: { status: 'concluido', qtdFeita: Number(f.qtd) || 0, concluidaEm: now, concluidaPor: eu(), concluidaPorNome: quem(), fimEm: now, notaIds: (f.notaIds || []).concat(novos.map(d => d.id)) } });
        tot.docs = tot.docs.concat(novos); tot.caixas += novos.length;
      }
    }
    if (!ops.length) continue;
    try { await S.DB.batch(ops); tot.ok = true; } catch (e) { const y = rows[0] ? await S.DB.get('notasDisplay', rows[0].id) : null; if (ac === 'iniciar' && y && y.iniciadaPor && y.iniciadaPor !== eu()) { motivo = 'ja_iniciada'; nome = y.iniciadaPorNome; } else throw e; }
  }
  if (tot.ok) return tot;
  if (ac === 'concluir' && tot.outros) return Object.assign(tot, { ok: true });
  return { ok: false, motivo: motivo || 'nada', nome, erro: motivo === 'ja_iniciada' ? '' : motivo === 'nao_pode' ? t('nd_nao_pode') : t('nd_erro') };
}

/* ---------- 한 박스로 합치기 (옛 ndUnir → rpc_notas_display_unir) · Outros 끝내기 ---------- */
async function unir(vals, lista) {
  const sel = lista || selecionados(); if (!sel.length) return;
  vals = vals || {};
  const peso = vals.peso != null ? vals.peso : sel.reduce((a, x) => { const m = medLinha(x); return a + (m ? m.peso : 0) * resta(x); }, 0);
  const cp = (id, v, ph) => '<input id="' + id + '" type="number" inputmode="decimal" min="0" step="any" class="nd-unir-in" placeholder="' + esc(ph) + '" value="' + esc(v == null || v === '' ? '' : String(v)) + '">';
  const html = '<div class="nd-unir-corpo"><div class="nd-unir-lista">' + sel.map(x => { const q = vals.q && vals.q[x.id] != null ? vals.q[x.id] : resta(x);
    return '<label class="nd-unir-l"><span><b>' + esc(nomeDe(x)) + '</b><small>' + esc(t('nd_resta') + ' ' + resta(x)) + '</small></span><input type="number" inputmode="numeric" min="1" max="' + resta(x) + '" step="1" class="nd-unir-q" data-id="' + esc(x.id) + '" value="' + esc(String(q)) + '"></label>'; }).join('') + '</div>' +
    '<div class="nd-unir-campos"><label>' + esc(t('nd_unir_peso')) + cp('ndUP', peso ? Math.round(peso * 100) / 100 : '', 'lb') + '</label><label>' + esc(t('nd_unir_med')) + '<span class="nd-unir-3">' + cp('ndUC', vals.c, 'C') + cp('ndUL', vals.l, 'L') + cp('ndUA', vals.a, 'A') + '</span></label></div></div>';
  const r = await E.pergunta({ titulo: t(lista ? 'nd_concluir_tit' : 'nd_unir_tit'), texto: (sel[0].store || '') + ' — ' + t('nd_unir_txt'), html, sim: t(lista ? 'nd_concluir' : 'nd_unir'), nao: t('cancelar'), cls: 'nu-m',
    ler: w => { const o = { q: {}, peso: Number((w.querySelector('#ndUP') || {}).value), c: Number((w.querySelector('#ndUC') || {}).value), l: Number((w.querySelector('#ndUL') || {}).value), a: Number((w.querySelector('#ndUA') || {}).value) }; w.querySelectorAll('.nd-unir-q').forEach(e => { o.q[e.dataset.id] = e.value; }); return o; } });
  if (!r) return;
  const lido = r.extra; let ok = true;
  sel.forEach(x => { const q = Number(lido.q[x.id]); if (!(q >= 1 && q === Math.floor(q) && q <= resta(x))) ok = false; });
  if (!ok || !(lido.peso > 0 && lido.c > 0 && lido.l > 0 && lido.a > 0)) { toast(t('nd_unir_inv'), 'bad'); return unir(lido, lista); }
  try {
    if (S.DB.fresh) S.DB.fresh('notasDisplay');
    const rows = []; let acct = '';
    for (const x of sel) {
      const f = await S.DB.get('notasDisplay', x.id), q = Number(lido.q[x.id]);
      if (!f) throw new Error(L('작업 하나가 이제 없습니다.', 'One of the tasks no longer exists.', 'Uma das tarefas não existe mais.'));
      if (!aberto(f)) throw new Error(L('작업 하나가 이미 끝났거나 취소되었습니다.', 'One of the tasks was already finished or cancelled.', 'Uma das tarefas já foi concluída ou cancelada.'));
      if (f.status === 'preparando' && f.iniciadaPor !== eu() && !gerente()) throw new Error(L('작업 하나를 다른 사람이 준비하고 있습니다.', 'One of the tasks is being prepared by someone else.', 'Uma das tarefas está sendo preparada por outra pessoa.'));
      if (acct && acct !== f.acct) throw new Error(t('nd_unir_loja')); acct = f.acct;
      if (q > resta(f)) throw new Error(t('nd_unir_inv'));
      rows.push({ f, q });
    }
    const pm = {}, prods = [], txt = [];
    rows.slice().sort((a, b) => String(a.f.criadoEm).localeCompare(String(b.f.criadoEm))).forEach(({ f, q }) => { if (ehOutro(f)) { txt.push(f.texto + ' ×' + q); return; } const k = f.code || f.nome; if (pm[k]) pm[k].q += q; else { pm[k] = { c: f.code, n: f.nome || f.code, q }; prods.push(pm[k]); } });
    const f0 = rows[0].f, now = agora(), doc = NU.novaCaixa({ acct: f0.acct, store: f0.store || '', sm: f0.sm || '', w: lido.peso, l: lido.c, wd: lido.l, h: lido.a, prods, texto: txt.join(', '), ndIds: rows.map(r1 => r1.f.id) });
    const ops = [{ op: 'set', col: 'upsnotes', id: doc.id, data: doc }].concat(rows.map(({ f, q }) => { const feita = (Number(f.qtdFeita) || 0) + q, fim = feita >= Number(f.qtd); return { op: 'update', col: 'notasDisplay', id: f.id, data: Object.assign({ qtdFeita: feita, notaIds: (f.notaIds || []).concat([doc.id]) }, fim ? { status: 'concluido', concluidaEm: now, concluidaPor: eu(), concluidaPorNome: quem(), fimEm: now } : {}) }; }));
    await S.DB.batch(ops);
    ND.sel = {}; await ler(); await NU.carregarFila(true); render();
    NU.imprimirNovas([doc]); toast(t('nd_unir_ok'), 'good');
  } catch (e) { toast(String(e.message || e), 'bad'); await ler(); render(); }
}

/* ====================  다른 화면이 쓰는 것  ==================== */
/** 주문 창 "🖼 Notes Display" — 이 화면의 새 요청 칸을 그 가게로 (요청한 종류 · 개수 · 설명은 Outros 줄로) */
export async function form(pre) {
  pre = pre || {};
  N.cli = pre.acct || ''; N.busca = N.cli ? '' : (pre.store || ''); N.novo = true; N.qtd = 0; N.feitas = []; N.cx = {};
  ND.esc = null; ND.busca = ''; ND.para = ''; ND.orderId = pre.orderId || ''; ND.orderNo = pre.orderNo || '';
  const rq = reqClean(pre.req), rn = reqNoteClean(pre.reqNote) || {};
  ND.prods = rq ? Object.keys(rq).map((k, i) => ({ id: 'txt' + Date.now() + i, livre: true, texto: [reqLabel(k, true), rn[k]].filter(Boolean).join(' — '), qtd: String(rq[k]) })) : [];
  if (location.hash.indexOf('#/displays') === 0) return page();
  Router.go('displays');
}
/** 주문에서 — 그 주문의 Notes Display 요청 수 (단추에 숫자) */
export async function countForOrder(orderId) {
  try { const L2 = (await S.DB.list('notasDisplay', { where: [['orderId', '==', orderId]] })).filter(d => d.status !== 'cancelado'); return new Set(L2.map(grupoDe)).size; } catch (e) { return 0; }
}
/** 대시보드 · 출고 묶음 타일 — 기다리는 가게 수 · 준비 날짜가 지난 것 */
export async function resumo() {
  const L2 = await S.DB.list('notasDisplay', { where: [['status', 'in', ['pendente', 'preparando']]] });
  return { lojas: new Set(L2.map(lojaDe)).size, atrasadas: new Set(L2.filter(x => x.paraEm && x.paraEm < today()).map(lojaDe)).size };
}
