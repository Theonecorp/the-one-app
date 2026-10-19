/* ============================================================
 *  화면 도우미 — 돈 · 날짜 · 토스트 · 모달 · 간단 라우터
 * ============================================================ */
export const $ = id => document.getElementById(id);
/* 한글 · 영문 병기 — bi: 화면(HTML) 용, bt: 글자만 (placeholder · toast · confirm) */
export const bi = (ko, en) => ko + ' <span class="en">' + en + '</span>';
export const bt = (ko, en) => ko + ' / ' + en;
export const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
export const money = n => { n = Number(n) || 0; return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export const k = n => { n = Number(n) || 0; const a = Math.abs(n), s = n < 0 ? '−' : ''; if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'K'; return s + '$' + Math.round(a); };
export const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
export const R2 = x => Math.round((Number(x) || 0) * 100) / 100;
/** ISO 시각 → 그 폰의 날짜 (YYYY-MM-DD) */
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
/* 📅 달력 기간 선택 — 날짜 하나를 누르면 시작, 또 하나 누르면 끝 (같은 날 두 번 = 하루). quick: [[label, from, to], ...]
 *  pickDates({ from, to, quick }) → Promise<[from, to] | null> */
export function pickDates(o) {
  o = o || {};
  return new Promise(res => {
    const t = today(); let from = o.from || t, to = o.to || from, view = (o.to || t).substring(0, 7), stage = 0;
    const WD = ['월', '화', '수', '목', '금', '토', '일'];
    const paint = () => {
      const y = Number(view.substring(0, 4)), m = Number(view.substring(5, 7)), first = new Date(y, m - 1, 1), nd = new Date(y, m, 0).getDate(), off = (first.getDay() + 6) % 7;
      let cells = ''; for (let i = 0; i < off; i++) cells += '<i></i>';
      for (let d = 1; d <= nd; d++) { const ds = view + '-' + String(d).padStart(2, '0'); const inR = ds >= from && ds <= to, edge = ds === from || ds === to; cells += '<b class="' + (inR ? 'in' : '') + (edge ? ' edge' : '') + (ds === t ? ' tdy' : '') + (ds > t ? ' fut' : '') + '" data-cd="' + ds + '">' + d + '</b>'; }
      const nextM = addDays(view + '-28', 7).substring(0, 7), prevM = addDays(view + '-01', -1).substring(0, 7);
      $('mbox').innerHTML = '<h2>📅 기간 고르기 <span class="en">Pick dates</span></h2>' +
        (o.quick && o.quick.length ? '<div class="chips">' + o.quick.map((q, i) => '<button data-cq="' + i + '">' + q[0] + '</button>').join('') + '</div>' : '') +
        '<div class="cal"><div class="calhd"><button data-cm="' + prevM + '">‹</button><b>' + y + '년 ' + m + '월</b><button data-cm="' + nextM + '">›</button></div><div class="calwd">' + WD.map(w => '<span>' + w + '</span>').join('') + '</div><div class="calgrid">' + cells + '</div></div>' +
        '<div class="sumbox" style="display:flex;justify-content:space-between;align-items:center"><span>' + md(from) + ' ~ ' + md(to) + ' <span class="muted">(' + (daysBetween(from, to) + 1) + '일)</span></span><span class="muted">' + (stage === 0 ? '시작 날짜를 누르세요' : '끝 날짜를 누르세요') + '</span></div>' +
        '<div class="two"><input type="date" id="cdF" value="' + from + '"><input type="date" id="cdT" value="' + to + '"></div>' +
        '<div class="btns"><button class="b-ghost" id="cdX">취소</button><button class="b-blue" id="cdOk">보기</button></div>';
      document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { view = b.dataset.cm; paint(); });
      document.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { const d = b.dataset.cd; if (stage === 0) { from = d; to = d; stage = 1; } else { if (d < from) { to = from; from = d; } else to = d; stage = 0; } paint(); });
      document.querySelectorAll('[data-cq]').forEach(b => b.onclick = () => { const q = o.quick[+b.dataset.cq]; from = q[1]; to = q[2]; view = to.substring(0, 7); stage = 0; paint(); });
      $('cdF').onchange = () => { if ($('cdF').value) { from = $('cdF').value; if (to < from) to = from; view = from.substring(0, 7); paint(); } };
      $('cdT').onchange = () => { if ($('cdT').value) { to = $('cdT').value; if (to < from) from = to; paint(); } };
      $('cdX').onclick = () => { closeModal(); res(null); };
      $('cdOk').onclick = () => { closeModal(); res([from, to]); };
    };
    openModal(''); paint();
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
  routes: {}, cur: '', stack: [], home: '',
  on(name, fn) { this.routes[name] = fn; },
  go(name, arg) { location.hash = '#/' + name + (arg ? '/' + encodeURIComponent(arg) : ''); },
  /** ‹ 뒤로 — 열린 창이 있으면 닫고, 앱 안에서 온 길이 있으면 브라우저 뒤로, 없으면 그 탭의 첫 화면 → 홈 */
  back() {
    const m = $('modal'); if (m && m.classList.contains('on')) { closeModal(); return; }
    const v = document.getElementById('viewer'); if (v) { v.remove(); return; }
    const p = $('prt'); if (p && p.classList.contains('on')) { printClose(); return; }
    const h = location.hash.replace(/^#\/?/, ''), [name, arg] = h.split('/');
    /* 우리 기록(stack)대로 바로 전 화면으로 — 브라우저 history 에 기대지 않음 (iOS PWA · 역할 바꿈 · 새로고침 뒤에도 같게) */
    if (this.stack.length > 1) {
      this.stack.pop();
      const prev = this.stack[this.stack.length - 1];
      if (prev && prev !== h) { this._back = true; location.replace(location.href.split('#')[0] + '#/' + prev); return; }   // 같은 문서 안에서 해시만 바꿈 (기록은 안 늘어남)
    }
    if (!arg && this.home && name === this.home) return;   // 홈에서는 더 갈 곳이 없음
    if (arg) this.go(name); else if (this.home && name !== this.home) this.go(this.home);
  },
  start() {
    const run = () => {
      const h = location.hash.replace(/^#\/?/, ''), [name, arg] = h.split('/');
      this.cur = name || '';
      if (this._back) this._back = false;
      else if (this.stack.length > 1 && this.stack[this.stack.length - 2] === h) this.stack.pop();   // 브라우저(안드로이드) 뒤로 — 우리 기록도 한 칸 뒤로
      else if (this.stack[this.stack.length - 1] !== h) { this.stack.push(h); if (this.stack.length > 60) this.stack.shift(); }
      const fn = this.routes[name] || this.routes['']; if (fn) fn(arg ? decodeURIComponent(arg) : '');
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
      const bk = $('hBack'); if (bk) bk.classList.toggle('show', !!arg || this.stack.length > 1 || !!(this.home && name !== this.home));
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
