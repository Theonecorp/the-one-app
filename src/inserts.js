/* ============================================================
 *  🧩 인서트 — 옛 THE ONE CORP WMS 의 "Criar insert" · "Inserts prontos" 화면을 그대로
 *    #/insert  : 전체 화면 질문(상품 → 등록된 인서트 / 크기 → 훅 수 → 훅당 수량 → 번호 그리드 → 몇 개)
 *                → 구성표(훅 · 상품 · 통로 · 필요 · 재고 · 소계 · 대체) → 만들기 → 라벨 3가지 인쇄
 *    #/inserts : 완성된 인서트 목록 (숫자 3칸 · 검색 · 재고 있음/판매됨 · 펼치면 바코드와 구성)
 *  옛 앱은 Supabase RPC(rpc_insert_previa · rpc_montar_insert …) 가 하던 일을 여기서 그대로 계산함
 *    번호 규칙: 패밀리 = 코드 앞 글자(OPCG01 → OPCG) · 번호 = 첫 숫자부터(01)
 *    빈 박스(stock/{코드}.vazia) 인 훅은 자동 대체: 같은 패밀리 · 같은 가격 → 가장 가까운 가격 → 이웃 번호
 *    인서트를 만들어도 부품 재고는 줄지 않음 (팔릴 때 줄어듦 — 옛 앱과 같음)
 *  컬렉션: insModelos (등록된 인서트 = 틀) · inserts (만든 인서트, 구성은 itens 배열) · counters/ins (INS-0001 번호)
 * ============================================================ */
import { $, esc, money, toast, confirmBox, Router, busy, printOpen } from './ui.js';
import { can, isTop } from './main.js';
import { catalog, loadCatalog, exactItem, locOf, thumb } from './catalog.js';
import { stockAll } from './stock.js';
import { openScanner } from './scan.js';
import { barcodeSvg, loadJsBarcode } from './catpage.js';
import { newId } from './db.js';
import { ICO, svg, css as sbCss, L3 } from './balcao.js';
import { INS_CSS, INS_PRT_CSS } from './inserts-css.js';
import { D } from './inserts-txt.js';

let S = null;
export function register(state) { S = state; Router.on('insert', telaInsert); Router.on('inserts', telaProntos); }

/* ---------- 문구 (옛 앱의 t · ti) ---------- */
const t = (k, v) => { const x = D[k]; if (!x) return k; let s = L3(x[0], x[1], x[2]); if (v) Object.keys(v).forEach(n => { s = s.split('{' + n + '}').join(String(v[n])); }); return s; };
const te = k => { const x = D[k]; return x ? x[1] : k; };   // 인쇄 라벨은 늘 영어 (옛 앱 te)
const SCAN = '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="11" y1="8" x2="11" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/>';
export const TAMANHOS = ['C4', 'C13', 'C15', 'FLOOR', 'H', 'L SMAL', 'L MEDIO', 'LOOK2'];
const brl = n => money(Number(n) || 0);
const dataBR = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(); };
const quem = () => (S.me && S.me.name) || S.user.name || S.user.email.split('@')[0];
const podeMexer = () => can('items');           // 옛 앱 podeMexerEstoque (재고 담당)
const gerente = () => isTop();                   // 옛 앱 GERENTE (관리자 · 오너)
export const familiaDe = x => String(x == null ? '' : x).trim().toUpperCase().replace(/[^A-Z].*$/, '');
export const numeroDe = x => String(x == null ? '' : x).trim().replace(/^[^0-9]*/, '').toUpperCase();
function injetarCss() { sbCss(); if (!document.getElementById('insCss')) { const st = document.createElement('style'); st.id = 'insCss'; st.textContent = INS_CSS + INS_PRT_CSS; document.head.appendChild(st); } }

/* ---------- 상태 (옛 앱 S.ins* 그대로) ---------- */
const I = { modelos: null, inserts: null, prods: null, fam: '', modelo: null, daLista: false, tam: '', rooks: '', pecas: '', seq: [], qtd: 1, qtdOk: false,
  previa: null, subs: {}, subRook: null, subBusca: '', preco: null, obs: '', lBusca: '', lFiltro: '', aberto: null, pag: 1 };
function zerarMontagem() { Object.assign(I, { fam: '', modelo: null, daLista: false, tam: '', rooks: '', pecas: '', seq: [], previa: null, subs: {}, subRook: null, subBusca: '', preco: null, obs: '', qtd: 1 }); }

/* ---------- dados ---------- */
/** 상품 목록 — 카탈로그(숨김 제외) + 재고 수량 + 빈 박스 표시 */
async function carregarProdutos(force) {
  if (I.prods && !force) return I.prods;
  await loadCatalog(S);
  const C = catalog(); let qtd = {}, vaz = {};
  try { qtd = await stockAll(force); } catch (e) {}
  try { (await S.DB.list('stock', { where: [['vazia', '==', true]] })).forEach(r => { vaz[r.code || r.id] = true; }); } catch (e) {}
  I.prods = (C ? C.vis : []).filter(x => !x.virt).map(x => ({ id: x.c, sku: x.c, nome: x.c, descricao: x.d || '', preco: Number(x.p) || 0, corredor: locOf(x), qtd: Number(qtd[x.c]) || 0, vazia: !!vaz[x.c], foto: x.ph || '', barcode: x.b || '' }));
  I.byId = {}; I.prods.forEach(p => { I.byId[p.id] = p; });
  return I.prods;
}
const prod = id => (I.byId && I.byId[id]) || null;
async function carregarModelos() { try { I.modelos = await S.DB.list('insModelos'); } catch (e) { I.modelos = []; toast(String(e.message || e), 'bad'); } }
async function carregarInserts() { try { I.inserts = (await S.DB.list('inserts')).filter(x => x.status !== 'excluido').sort((a, b) => String(b.montadoEm || '').localeCompare(String(a.montadoEm || ''))); } catch (e) { I.inserts = []; toast(String(e.message || e), 'bad'); } }
const vendido = x => x.status === 'montado' && Number(x.emEstoque || 0) <= 0;

const produtosDa = fam => (I.prods || []).filter(p => familiaDe(p.sku) === fam && numeroDe(p.sku)).sort((a, b) => { const x = numeroDe(a.sku), y = numeroDe(b.sku); return (/^\d+$/.test(x) && /^\d+$/.test(y)) ? Number(x) - Number(y) : x.localeCompare(y); });
const modelosDa = fam => (I.modelos || []).filter(m => m.ativo && (!fam || m.familia === fam)).sort((a, b) => a.familia === b.familia ? (a.tamanho === b.tamanho ? Number(a.nRooks) - Number(b.nRooks) : String(a.tamanho).localeCompare(String(b.tamanho))) : String(a.familia).localeCompare(String(b.familia)));
const seqTxt = m => m.numeros && m.numeros.length ? m.numeros.join(' ') : t('ins_auto', { n: produtosDa(m.familia).length });
/** 코드 · 바코드 · 패밀리로 찾기 (옛 insResolverCodigo) */
function resolver(txt) {
  const v = String(txt || '').trim(); if (!v) return null;
  const it = exactItem(v); const p = it ? prod(it.c) : null;
  if (p) return { familia: familiaDe(p.sku), produto: p };
  const fam = familiaDe(v);
  if (fam && (I.prods || []).some(x => familiaDe(x.sku) === fam)) return { familia: fam, produto: null };
  return null;
}
/** 옛 expandir_numeros — 번호가 훅보다 적으면 앞에서부터 고르게 반복 */
function expandir(nums, hooks) { const k = nums.length; if (!k || hooks <= 0) return nums; if (k >= hooks) return nums.slice(0, hooks); const base = Math.floor(hooks / k), sobra = hooks % k, out = []; nums.forEach((n, i) => { for (let r = 0; r < base + (i < sobra ? 1 : 0); r++) out.push(n); }); return out; }

/** 옛 rpc_insert_previa — 틀(또는 패밀리 전체 번호)로 훅마다 상품을 붙이고, 빈 박스는 자동 대체 */
export function previa(fam, tam, rooks, pecas, modeloId) {
  fam = String(fam || '').trim().toUpperCase(); tam = String(tam || '').trim().toUpperCase();
  let m = null;
  if (modeloId) { m = (I.modelos || []).find(x => x.id === modeloId && x.ativo); if (!m) throw new Error(L3('등록된 인서트를 찾을 수 없습니다.', 'Registered insert not found.', 'Insert cadastrado não encontrado.')); fam = m.familia; tam = m.tamanho; }
  else m = (I.modelos || []).filter(x => x.ativo && x.familia === fam && x.tamanho === tam).sort((a, b) => ((b.nRooks === Number(rooks)) - (a.nRooks === Number(rooks))) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))[0] || null;
  let vRooks, vPecas, vModelo;
  if (modeloId) { vRooks = m.nRooks; vPecas = m.pecas; vModelo = m.id; }
  else if (Number(rooks) > 0) { vRooks = Number(rooks); vPecas = Math.max(Number(pecas) || (m ? m.pecas : 1), 1); vModelo = m && m.nRooks === vRooks && m.pecas === vPecas ? m.id : null; }
  else if (m) { vRooks = m.nRooks; vPecas = m.pecas; vModelo = m.id; }
  else throw new Error(L3('훅 수와 훅당 수량을 입력하세요.', 'Enter how many hooks and pieces per hook.', 'Informe quantos hooks e quantas peças por hook.'));
  const daFam = produtosDa(fam);
  let nums, unicos;
  if (m && m.numeros && m.numeros.length === vRooks) { nums = m.numeros.slice(); unicos = new Set(nums).size; }
  else { nums = daFam.map(p => numeroDe(p.sku)); unicos = nums.length; nums = expandir(nums, vRooks); }
  const porNum = {}; daFam.forEach(p => { if (!porNum[numeroDe(p.sku)]) porNum[numeroDe(p.sku)] = p; });
  const itens = nums.map((numero, i) => {
    const p = porNum[numero];
    const l = { rook: i + 1, numero, produto_id: p ? p.id : null, sku: p ? p.sku : '', nome: p ? p.nome : '', descricao: p ? p.descricao : '', preco: p ? p.preco : 0, corredor: p ? p.corredor : '', estoque: p ? p.qtd : 0, caixa_vazia: !!(p && p.vazia), vazio: !p || p.vazia, precisa: vPecas, ok: !!p && !p.vazia, substituto: false };
    if (!l.ok && numero) {
      const orig = l.preco, n0 = numero;
      const cand = daFam.filter(x => !x.vazia).sort((a, b) => (Math.abs(a.preco - orig) - Math.abs(b.preco - orig)) || (dist(a) - dist(b)) || numeroDe(a.sku).localeCompare(numeroDe(b.sku)));
      function dist(x) { const n = numeroDe(x.sku); return /^\d+$/.test(n) && /^\d+$/.test(n0) ? Math.abs(Number(n) - Number(n0)) : 999999; }
      const s = cand[0];
      if (s) Object.assign(l, { produto_id: s.id, sku: s.sku, nome: s.nome, descricao: s.descricao, preco: s.preco, corredor: s.corredor, estoque: s.qtd, caixa_vazia: false, vazio: false, ok: true, substituto: true, substitui: l.sku || fam + n0, motivo_sub: !p ? 'vizinho' : s.preco === orig ? 'mesmo_preco' : 'preco_proximo', preco_original: orig, numero_sub: numeroDe(s.sku) });
    }
    return l;
  });
  const falta = itens.filter(x => !x.ok).length;
  return { modelo_id: vModelo, familia: fam, tamanho: tam, n_rooks: vRooks, pecas_por_rook: vPecas, do_modelo: !!vModelo, numeros_unicos: unicos, repetido: unicos > 0 && unicos < vRooks, rooks_no_padrao: nums.length, itens, substituidos: itens.filter(x => x.substituto).length, faltando: falta, completo: !falta && nums.length === vRooks };
}

/* ---------- composição (옛 insLinhas · insTotal · insPronto) ---------- */
function linhas() {
  const p = I.previa; if (!p) return [];
  const base = (p.itens || []).slice();
  for (let r = base.length + 1; r <= Number(p.n_rooks || 0); r++) base.push({ rook: r, numero: null, produto_id: null, ok: false, precisa: p.pecas_por_rook });
  return base.slice(0, Number(p.n_rooks || 0)).map(l => {
    const sub = I.subs[l.rook]; const pr = sub ? prod(sub) : null;
    if (pr) return { rook: l.rook, numero: l.numero, produto_id: pr.id, sku: pr.sku, nome: pr.nome, descricao: pr.descricao, preco: pr.preco, corredor: pr.corredor, estoque: pr.qtd, precisa: l.precisa, vazio: pr.qtd === 0 && pr.vazia, ok: !(pr.qtd === 0 && pr.vazia), substituto: true, substitui: l.sku || (p.familia + (l.numero || l.rook)) };
    return l;
  });
}
const total = () => linhas().reduce((s, l) => s + (l.produto_id ? Number(l.precisa || 1) * Number(l.preco || 0) : 0), 0);
const pronto = () => { const l = linhas(); return l.length > 0 && l.every(x => x.produto_id && x.ok); };
function carregarPrevia() {
  if (!I.fam) { I.previa = null; return telaInsert(); }
  if (!String(I.tam || '').trim()) return toast(t('ins_precisa_tam'), 'bad');
  if (!(Number(I.rooks) > 0)) return toast(t('ins_precisa_rooks'), 'bad');
  try { I.previa = previa(I.fam, I.tam, I.rooks, Math.max(Number(I.pecas) || 1, 1), I.modelo ? I.modelo.id : null); } catch (e) { I.previa = null; toast(e.message, 'bad'); return telaInsert(); }
  I.subs = {}; I.preco = null; telaInsert();
}

/* ============================================================
 *  PERGUNTA EM TELA CHEIA (옛 perguntaTela) — 짧은 말 · 큰 단추
 * ============================================================ */
let TC = null;
function perguntaTela(cfg) {
  document.querySelectorAll('.ins-tcw').forEach(x => x.remove()); TC = null;   // a anterior sai já — senão dois #tcValor no DOM
  const w = document.createElement('div'); w.className = 'sb ins-tcw'; w.style.cssText = 'position:fixed;inset:0;z-index:210;padding:0;margin:0;min-height:0;background:transparent';
  let corpo = '';
  if (cfg.tipo === 'numero') corpo = '<div class="tc-num"><button type="button" class="tc-mm" data-tc-menos>−</button><input id="tcValor" type="number" inputmode="numeric" min="' + (cfg.min || 1) + '" value="' + Number(cfg.valor || 1) + '"><button type="button" class="tc-mm" data-tc-mais>+</button></div>' +
    '<div class="tc-rapido">' + (cfg.rapido || [1, 2, 3, 5, 10]).map(n => '<button type="button" class="tc-pill" data-tc-set="' + n + '">' + n + '</button>').join('') + '</div>';
  else if (cfg.tipo === 'texto') corpo = '<div class="tc-texto"><input id="tcValor" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + esc(cfg.ph || '') + '" value="' + esc(cfg.valor || '') + '">' + (cfg.scan ? '<button type="button" class="tc-scan" data-tc-scan>' + svg(SCAN, 26) + '</button>' : '') + '</div>' +
    (cfg.sugestoes && cfg.sugestoes.length ? '<div class="tc-rapido">' + cfg.sugestoes.map(x => '<button type="button" class="tc-pill" data-tc-texto="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>' : '') + '<div class="tc-erro" id="tcErro"></div>';
  else if (cfg.tipo === 'html') corpo = cfg.html || '';
  else if (cfg.tipo === 'escolha') corpo = '<div class="tc-escolhas">' + (cfg.opcoes || []).map(o => '<button type="button" class="tc-op' + (o.valor === cfg.valor ? ' on' : '') + '" data-tc-op="' + esc(o.valor) + '"><b>' + esc(o.titulo) + '</b>' + (o.sub ? '<span>' + esc(o.sub) + '</span>' : '') + '</button>').join('') + '</div>';
  w.innerHTML = '<div class="tc' + (cfg.cor ? ' ' + cfg.cor : '') + (cfg.classe ? ' ' + cfg.classe : '') + '"><div class="tc-in">' + (cfg.passo ? '<div class="tc-passo">' + esc(cfg.passo) + '</div>' : '') +
    '<div class="tc-tit">' + esc(cfg.titulo || '') + '</div>' + (cfg.sub ? '<div class="tc-sub">' + esc(cfg.sub) + '</div>' : '') + corpo +
    '<div class="tc-bts">' + (cfg.tipo === 'escolha' ? '' : '<button type="button" class="tc-ok" data-tc-ok' + (cfg.okDesab ? ' disabled' : '') + '>' + esc(cfg.ok || t('ins_continuar')) + '</button>') + '<button type="button" class="tc-nao" data-tc-cancel>' + esc(cfg.cancelar || t('cancelar')) + '</button></div></div></div>';
  document.body.appendChild(w);
  const el = w.firstChild; requestAnimationFrame(() => el.classList.add('on'));
  TC = { w, el, cfg, valor: cfg.tipo === 'numero' ? Number(cfg.valor || 1) : cfg.valor };
  const inp = w.querySelector('#tcValor');
  if (inp) {
    try { inp.focus(); inp.select(); } catch (e) {}
    inp.addEventListener('input', () => { TC.valor = cfg.tipo === 'texto' ? inp.value : Math.max(Number(cfg.min || 1), Number(inp.value) || 0); if (cfg.tipo === 'texto' && w.querySelector('#tcErro')) w.querySelector('#tcErro').textContent = ''; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });
  }
  w.addEventListener('click', e => {
    const c = x => e.target.closest(x); let b;
    if (c('[data-tc-ok]')) return confirmar();
    if (c('[data-tc-cancel]')) { const k = TC && TC.cfg; fecharTela(); return k && k.onCancel && k.onCancel(); }
    if (c('[data-tc-menos]')) return setNum((Number((inp || {}).value) || 1) - 1);
    if (c('[data-tc-mais]')) return setNum((Number((inp || {}).value) || 0) + 1);
    if ((b = c('[data-tc-set]'))) return setNum(b.dataset.tcSet);
    if ((b = c('[data-tc-texto]'))) { if (inp) inp.value = b.dataset.tcTexto; TC.valor = b.dataset.tcTexto; return confirmar(); }
    if (c('[data-tc-scan]')) return openScanner(code => { if (inp) { inp.value = code; TC.valor = code; } confirmar(); }, { title: cfg.titulo });
    if ((b = c('[data-tc-op]'))) { TC.valor = b.dataset.tcOp; w.querySelectorAll('[data-tc-op]').forEach(x => x.classList.toggle('on', x === b)); return confirmar(); }
    if ((b = c('[data-im-num]'))) { e.preventDefault(); return escolherNumero(b.dataset.imNum); }
    if (c('[data-act="im-limpar"]')) { I.seq = []; return repintarGrade(); }
  });
  return el;
}
function fecharTela() { document.querySelectorAll('.ins-tcw').forEach(w => { const e = w.firstChild; if (e) e.classList.remove('on'); setTimeout(() => w.remove(), 200); }); TC = null; }
function setNum(n) { if (!TC) return; n = Math.max(Number(TC.cfg.min || 1), Number(n) || 1); TC.valor = n; const inp = TC.w.querySelector('#tcValor'); if (inp) inp.value = n; }
function confirmar() {
  if (!TC) return; const cfg = TC.cfg, inp = TC.w.querySelector('#tcValor'); let val = TC.valor;
  if (cfg.tipo === 'numero') val = Math.max(Number(cfg.min || 1), Number(inp ? inp.value : val) || 0);
  else if (cfg.tipo === 'texto') { val = String((inp ? inp.value : val) || '').trim(); const erro = cfg.valida ? cfg.valida(val) : (val ? null : ' '); if (erro) { const e2 = TC.w.querySelector('#tcErro'); if (e2) e2.textContent = erro === ' ' ? '' : erro; if (inp) { try { inp.focus(); inp.select(); } catch (x) {} } return; } }
  else if (cfg.tipo === 'escolha' && !val) return;
  else if (cfg.tipo === 'html' && cfg.valida) { const eh = cfg.valida(); if (eh) return toast(eh, 'bad'); }
  fecharTela(); cfg.onOk && cfg.onOk(val);
}
export const telaAberta = () => !!document.querySelector('.ins-tcw');

/* ---------- a grade (옛 insGradeTelaHTML · imGradeHTML · imHooksHTML) ---------- */
function miniFoto(p, n) { const u = p.foto ? thumb(p.foto, 120) : ''; return u ? '<img src="' + esc(u) + '" alt="" loading="lazy" style="width:' + n + 'px;height:' + n + 'px;object-fit:cover;border-radius:6px">' : '<span class="thumb" style="width:' + n + 'px;height:' + n + 'px">' + esc(String(p.sku || '?').slice(0, 2)) + '</span>'; }
function gradeHTML(fam) {
  const cheio = I.seq.length >= Number(I.rooks || 0);
  return '<div class="im-grade">' + produtosDa(fam).map(p => { const n = numeroDe(p.sku); return '<button type="button" class="im-q' + (p.vazia ? ' vazia' : '') + '" data-im-num="' + esc(n) + '"' + (cheio ? ' aria-disabled="true"' : '') + '>' + miniFoto(p, 40) + '<b>' + esc(p.sku) + '</b><small>' + esc(brl(p.preco)) + (p.vazia ? ' · <i class="im-q-vazia">' + esc(t('im_vazia')) + '</i>' : '') + '</small></button>'; }).join('') + '</div>';
}
function hooksHTML() { const n = Math.max(Number(I.rooks) || 0, 0); let h = '<div class="im-hooks">'; for (let i = 0; i < n; i++) { const num = I.seq[i]; h += '<div class="im-hk' + (num ? ' on' : '') + '"' + (num ? ' data-num="' + esc(num) + '"' : '') + '>' + (num ? '<b>' + esc(I.fam + num) + '</b><i>' + (i + 1) + '</i>' : '<i>' + (i + 1) + '</i>') + '</div>'; } return h + '</div>'; }
function gradeTelaHTML() {
  return '<div class="im-hooks-cab"><span>' + esc(t('im_grade_tit', { f: I.fam })) + '</span><b id="imCont">' + esc(t('im_hooks_de', { n: I.seq.length, t: I.rooks })) + '</b></div>' + hooksHTML() +
    (produtosDa(I.fam).length ? gradeHTML(I.fam) : '<div class="placeholder">' + esc(t('ins_nao_achou')) + '</div>') +
    '<div class="tc-rapido" style="margin-top:12px"><button type="button" class="tc-pill" data-act="im-limpar">' + esc(t('im_limpar')) + '</button></div>';
}
function escolherNumero(num) { const r = Math.max(Number(I.rooks) || 0, 0); if (!r) return toast(t('im_precisa_hooks'), 'bad'); if (I.seq.length >= r) return; I.seq.push(String(num)); repintarGrade(); }
function repintarGrade() {
  const r = Math.max(Number(I.rooks) || 0, 0), c = $('imCont'); if (c) c.textContent = t('im_hooks_de', { n: I.seq.length, t: r });
  const ok = document.querySelector('.tc-grade [data-tc-ok]'); if (ok) ok.disabled = !(r > 0 && I.seq.length === r);
  const hk = document.querySelector('.ins-tcw .im-hooks'); if (hk) hk.outerHTML = hooksHTML();
  const cheio = I.seq.length >= r; document.querySelectorAll('.ins-tcw .im-grade .im-q').forEach(q => { if (cheio) q.setAttribute('aria-disabled', 'true'); else q.removeAttribute('aria-disabled'); });
}

/* ============================================================
 *  ASSISTENTE (옛 insAssistente) — 한 번에 질문 하나
 * ============================================================ */
function assistente(passo) {
  if (passo === 1) return perguntaTela({ passo: t('ins_de5_1'), titulo: t('ins_q_produto'), sub: t('ins_q_produto_sub'), tipo: 'texto', scan: true, ph: t('ins_q_produto_ph'), valor: I.fam || '', ok: t('ins_continuar'),
    valida: v => resolver(v) ? null : t('ins_nao_achou'),
    onOk: v => { const r = resolver(v); Object.assign(I, { fam: r.familia, modelo: null, daLista: false, previa: null, subs: {}, preco: null, seq: [] }); assistente('molde'); },
    onCancel: () => { Object.assign(I, { fam: '', modelo: null, previa: null, subs: {} }); telaInsert(); } });
  if (passo === 'molde') {
    const mods = modelosDa(I.fam); if (!mods.length) return assistente(3);
    const ops = mods.map(m => ({ valor: String(m.id), titulo: m.tamanho + ' · ' + t('ins_rooks_pecas', { r: m.nRooks, p: m.pecas }), sub: seqTxt(m) + (m.criadoPorNome ? ' · ' + m.criadoPorNome : '') }));
    ops.push({ valor: 'novo', titulo: t('ins_molde_novo'), sub: t('ins_molde_novo_sub') });
    return perguntaTela({ passo: t('im_todos'), titulo: t('ins_q_molde', { f: I.fam }), sub: t('ins_q_molde_sub'), tipo: 'escolha', opcoes: ops,
      onOk: v => { if (v === 'novo') { I.modelo = null; I.daLista = false; return assistente(3); } const m = mods.find(x => String(x.id) === String(v)); if (!m) return assistente('molde'); Object.assign(I, { modelo: m, daLista: true, tam: m.tamanho, rooks: m.nRooks, pecas: m.pecas }); assistente('qtd'); },
      onCancel: () => assistente(1) });
  }
  if (passo === 3) return perguntaTela({ cor: 'roxo', passo: t('ins_de5_2'), titulo: t('ins_q_tamanho'), sub: t('ins_q_tamanho_sub'), tipo: 'texto', ph: t('ins_tam_ph'), valor: I.tam || '', sugestoes: TAMANHOS, ok: t('ins_continuar'),
    valida: v => v ? null : t('ins_precisa_tam'),
    onOk: v => { I.tam = String(v).trim().toUpperCase(); const m = modelosDa(I.fam).find(x => x.tamanho === I.tam); if (m) { I.rooks = m.nRooks; I.pecas = m.pecas; } assistente(4); },
    onCancel: () => assistente(modelosDa(I.fam).length ? 'molde' : 1) });
  if (passo === 4) return perguntaTela({ cor: 'roxo', passo: t('ins_de5_3'), titulo: t('ins_q_hooks'), sub: t('ins_q_hooks_sub'), tipo: 'numero', valor: Number(I.rooks) > 0 ? Number(I.rooks) : 12, min: 1, rapido: [4, 6, 12, 13, 15], ok: t('ins_continuar'),
    onOk: n => { I.rooks = n; assistente(5); }, onCancel: () => assistente(3) });
  if (passo === 5) return perguntaTela({ cor: 'roxo', passo: t('ins_de5_4'), titulo: t('ins_q_pecas'), sub: t('ins_q_pecas_sub'), tipo: 'numero', valor: Number(I.pecas) > 0 ? Number(I.pecas) : 1, min: 1, rapido: [1, 2, 3, 4, 6], ok: t('ins_continuar'),
    onOk: n => { I.pecas = n; assistente('grade'); }, onCancel: () => assistente(4) });
  if (passo === 'grade') {
    I.rooks = Math.max(Number(I.rooks) || 0, 0); I.seq = (I.seq || []).slice(0, I.rooks);
    return perguntaTela({ cor: 'roxo', classe: 'tc-grade', passo: t('ins_de5_5'), titulo: t('ins_q_grade'), sub: t('im_grade_dica'), tipo: 'html', html: gradeTelaHTML(), ok: t('ins_grade_ok'), okDesab: I.seq.length !== I.rooks,
      valida: () => I.seq.length === I.rooks ? null : t('im_numeros_erro', { n: I.seq.length, h: I.rooks }),
      onOk: () => salvarMoldeESeguir(), onCancel: () => assistente(5) });
  }
  if (passo === 'qtd') return perguntaTela({ passo: I.daLista ? t('ins_ultimo') : t('ins_de5_6'), titulo: t('ins_quantos'), sub: t('ins_quantos_sub'), tipo: 'numero', valor: Number(I.qtd || 1), min: 1, rapido: [1, 2, 3, 6, 12], ok: t('ins_continuar'),
    onOk: n => { I.qtd = n; I.previa = null; I.subs = {}; I.preco = null; carregarPrevia(); },
    onCancel: () => { if (I.previa) return telaInsert(); assistente(I.daLista ? 'molde' : 'grade'); } });
}

/** 옛 rpc_salvar_insert_modelo — 같은 패밀리 · 크기 · 훅 · 순서가 이미 있으면 그것을 씀 */
export async function salvarModelo(fam, tam, rooks, pecas, nums) {
  fam = String(fam || '').trim().toUpperCase(); tam = String(tam || '').trim().toUpperCase(); nums = nums.map(x => String(x).trim().toUpperCase());
  if (!fam) throw new Error(t('ins_precisa_fam')); if (!tam) throw new Error(t('ins_precisa_tam')); if (!(rooks > 0)) throw new Error(t('ins_precisa_rooks'));
  if (nums.length !== rooks) throw new Error(t('im_numeros_erro', { n: nums.length, h: rooks }));
  await carregarModelos();
  const d = (I.modelos || []).find(m => m.ativo && m.familia === fam && m.tamanho === tam && Number(m.nRooks) === rooks && (m.numeros || []).join('\u0001') === nums.join('\u0001'));
  if (d) return { duplicado: true, modelo: d };
  const id = newId('M'), now = new Date().toISOString();
  const m = { id, familia: fam, tamanho: tam, nRooks: rooks, pecas: Math.max(Number(pecas) || 1, 1), numeros: nums, obs: '', ativo: true, criadoPor: S.user.email, criadoPorNome: quem(), criadoEm: now, atualizadoEm: now };
  await S.DB.set('insModelos', id, m); I.modelos.push(m);
  return { duplicado: false, modelo: m };
}
async function salvarMoldeESeguir() {
  const rooks = Number(I.rooks) || 0;
  if (!I.fam || !String(I.tam || '').trim() || rooks <= 0 || I.seq.length !== rooks) { toast(t('im_numeros_erro', { n: I.seq.length, h: rooks }), 'bad'); return assistente('grade'); }
  busy(true); let r;
  try { r = await salvarModelo(I.fam, I.tam, rooks, Math.max(Number(I.pecas) || 1, 1), I.seq.slice()); } catch (e) { busy(false); toast(e.message, 'bad'); return assistente('grade'); }
  busy(false);
  if (r.duplicado) toast(t('ins_dup_usando', { d: dataBR(r.modelo.criadoEm) || '—', q: r.modelo.criadoPorNome || '—' }), 'warn'); else toast(t('im_salvo'), 'good');
  Object.assign(I, { modelo: r.modelo, daLista: false, seq: [] });
  assistente('qtd');
}

/* ============================================================
 *  TELA "CRIAR INSERT" (#/insert)
 * ============================================================ */
const cab = () => '<div class="page-head"><div><h1>' + esc(t('ins_tit')) + '</h1><p>' + esc(t('ins_sub')) + '</p></div>';
function chipSt(x) { return x.status === 'desmontado' ? '<span class="pdz-chip pdz-cz">' + esc(t('ins_st_desmontado')) + '</span>' : vendido(x) ? '<span class="pdz-chip pdz-vd">' + esc(t('ins_st_vendido')) + '</span>' : '<span class="pdz-chip pdz-az">' + esc(t('ins_st_montado')) + '</span>'; }
function acoesIns(x) {
  if (x.status !== 'montado') return gerente() ? '<button class="btn sm danger" data-ins-excluir="' + esc(x.id) + '">' + esc(t('ins_excluir')) + '</button>' : '';
  return '<button class="btn sm" data-ins-etq="' + esc(x.id) + '">' + svg(ICO.print, 14) + ' ' + esc(t('ins_etiqueta')) + '</button>' +
    (vendido(x) || !podeMexer() ? '' : '<button class="btn sm" data-ins-desmontar="' + esc(x.id) + '">' + esc(t('ins_desmontar')) + '</button>') +
    (vendido(x) || !gerente() ? '' : '<button class="btn sm danger" data-ins-excluir="' + esc(x.id) + '">' + esc(t('ins_excluir')) + '</button>');
}
function listaModelosHTML(fam) {
  const lista = modelosDa(fam);
  let h = '<div class="panel im-fam-lista"><div class="pdz-panel-head">' + esc(fam ? t('im_da_familia', { f: fam }) : t('im_todos')) + '</div>';
  if (!lista.length) return h + '<div class="placeholder" style="padding:22px 16px">' + esc(t('im_vazio')) + '</div></div>';
  return h + '<div class="im-lista">' + lista.map(m => '<div class="im-li"><div class="im-li-txt"><b>' + esc(m.familia + ' · ' + m.tamanho + ' · ' + t('im_hooks_n', { n: Number(m.nRooks || 0) })) + ' · ' + esc(t('ins_rooks_pecas', { r: m.nRooks, p: m.pecas })) + '</b><span class="im-seq">' + esc(seqTxt(m)) + '</span></div>' +
    '<span class="im-li-quem pdz-mut">' + esc((m.criadoEm ? dataBR(m.criadoEm) : '') + (m.criadoPorNome ? ' · ' + m.criadoPorNome : '')) + '</span><div class="im-li-acoes">' +
    (podeMexer() ? '<button class="btn primary sm" data-im-montar="' + esc(m.id) + '">' + svg(ICO.print, 14) + ' ' + esc(t('im_montar')) + '</button><button class="btn sm danger" data-im-excluir="' + esc(m.id) + '">' + esc(t('pd_excluir')) + '</button>' : '') + '</div></div>').join('') + '</div></div>';
}
function subResHTML() {
  const q = String(I.subBusca || '').trim().toLowerCase(); let h = '<div id="insSubRes">';
  if (q) { const a = (I.prods || []).filter(x => !(x.qtd === 0 && x.vazia) && [x.nome, x.sku, x.barcode, x.descricao].join(' ').toLowerCase().indexOf(q) >= 0).slice(0, 6);
    h += a.length ? '<div class="achados">' + a.map(x => '<button type="button" class="ach" data-ins-escolher="' + esc(x.id) + '"><b>' + esc(x.nome) + '</b><span>' + esc(t('c_qtd')) + ': ' + x.qtd + ' · ' + esc(brl(x.preco)) + '</span></button>').join('') + '</div>' : '<div class="hint" style="margin-top:8px">' + esc(t('ins_sem_sub')) + '</div>'; }
  return h + '</div>';
}

async function telaInsert() {
  injetarCss();
  if (!I.modelos || !I.prods || !I.inserts) { $('page').innerHTML = '<div class="sb"><div class="placeholder">' + esc(t('carregando')) + '</div></div>'; await Promise.all([I.modelos ? 0 : carregarModelos(), I.prods ? 0 : carregarProdutos(), I.inserts ? 0 : carregarInserts()]); if (location.hash.indexOf('#/insert') !== 0 || location.hash.indexOf('#/inserts') === 0) return; }
  if (!podeMexer()) { $('page').innerHTML = '<div class="sb ins-tela">' + cab() + '</div><div class="panel im-restrito"><div class="placeholder" style="padding:30px 16px">' + svg(ICO.caixa, 34) + '<b>' + esc(t('im_restrito')) + '</b></div></div>' + listaModelosHTML('') + '</div>'; return ligar(); }
  if (!I.qtdOk) { I.qtdOk = true; $('page').innerHTML = '<div class="sb ins-tela"></div>'; return assistente(1); }
  let h = cab() + '<div class="actions">' + (I.previa ? '<button class="btn ins-qtd-btn" data-act="ins-qtd">' + svg(ICO.repetir, 15) + ' ' + esc(t('ins_qtd_btn', { n: Number(I.qtd || 1) })) + '</button>' : '') +
    '<button class="btn primary btn-grande" data-act="ins-novo">' + svg(ICO.mais, 16) + ' ' + esc(t('nav_insert')) + '</button></div></div>';
  if (I.fam && I.modelo) { const m = I.modelo; h += '<div class="panel pdz-pad"><div class="pdz-passo">' + esc(t('ins_p2')) + '</div><div class="sel-prod ins-molde"><div><b>' + esc(m.familia + ' · ' + m.tamanho + ' · ' + t('ins_rooks_pecas', { r: m.nRooks, p: m.pecas })) + '</b><span>' + esc((m.numeros || []).join(' ')) + (m.criadoPorNome ? ' · ' + esc(t('ins_molde_por', { d: dataBR(m.criadoEm), q: m.criadoPorNome })) : '') + '</span></div><button class="btn" data-act="ins-trocar-fam">' + esc(t('pd_trocar_cliente')) + '</button></div></div>'; }
  if (I.previa) {
    const L = linhas(), p = I.previa, faltando = L.filter(l => !l.produto_id || !l.ok).length, trocados = L.filter(l => l.substituto && l.motivo_sub).length;
    h += '<div class="panel pdz-pad"><div class="pdz-passo">' + esc(t('ins_p3')) + '</div>';
    if (trocados) h += '<div class="aviso pdz-av alerta ins-trocados">' + svg(ICO.repetir, 16) + '<div>' + esc(t('ins_trocados_n', { n: trocados })) + ' ' + esc(t('ins_trocados_regra')) + '</div></div>';
    if (p.repetido && !I.modelo) h += '<div class="aviso pdz-av">' + svg(ICO.repetir, 16) + '<div>' + esc(t('ins_repetido', { u: p.numeros_unicos, r: p.n_rooks })) + '</div></div>';
    if (Number(p.rooks_no_padrao || 0) < Number(p.n_rooks || 0)) h += '<div class="aviso pdz-av alerta">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('ins_padrao_curto', { n: p.rooks_no_padrao, r: p.n_rooks, f: p.familia })) + '</div></div>';
    h += '<div class="tbl-scroll"><table class="tbl-compacta ins-comp"><thead><tr><th style="width:62px">' + esc(t('ins_rook')) + '</th><th>' + esc(t('pd_produto')) + '</th><th style="width:80px">' + esc(t('r_corredor')) + '</th><th class="num" style="width:88px">' + esc(t('ins_precisa')) + '</th><th class="num" style="width:88px">' + esc(t('c_qtd')) + '</th><th class="num" style="width:96px">' + esc(t('pd_subtotal')) + '</th><th style="width:150px"></th></tr></thead><tbody>';
    L.forEach(l => {
      const falta = !l.produto_id || !l.ok;
      h += '<tr class="' + (falta ? 'ins-falta' : '') + (l.substituto ? ' ins-sub' : '') + '" data-rook="' + l.rook + '"><td><b>' + l.rook + '</b></td><td class="principal">' + (l.produto_id
        ? '<div class="cell-name"><div class="thumb">' + esc(String(l.nome || '?').slice(0, 2)) + '</div><div class="txt"><b>' + esc(l.nome || '') + (l.substituto ? ' <span class="pdz-chip ' + (l.motivo_sub ? 'pdz-am' : 'pdz-az') + '">' + esc(l.motivo_sub ? t('ins_sub_' + l.motivo_sub) : t('ins_substituto')) + '</span>' : '') + '</b><span>' + esc(l.descricao || '') + (l.substituto && l.substitui ? ' · ' + esc(t('ins_no_lugar_de', { s: l.substitui })) : '') + '</span></div></div>'
        : '<span class="pdz-vm-txt">' + esc(t('ins_rook_vazio', { n: p.familia + (l.numero || '') })) + '</span>') + '</td>' +
        '<td>' + esc(l.corredor || '—') + '</td><td class="num">' + Number(l.precisa || p.pecas_por_rook) + '</td><td class="num' + (l.vazio ? ' pdz-vm-txt' : '') + '">' + (l.produto_id ? Number(l.estoque || 0) + (l.vazio ? ' <span class="pdz-chip pdz-vm">' + esc(t('ins_caixa_vazia')) + '</span>' : '') : '—') + '</td>' +
        '<td class="num">' + (l.produto_id ? brl(Number(l.precisa || 1) * Number(l.preco || 0)) : '—') + '</td><td class="acoes">' + (falta || l.substituto ? '<button class="btn sm" data-ins-sub="' + l.rook + '">' + esc(t(l.substituto ? 'ins_trocar_sub' : 'ins_substituir')) + '</button>' + (l.substituto && I.subs[l.rook] ? '<button class="btn sm" data-ins-limpar="' + l.rook + '">' + esc(t('pk_desfazer_item')) + '</button>' : '') : '') + '</td></tr>';
      if (String(I.subRook) === String(l.rook)) h += '<tr class="ins-subrow"><td></td><td colspan="6"><div class="campo-scan"><input id="insSubBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + esc(t('ins_sub_ph')) + '" value="' + esc(I.subBusca || '') + '"><button type="button" class="scan-btn" data-scan="insert-sub">' + svg(SCAN, 18) + '</button></div>' + subResHTML() + '</td></tr>';
    });
    h += '</tbody></table></div><div class="aviso pdz-av" style="margin-top:10px">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('ins_sem_baixa')) + ' ' + esc(t('ins_qtd_hint')) + '</div></div>';
    const soma = total();
    h += '<div class="pdz-total"><span>' + esc(t('ins_resumo', { r: L.length, p: L.reduce((s, l) => s + (l.produto_id ? Number(l.precisa || 1) : 0), 0) })) + '</span><b>' + brl(soma) + '</b></div>' +
      '<div class="grid2" style="margin-top:12px"><div class="field"><label>' + esc(t('ins_preco')) + '</label><input id="insPreco" type="number" step="0.01" min="0" value="' + (I.preco == null ? soma.toFixed(2) : esc(I.preco)) + '"><div class="hint">' + esc(t('ins_preco_hint', { v: brl(soma) })) + '</div></div>' +
      '<div class="field"><label>' + esc(t('ins_obs')) + '</label><input id="insObs" value="' + esc(I.obs || '') + '"></div></div>';
    if (faltando) h += '<div class="aviso pdz-av alerta">' + svg(ICO.ajuda, 16) + '<div>' + esc(t('ins_faltando', { n: faltando })) + '</div></div>';
    h += '<div style="margin-top:14px;text-align:right"><button class="btn primary btn-grande" data-act="ins-montar"' + (pronto() ? '' : ' disabled') + '>' + svg(ICO.check, 16) + ' ' + esc(Number(I.qtd || 1) > 1 ? t('ins_montar_n', { n: I.qtd }) : t('ins_montar')) + '</button></div></div>';
  }
  h += listaModelosHTML(I.previa ? I.fam : '');
  const ult = (I.inserts || []).slice(0, 12);
  if (ult.length) h += '<div class="panel"><div class="pdz-panel-head">' + esc(t('ins_ultimos')) + '</div><div class="tbl-scroll"><table class="tbl-compacta"><thead><tr><th style="width:110px">' + esc(t('pd_num')) + '</th><th>' + esc(t('ins_modelo')) + '</th><th class="num" style="width:110px">' + esc(t('pd_preco')) + '</th><th style="width:140px">' + esc(t('pd_status')) + '</th><th style="width:120px">' + esc(t('pd_data')) + '</th><th style="width:190px"></th></tr></thead><tbody>' +
    ult.map(x => '<tr><td class="principal"><b>' + esc(x.codigo) + '</b></td><td>' + esc(x.descricao || (x.familia + ' ' + x.tamanho)) + (Number(x.nSub) ? ' <span class="pdz-chip pdz-az">' + esc(t('ins_n_sub', { n: x.nSub })) + '</span>' : '') + '</td><td class="num"><b>' + brl(x.preco) + '</b></td><td>' + chipSt(x) + '</td><td class="pdz-mut">' + esc(dataBR(x.montadoEm)) + '</td><td class="acoes">' + acoesIns(x) + '</td></tr>').join('') + '</tbody></table></div></div>';
  $('page').innerHTML = '<div class="sb ins-tela">' + h + '</div>';
  const pp = $('insPreco'); if (pp) pp.oninput = () => { I.preco = pp.value; };
  const ob = $('insObs'); if (ob) ob.oninput = () => { I.obs = ob.value; };
  const sb = $('insSubBusca'); if (sb) { sb.oninput = () => { I.subBusca = sb.value; const a = $('insSubRes'); if (a) a.outerHTML = subResHTML(); }; sb.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const p = resolver(sb.value); if (p && p.produto) aplicarSub(p.produto.id); } }; try { sb.focus(); } catch (e) {} }
  ligar();
}

function aplicarSub(id) { if (!I.subRook) return; I.subs[I.subRook] = id; I.subRook = null; I.subBusca = ''; I.preco = null; telaInsert(); }
function montarDoModelo(id) {
  const m = (I.modelos || []).find(x => String(x.id) === String(id)); if (!m) return toast(t('ins_nao_achou'), 'bad');
  Object.assign(I, { modelo: m, fam: m.familia, tam: m.tamanho, rooks: m.nRooks, pecas: m.pecas, qtd: 1, qtdOk: true, subs: {}, preco: null, obs: '', previa: null, daLista: true });
  if (location.hash.indexOf('#/insert') !== 0 || location.hash.indexOf('#/inserts') === 0) { Router.go('insert'); setTimeout(carregarPrevia, 0); return; }
  carregarPrevia();
}

/** 옛 rpc_montar_insert — 번호 INS-0001 · 구성 저장 · 부품 재고는 그대로 */
export async function montarUm(pv, L, preco, obs, modeloId) {
  if (!pv || !L.length) throw new Error(L3('훅이 비었습니다.', 'The display has no hook filled.', 'O display não tem nenhum hook preenchido.'));
  if (L.length !== Number(pv.n_rooks)) throw new Error(L3('훅 수가 맞지 않습니다.', 'Hook count does not match.', 'O display tem ' + pv.n_rooks + ' hooks, mas vieram ' + L.length + '.'));
  L.forEach(l => { const p = prod(l.produto_id); if (!p) throw new Error(L3('훅 ' + l.numero + ' 상품이 없습니다.', 'Product of hook ' + l.numero + ' does not exist.', 'Produto do hook ' + l.numero + ' não existe ou está inativo.')); if (p.vazia) throw new Error(L3(p.sku + ' 박스가 빈 박스로 표시되어 있습니다. 대체품을 고르세요.', 'The box of ' + p.sku + ' is marked empty. Pick a substitute.', 'A caixa de ' + p.sku + ' está marcada como vazia. Escolha um substituto para esse hook.')); });
  const n = await S.DB.seq('ins', 'n', 1), codigo = 'INS-' + String(n).padStart(4, '0');
  const pecas = Number(pv.pecas_por_rook) || 1, itens = L.map(l => { const p = prod(l.produto_id); return { rook: l.rook, numero: l.numero || '', code: p.sku, nome: p.nome, qtd: pecas, precoUnit: p.preco, corredor: p.corredor || '', substituto: !!l.substituto, substitui: l.substitui || '' }; });
  const soma = Math.round(itens.reduce((s, x) => s + x.qtd * x.precoUnit, 0) * 100) / 100;
  const id = newId('I'), now = new Date().toISOString();
  const doc = { id, codigo, modeloId: modeloId || pv.modelo_id || '', familia: pv.familia, tamanho: pv.tamanho, nRooks: Number(pv.n_rooks), pecas, precoSugerido: soma, preco: preco > 0 ? Number(preco) : soma, obs: obs || '',
    descricao: 'Insert ' + pv.tamanho + ' ' + pv.familia + ' — ' + pv.n_rooks + ' hooks x ' + pecas + ' peça(s)', status: 'montado', emEstoque: 1, itens, nSub: itens.filter(x => x.substituto).length,
    montadoEm: now, montadoPor: S.user.email, montadoPorNome: quem() };
  await S.DB.set('inserts', id, doc);
  return doc;
}
async function criarEImprimir() {
  const L = linhas(); if (!pronto()) { telaInsert(); return toast(t('ins_incompleto'), 'bad'); }
  const quantos = Math.max(Number(I.qtd || 1), 1), preco = I.preco != null && Number(I.preco) > 0 ? Number(I.preco) : null, feitos = [];
  busy(true);
  try { for (let k = 0; k < quantos; k++) feitos.push(await montarUm(I.previa, L, preco, I.obs || '', I.modelo ? I.modelo.id : '')); }
  catch (e) { busy(false); toast(String(e.message || e), 'bad'); if (feitos.length) { I.inserts = null; } return telaInsert(); }
  busy(false);
  const h = await imprimirTudo(feitos);
  toast((feitos.length > 1 ? t('ins_prontos_n', { n: feitos.length }) : t('ins_pronto', { c: feitos[0].codigo })) + ' · ' + t('ins_imp_tres', { h }), 'good');
  zerarMontagem(); I.qtdOk = false; I.inserts = null;
  Router.go('inserts');
}

/* ============ AS TRÊS IMPRESSÕES DO INSERT (옛 insImprimirTudo) ============
 *  1. 훅 라벨 — 훅마다 1 × 0.5 in, 틀의 코드 (대체해도 라벨은 그대로 — 인서트는 표준)
 *  2. 가격 라벨 — INS 바코드 + 가격
 *  3. 피킹 체크리스트 3 × 6 in — 실제로 집을 것, 대체품 표시
 *  옛 앱의 인쇄 에이전트 대신 브라우저 인쇄 한 번 (페이지 크기는 @page ins1 · ins3) */
const codigoMolde = (l, fam) => l.substituto ? (l.substitui || (fam + (l.numero || ''))) : (l.code || l.sku || (fam + (l.numero || '')));
function hooksDe(d) { const fam = d.familia || '', its = (d.itens || []).slice().sort((a, b) => Number(a.rook) - Number(b.rook)); return its.map((l, k) => ({ codigo_molde: codigoMolde(l, fam), rook: Number(l.rook || k + 1), total: its.length, ins: d.codigo, sku: l.code || l.sku || '', corredor: l.corredor || '', precisa: Number(l.qtd || d.pecas || 1), substituto: !!l.substituto })); }
const bar = (v, h, fs) => barcodeSvg(v, { h, w: 1, fs: fs || 10, text: !!fs });
const etqHook = h => '<div class="ietq"><div class="ietq-bar">' + bar(h.codigo_molde, 30) + '</div><b>' + esc(h.codigo_molde) + '</b><small>' + esc(te('ins_etq_hook_n')) + ' ' + h.rook + '/' + h.total + ' · ' + esc(h.ins) + '</small></div>';
const etqValor = d => '<div class="ietq ietq-valor"><div class="ietq-bar">' + bar(d.codigo, 30) + '</div><b>' + esc(d.codigo) + ' · ' + esc(brl(d.preco)) + '</b><small>' + esc([d.familia, d.tamanho, d.nRooks ? d.nRooks + ' ' + te('pd_ins_hooks').toLowerCase() : ''].filter(Boolean).join(' · ')) + '</small></div>';
function checklist(d) {
  const hooks = hooksDe(d), troc = hooks.filter(x => x.substituto).length;
  return '<div class="ichk"><div class="ichk-cab"><b>' + esc(te('ins_checklist')) + '</b><span>' + esc(d.codigo) + '</span></div><div class="ichk-sub">' + esc([d.familia, d.tamanho, hooks.length + ' ' + te('pd_ins_hooks').toLowerCase()].filter(Boolean).join(' · ')) + ' · ' + esc(dataBR(new Date().toISOString())) + '</div>' +
    '<div class="ichk-l ichk-h"><span></span><span>#</span><span>' + esc(te('pd_produto')) + '</span><span>' + esc(te('r_corredor')) + '</span><span>' + esc(te('c_qtd')) + '</span></div>' +
    hooks.map(x => '<div class="ichk-l' + (x.substituto ? ' sub' : '') + '"><span class="ichk-cx"></span><span>' + x.rook + '</span><span><b>' + esc(x.sku || x.codigo_molde) + '</b>' + (x.substituto ? ' <i>*' + esc(te('ins_sub_curto')) + ' ' + esc(x.codigo_molde) + '</i>' : '') + '</span><span>' + esc(x.corredor || '—') + '</span><span>' + x.precisa + '</span></div>').join('') +
    '<div class="ichk-pe">' + (troc ? '<div>* ' + esc(te('ins_sub_legenda')) + '</div>' : '') + '<div class="ichk-tot"><span>' + esc(te('ins_valor_insert')) + '</span><b>' + esc(brl(d.preco)) + '</b></div><div class="ichk-bar">' + bar(d.codigo, 40, 11) + '</div></div></div>';
}
export function impressaoHTML(feitos) { return '<div class="ins-prt">' + feitos.map(d => hooksDe(d).map(etqHook).join('') + etqValor(d) + checklist(d)).join('') + '</div>'; }
/** devolve quantas etiquetas de hook foram (para o aviso) */
async function imprimirTudo(feitos) { try { await loadJsBarcode(); } catch (e) {} injetarCss(); printOpen(impressaoHTML(feitos)); return feitos.reduce((s, d) => s + hooksDe(d).length, 0); }

/* ---------- desmontar · excluir (옛 rpc_desmontar_insert · rpc_excluir_insert) ---------- */
async function desmontar(id) {
  const x = (I.inserts || []).find(y => y.id === id); if (!x) return;
  if (vendido(x)) return toast(L3('이 디스플레이는 이미 재고에서 나갔습니다 (판매됨). 해체할 수 없습니다.', 'This display already left stock (sold). It cannot be taken apart.', 'Este display já saiu do estoque (vendido). Não dá para desmontar.'), 'bad');
  if (!(await confirmBox(t('ins_desmontar_tit') + '\n' + t('ins_desmontar_txt', { c: x.codigo }), t('ins_desmontar')))) return;
  try { await S.DB.update('inserts', id, { status: 'desmontado', emEstoque: 0, desmontadoEm: new Date().toISOString(), desmontadoPor: S.user.email }); } catch (e) { return toast(String(e.message || e), 'bad'); }
  toast(t('ins_desmontado_ok'), 'good'); I.inserts = null; rerender();
}
/** 관리자만 · 판매된 것은 거절 · 문서는 지우지 않고 status 'excluido' 로 남김 (옛 앱의 백업 복사본 대신) */
async function excluir(id) {
  const x = (I.inserts || []).find(y => y.id === id); if (!x || !gerente()) return;
  if (vendido(x)) return toast(L3('이미 판매된 인서트입니다. 삭제하면 판매 기록이 사라집니다.', 'This insert was already sold. Deleting it would erase the sale history.', 'Este insert já foi vendido. Apagar apagaria o histórico da venda.'), 'bad');
  if (!(await confirmBox(t('ins_excluir_tit') + '\n' + t('ins_excluir_txt', { c: x.codigo }), t('ins_excluir')))) return;
  try { await S.DB.update('inserts', id, { status: 'excluido', emEstoque: 0, excluidoEm: new Date().toISOString(), excluidoPor: S.user.email }); } catch (e) { return toast(String(e.message || e), 'bad'); }
  toast(t('ins_excluido_ok'), 'good'); I.inserts = null; rerender();
}
/** 옛 rpc_excluir_insert_modelo — 그 틀로 만든 인서트가 있으면 끄기만, 없으면 지움 */
async function excluirModelo(id) {
  const m = (I.modelos || []).find(x => x.id === id); if (!m) return;
  if (!(await confirmBox(t('im_excluir_tit') + '\n' + t('im_excluir_txt', { f: m.familia, t: m.tamanho }), t('pd_excluir')))) return;
  try {
    const usado = (await S.DB.list('inserts', { where: [['modeloId', '==', id]], limit: 1 })).length;
    if (usado) await S.DB.update('insModelos', id, { ativo: false, atualizadoEm: new Date().toISOString() }); else await S.DB.del('insModelos', id);
  } catch (e) { return toast(String(e.message || e), 'bad'); }
  toast(t('im_excluido'), 'good'); I.modelos = null; rerender();
}
async function reimprimir(id) { const x = (I.inserts || []).find(y => y.id === id); if (!x) return; await imprimirTudo([x]); }
const rerender = () => (location.hash.indexOf('#/inserts') === 0 ? telaProntos() : telaInsert());

/* ---------- cliques (옛 앱의 위임 처리) ---------- */
function ligar() {
  const raiz = document.querySelector('#page .sb'); if (!raiz) return;
  raiz.onclick = e => {
    const c = s => e.target.closest(s); let b;
    if (c('[data-act="ins-novo"]')) { zerarMontagem(); I.qtdOk = true; return assistente(1); }
    if (c('[data-act="ins-qtd"]')) return assistente('qtd');
    if (c('[data-act="ins-trocar-fam"]')) { zerarMontagem(); return assistente(1); }
    if (c('[data-act="ins-montar"]')) { const pp = $('insPreco'), ob = $('insObs'); I.preco = pp ? pp.value : null; I.obs = ob ? ob.value : ''; return criarEImprimir(); }
    if (c('[data-nav="insert"]')) { zerarMontagem(); I.qtdOk = false; return Router.go('insert'); }
    if ((b = c('[data-ins-sub]'))) { I.subRook = b.dataset.insSub; I.subBusca = ''; return telaInsert(); }
    if ((b = c('[data-ins-limpar]'))) { delete I.subs[b.dataset.insLimpar]; I.subRook = null; I.subBusca = ''; return telaInsert(); }
    if ((b = c('[data-ins-escolher]'))) return aplicarSub(b.dataset.insEscolher);
    if (c('[data-scan="insert-sub"]')) return openScanner(code => { const r = resolver(code); if (r && r.produto) aplicarSub(r.produto.id); else toast(t('sc_nao_achado') + ' ' + code, 'bad'); }, { title: t('ins_sub_ph') });
    if (c('[data-scan="ins-lista"]')) return openScanner(code => { I.lBusca = code; I.pag = 1; telaProntos(); }, { title: t('ins_busca_lista') });
    if ((b = c('[data-ins-etq]'))) { e.stopPropagation(); return reimprimir(b.dataset.insEtq); }
    if ((b = c('[data-ins-desmontar]'))) { e.stopPropagation(); return desmontar(b.dataset.insDesmontar); }
    if ((b = c('[data-ins-excluir]'))) { e.stopPropagation(); return excluir(b.dataset.insExcluir); }
    if ((b = c('[data-im-montar]'))) return montarDoModelo(b.dataset.imMontar);
    if ((b = c('[data-im-excluir]'))) return excluirModelo(b.dataset.imExcluir);
    if ((b = c('[data-copiar]'))) { e.stopPropagation(); try { navigator.clipboard.writeText(b.dataset.copiar); toast(b.dataset.copiar, 'good'); } catch (x) {} return; }
    if ((b = c('[data-pag]'))) { I.pag = Number(b.dataset.pag) || 1; return telaProntos(); }
    if ((b = c('[data-ins-abrir]'))) { I.aberto = I.aberto === b.dataset.insAbrir ? null : b.dataset.insAbrir; return telaProntos(); }
  };
}

/* ============================================================
 *  TELA "INSERTS PRONTOS" (#/inserts)
 * ============================================================ */
const POR_PAG = 25;
function listaFiltrada() {
  const q = String(I.lBusca || '').trim().toLowerCase();
  return (I.inserts || []).filter(x => {
    if (I.lFiltro === 'disp' && (x.status !== 'montado' || vendido(x))) return false;
    if (I.lFiltro === 'vend' && !vendido(x)) return false;
    if (q && [x.codigo, x.familia, x.tamanho, x.descricao].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
function resListaHTML() {
  const lista = listaFiltrada(), tp = Math.max(1, Math.ceil(lista.length / POR_PAG)); if (I.pag > tp) I.pag = tp;
  const de = (I.pag - 1) * POR_PAG, pg = lista.slice(de, de + POR_PAG);
  let h = '<div id="insListaRes">';
  if (!lista.length) return h + '<div class="placeholder">' + esc(t('ins_vazio_lista')) + '</div></div>';
  h += '<div class="tbl-scroll"><table class="tbl-compacta ins-lista"><thead><tr><th style="width:40px">#</th><th style="width:150px">' + esc(t('pd_num')) + '</th><th>' + esc(t('ins_modelo')) + '</th><th style="width:80px">' + esc(t('ins_tamanho')) + '</th><th class="num" style="width:80px">' + esc(t('ins_rooks')) + '</th><th class="num" style="width:110px">' + esc(t('pd_preco')) + '</th><th style="width:140px">' + esc(t('pd_status')) + '</th><th style="width:200px"></th></tr></thead><tbody>';
  pg.forEach((x, i) => {
    h += '<tr class="clic" data-ins-abrir="' + esc(x.id) + '"><td class="pdz-mut">' + (de + i + 1) + '</td><td class="principal"><div class="ins-cod"><b>' + esc(x.codigo) + '</b><button type="button" class="btn-copiar" data-copiar="' + esc(x.codigo) + '" title="' + esc(t('pd_num')) + '">' + svg(ICO.copiar, 13) + '</button></div></td>' +
      '<td>' + esc(x.familia) + (Number(x.nSub) ? ' <span class="pdz-chip pdz-az">' + esc(t('ins_n_sub', { n: x.nSub })) + '</span>' : '') + '</td><td><b>' + esc(x.tamanho) + '</b></td><td class="num">' + Number(x.nRooks || 0) + '×' + Number(x.pecas || 1) + '</td><td class="num"><b>' + brl(x.preco) + '</b></td><td>' + chipSt(x) + '</td><td class="acoes">' + acoesIns(x) + '</td></tr>';
    if (I.aberto === x.id) h += '<tr class="ins-detalhe"><td colspan="8"><div class="ins-det"><div class="ins-det-bar">' + barcodeSvg(x.codigo, { h: 46, fs: 12 }) + '</div><div class="ins-det-info"><b>' + esc(t('ins_composto')) + '</b><div class="ins-det-lista">' +
      (x.itens || []).slice().sort((a, b) => a.rook - b.rook).map(it => '<span' + (it.substituto ? ' class="sub"' : '') + '>' + it.rook + '. ' + esc(it.code || it.nome) + ' ×' + it.qtd + '</span>').join('') + '</div><div class="hint" style="margin-top:6px">' + esc(x.descricao || '') + ' · ' + esc(dataBR(x.montadoEm)) + ' · ' + esc(x.montadoPorNome || '') + '</div></div></div></td></tr>';
  });
  h += '</tbody></table></div>';
  if (tp > 1) { h += '<div class="sh-pag"><div class="sh-pag-bts">'; for (let p = 1; p <= tp; p++) h += '<button type="button" class="btn sm' + (p === I.pag ? ' primary' : '') + '" data-pag="' + p + '">' + p + '</button>'; h += '</div></div>'; }
  return h + '</div>';
}
async function telaProntos() {
  injetarCss();
  if (!I.inserts) { $('page').innerHTML = '<div class="sb"><div class="placeholder">' + esc(t('carregando')) + '</div></div>'; await carregarInserts(); if (location.hash.indexOf('#/inserts') !== 0) return; }
  try { await loadJsBarcode(); } catch (e) {}
  const disp = I.inserts.filter(x => x.status === 'montado' && Number(x.emEstoque || 0) > 0), vend = I.inserts.filter(vendido), valor = disp.reduce((s, x) => s + Number(x.preco || 0), 0);
  const tile = (l, v, s) => '<div class="tile"><div class="lbl">' + esc(l) + '</div><div class="val">' + esc(v) + '</div><div class="sub">' + esc(s) + '</div></div>';
  const h = '<div class="tiles">' + tile(t('ins_f_disp'), String(disp.length), t('ins_aba_sub')) + tile(t('pd_total'), brl(valor), t('ins_f_disp')) + tile(t('ins_f_vend'), String(vend.length), t('ins_st_vendido')) + '</div>' +
    '<div class="page-head"><div><h1>' + esc(t('ins_aba')) + '</h1><p>' + esc(t('ins_aba_sub')) + '</p></div><div class="actions">' + (podeMexer() ? '<button class="btn primary" data-nav="insert">' + svg(ICO.mais, 15) + ' ' + esc(t('nav_insert')) + '</button>' : '') + '</div></div>' +
    '<div class="panel"><div class="toolbar"><div class="tb-search">' + svg(ICO.busca, 15) + '<input type="search" id="insListaBusca" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + esc(t('ins_busca_lista')) + '" value="' + esc(I.lBusca || '') + '"><button type="button" class="scan-in" data-scan="ins-lista" title="' + esc(t('sc_abrir')) + '">' + svg(SCAN, 16) + '</button></div>' +
    '<select class="flt" id="insListaFiltro"><option value="">' + esc(t('ins_f_todos')) + '</option><option value="disp"' + (I.lFiltro === 'disp' ? ' selected' : '') + '>' + esc(t('ins_f_disp')) + '</option><option value="vend"' + (I.lFiltro === 'vend' ? ' selected' : '') + '>' + esc(t('ins_f_vend')) + '</option></select></div>' + resListaHTML() + '</div>';
  $('page').innerHTML = '<div class="sb ins-tela ins-prontos">' + h + '</div>';
  let tm = null; const b = $('insListaBusca'); if (b) b.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { I.lBusca = b.value; I.pag = 1; const a = $('insListaRes'); if (a) a.outerHTML = resListaHTML(); }, 220); };
  const f = $('insListaFiltro'); if (f) f.onchange = () => { I.lFiltro = f.value; I.pag = 1; telaProntos(); };
  ligar();
}
