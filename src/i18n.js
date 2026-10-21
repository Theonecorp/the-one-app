/* ============================================================
 *  🌐 언어 — 한국어 · English · Português (Brasil)
 *    화면은 한국어로 만들고, 그려진 뒤 글자를 바꿔 끼움 (MutationObserver) — 모든 화면 · 팝업 · 토스트 · 확인창에 한 번에 적용
 *    사전 i18n.json = { r: { 한글덩어리: [en, pt, [뒤따르는 영어 표기들]] }, p: { 한글문구: [en, pt] } }
 *      p — 버튼 · 메뉴처럼 통째로 있는 문구 (먼저 찾음)
 *      r — 숫자 · 코드 · 가게 이름 사이의 한글 덩어리 (예: "3건 · 오늘" → "3 items · Today")
 *    한국어 화면에서도 같은 사전으로 한글 옆에 붙은 영어(예: "합계 Total")를 지워 한 언어만 보이게 함
 *    언어는 폰마다 저장(localStorage) + 사용자 기록(users.lang, 관리 → 사용자에서 정함)
 * ============================================================ */
const LS = 'theone.lang';
export const LANGS = [['ko', '한국어'], ['en', 'English'], ['pt', 'Português']];
const pick = () => { try { const v = localStorage.getItem(LS); if (v) return v; } catch (e) {} const n = (navigator.language || '').toLowerCase(); return n.startsWith('pt') ? 'pt' : 'ko'; };
export let LANG = pick();
if (!LANGS.some(l => l[0] === LANG)) LANG = 'ko';
export const hasLangChoice = () => { try { return !!localStorage.getItem(LS); } catch (e) { return false; } };
/** 언어 바꾸기 — 화면을 처음부터 다시 그림 */
export function setLang(l, reload) { try { localStorage.setItem(LS, l); } catch (e) {} if (reload !== false) location.reload(); }

let D = { r: {}, p: {} }, E2P = {};
const ek = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
/** 영어 → 포르투갈어 (사전의 짝에서) — 화면에 원래 붙어 있던 영어를 그대로 쓰는 자리 */
const ptOfEn = en => E2P[ek(en)] || E2P[ek(en).replace(/[.:]+$/, '')] || null;
const HAN = /[가-힣]/;
const RUN = /[가-힣]+(?:[ ]+[가-힣]+)*/g;
const IDX = () => (LANG === 'en' ? 0 : 1);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* 문구 찾기용 — 앞의 이모지 · 기호, 뒤의 구분 기호는 빼고 */
const LEAD = /^[^가-힣A-Za-z0-9]+/, TAIL = /[\s·:,—-]+$/;

/* 날짜 조각 — "10월 20일 (화)" "2026년 10월" → 언어별 */
const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] };
const WDK = '일월화수목금토', WDX = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], pt: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] };
function dates(s) {
  const M = MON[LANG], W = WDX[LANG];
  if (/^[일월화수목금토]$/.test(s)) return W[WDK.indexOf(s)];   // 달력 요일 머리
  return s.replace(/(\d{4})년\s*(\d{1,2})월/g, (_, y, m) => M[(+m - 1) % 12] + ' ' + y)
    .replace(/(\d{1,2})월\s*(\d{1,2})일/g, '$1/$2')
    .replace(/(\d{4})년/g, '$1')
    .replace(/(\d{1,2})월(?![가-힣])/g, (_, m) => M[(+m - 1) % 12] || m)
    .replace(/\(([일월화수목금토])\)/g, (_, w) => '(' + W[WDK.indexOf(w)] + ')');
}
/** 사전에 없는 덩어리 — 앞에서부터 가장 긴 낱말 묶음으로 찾고, 끝의 조사를 떼어서도 찾음 */
const JOSA = /(에서|까지|부터|으로|에게|하고|이나|이랑|은|는|이|가|을|를|에|의|로|도|와|과|만)$/;
function piece(w) {
  const e = D.r[w]; if (e) return e[IDX()];
  const m = w.match(JOSA); if (m && w.length > m[0].length) { const e2 = D.r[w.slice(0, -m[0].length)]; if (e2) return e2[IDX()]; }
  return null;
}
function greedy(run) {
  const ws = run.split(' '), out = []; let i = 0;
  while (i < ws.length) {
    let done = false;
    for (let j = ws.length; j > i; j--) { const t = piece(ws.slice(i, j).join(' ')); if (t != null) { if (t) out.push(t); i = j; done = true; break; } }
    if (!done) { out.push(ws[i]); i++; }
  }
  return out.join(' ');
}
/** 글자 하나(텍스트 노드 · placeholder …)를 지금 언어로 */
const MK = /\u2062([^\u2062\u2063]*?) \/ ([^\u2062\u2063]*)\u2063/g;
/** bt() 짝 하나 — 한국어 · 영어는 그대로 고르고, 포르투갈어는 사전(한글 → 영어 → 덩어리 순) */
function pair(ko, en) {
  if (LANG === 'ko') return ko; if (LANG === 'en') return en;
  const pre = ko.match(/^[^가-힣]*/)[0], k = ko.slice(pre.length).replace(TAIL, ''), P = D.p[k] || D.r[k];
  return pre + ((P && P[1]) || ptOfEn(en) || tr(ko.slice(pre.length)));
}
export function tr(t, enHint) {
  if (t && t.indexOf('\u2063') >= 0) { t = t.replace(MK, (_, ko, en) => pair(ko, en)); }
  if (!t || !HAN.test(t)) return t;
  const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0];
  let s = t.trim();
  /* 바로 옆에 원래 영어 꼬리표가 있으면 그 영어(또는 그 영어의 포르투갈어)가 가장 정확 */
  if (enHint && LANG !== 'ko') { const pre = (s.match(LEAD) || [''])[0], rest = s.slice(pre.length); if (!/[0-9]/.test(rest)) { const k = rest.replace(TAIL, ''), K = D.p[k] || D.r[k]; const x = LANG === 'en' ? enHint.trim() : (K && K[1]) || ptOfEn(enHint); if (x) return lead + pre + x + trail; } }
  if (LANG !== 'ko') {
    const pre = (s.match(LEAD) || [''])[0], rest = s.slice(pre.length), post = (rest.match(TAIL) || [''])[0], key = rest.slice(0, rest.length - post.length);
    const P = D.p[key]; if (P && P[IDX()]) return lead + pre + P[IDX()] + post + trail;
  }
  /* "한글 / English" 통째 — 한쪽만 */
  const bi = s.match(/^([^]*[가-힣][^]*?)\s+\/\s+([^가-힣]*[A-Za-z][^가-힣]*)$/);
  if (bi) {
    const pre = bi[1].match(/^[^가-힣]*/)[0];   // 앞의 숫자 · 이모지 (예: "4 / 4 곳 …", "📋 가게 창") 는 살림
    if (LANG === 'en') return lead + pre + bi[2] + trail;
    s = bi[1];
    if (LANG !== 'ko') { const k = s.slice(pre.length).replace(TAIL, ''), P = D.p[k] || D.r[k]; if (P && P[1]) return lead + pre + P[1] + trail; const x = ptOfEn(bi[2]); if (x) return lead + pre + x + trail; }
  }
  if (LANG !== 'ko') s = dates(s);
  let out = '', i = 0, m; RUN.lastIndex = 0;
  while ((m = RUN.exec(s))) {
    out += s.slice(i, m.index);
    const run = m[0], e = D.r[run]; let end = m.index + run.length;
    /* 뒤에 같은 뜻의 영어가 붙어 있으면 (예: "합계 Total", "없음 · none") 지움 */
    if (e && e[2]) for (const a of e[2]) { const mm = s.slice(end).match(new RegExp('^\\s*(?:[·/|—–-]\\s*|\\(\\s*)?' + escRe(a) + '(?![A-Za-z])\\)?', 'i')); if (mm) { end += mm[0].length; break; } }
    let rep = LANG === 'ko' ? run : e ? e[IDX()] : greedy(run);
    if (rep == null) rep = run;
    if (LANG !== 'ko' && rep) {
      const pc = out.slice(-1), nc = s.charAt(end);
      if (/[A-Za-z0-9)%$]/.test(pc) && /^[A-Za-zÀ-ú(]/.test(rep)) rep = ' ' + rep;
      if (/[A-Za-z0-9(]/.test(nc) && /[A-Za-zÀ-ú)]$/.test(rep)) rep += ' ';
      if (!out.replace(/[^A-Za-z0-9가-힣]/g, '')) rep = rep.replace(/^(\s*)([a-zà-ú])/, (_, a, b) => a + b.toUpperCase());   // 문장 첫 글자
    }
    out += rep; i = end; RUN.lastIndex = end;
  }
  out += s.slice(i);
  if (LANG !== 'ko') out = out.replace(/ {2,}/g, ' ').replace(/ ([,.:;)])/g, '$1').replace(/\( /g, '(');
  return lead + out + trail;
}
/** 여러 줄 (확인창) */
const trLines = s => String(s == null ? '' : s).split('\n').map(tr).join('\n');

const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
const skipEl = el => !el || SKIP[el.tagName] || (el.closest && el.closest('[translate="no"]'));
function doText(n) {
  const p = n.parentElement; if (!p || skipEl(p)) return;
  if (p.classList && p.classList.contains('en') && p.classList.contains('enx')) return;
  const v = n.data; if (!HAN.test(v)) return;
  const sib = n.nextSibling, hint = sib && sib.nodeType === 1 && sib.classList.contains('en') && !sib.children.length && /[A-Za-z]/.test(sib.textContent) && !HAN.test(sib.textContent) ? sib.textContent : '';
  const x = tr(v, hint); if (x !== v) n.data = x;
}
function doAttr(el, a) { const v = el.getAttribute(a); if (v && HAN.test(v)) { const x = tr(v); if (x !== v) el.setAttribute(a, x); } }
/* 한글 옆의 영어 꼬리표 <span class="en"> — 같은 뜻이므로 숨김 (숫자만 있는 꼬리표는 그대로) */
function markEn(el) {
  el.querySelectorAll('.en:not(.enx)').forEach(sp => {
    if (!/[A-Za-z]/.test(sp.textContent)) return;
    const par = sp.parentElement; if (!par) return;
    let own = ''; par.childNodes.forEach(c => { if (c !== sp) own += c.textContent || ''; });
    if (HAN.test(own) || sp.dataset.ko) sp.classList.add('enx');
  });
}
function walk(node) {
  if (node.nodeType === 3) return doText(node);
  if (node.nodeType !== 1 || skipEl(node)) return;
  if (node.classList && node.classList.contains('en') && /[A-Za-z]/.test(node.textContent) && node.parentElement && HAN.test(node.parentElement.textContent.replace(node.textContent, ''))) node.classList.add('enx');
  markEn(node);
  ['placeholder', 'title'].forEach(a => { if (node.hasAttribute && node.hasAttribute(a)) doAttr(node, a); });
  node.querySelectorAll('[placeholder],[title]').forEach(el => { doAttr(el, 'placeholder'); doAttr(el, 'title'); });
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), L = [];
  while (w.nextNode()) L.push(w.currentNode);
  L.forEach(doText);
}
function buildE2P() { if (LANG !== 'pt') return; for (const k in D.r) { const e = D.r[k]; if (e[0] && e[1] && !E2P[ek(e[0])]) E2P[ek(e[0])] = e[1]; } for (const k in D.p) { const e = D.p[k]; if (e[0] && e[1]) E2P[ek(e[0])] = e[1]; } }
let ON = false;
/** 앱 시작 때 한 번 — 사전 받기 · 감시 시작 · 확인창 바꾸기 */
export async function initLang(ver) {
  document.documentElement.lang = LANG === 'pt' ? 'pt-BR' : LANG;
  document.documentElement.classList.add('L-' + LANG);
  /* 한국어 화면은 사전을 기다리지 않고 바로 시작 (사전은 한글 옆 영어 지우기용 — 받아지면 화면 전체에 한 번 더) */
  const load = fetch('i18n.json?v=' + encodeURIComponent(ver || '')).then(r => r.ok ? r.json() : null).catch(() => null).then(j => { if (j) D = j; D.r = D.r || {}; D.p = D.p || {}; buildE2P(); });
  if (LANG !== 'ko') await load; else { D.r = D.r || {}; D.p = D.p || {}; load.then(() => walk(document.body)); }

  if (ON) return; ON = true;
  walk(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
  const oc = window.confirm.bind(window), oa = window.alert.bind(window), op = window.prompt.bind(window);
  window.confirm = m => oc(trLines(m)); window.alert = m => oa(trLines(m)); window.prompt = (m, d) => op(trLines(m), d);
}
