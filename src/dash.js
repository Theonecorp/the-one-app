/* ============================================================
 *  🏠 창고 · 주문 대시보드 (v0.8.205) — 담당자 홈(shome) 맨 위
 *    ① 핵심 숫자 4칸 (들어온 주문 · 출고 작업 중 · 포장 대기 · 출고 완료)  ② 빠른 작업  ③ 할 일 · 경고
 *    ④ 오늘 출고 진행 · 매출(인보이스 기준, #hSales 칸은 orders.js 가 채움)  ⑤ 최근 주문 · 최근 활동
 *  숫자는 모두 실제 자료(orders · backorders · stock · catalog · stockLog). 볼 권한이 없는 칸은 안 보임 (can())
 * ============================================================ */
import { $, esc, bt, money } from './ui.js';
import { icon } from './icons.js';

/** 처음 그릴 틀 — 숫자는 '…' 로 두고 fill() 이 채움. ctx.can = 권한 함수 */
export function frame(ctx) {
  const can = ctx.can, K = [];
  const kpi = (id, ic, cls, label) => '<button class="wd-kpi ' + cls + '" data-wk="' + id + '"><span class="ki">' + icon(ic, 22) + '</span><span class="kt"><span>' + label + '</span><b id="wk-' + id + '">…</b></span><span class="kd" id="wkd-' + id + '" style="display:none"></span></button>';
  K.push(kpi('in', 'cart', 'k-green', bt('들어온 주문', 'Orders in')));
  K.push(kpi('pick', 'package', 'k-blue', bt('출고 작업 중', 'Picking')));
  K.push(kpi('pack', 'packagePlus', 'k-amber', bt('포장 대기', 'Awaiting packing')));
  K.push(kpi('ship', 'truck', 'k-indigo', bt('출고 완료', 'Shipped')));
  const Q = quick(ctx);
  return '<div class="wd" id="wdash">' +
    '<div class="wd-kpis">' + K.join('') + '</div>' +
    '<div class="wd-g2">' +
      (Q.length ? '<section class="wd-card"><h3>' + icon('zap', 20) + bt('빠른 작업', 'Quick actions') + '</h3><div class="wd-qa">' + Q.map(q => '<button data-wq="' + esc(q[0]) + '">' + icon(q[1], 26) + '<b>' + q[2] + '</b>' + (q[3] ? '<small>' + q[3] + '</small>' : '') + '</button>').join('') + '</div></section>' : '') +
      '<section class="wd-card"><h3>' + icon('alert', 20).replace('class="ic"', 'class="ic" style="color:var(--red)"') + bt('할 일 · 경고', 'Pending · Alerts') + '</h3><div class="wd-al" id="wdAl"><div class="load" style="padding:8px 0">…</div></div></section>' +
    '</div>' +
    '<div class="wd-g2 even">' +
      (can('ship') || can('pick') || can('assign') ? '<section class="wd-card"><h3>' + icon('truck', 20) + bt('출고 진행', 'Shipping progress') + ' · <span id="wdShipP" style="font-weight:600;color:var(--muted)">' + esc(ctx.ptxt) + '</span><span class="live"><i></i>' + bt('실시간', 'live') + '</span></h3><div class="wd-ship" id="wdShip"><div class="load" style="padding:8px 0">…</div></div></section>' : '') +
      '<section class="wd-card wd-sales" id="wdSales"><h3>' + icon('chart', 20) + bt('매출 (인보이스 기준)', 'Sales (invoiced)') + '</h3><div class="load" style="padding:8px 0">…</div></section>' +
    '</div>' +
    '<div class="wd-g2">' +
      '<section class="wd-card"><h3>' + icon('cart', 20) + bt('최근 주문', 'Latest orders') + '<button class="lnk" data-wq="all">' + bt('전체 보기', 'View all') + '</button></h3><div id="wdOrd"><div class="load" style="padding:8px 0">…</div></div></section>' +
      '<section class="wd-card"><h3>' + icon('history', 20) + bt('최근 활동', 'Recent activity') + '</h3><ul class="wd-act" id="wdAct"><li><div>…</div></li></ul></section>' +
    '</div>' +
    '<div class="wd-more">' + bt('모든 화면', 'All screens') + '</div>' +
  '</div>';
}

/** 빠른 작업 — [키, 아이콘, 이름, 설명]. 권한 있는 것만 · 누르면 원래 있던 화면으로 */
function quick(ctx) {
  const can = ctx.can, Q = [];
  if (can('items')) Q.push(['recv', 'packagePlus', bt('입고', 'Receive'), bt('팩킹 리스트 · 박스', 'packing list')]);
  if (can('items')) Q.push(['inb', 'clipCheck', bt('입고 확인', 'Check inbound'), bt('입고 예정 · 대조', 'expected · verify')]);
  if (can('pick')) Q.push([can('assign') ? 'pick' : 'mine', 'cart', bt('픽킹', 'Pick orders'), bt('출고 작업', 'fulfillment')]);
  if (can('ship') || can('invoice')) Q.push(['done', 'package', bt('포장', 'Pack orders'), bt('인보이스 발행 · 포장 대기', 'invoiced · to pack')]);
  if (can('ship')) Q.push(['notesups', 'truck', bt('택배 보내기 · UPS', 'Ship UPS'), bt('박스 · 라벨', 'boxes · label')]);
  Q.push(['cat', 'search', bt('아이템 찾기', 'Find product'), bt('재고 · 위치 · 사진', 'stock · location · photo')]);
  if (!Q.some(q => q[0] === 'recv') && can('newOrder')) Q.unshift(['new', 'cart', bt('새 주문', 'New order'), bt('가게 고르고 담기', 'pick a store')]);
  return Q.slice(0, 6);
}

const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
const shortWho = w => { w = String(w || ''); return w.indexOf('@') > 0 ? w.split('@')[0] : w; };
function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime(); if (!(ms >= 0)) return '';
  const m = Math.round(ms / 60000); if (m < 1) return bt('방금', 'just now'); if (m < 60) return m + bt('분 전', ' min ago');
  const h = Math.round(m / 60); if (h < 24) return h + bt('시간 전', ' h ago'); return Math.round(h / 24) + bt('일 전', ' d ago');
}
/** 주문 상태 → [글, 색] */
export function stTag(o) {
  const M = { draft: [bt('작성 중', 'Draft'), 'x'], sent: [bt('신규', 'New'), 'b'], pick: [bt('출고 작업', 'Picking'), 'b'], ok: [bt('출고 작업', 'Picking'), 'b'], picked: [bt('검수 대기', 'Review'), 'a'], done: [bt('포장 대기', 'To pack'), 'a'], packed: [bt('픽업 대기', 'Pickup'), 'b'], dlv: [bt('딜리버리 대기', 'Delivery'), 'a'], shipped: [bt('출고 완료', 'Shipped'), 'g'], x: [bt('취소됨', 'Cancelled'), 'r'] };
  const t = M[o.st] || [esc(o.st || ''), 'x'];
  return '<span class="wd-st s-' + t[1] + '">' + t[0] + '</span>';
}

/** 숫자 채우기 — 주문 자료를 받은 뒤 (orders.js staffHome) */
export function fill(ctx) {
  if (!$('wdash')) return;
  const { live, ords, bo, from, to, days, olds } = ctx;
  const inR = (iso, f, t) => { if (!iso) return false; const d = ctx.localDay(iso); return d >= f && d <= t; };
  const pf = ctx.pf, pt = ctx.pt, cmp = days <= 7;   // 바로 앞 같은 길이 기간 — 주문은 from-7 일부터 읽어 왔으므로 7일 이하만 비교
  const sent = (f, t) => ords.filter(o => o.st !== 'draft' && o.st !== 'x' && inR(o.sentAt, f, t)), shipped = (f, t) => ords.filter(o => o.st === 'shipped' && inR(o.shipAt, f, t));
  const sIn = sent(from, to), shIn = shipped(from, to);
  const pk = live.filter(o => o.st === 'pick' || o.st === 'ok'), topack = live.filter(o => o.st === 'done'), packed = live.filter(o => o.st === 'packed');
  const put = (id, v, d) => { const b = $('wk-' + id); if (b) b.textContent = v; const e = $('wkd-' + id); if (e && d != null) { e.style.display = ''; e.className = 'kd' + (d < 0 ? ' dn' : ''); e.textContent = (d >= 0 ? '↑ +' : '↓ ') + d + '%'; } };
  put('in', sIn.length, cmp ? pct(sIn.length, sent(pf, pt).length) : null);
  put('pick', pk.length); put('pack', topack.length);
  put('ship', shIn.length, cmp ? pct(shIn.length, shipped(pf, pt).length) : null);

  /* ④ 출고 진행 — 이 기간에 나간 것 / (나간 것 + 포장 대기 + 픽업 대기) */
  const sb = $('wdShip');
  if (sb) {
    const total = shIn.length + topack.length + packed.length, p = total ? Math.round(shIn.length / total * 100) : 0, R = 52, C = 2 * Math.PI * R;
    sb.innerHTML = '<div class="wd-ring"><svg width="118" height="118" viewBox="0 0 118 118"><circle cx="59" cy="59" r="' + R + '" fill="none" stroke="#e8f5ec" stroke-width="11"/>' + (p ? '<circle cx="59" cy="59" r="' + R + '" fill="none" stroke="var(--green)" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + (C * p / 100).toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '') + '</svg><div><b>' + p + '%</b><small>' + bt('나감', 'shipped') + '</small></div></div>' +
      '<div class="wd-nums"><div><b>' + shIn.length + '</b><span>' + bt('출고 완료', 'Shipped') + '</span></div><div><b>' + (topack.length + packed.length) + '</b><span>' + bt('남은 출고', 'Still to ship') + '</span></div><div><b>' + total + '</b><span>' + bt('출고할 전체', 'Total to ship') + '</span></div></div>';
  }

  /* ③ 할 일 · 경고 — 빨강(문제) → 노랑(주의) → 파랑(진행) 순 */
  const A = [];
  if (olds.length) A.push(['old', 'r', 'clock', bt('하루 넘게 밀린 주문', 'Orders waiting 1+ day'), olds.length]);
  if (ctx.can('ship') && topack.length) A.push(['ups', 'b', 'printer', bt('라벨 기다리는 UPS 주문', 'UPS labels pending'), topack.length]);
  if (ctx.can('bo') && bo.length) A.push(['bo', 'a', 'hourglass', bt('백오더', 'Backorders'), bo.length]);
  const al = $('wdAl');
  const paintAl = () => {
    if (!al || !al.isConnected) return;
    const L = A.slice().sort((a, b) => 'rab'.indexOf(a[1]) - 'rab'.indexOf(b[1]));
    al.innerHTML = L.length ? L.map(a => '<button class="a-' + a[1] + '" data-wa="' + a[0] + '"' + (a[0] === 'old' ? ' id="hOldB"' : '') + '>' + icon(a[2], 18) + '<span>' + a[3] + (a[0] === 'old' && ctx.oldest ? '<small>' + bt('가장 오래된 것', 'oldest') + ' ' + esc(ctx.oldest.store) + ' · ' + esc(ctx.oldest.t) + '</small>' : '') + '</span><em>' + a[4] + '</em><span class="chev" style="flex:none">' + icon('chevRight', 16) + '</span></button>').join('')
      : '<button class="a-ok" disabled>' + icon('check', 18) + '<span>' + bt('밀린 일 없음 — 모두 정상', 'Nothing pending — all clear') + '</span></button>';
    al.querySelectorAll('[data-wa]').forEach(b => b.onclick = () => ctx.alert(b.dataset.wa));
  };
  paintAl();
  /* 재고 부족 · 바코드 없는 아이템 — 재고 · 아이템 권한이 있을 때만 (폰에 보관한 재고 · 카탈로그로, 서버는 바뀐 것만) */
  if (ctx.can('items') && ctx.lowStock) ctx.lowStock().then(r => { if (!r) return; if (r.low) A.push(['low', 'a', 'refresh', bt('재고 보충 필요', 'Restock needed'), r.low]); if (r.nobar) A.push(['nobar', 'a', 'barcode', bt('바코드 없는 아이템', 'Items without barcode'), r.nobar]); paintAl(); }).catch(() => {});
  if (ctx.displaysLate) ctx.displaysLate().then(n => { if (n) { A.push(['displays', 'r', 'image', bt('기한 지난 디스플레이', 'Late displays'), n]); paintAl(); } }).catch(() => {});

  /* ⑤ 최근 주문 */
  const seen = new Set(), all = live.concat(ords).filter(o => o.st !== 'draft' && o.sentAt && !seen.has(o.id) && seen.add(o.id));
  all.sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  const ob = $('wdOrd');
  if (ob) {
    const L = all.slice(0, 6);
    ob.innerHTML = L.length ? '<div class="dtw"><table class="wd-tbl"><thead><tr><th>' + bt('주문', 'Order') + '</th><th>' + bt('가게', 'Customer') + '</th><th class="r wd-hide-sm">' + bt('줄 수', 'Lines') + '</th><th>' + bt('상태', 'Status') + '</th><th class="r wd-hide-sm">' + bt('시각', 'Time') + '</th></tr></thead><tbody>' +
      L.map(o => '<tr class="tap" data-wo="' + esc(o.id) + '"><td><b>' + esc(o.no || o.id) + '</b></td><td>' + esc(o.store || o.acct || '') + '</td><td class="r wd-hide-sm">' + (o.n || (o.lines || []).length || '') + '</td><td>' + stTag(o) + '</td><td class="r wd-hide-sm">' + esc(String(o.sentAt).substring(5, 10).replace('-', '/') + ' ' + new Date(o.sentAt).toTimeString().substring(0, 5)) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="none">' + bt('이 기간에 들어온 주문이 없습니다', 'No orders in this period') + '</div>';
    ob.querySelectorAll('[data-wo]').forEach(r => r.onclick = () => ctx.openOrder(r.dataset.wo));
  }

  /* ⑤ 최근 활동 — 주문의 단계 기록(접수 · 작업 시작 · 작업 완료 · 인보이스 · 출고) + 입고 기록 */
  const ev = [];
  all.forEach(o => {
    const nm = '<b>' + esc(o.no || o.id) + '</b> · ' + esc(o.store || '');
    if (o.sentAt) ev.push([o.sentAt, bt('주문 들어옴', 'Order received') + ': ' + nm, o.sm]);
    if (o.pickAt) ev.push([o.pickAt, bt('출고 작업 시작', 'Picking started') + ': ' + nm, o.pickBy || o.picker]);
    if (o.pickDoneAt) ev.push([o.pickDoneAt, bt('픽킹 완료', 'Picking done') + ': ' + nm, o.pickDoneBy || o.pickedBy]);
    if (o.doneAt) ev.push([o.doneAt, bt('인보이스 발행', 'Invoiced') + ': ' + nm, o.doneBy]);
    if (o.shipAt) ev.push([o.shipAt, bt('출고 완료', 'Shipped') + ': ' + nm, o.shipBy]);
  });
  const paintAct = extra => {
    const ab = $('wdAct'); if (!ab || !ab.isConnected) return;
    const L = ev.concat(extra || []).filter(e => e[0]).sort((a, b) => String(b[0]).localeCompare(String(a[0]))).slice(0, 7);
    ab.innerHTML = L.length ? L.map(e => '<li><div>' + e[1] + (e[2] ? '<small>' + esc(shortWho(e[2])) + '</small>' : '') + '</div><time>' + ago(e[0]) + '</time></li>').join('') : '<li><div class="muted">' + bt('아직 활동이 없습니다', 'No activity yet') + '</div></li>';
  };
  paintAct();
  if (ctx.can('items') && ctx.recvLog) ctx.recvLog().then(R => paintAct((R || []).map(r => [r.at, bt('입고', 'Received') + ': <b>' + esc(r.code) + '</b> +' + (Number(r.delta) || 0), r.byName || r.by]))).catch(() => {});
}

/** 매출 칸 — 금액 · 바로 앞 기간 대비 · 날짜별 선 그래프 (series: [[날짜, 금액]]) */
export function sales(ctx, tot, prev, series, n) {
  const b = $('wdSales'); if (!b) return;
  const d = prev != null ? pct(tot, prev) : null;
  let spark = '';
  if (series && series.length > 1) {
    const W = 320, H = 84, mx = Math.max(1, ...series.map(x => x[1])), st = W / (series.length - 1);
    const pts = series.map((x, i) => [Math.round(i * st * 10) / 10, Math.round((H - 6 - (x[1] / mx) * (H - 14)) * 10) / 10]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    spark = '<svg class="wd-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(bt('날짜별 매출', 'Sales by day')) + '"><defs><linearGradient id="wdG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#16a34a" stop-opacity=".28"/><stop offset="1" stop-color="#16a34a" stop-opacity="0"/></linearGradient></defs><path d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#wdG)"/><path d="' + line + '" fill="none" stroke="#16a34a" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="#fff" stroke="#16a34a" stroke-width="1.6" vector-effect="non-scaling-stroke"><title>' + esc(series[i][0] + ' ' + money(series[i][1])) + '</title></circle>').join('') + '</svg>' +
      '<div class="muted" style="display:flex;justify-content:space-between;font-size:11px"><span>' + esc(series[0][0]) + '</span><span>' + esc(series[series.length - 1][0]) + '</span></div>';
  }
  b.innerHTML = '<h3>' + icon('chart', 20) + bt('매출 (인보이스 기준)', 'Sales (invoiced)') + '<span class="live">' + esc(ctx.ptxt) + '</span></h3><div class="wd-amt">' + money(tot) + '</div><div class="muted">' + bt('인보이스', 'Invoices') + ' ' + n + '</div>' +
    (d != null ? '<span class="wd-pill' + (d < 0 ? ' dn' : '') + '">' + (d >= 0 ? '↑ +' : '↓ ') + d + '% ' + bt('바로 앞 기간 대비', 'vs previous period') + '</span>' : '') + spark;
}
