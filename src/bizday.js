/* ============================================================
 *  📅 영업일 (business day) — 앱의 "며칠 지남 · 몇 시간째" 는 모두 영업일 기준 (v0.8.180, 2026-11-10 관리자)
 *    · 주말(토 · 일) · 휴일은 세지 않음. 휴일 = 미국 연방 공휴일(은행 휴일, 주말이면 대체일) + 관리 → 설정의 추가 휴일(settings.app.holidays)
 *      − 설정의 "쉬지 않는 공휴일"(settings.app.workHolidays: 회사는 일하는 날 — 앱 계산에서만 영업일로 봄, ACH 인출일은 은행 기준 그대로)
 *    · 인보이스 결제 기한 · AR 연체(N30 등)는 계약 조건이라 달력 날짜 그대로 (여기서 바꾸지 않음)
 *    · apps-script/Code.gs 의 bizHolidays_ 와 같은 규칙
 * ============================================================ */
let S = null;
export function register(state) { S = state; HOL = null; }
const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function nthDow(y, m, dow, n) { const d = new Date(y, m, 1); let c = 0; while (true) { if (d.getDay() === dow && ++c === n) return d; d.setDate(d.getDate() + 1); } }
function lastDow(y, m, dow) { const d = new Date(y, m + 1, 0); while (d.getDay() !== dow) d.setDate(d.getDate() - 1); return d; }
function observed(y, m, day) { const d = new Date(y, m, day); if (d.getDay() === 6) d.setDate(d.getDate() - 1); else if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; }
/** 그해 미국 연방 공휴일 [날짜, 이름] — 새해 · MLK · 대통령의 날 · 메모리얼 · 준틴스 · 독립기념일 · 노동절 · 콜럼버스 · 재향군인 · 추수감사절 · 크리스마스 */
export function federal(Y) {
  return [[observed(Y, 0, 1), "New Year's Day"], [nthDow(Y, 0, 1, 3), 'MLK Day'], [nthDow(Y, 1, 1, 3), "Presidents' Day"], [lastDow(Y, 4, 1), 'Memorial Day'], [observed(Y, 5, 19), 'Juneteenth'], [observed(Y, 6, 4), 'Independence Day'],
    [nthDow(Y, 8, 1, 1), 'Labor Day'], [nthDow(Y, 9, 1, 2), 'Columbus Day'], [observed(Y, 10, 11), 'Veterans Day'], [nthDow(Y, 10, 4, 4), 'Thanksgiving'], [observed(Y, 11, 25), 'Christmas']].map(x => [fmt(x[0]), x[1]]);
}
const setOf = () => (S && S.settings) || {};
let HOL = null, HOLK = '';
/** 은행 휴일 (ACH 인출일) — 연방 공휴일 + 추가 휴일 */
export function bankHolidays() { return hol(false); }
/** 회사 휴일 (앱의 영업일 계산) — 은행 휴일 − 쉬지 않는 공휴일 */
export function holidays() { return hol(true); }
function hol(work) {
  const st = setOf(), y = new Date().getFullYear(), key = y + '|' + work + '|' + JSON.stringify(st.holidays || []) + JSON.stringify(st.workHolidays || []);
  if (HOL && HOLK === key) return HOL;
  const H = {}; [y - 1, y, y + 1].forEach(Y => federal(Y).forEach(x => { H[x[0]] = 1; }));
  (st.holidays || []).forEach(d => { H[d] = 1; });
  if (work) (st.workHolidays || []).forEach(d => { delete H[d]; });
  HOL = H; HOLK = key; return H;
}
const dkey = d => fmt(d);
/** 영업일인가 (YYYY-MM-DD) */
export function isBiz(s, H) { const d = new Date(String(s).substring(0, 10) + 'T12:00:00'), w = d.getDay(); return w !== 0 && w !== 6 && !(H || holidays())[String(s).substring(0, 10)]; }
const add1 = s => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + 1); return fmt(d); };
/** a 다음 날부터 b 까지의 영업일 수 (b 가 앞이면 음수) — "N일 지남" · "N일 전" */
export function bizDaysBetween(a, b) {
  a = String(a || '').substring(0, 10); b = String(b || '').substring(0, 10); if (a.length < 10 || b.length < 10) return 0;
  if (b < a) return -bizDaysBetween(b, a);
  const H = holidays(); let n = 0, d = a;
  for (let i = 0; i < 3700 && d < b; i++) { d = add1(d); if (isBiz(d, H)) n++; }
  return n;
}
/** 영업일 n 일 뒤 (n ≥ 0, 오늘이 쉬는 날이면 다음 영업일부터) */
export function addBizDays(s, n) { const H = holidays(); let d = String(s).substring(0, 10); while (!isBiz(d, H)) d = add1(d); for (let i = 0; i < n; i++) { d = add1(d); while (!isBiz(d, H)) d = add1(d); } return d; }
/** from(ISO 시각) 부터 to(기본 지금) 까지 흐른 시간 중 영업일에 든 것만 (ms) — 금요일 오후 4시 → 월요일 오전 10시 = 18시간 */
export function bizMs(from, to) {
  const t0 = new Date(from).getTime(), t1 = to == null ? Date.now() : new Date(to).getTime(); if (!isFinite(t0) || !isFinite(t1) || t1 <= t0) return 0;
  const H = holidays(); let ms = 0, cur = new Date(t0);
  for (let i = 0; i < 3700 && cur.getTime() < t1; i++) {
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1).getTime(), end = Math.min(next, t1);
    if (isBiz(dkey(cur), H)) ms += end - cur.getTime();
    cur = new Date(next);
  }
  return ms;
}
