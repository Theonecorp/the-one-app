/* ============================================================
 *  화면 도우미 — 돈 · 날짜 · 토스트 · 모달 · 간단 라우터
 * ============================================================ */
export const $ = id => document.getElementById(id);
/* 한글 · 영문 병기 — bi: 화면(HTML) 용, bt: 글자만 (placeholder · toast · confirm) */
export const bi = (ko, en) => ko + ' <span class="en">' + en + '</span>';
/* bt: 앞뒤에 보이지 않는 표시(U+2062 · U+2063) — 언어 전환(i18n.js)이 한글 / English 짝의 정확한 경계를 알게 (뒤에 붙는 날짜 · 이름이 안 사라지게) */
export const bt = (ko, en) => '\u2062' + ko + ' / ' + en + '\u2063';
export const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
export const money = n => { n = Number(n) || 0; return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export const k = n => { n = Number(n) || 0; const a = Math.abs(n), s = n < 0 ? '−' : ''; if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'K'; return s + '$' + Math.round(a); };
export const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
export const R2 = x => Math.round((Number(x) || 0) * 100) / 100;
/** ISO 시각 → 그 폰의 날짜 (YYYY-MM-DD) */
/** 🔢 인보이스 번호 형식 — 무조건 글자 + 하이픈 + 6자리 숫자: A43350 · A-43350 · a 043350 → A-043350, P007803 → P-007803, CM161 → CM-000161
 *  (A-999999 다음은 AA-000001 — invoicing.js fmtNo). 숫자가 6자리를 넘거나 모양이 다르면 그대로 (대문자만) */
export const invNo = v => { const s = String(v == null ? '' : v).toUpperCase().replace(/\s+/g, ''); const m = s.match(/^([A-Z]{1,3})-?(\d{1,6})$/); return m ? m[1] + '-' + m[2].padStart(6, '0') : s; };
/** 형식 통일 전 옛 모양들 (A43350 · A043350 · A-43350) — 아직 바꾸지 않은 자료를 찾을 때 */
export const invNoOld = v => { const n = invNo(v), m = n.match(/^([A-Z]{1,3})-(\d{6})$/); if (!m) return [n]; const k = String(Number(m[2])); return [n, m[1] + k, m[1] + m[2], m[1] + '-' + k, m[1] + k.padStart(5, '0')].filter((x, i, a) => a.indexOf(x) === i); };
/** 인보이스 번호 순서 — 종류(A · CM · P · W …)끼리 묶고, 안에서 번호 크기 순 (A42497 · P-007803 · CM-000161). desc 면 큰 번호가 위 */
export const invParts = no => { const m = String(no || '').toUpperCase().match(/^([A-Z]+)-?(\d+)/); return m ? [m[1], Number(m[2])] : [String(no || '').toUpperCase(), 0]; };
export function sortInv(rows, noOf, desc) { return rows.slice().sort((x, y) => { const a = invParts(noOf(x)), b = invParts(noOf(y)); return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : desc ? b[1] - a[1] : a[1] - b[1]; }); }
export const localDay = iso => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return String(iso).substring(0, 10); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const nz = s => String(s || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
/** 키워드 검색 — 띄어쓴 단어가 모두 들어 있으면 맞음 (순서 · 대소문자 · 기호 무시). 'beauty miami' → BEAUTY EXCHANGE, MIAMI */
export const hasWords = (text, q) => { const w = String(q || '').split(/\s+/).map(nz).filter(Boolean); if (!w.length) return true; const t = nz(text); return w.every(x => t.includes(x)); };
export const pad4 = v => { const s = String(v == null ? '' : v).trim(); return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s; };
export function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export const ym = d => String(d || '').substring(0, 7);
export const md = s => { s = String(s || ''); return s.length >= 10 ? s.substring(5, 7) + '/' + s.substring(8, 10) : s; };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function dlabel(s) { s = String(s || ''); if (s.length < 10) return s; const d = new Date(s + 'T12:00:00'); return Number(s.substring(5, 7)) + '월 ' + Number(s.substring(8, 10)) + '일 (' + WD[d.getDay()] + ')'; }
export function addDays(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().substring(0, 10); }
export function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
export function pct(a, b) {
  if (!b) return a ? '<span class="up">신규</span>' : '<span class="muted">—</span>';
  const p = (a / b - 1) * 100;
  return '<span class="' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '▲' : '▼') + ' ' + Math.abs(p).toFixed(0) + '%</span>';
}

export function toast(m, kind) {
  const t = $('toast'); if (!t) return;
  t.textContent = m; t.className = 'on' + (kind ? ' ' + kind : '');
  clearTimeout(t._t); t._t = setTimeout(() => { t.className = ''; }, 2400);
}
/* 잠깐 막기(돌아가는 동그라미) — 8초 넘게 안 풀리면 "화면 풀기" 버튼이 나와 화면이 영영 멈추지 않게 */
let busyT = 0;
/* 📸 화면 스냅숏 — 무거운 첫 화면(경영 대시보드 등)을 지난번 모습으로 바로 보여 주고, 새 자료가 오면 바꿈 */
/** 🗂 아이콘 탭 — 묶음 메뉴 타일처럼 아이콘 위 · 이름 아래 (v0.8.136). items: [key, icon, 한글, 영어, badgeId?] 또는 [key, '🔎 검색', 'Search'] 처럼 아이콘이 이름 앞에 붙은 것도 됨
 *   attr: data-속성 이름 (기존 화면의 data-stm · data-ct 그대로) · cls: 'stick' 이면 화면 위에 고정 */
export function itabs(items, cur, attr, cls) {
  const one = it => { let [k, ic, ko, en, badge] = it; if (ko == null || /^[^A-Za-z0-9가-힣]+$/.test(String(ic).trim()) === false) { const s = String(ic || '').trim(), i = s.indexOf(' '); if (i > 0 && /^[^A-Za-z0-9가-힣]+$/.test(s.substring(0, i))) { badge = en; en = ko; ko = s.substring(i + 1); ic = s.substring(0, i); } else { badge = en; en = ko; ko = s; ic = '•'; } }
    return '<button class="' + (k === cur ? 'on' : '') + '" data-' + attr + '="' + esc(k) + '" title="' + esc(ko + (en ? ' · ' + en : '')) + '"><span class="ci">' + ic + '</span><span class="cl">' + ko + (en ? ' <span class="en">' + en + '</span>' : '') + '</span>' + (badge ? '<span class="badge" id="' + esc(badge) + '" style="display:none">0</span>' : '') + '</button>'; };
  return '<div class="itabs' + (cls ? ' ' + cls : '') + '">' + items.map(one).join('') + '</div>';
}
export function snapGet(key, maxAgeMs) { try { const j = JSON.parse(localStorage.getItem('theone.snap.' + key) || 'null'); if (j && j.html && (!maxAgeMs || Date.now() - j.at < maxAgeMs)) return j; } catch (e) {} return null; }
export function snapPut(key, html) { try { localStorage.setItem('theone.snap.' + key, JSON.stringify({ html, at: Date.now() })); } catch (e) {} }
export function busy(on) {
  const b = $('busy'); if (!b) return;
  b.classList.toggle('on', !!on); clearTimeout(busyT);
  const x = b.querySelector('.bfree'); if (x) x.remove();
  if (on) busyT = setTimeout(() => { if (!b.classList.contains('on') || b.querySelector('.bfree')) return; const k = document.createElement('button'); k.className = 'bfree'; k.textContent = '오래 걸립니다 — ✕ 화면 풀기'; k.onclick = () => busy(false); b.appendChild(k); }, 8000);
}
/* 창(모달)은 ✕ 나 닫기 버튼으로만 닫힘 — 바깥을 눌러도 안 닫힘. 코너의 ✕ 는 어느 창에나 자동으로 붙음.
 *  📱 안드로이드 뒤로가기(브라우저 back)로는 창만 닫히고 화면은 그대로 — 창을 열 때 히스토리에 빈 칸을 하나 넣고, 뒤로가기(popstate)가 그 칸을 빼면 창을 닫음 */
/* 📱 뒤로가기 (안드로이드 버튼 · 아이폰 밀기) — 앱 안의 화면 이동은 기록을 쌓지 않고(location.replace) 지금 칸만 바꿈.
 *   대신 "뒤로 갈 곳"이 있으면(창 · 겹침 질문 · 숫자 패드 · 인쇄 화면 · 한 단계 위 화면) 빈 칸(guard)을 하나 올려 둠 →
 *   뒤로가기는 그 빈 칸을 빼면서 popstate → 겹침 질문 → 패드 → 창 → 인쇄 → 한 단계 위 순으로 하나만 처리. 홈(위가 없음)에서는 빈 칸이 없어 앱이 닫힘(폰 기본) */
const BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';   // Node(시험)에서 불러도 멈추지 않게
let GUARD = false, LAST_HASH = BROWSER ? location.hash : '';
export function openModal(html, opts) {
  const m = $('modal'), box = $('mbox');
  box.className = 'box' + (opts && opts.wide ? ' wide' : ''); box.innerHTML = html; m.classList.add('on');
  box.scrollTop = 0;
  if (opts && opts.onClose) m._onClose = opts.onClose; else m._onClose = null;
  if (!m.querySelector('.mclose')) { const x = document.createElement('button'); x.className = 'mclose'; x.type = 'button'; x.setAttribute('aria-label', 'close'); x.innerHTML = '✕'; x.onclick = () => closeModal(); m.appendChild(x); }
  guardSync();
}
export function closeModal() { const m = $('modal'); m.classList.remove('on'); if (m._onClose) { const f = m._onClose; m._onClose = null; f(); } }
export const modalOpen = () => { const m = $('modal'); return !!(m && m.classList.contains('on')); };
export function goHash(h) { h = String(h || ''); if (h.charAt(0) !== '#') h = '#' + h; if (h === location.hash) return; try { location.replace(location.href.split('#')[0] + h); } catch (e) { location.hash = h; } }   // 주소 전체로 (<base> 가 있어도 같은 페이지)
const needGuard = () => modalOpen() || !!document.querySelector('.ovr') || !!document.querySelector('.npad') || !!(document.getElementById('prt') && document.getElementById('prt').classList.contains('on')) || !!document.getElementById('viewer') || !!(Router.hasUp && Router.hasUp());
export function guardSync() { if (GUARD || !needGuard()) return; try { history.pushState({ g: 1 }, ''); GUARD = true; } catch (e) {} }
if (BROWSER) window.addEventListener('popstate', () => {
  if (location.hash !== LAST_HASH) { LAST_HASH = location.hash; GUARD = false; setTimeout(guardSync, 0); return; }   // 다른 칸으로 간 진짜 이동 (예: 옛 기록)
  GUARD = false;
  const ov = document.querySelector('.ovr');
  if (ov) { const no = ov.querySelector('#cfNo'); if (no) no.click(); else ov.remove(); }
  else if (document.querySelector('.npad')) numPadClose();
  else if (document.getElementById('viewer')) document.getElementById('viewer').remove();
  else if (modalOpen()) closeModal();
  else if (document.getElementById('prt') && document.getElementById('prt').classList.contains('on')) printClose();
  else if (Router.hasUp && Router.hasUp()) Router.back();
  setTimeout(guardSync, 30);
});
/* 화면(해시)이 바뀌면 — 열려 있던 창 · 겹침 질문 · 숫자 패드 · 바쁨 표시를 정리해 화면이 굳지 않게, 그리고 뒤로 갈 곳이 있으면 빈 칸 */
if (BROWSER) window.addEventListener('hashchange', () => { LAST_HASH = location.hash; if (modalOpen()) closeModal(); document.querySelectorAll('.ovr').forEach(o => o.remove()); numPadClose(); busy(false); setTimeout(guardSync, 60); });
/* 화면 안의 #/ 링크도 기록을 쌓지 않게 */
if (BROWSER) document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="#/"]'); if (!a || e.defaultPrevented || a.target) return; e.preventDefault(); goHash(a.getAttribute('href')); });

/* ↔ 화면보다 넓은 표 — 표만 옆으로 밀어 볼 수 있게 감쌈 (페이지 전체가 넘치면 아래 메뉴 · 버튼이 화면 밖으로 감) */
let WRAP_T = null;
function wrapWide() { document.querySelectorAll('#page table, #mbox table').forEach(t => { const p = t.parentElement; if (!p || p.classList.contains('xwrap') || t.closest('#prtbody')) return; if (t.scrollWidth > p.clientWidth + 2) { const w = document.createElement('div'); w.className = 'xwrap'; p.insertBefore(w, t); w.appendChild(t); } }); }
try { new MutationObserver(() => { clearTimeout(WRAP_T); WRAP_T = setTimeout(wrapWide, 80); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

/* ⌨ 폰 키보드가 올라오면 — 아래 메뉴 · 아래 고정 칸(합계 · 저장)을 잠시 숨겨 화면을 넓히고, 입력 칸이 키보드에 가리지 않게 가운데로 */
const typing = t => t && ((t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|date|color|range)$/.test(t.type)) || t.tagName === 'TEXTAREA' || t.isContentEditable);
let KB_T = null;
if (BROWSER) document.addEventListener('focusin', e => { if (!typing(e.target) || !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return; clearTimeout(KB_T); document.body.classList.add('kb'); const t = e.target; if (t.closest('header, nav, .ehead, .npad, .sticky')) return; setTimeout(() => { try { if (document.activeElement !== t) return; const r = t.getBoundingClientRect(), vh = window.visualViewport ? window.visualViewport.height : innerHeight, top = (document.querySelector('.ehead') || document.querySelector('header') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom; if (r.bottom > vh - 8 || r.top < top) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) {} }, 320); });   // 가려진 칸만 가운데로 (위에 고정된 검색 칸 · 창 안은 그대로)
if (BROWSER) document.addEventListener('focusout', e => { if (!typing(e.target)) return; clearTimeout(KB_T); KB_T = setTimeout(() => { if (!typing(document.activeElement)) { document.body.classList.remove('kb'); setTimeout(unstick, 350); } }, 120); });
/* 📱 키보드가 내려간 뒤 — 아이폰은 화면이 위로 밀린 채(아래가 비고, 아래 고정 바가 공중에 뜸) 다음 터치까지 그대로 남는 때가 있음
 *   → 스크롤을 범위 안으로 되돌리고, 아래 메뉴 높이(--navh)를 다시 재게 resize 를 한 번 울림 */
let KB_OPEN = false;
export function unstick() {
  try {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight), y = window.scrollY;
    window.scrollTo(0, y > max ? max : y);
    window.dispatchEvent(new Event('resize'));
  } catch (e) {}
}
if (BROWSER && window.visualViewport) window.visualViewport.addEventListener('resize', () => {
  const vv = window.visualViewport; document.documentElement.style.setProperty('--vvh', Math.round(vv.height) + 'px');
  const open = vv.height < window.innerHeight * 0.8;   // 키보드(또는 큰 겹침)가 올라와 보이는 높이가 줄었음
  if (KB_OPEN && !open) setTimeout(unstick, 60);
  KB_OPEN = open;
});

/* ============================================================
 *  🔢 숫자 패드 — 폰 · 태블릿에서 수량 · 금액 칸을 누르면 키보드 대신 팝업 패드 (키보드가 화면 아래를 가리지 않게)
 *    type=number · inputmode numeric/decimal 칸에 자동. data-nopad 가 있으면 키보드. 사용자 메뉴에서 끌 수 있음 (theone.numpad = 0)
 * ============================================================ */
/* 기본은 폰 키보드 (v0.8.120 — 패드가 화면을 더 가려 불편) · 사용자 메뉴에서 켠 사람만 팝업 패드 */
export const numPadOn = () => { try { if (localStorage.getItem('theone.numpad') !== '1') return false; } catch (e) { return false; } return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; };
export function setNumPad(on) { try { localStorage.setItem('theone.numpad', on ? '1' : '0'); } catch (e) {} }
const padWants = t => t && t.tagName === 'INPUT' && !t.readOnly && !t.disabled && !t.dataset.nopad && (t.type === 'number' || /^(numeric|decimal)$/.test(t.getAttribute('inputmode') || '')) && !t.closest('.npad');
let PAD = null;
export function numPadClose() { if (PAD) { const p = PAD; PAD = null; if (p.inp && p.im != null) { if (p.im) p.inp.setAttribute('inputmode', p.im); else p.inp.removeAttribute('inputmode'); } p.el.remove(); } }
export function numPad(inp) {
  numPadClose();
  const dec = inp.getAttribute('inputmode') === 'decimal' || /\./.test(String(inp.step || '')) || inp.dataset.dec != null;
  const neg = inp.min === '' || Number(inp.min) < 0;
  const quick = !dec && (inp.dataset.quick ? inp.dataset.quick.split(',') : ['1', '2', '3', '6', '12', '24']);
  let v = String(inp.value || ''), fresh = true;
  const lab = (inp.closest('.fg') && inp.closest('.fg').querySelector('label')) ? inp.closest('.fg').querySelector('label').textContent.trim() : (inp.placeholder || inp.getAttribute('aria-label') || '');
  const el = document.createElement('div'); el.className = 'npad';
  el.innerHTML = '<div class="npbox"><div class="nphd"><span class="muted">' + esc(lab.slice(0, 40)) + '</span><button type="button" class="npx" data-np="x">✕</button></div><div class="npv" id="npV">' + esc(v || '0') + '</div>' +
    (quick ? '<div class="npq">' + quick.map(q => '<button type="button" data-npq="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' : '') +
    '<div class="npk">' + ['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(k => '<button type="button" data-np="' + k + '">' + k + '</button>').join('') +
    '<button type="button" data-np="' + (dec ? '.' : neg ? '-' : '00') + '">' + (dec ? '.' : neg ? '±' : '00') + '</button><button type="button" data-np="0">0</button><button type="button" data-np="bs">⌫</button></div>' +
    '<div class="npb"><button type="button" class="b-ghost" data-np="kb">⌨ ' + esc(bt('키보드', 'Keyboard')) + '</button><button type="button" class="b-ghost" data-np="c">C</button><button type="button" class="b-green" data-np="ok">OK</button></div></div>';
  document.body.appendChild(el); guardSync();
  PAD = { el, inp, im: inp.getAttribute('inputmode') };
  const show = () => { const d = el.querySelector('#npV'); if (d) d.textContent = v === '' ? '0' : v; };
  const commit = () => { const n = v === '' || v === '-' ? '' : String(Number(v)); const changed = n !== String(inp.value); inp.value = n; numPadClose(); if (changed) { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } };
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) { return; }
    if (b.dataset.npq != null) { v = b.dataset.npq; commit(); return; }
    const k = b.dataset.np;
    if (k === 'x') { numPadClose(); return; }
    if (k === 'kb') { numPadClose(); inp.dataset.nopad = '1'; inp.removeAttribute('inputmode'); if (PAD === null) setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 30); return; }
    if (k === 'ok') { commit(); return; }
    if (k === 'c') { v = ''; fresh = false; show(); return; }
    if (k === 'bs') { v = fresh ? '' : v.slice(0, -1); fresh = false; show(); return; }
    if (k === '-') { v = v.startsWith('-') ? v.slice(1) : '-' + v; fresh = false; show(); return; }
    if (k === '.') { if (fresh) { v = '0.'; fresh = false; } else if (!v.includes('.')) v = (v || '0') + '.'; show(); return; }
    if (fresh) { v = ''; fresh = false; }
    if (k === '00') { if (v && v !== '-') v += '00'; } else v += k;
    if (v.replace('-', '').length > 9) v = v.slice(0, 10);
    show();
  };
  el.onpointerdown = e => { if (e.target === el) e.preventDefault(); };
}
/* 폰에서 숫자 칸을 누르면 키보드 대신 패드 — 누르는 순간 inputmode=none 으로 키보드를 막고, 포커스가 오면 패드를 띄움 */
if (BROWSER) document.addEventListener('pointerdown', e => { const t = e.target; if (numPadOn() && padWants(t)) { if (!t.dataset.im0) t.dataset.im0 = t.getAttribute('inputmode') || '-'; t.setAttribute('inputmode', 'none'); } }, true);
if (BROWSER) document.addEventListener('focusin', e => { const t = e.target; if (!numPadOn() || !padWants(t)) return; if (t.getAttribute('inputmode') !== 'none') return; numPad(t); const im0 = t.dataset.im0; if (PAD) PAD.im = im0 === '-' ? '' : im0; });
if (BROWSER) document.addEventListener('focusout', e => { const t = e.target; if (t && t.dataset && t.dataset.im0 != null && PAD && PAD.inp !== t) { const im0 = t.dataset.im0; if (im0 === '-') t.removeAttribute('inputmode'); else t.setAttribute('inputmode', im0); } });
/* 열려 있는 창 위에 겹쳐 묻기 — 취소해도 아래 입력 창이 그대로 남음 (입력 중 경고용) */
export function askOver(msg, okLabel) {
  return new Promise(res => {
    const o = document.createElement('div'); o.className = 'ovr'; o.innerHTML = '<div class="obox"><h2>' + esc(msg) + '</h2><div class="btns"><button class="b-ghost" id="cfNo">취소</button><button class="b-red" id="cfOk">' + esc(okLabel || '확인') + '</button></div></div>';
    document.body.appendChild(o); guardSync();
    o.querySelector('#cfNo').onclick = () => { o.remove(); res(false); }; o.querySelector('#cfOk').onclick = () => { o.remove(); res(true); };
  });
}
export function confirmBox(msg, okLabel) {
  return new Promise(res => {
    openModal('<h2>' + esc(msg) + '</h2><div class="btns"><button class="b-ghost" id="cfNo">취소</button><button class="b-red" id="cfOk">' + esc(okLabel || '확인') + '</button></div>');
    $('cfNo').onclick = () => { closeModal(); res(false); };
    $('cfOk').onclick = () => { closeModal(); res(true); };
  });
}
/* 📅 달력 — 날짜를 누르면 바로 바뀜. 「하루」: 한 번 누르면 그 날로 · 「기간」: 시작 · 끝 두 번 누르면 바로 그 기간으로. quick: [[label, from, to], ...]
 *  pickDates({ from, to, quick }) → Promise<[from, to] | null> */
export function pickDates(o) {
  o = o || {};
  return new Promise(res => {
    const t = today(); let from = o.from || t, to = o.to || from, view = (o.to || t).substring(0, 7), stage = 0, mode = 'day';
    const WD = ['월', '화', '수', '목', '금', '토', '일'];
    const fin = r => { closeModal(); res(r); };
    const paint = () => {
      const y = Number(view.substring(0, 4)), m = Number(view.substring(5, 7)), first = new Date(y, m - 1, 1), nd = new Date(y, m, 0).getDate(), off = (first.getDay() + 6) % 7;
      let cells = ''; for (let i = 0; i < off; i++) cells += '<i></i>';
      for (let d = 1; d <= nd; d++) { const ds = view + '-' + String(d).padStart(2, '0'); const inR = ds >= from && ds <= to, edge = ds === from || ds === to; cells += '<b class="' + (inR ? 'in' : '') + (edge ? ' edge' : '') + (ds === t ? ' tdy' : '') + (ds > t ? ' fut' : '') + '" data-cd="' + ds + '">' + d + '</b>'; }
      const nextM = addDays(view + '-28', 7).substring(0, 7), prevM = addDays(view + '-01', -1).substring(0, 7);
      $('mbox').innerHTML = '<h2>📅 ' + bi('날짜 고르기', 'Pick a date') + '</h2>' +
        '<div class="seg"><button class="' + (mode === 'day' ? 'on' : '') + '" data-cmo="day">' + bi('하루', 'One day') + '</button><button class="' + (mode === 'range' ? 'on' : '') + '" data-cmo="range">' + bi('기간', 'Range') + '</button></div>' +
        (o.quick && o.quick.length ? '<div class="chips">' + o.quick.map((q, i) => '<button data-cq="' + i + '">' + q[0] + '</button>').join('') + '</div>' : '') +
        '<div class="cal"><div class="calhd"><button data-cm="' + prevM + '">‹</button><b class="calym">' + y + '-' + String(m).padStart(2, '0') + '</b><button data-cm="' + nextM + '">›</button></div><div class="calwd">' + WD.map(w => '<span>' + w + '</span>').join('') + '</div><div class="calgrid">' + cells + '</div></div>' +
        '<div class="sumbox" style="display:flex;justify-content:space-between;align-items:center"><span>' + md(from) + (from !== to ? ' ~ ' + md(to) : '') + '</span><span class="muted">' + (mode === 'day' ? bt('날짜를 누르면 바로 바뀝니다', 'Tap a day') : stage === 0 ? bt('시작 날짜를 누르세요', 'Tap the first day') : bt('끝 날짜를 누르세요', 'Tap the last day')) + '</span></div>' +
        (mode === 'range' ? '<div class="two"><input type="date" id="cdF" value="' + from + '"><input type="date" id="cdT" value="' + to + '"></div>' : '<input type="date" id="cdF" value="' + from + '">') +
        '<div class="btns"><button class="b-ghost" id="cdX">' + bt('취소', 'Cancel') + '</button>' + (mode === 'range' ? '<button class="b-blue" id="cdOk">' + bt('보기', 'Show') + '</button>' : '') + '</div>';
      document.querySelectorAll('[data-cmo]').forEach(b => b.onclick = () => { mode = b.dataset.cmo; stage = 0; paint(); });
      document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { view = b.dataset.cm; paint(); });
      document.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { const d = b.dataset.cd; if (mode === 'day') return fin([d, d]); if (stage === 0) { from = d; to = d; stage = 1; paint(); } else { if (d < from) { to = from; from = d; } else to = d; fin([from, to]); } });
      document.querySelectorAll('[data-cq]').forEach(b => b.onclick = () => { const q = o.quick[+b.dataset.cq]; fin([q[1], q[2]]); });
      $('cdF').onchange = () => { if (!$('cdF').value) return; if (mode === 'day') return fin([$('cdF').value, $('cdF').value]); from = $('cdF').value; if (to < from) to = from; view = from.substring(0, 7); paint(); };
      if ($('cdT')) $('cdT').onchange = () => { if ($('cdT').value) { to = $('cdT').value; if (to < from) from = to; paint(); } };
      $('cdX').onclick = () => fin(null);
      if ($('cdOk')) $('cdOk').onclick = () => fin([from, to]);
    };
    openModal(''); paint();
  });
}
export function inputDate(id, v, extra) { return '<input type="date" id="' + id + '" value="' + esc(v || today()) + '" ' + (extra || '') + '>'; }
export function sel(id, opts, v, extra) {
  return '<select id="' + id + '" ' + (extra || '') + '>' + opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(val) + '" ' + (val === v ? 'selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>';
}
export function printOpen(html) { $('prtbody').innerHTML = html; $('prt').classList.add('on'); window.scrollTo(0, 0); guardSync(); }
export function printClose() { $('prt').classList.remove('on'); }

/* 간단 라우터 — 해시 기반 (#/page/sub) */
export const Router = {
  routes: {}, cur: '', stack: [], home: '', gen: 0, done: 0, parent: {},
  on(name, fn) { this.routes[name] = fn; },
  go(name, arg) { goHash('#/' + name + (arg ? '/' + encodeURIComponent(arg) : '')); },
  /** 화면마다 "한 단계 위" 가 따로 있으면 — up[name](arg) 가 처리하고 true, upHas[name]() 는 위가 있는지 */
  up: {}, upHas: {},
  /** ‹ 뒤로 = 한 단계 위로 (바로 전에 본 화면이 아님) — 열린 창 → 닫기, 상세 → 그 목록, 목록 → 그 탭의 첫 화면, 탭 → 홈 */
  back() {
    const m = $('modal'); if (m && m.classList.contains('on')) { closeModal(); return; }
    const v = document.getElementById('viewer'); if (v) { v.remove(); return; }
    const p = $('prt'); if (p && p.classList.contains('on')) { printClose(); return; }
    const h = location.hash.replace(/^#\/?/, ''), [name, arg] = h.split('/');
    if (this.backTo && arg && this.backTo.name === name) { const b = this.backTo.hash; this.backTo = null; goHash(b); return; }   // 다른 화면(🧭 흐름 감독)에서 열었으면 그리로
    const up = this.up[name]; if (up && up(arg ? decodeURIComponent(arg) : '')) { this.refreshBack(); return; }
    if (name === 'hub') { if (this.home && name !== this.home) this.go(this.home); return; }   // 🗂 묶음 → 홈
    if (arg) this.go(name); else if (this.parent && this.parent[name] && location.hash !== '#/' + this.parent[name]) { const [r, a2] = this.parent[name].split('/'); this.go(r, a2); } else if (this.home && name !== this.home) this.go(this.home);
  },
  hasUp() { const h = location.hash.replace(/^#\/?/, ''), [name, arg] = h.split('/'); return !!arg || !!(this.home && name !== this.home) || !!(this.upHas[name] && this.upHas[name]()); },
  refreshBack() { const bk = $('hBack'); if (bk) bk.classList.toggle('show', this.hasUp()); },
  start() {
    const run = () => {
      const h = location.hash.replace(/^#\/?/, ''), [name, arg] = h.split('/');
      this.cur = name || '';
      if (this.backTo && this.backTo.name !== name && '#/' + h !== this.backTo.hash) this.backTo = null;
      if (this._back) this._back = false;
      else if (this.stack.length > 1 && this.stack[this.stack.length - 2] === h) this.stack.pop();   // 브라우저(안드로이드) 뒤로 — 우리 기록도 한 칸 뒤로
      else if (this.stack[this.stack.length - 1] !== h) { this.stack.push(h); if (this.stack.length > 60) this.stack.shift(); }
      /* 빠르게 여러 탭을 누르면 앞 화면이 늦게 끝나 지금 화면을 덮어쓸 수 있음 — 늦게 끝난 앞 화면이 있으면 지금 화면을 한 번 더 그림 */
      this.at = Date.now(); const g = ++this.gen, fn = this.routes[name] || this.routes['']; if (!fn) return;
      const redo = () => { if (g !== this.gen && this.done === this.gen && Date.now() - this.at < 5000) { const f2 = this.routes[this.cur] || this.routes['']; const a2 = location.hash.replace(/^#\/?/, '').split('/')[1]; this.done = 0; settle(this.gen, f2 && f2(a2 ? decodeURIComponent(a2) : '')); } };
      const settle = (gg, p) => { const end = () => { if (gg === this.gen) this.done = gg; else redo(); }; if (p && p.then) p.then(end, e => { busy(false); toast('화면을 열지 못했습니다: ' + (e && (e.code || e.message) || e), 'bad'); end(); }); else end(); };
      let p; try { p = fn(arg ? decodeURIComponent(arg) : ''); } catch (e) { busy(false); toast('화면을 열지 못했습니다: ' + (e.code || e.message), 'bad'); }
      settle(g, p);
      const par = this.parent && this.parent[name];   // 🗂 묶음 안의 화면이면 그 묶음 탭이 켜짐
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.go === h || (b.dataset.go === name && b.dataset.go.indexOf('/') < 0 && !document.querySelector('nav button[data-go="' + h + '"]')) || (!!par && b.dataset.go === par)));
      this.refreshBack();
      window.scrollTo(0, 0);
    };
    if (!this._bound) { this._bound = true; window.addEventListener('hashchange', run); }
    run();
  }
};

/* 리스트 묶기 */
export function groupBy(arr, keyFn) { const m = {}; arr.forEach(x => { const k = keyFn(x); (m[k] = m[k] || []).push(x); }); return m; }
export function sum(arr, f) { return R2(arr.reduce((a, x) => a + (f ? f(x) : x), 0)); }
export function sortBy(arr, f, desc) { return arr.slice().sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1); }); }
export function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments, s = this; t = setTimeout(() => fn.apply(s, a), ms || 200); }; }
