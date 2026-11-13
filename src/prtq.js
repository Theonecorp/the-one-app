/* ============================================================
 *  🖨 프린터 에이전트 대기열 (옛 THE ONE CORP WMS 의 "Agente de impressão" 를 그대로 — etqFilaLote · etqFilaExpedicao · impAcompanhar)
 *    화면은 프린터에 직접 찍지 않고 printJobs 에 일을 넣음 → 그 방 Windows 의 에이전트(agente-impressao/agente.mjs)가 3초마다 가져가
 *    라벨을 그림으로 찍어 Zebra/TSC 에 바로 보냄 → st 'feito' (실패하면 두 번 더 해 보고 'erro')
 *    · impressora: 별명만 ('grande' 4×6 · 'pequena') — 진짜 프린터 이름은 그 PC 의 config.json 이 앎 (프린터를 바꿔도 앱은 그대로)
 *    · estacao: 어느 방에서 나오나 — 출고 화면(Shipping UPS · Notes UPS)은 'Expedicao'. 그 estacao 의 에이전트만 가져감
 *    · 끄고 켜기: settings/app.printDireta (옛 "impressão direta") — 꺼져 있으면 지금처럼 브라우저 인쇄 창
 *    · 에이전트는 30초마다 printAgents/{기계} 에 "살아 있음" — 2분 안에 소식이 없으면 화면이 "에이전트 꺼짐 — 대기열에 보관" 이라고 사실대로 말함
 *    · 보낸 뒤 화면 전체에 "나오는 중…" → 에이전트가 'feito' 로 바꾸면 ✓ (45초까지 기다림 · 넘으면 "대기열에 있음")
 * ============================================================ */
import { esc, bt } from './ui.js';
import { newId } from './db.js';
import { S, myJobs } from './main.js';
import { LANG } from './i18n.js';

const L3 = (ko, en, pt) => LANG === 'pt' ? pt : LANG === 'en' ? en : bt(ko, en);
/** 출고 방 — 에이전트 config.json 의 "estacao" 와 글자 하나까지 같아야 함 (다르면 라벨이 영원히 대기열에) */
export const ESTACAO_EXPEDICAO = 'Expedicao';
export const VIVO_MS = 120000, ESPERA_MS = 1200, TETO_MS = 45000;

/** 바로 인쇄(에이전트)가 켜져 있나 — 집 전체 설정 */
export const direta = () => !!(S.settings && S.settings.printDireta);
/** 켜고 끄기: 관리자 · 오너 · 창고 매니저 (옛 앱: 매니저만) */
export const podeLigar = () => S.role === 'admin' || S.role === 'owner' || (S.role === 'manager' && myJobs().includes('whmgr'));
export async function ligar(v) {
  await S.DB.update('settings', 'app', { printDireta: !!v, updatedAt: new Date().toISOString() });
  S.settings.printDireta = !!v;
}

/** 지금 살아 있는 에이전트 (estacao 를 주면 그 방 것만 · 안 주면 방 없는 것만 — 옛 rpc_impressao_quem_imprime) */
export async function vivos(estacao) {
  if (S.DB.fresh) S.DB.fresh('printAgents');
  const L = await S.DB.list('printAgents');
  const lim = Date.now() - VIVO_MS;
  return L.filter(a => a && a.imprime !== false && Date.parse(a.em || '') > lim && (estacao ? a.estacao === estacao : !a.estacao));
}

/** 에이전트가 찍을 한 장짜리 페이지 — 장(.etq-pag)마다 라벨 하나. 에이전트는 @page 크기와 .etq-pag 개수로 자름 (옛 etqPaginaHTML) */
export function paginaHTML(css, folhas, pw, ph) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:' + pw + 'in ' + ph + 'in;margin:0}html,body{margin:0;padding:0;background:#fff}' +
    '.etq-pag{width:' + pw + 'in;height:' + ph + 'in;position:relative;overflow:hidden;page-break-after:always;break-after:page}.etq-pag:last-child{page-break-after:auto;break-after:auto}</style>' +
    (css ? '<style>' + css + '</style>' : '') + '</head><body>' + folhas.map(f => '<div class="etq-pag">' + f + '</div>').join('') + '</body></html>';
}

/**
 * 출고 방 대기열로 (옛 etqFilaExpedicao). itens: [{ titulo, html } | { titulo, zpl }] — 하나가 일 하나
 *   html: paginaHTML 로 만든 페이지 · zpl: 프린터에 그대로 보낼 명령 (UPS 의 ZPL 라벨)
 *   돌려주는 값: true = 대기열이 맡음 (브라우저 창을 열지 말 것) · false = 바로 인쇄가 꺼져 있음 → 하던 대로 브라우저
 */
export function filaExpedicao(itens, tipo) {
  return filaLote(itens, tipo, { estacao: ESTACAO_EXPEDICAO, impressora: 'grande', nome: L3('출고 프린터', 'Shipping printer', 'Impressora da expedição') });
}

export function filaLote(itens, tipo, op) {
  if (!direta()) return false;
  const L = (itens || []).filter(x => x && (x.html || x.zpl)); if (!L.length) return false;
  op = op || {};
  const estacao = op.estacao || '', nome = op.nome || '', qtd = L.length;
  const enfileirar = () => Promise.all(L.map(async x => {
    const id = newId('P'), now = new Date().toISOString();
    try {
      await S.DB.set('printJobs', id, { id, tipo: tipo || '', titulo: String(x.titulo || '').substring(0, 120), impressora: op.impressora || 'grande', estacao, copias: 1,
        dados: x.zpl ? { zpl: x.zpl } : { html: x.html }, st: 'pendente', tentativas: 0, by: (S.user && S.user.email) || '', em: now });
      return id;
    } catch (e) { return null; }
  })).then(ids => ids.filter(Boolean));
  /* "보냈다" 고 말하기 전에 반대편에 누가 있는지 물음 (옛 앱 2026-09-08: 라벨 하나가 40분 기다렸다가 72장이 한꺼번에 나옴) — 없어도 일은 넣어 둠 (에이전트가 돌아오면 나옴) */
  vivos(estacao).then(v => enfileirar().then(ids => {
    if (!ids.length) return cartao('erro', L3('대기열에 넣지 못했습니다', 'Could not queue the label', 'Não consegui pôr na fila'), nome);
    if (!v.length) return cartao('fila', estacao ? L3('출고 PC 의 에이전트가 꺼져 있습니다 — 라벨은 대기열에 있고 켜지면 나옵니다', 'The shipping PC agent is off — the label is queued and prints when it comes back', 'O agente do PC da expedição está desligado — a etiqueta ficou na fila e sai quando ele voltar')
      : L3('에이전트가 꺼져 있습니다 — 대기열에 보관', 'Agent offline — stays queued', 'Agente desligado — fica na fila'), nome);
    acompanhar(ids, qtd, nome);
  }), () => enfileirar().then(ids => acompanhar(ids, qtd, nome)));   // 누가 있는지 모르면 그래도 인쇄
  return true;
}

/* ---------- 나왔는지 확인 (옛 impAcompanhar) — 1.2초마다 · 45초까지 ---------- */
export function acompanhar(ids, qtd, nome) {
  const enviada = L3('라벨 ' + qtd + '장을 대기열에 넣었습니다', qtd + ' label(s) queued', qtd + ' etiqueta(s) na fila');
  if (!ids || !ids.length) return cartao('ok', enviada, nome);
  const c = cartao('esperando', L3('라벨 ' + qtd + '장 나오는 중…', 'Printing ' + qtd + ' label(s)…', 'Saindo ' + qtd + ' etiqueta(s)…'), nome);
  let n = 0;
  const olhar = async () => {
    let L = [];
    try { if (S.DB.fresh) S.DB.fresh('printJobs'); L = await Promise.all(ids.map(id => S.DB.get('printJobs', id))); } catch (e) { return fim(c, 'ok', enviada); }
    const feitas = L.filter(j => j && j.st === 'feito').length, ruins = L.filter(j => j && j.st === 'erro').length;
    if (ruins) return fim(c, 'erro', L3('라벨 ' + ruins + '장이 나오지 않았습니다 — 프린터를 확인하세요', ruins + ' label(s) failed — check the printer', ruins + ' etiqueta(s) não saíram — confira a impressora'));
    if (feitas >= ids.length) return fim(c, 'ok', L3('라벨 ' + feitas + '장 나왔습니다', feitas + ' label(s) printed', feitas + ' etiqueta(s) impressa(s)'));
    if (++n * ESPERA_MS >= TETO_MS) return fim(c, 'ok', enviada);   // 넘으면 실패가 아니라 "대기열에 있음" — 그게 사실
    const p = c.querySelector('.prq-sub'); if (p && feitas) p.textContent = feitas + ' / ' + ids.length;
    setTimeout(olhar, ESPERA_MS);
  };
  setTimeout(olhar, 600);
}

/* ---------- 화면 전체 확인 (옛 imp-tela: 서서 상자를 든 사람이 몇 걸음 떨어져서도 보게) ---------- */
const CSS = '.prq{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,32,.55);cursor:pointer;transition:opacity .2s}' +
  '.prq.saindo{opacity:0}.prq-in{background:#fff;color:#1f2933;border-radius:18px;padding:34px 40px;min-width:280px;max-width:min(520px,92vw);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}' +
  '.prq-selo{width:84px;height:84px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800;color:#fff;background:#1b6ec2}' +
  '.prq.ok .prq-selo{background:#128a5b}.prq.erro .prq-selo{background:#c62828}.prq.fila .prq-selo{background:#d98a00}' +
  '.prq-giro{width:44px;height:44px;border:5px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:prqg 0.9s linear infinite}@keyframes prqg{to{transform:rotate(360deg)}}' +
  '.prq-txt{font-size:20px;font-weight:700;line-height:1.35}.prq-sub{margin-top:8px;color:#6b7785;font-size:15px}';
function css() { if (document.getElementById('prqCss')) return; const s = document.createElement('style'); s.id = 'prqCss'; s.textContent = CSS; document.head.appendChild(s); }
const SELO = { esperando: '<span class="prq-giro"></span>', ok: '✓', erro: '✕', fila: '!' };
function cartao(estado, texto, nome) {
  css(); document.querySelectorAll('.prq').forEach(x => x.remove());
  const a = document.createElement('div'); a.className = 'prq ' + estado; a.setAttribute('role', 'status'); a.setAttribute('aria-live', 'polite'); a.dataset.prq = estado;
  a.innerHTML = '<div class="prq-in"><div class="prq-selo">' + SELO[estado] + '</div><div class="prq-txt">' + esc(texto) + '</div><div class="prq-sub">' + esc(nome || '') + '</div></div>';
  a.addEventListener('click', () => a.remove());
  document.body.appendChild(a);
  if (estado !== 'esperando') fechar(a, estado);
  return a;
}
function fim(a, estado, texto) {
  if (!a || !a.isConnected) return;
  a.className = 'prq ' + estado; a.dataset.prq = estado;
  a.querySelector('.prq-selo').innerHTML = SELO[estado]; a.querySelector('.prq-txt').textContent = texto;
  fechar(a, estado);
}
/* 이 카드만 닫음 (옛 앱: 연달아 두 번 찍으면 첫 확인이 두 번째 카드를 닫던 일) · 오류 · 대기열은 더 오래 */
function fechar(a, estado) { setTimeout(() => { if (!a.isConnected) return; a.classList.add('saindo'); setTimeout(() => a.remove(), 220); }, estado === 'ok' ? 2600 : 6000); }

/* ---------- 화면 위 작은 띠: 🖨 바로 인쇄 켜기/끄기 + 출고 PC 에이전트 상태 (Shipping UPS · Notes UPS 머리) ---------- */
export function seloHTML() {
  const on = direta(), pode = podeLigar();
  if (!on && !pode) return '';
  return '<div class="prq-barra" id="prqBarra" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;margin:0 0 10px">' +
    (pode ? '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="prqLigar"' + (on ? ' checked' : '') + '> 🖨 ' + esc(L3('출고 PC 프린터로 바로 인쇄 (에이전트)', 'Print straight to the shipping PC (agent)', 'Imprimir direto no PC da expedição (agente)')) + '</label>'
      : '<span>🖨 ' + esc(L3('출고 PC 프린터로 바로 인쇄', 'Printing straight to the shipping PC', 'Impressão direta no PC da expedição')) + '</span>') +
    (on ? '<span id="prqEstado" data-prq-vivo="" style="color:#6b7785">' + esc(L3('확인 중…', 'Checking…', 'Verificando…')) + '</span>' : '') + '</div>';
}
const VC = { at: 0, p: null };
export function ligarSelo(redesenhar) {
  const cb = document.getElementById('prqLigar');
  if (cb) cb.onchange = async () => { try { await ligar(cb.checked); } catch (e) { cb.checked = !cb.checked; } if (redesenhar) redesenhar(); };
  const el = document.getElementById('prqEstado'); if (!el) return;
  /* 화면을 다시 그릴 때마다 읽지 않게 15초 기억 */
  const now = Date.now(); if (!VC.p || now - VC.at > 15000) { VC.at = now; VC.p = vivos(ESTACAO_EXPEDICAO); VC.p.catch(() => { VC.p = null; }); }
  VC.p.then(v => {
    if (!el.isConnected) return;
    el.dataset.prqVivo = v.length ? '1' : '0';
    el.style.color = v.length ? '#128a5b' : '#c62828';
    el.textContent = v.length ? '● ' + L3('연결됨', 'Connected', 'Conectada') + ' · ' + v.map(a => a.maquina || a.id).join(', ') : '● ' + L3('에이전트 꺼짐 — 대기열에 보관', 'Agent offline — stays queued', 'Agente desligado — fica na fila');
  }, () => { if (el.isConnected) el.textContent = ''; });
}
