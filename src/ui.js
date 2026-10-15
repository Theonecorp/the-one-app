/* ============================================================
 *  화면 도우미 — 돈 · 날짜 · 토스트 · 모달 · 간단 라우터
 * ============================================================ */
export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
export const money = n => { n = Number(n) || 0; return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export const k = n => { n = Number(n) || 0; const a = Math.abs(n), s = n < 0 ? '−' : ''; if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'K'; return s + '$' + Math.round(a); };
export const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
export const R2 = x => Math.round((Number(x) || 0) * 100) / 100;
export const nz = s => String(s || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
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
export function busy(on) { const b = $('busy'); if (b) b.classList.toggle('on', !!on); }
export function openModal(html, opts) {
  const m = $('modal'), box = $('mbox');
  box.innerHTML = html; m.classList.add('on');
  box.scrollTop = 0;
  if (opts && opts.onClose) m._onClose = opts.onClose; else m._onClose = null;
}
export function closeModal() { const m = $('modal'); m.classList.remove('on'); if (m._onClose) { const f = m._onClose; m._onClose = null; f(); } }
export function confirmBox(msg, okLabel) {
  return new Promise(res => {
    openModal('<h2>' + esc(msg) + '</h2><div class="btns"><button class="b-ghost" id="cfNo">취소</button><button class="b-red" id="cfOk">' + esc(okLabel || '확인') + '</button></div>');
    $('cfNo').onclick = () => { closeModal(); res(false); };
    $('cfOk').onclick = () => { closeModal(); res(true); };
  });
}
export function inputDate(id, v, extra) { return '<input type="date" id="' + id + '" value="' + esc(v || today()) + '" ' + (extra || '') + '>'; }
export function sel(id, opts, v, extra) {
  return '<select id="' + id + '" ' + (extra || '') + '>' + opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(val) + '" ' + (val === v ? 'selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>';
}
export function printOpen(html) { $('prtbody').innerHTML = html; $('prt').classList.add('on'); window.scrollTo(0, 0); }
export function printClose() { $('prt').classList.remove('on'); }

/* 간단 라우터 — 해시 기반 (#/page/sub) */
export const Router = {
  routes: {}, cur: '',
  on(name, fn) { this.routes[name] = fn; },
  go(name, arg) { location.hash = '#/' + name + (arg ? '/' + encodeURIComponent(arg) : ''); },
  start() {
    const run = () => {
      const h = location.hash.replace(/^#\/?/, ''), [name, arg] = h.split('/');
      this.cur = name || '';
      const fn = this.routes[name] || this.routes['']; if (fn) fn(arg ? decodeURIComponent(arg) : '');
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
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
