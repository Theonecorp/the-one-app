/* ============================================================
 *  🎨 디자인 시스템 (v0.8.205) — style.js 뒤에 붙어 같은 이름의 규칙을 덮어씀
 *    색: 남색 서랍 · 흰 · 아주 옅은 회색 본문 · 초록(좋음 · 주요 버튼) · 파랑(진행 중) · 노랑(주의) · 빨강(문제)
 *    모서리 12px · 옅은 그림자 · 선 아이콘(icons.js) · 대시보드(dash.js)의 .wd-* 칸
 * ============================================================ */
export const THEME = `
:root{--navy:#0f1b2d;--navy2:#0a1422;--navy3:#16263d;--blue:#2563eb;--blue2:#dbeafe;--green:#16a34a;--green2:#dcfce7;--red:#dc2626;--red2:#fee2e2;--amber:#d97706;--amber2:#fef3c7;--indigo:#4f46e5;--indigo2:#e0e7ff;
  --bg:#f4f6fa;--card:#fff;--ink:#0f172a;--ink2:#334155;--muted:#64748b;--line:#e5e9f0;--r:12px;--sh:0 1px 2px rgba(15,23,42,.05),0 4px 14px -8px rgba(15,23,42,.12);--hdr:60px}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.ic{display:inline-block;vertical-align:middle;flex:none}
/* ---------- 머리띠: 흰 바탕 · 남색 글씨 ---------- */
header{background:#fff;color:var(--ink);border-bottom:1px solid var(--line);min-height:var(--hdr);padding:8px 16px;gap:12px;box-shadow:0 1px 0 rgba(15,23,42,.02)}
header h1,#hTitle{font-size:18px;font-weight:800;letter-spacing:-.2px;color:var(--ink)}header h1 .en{font-size:12px;color:var(--muted);font-weight:600;margin-left:6px}
header .hb{background:transparent;color:var(--ink2);border:0;border-radius:10px;padding:0;min-width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:700}
header .hb:hover{background:#f1f5f9;color:var(--ink)}#hBell.on{color:var(--amber)}
#hBack{display:none;padding:0;margin-right:-4px}#hBack.show{display:inline-flex}
header .hlang{padding:0 10px;border:1px solid var(--line)}
header .hsearch{border:1px solid var(--line);background:#f8fafc;color:var(--muted);font-weight:500}
header .hsearch .hsl,header .hsearch kbd{display:none}
header .hsearch kbd{font:600 11px/1 ui-monospace,Menlo,monospace;background:#fff;border:1px solid var(--line);border-radius:6px;padding:4px 6px;color:var(--muted)}
@media (min-width:900px){header .hsearch{justify-content:flex-start;padding:0 10px 0 12px;width:min(34vw,420px);gap:10px;margin-right:6px}header .hsearch .hsl{display:inline;flex:1;text-align:left;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}header .hsearch kbd{display:inline-block}}
.netpill{background:var(--green2);color:#166534}.netpill i{background:var(--green)}.netpill.wait:not(.off){background:var(--amber2);color:#92400e}.netpill.wait:not(.off) i{background:var(--amber)}
#hWho{color:var(--muted);font-weight:600;font-size:12.5px}
header nav button{color:var(--muted)}header nav button.on{background:#eef2ff;color:var(--navy)}header nav button .i .ic{width:18px;height:18px}
body.dock .hlogo{display:none}body.dock #hMenu{opacity:1}
/* ---------- 아래 메뉴 (폰) — 아이폰 앱처럼 ---------- */
nav{background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid var(--line)}
nav button{color:#94a3b8;padding:7px 1px 5px}nav button .i{height:24px;display:flex;align-items:center;justify-content:center;margin-bottom:1px}nav button.on{color:var(--green)}
/* ---------- 본문 · 카드 ---------- */
.wrap{padding:12px 12px 0}@media (min-width:640px){.wrap{padding:16px 16px 0}}
.card{border-radius:var(--r);box-shadow:0 0 0 1px var(--line),var(--sh)}
.card h2{font-size:15.5px;font-weight:700}
.b-blue,.b-green,.b-ghost,.b-red,.b-navy{border-radius:10px}.b-green{background:var(--green)}.b-ghost{background:#f1f5f9;color:var(--ink)}
input,select,textarea{border-radius:10px;border:1px solid #d7dde6}input:focus,select:focus,textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.12)}
.seg button.on,.chips button.on{background:var(--navy);border-color:var(--navy)}
th{color:var(--muted);font-weight:600}
/* 묶음 · 홈 타일 — 아이콘 동그라미 */
.htile .hi .ic{width:24px;height:24px}
/* ---------- ☰ 서랍 = 왼쪽 남색 메뉴 ---------- */
.dpanel{background:var(--navy)}
.dhead{background:var(--navy);border-bottom:1px solid rgba(255,255,255,.06);padding:16px 14px 14px}.dhead img{width:32px;height:32px;border-radius:8px}.dhead b{font-size:16.5px;font-weight:800;letter-spacing:.2px}.dhead b em{font-style:normal;color:#4ade80}
.dhead .hb,.dfoot .hb{background:rgba(255,255,255,.06);width:32px;height:32px;border-radius:8px;color:#cbd5e1}.dhead .hb:hover,.dfoot .hb:hover{background:rgba(255,255,255,.12);color:#fff}
#dRail{display:none}
.dbody{padding:8px 10px 14px}
.dsec{margin-top:6px}
.dsec>small{color:#7f93b2;font-size:10.5px;font-weight:700;letter-spacing:.9px;padding:12px 10px 6px}
.dsec>small .em{display:none}
.dgh{display:flex!important;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;border-radius:8px}.dgh:hover{color:#c7d2e6}
.dgc{display:inline-flex;transition:transform .15s}.dgrp.fold>.dgh .dgc{transform:rotate(-90deg)}
.dgrp.fold>button,.dgrp.fold>.dord{display:none}
.dsec button[data-dgo],.dsec button[data-dlf]{color:#dbe4f0;font-size:14.5px;font-weight:600;padding:9px 10px;border-radius:10px;gap:12px}
.dsec button[data-dgo] .i,.dsec button[data-dlf] .i{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;color:#9fb0c9;font-size:17px}
.dsec button[data-dgo]:hover,.dsec button[data-dlf]:hover{background:rgba(255,255,255,.06);color:#fff}.dsec button[data-dgo]:hover .i,.dsec button[data-dlf]:hover .i{color:#fff}
.dsec button[data-dgo].on,.dsec button[data-dlf].on{background:var(--green);color:#fff;box-shadow:0 6px 16px -8px rgba(22,163,74,.8)}.dsec button[data-dgo].on .i,.dsec button[data-dlf].on .i{color:#fff}.dsec button.on small{color:#dcfce7}
.dsec button[data-dgo] small,.dsec button[data-dlf] small{color:#7f93b2;font-weight:500}
.dord{margin:2px 0 4px 10px;padding-left:8px;border-left:1px solid rgba(255,255,255,.08)}.dord>small{padding:8px 6px 4px}
.dsec.dord>button{font-size:13.5px}.dsec.dord>button .t small{display:none}
.dfoot{background:var(--navy2);border-top:1px solid rgba(255,255,255,.06);margin:8px 10px 10px;border-radius:12px;padding:10px 12px}.dav{background:#e2e8f0;color:var(--navy);font-size:13.5px}
.dlang button.on,.dseg button.on{background:var(--green);border-color:var(--green)}
@media (min-width:1200px){
  #drawer.dock .dpanel{border-right:0}
  #drawer.dock #dRail{display:inline-flex}
  /* 아이콘만 보이게 접은 서랍 */
  body.dock.rail{--dock:72px}
  body.rail #drawer.dock .dhead b,body.rail #drawer.dock .t,body.rail #drawer.dock .dwho,body.rail #drawer.dock .dlang,body.rail #drawer.dock .dset,body.rail #drawer.dock .dgc,body.rail #drawer.dock #mOut,body.rail #drawer.dock .dord>small{display:none}
  body.rail #drawer.dock .dhead{flex-direction:column;padding:12px 8px;gap:8px}
  body.rail #drawer.dock .dsec>small.dgh{font-size:0;padding:6px 0;margin:6px 10px;border-top:1px solid rgba(255,255,255,.08);border-radius:0}
  body.rail #drawer.dock .dgrp.fold>button,body.rail #drawer.dock .dgrp.fold>.dord{display:flex}
  body.rail #drawer.dock .dgrp.fold>.dord{display:block}
  body.rail #drawer.dock .dsec button[data-dgo],body.rail #drawer.dock .dsec button[data-dlf]{justify-content:center;padding:10px 0}
  body.rail #drawer.dock .dord{margin:0;padding:0;border:0}
  body.rail #drawer.dock .dfoot{justify-content:center;margin:8px 6px;padding:8px 0}
  body.dock .wrap{max-width:1360px;padding:20px 24px 0}
}
/* 🗂 아래의 옛 홈 묶음 · 매출 상세 — 대시보드 카드와 같은 모양 */
.hgrp{border:0;border-radius:var(--r);box-shadow:0 0 0 1px var(--line),var(--sh);margin:0 0 12px}.hgrp.open{border:0;box-shadow:0 0 0 1px #bbf7d0,var(--sh)}
.hgrp .hgh{padding:14px 16px}.hgrp .hgi{width:40px;height:40px;border-radius:10px;background:var(--green2);color:var(--green);display:flex;align-items:center;justify-content:center;flex:none;font-size:20px}
.hgrp .hgt b{font-size:15.5px;font-weight:800}.hgrp .hgt small b{display:inline;font-size:12.5px}.hgrp .hga{display:inline-flex;color:#94a3b8}
.wd-det{margin:0 0 12px}.wd-det>summary{list-style:none;display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff;border-radius:var(--r);box-shadow:0 0 0 1px var(--line),var(--sh);padding:14px 16px;font-weight:700;font-size:14.5px;color:var(--ink2)}.wd-det>summary::-webkit-details-marker{display:none}.wd-det>summary .ic{color:var(--green)}.wd-det>summary .hga{margin-left:auto;display:inline-flex;color:#94a3b8;transition:transform .15s}.wd-det[open]>summary{border-radius:var(--r) var(--r) 0 0}.wd-det[open]>summary .hga{transform:rotate(180deg)}.wd-det>.card{border-radius:0 0 var(--r) var(--r);margin:0}
.wd-al button span small{display:block;font-size:12px;font-weight:500;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#hPrev,#hNext,#hCalT,#hCal{display:inline-flex;align-items:center;justify-content:center;gap:6px}
/* ---------- 🏠 대시보드 (dash.js) ---------- */
.wd{display:flex;flex-direction:column;gap:14px;margin-bottom:14px}
.wd-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}.wd-hd h1{font-size:22px;margin:0;letter-spacing:-.3px}.wd-hd .sub{color:var(--muted);font-size:13.5px;margin-top:2px}
.wd-hd .chips{margin:0}
.wd-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media (min-width:900px){.wd-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}}
.wd-kpi{position:relative;display:flex;align-items:flex-start;gap:12px;background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh);padding:14px;text-align:left;width:100%;overflow:hidden;font:inherit;color:inherit}
.wd-kpi::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--k,var(--green))}
.wd-kpi .ki{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--k2,var(--green2));color:var(--k,var(--green));flex:none}
.wd-kpi .kt{display:flex;flex-direction:column;min-width:0;flex:1}.wd-kpi .kt span{font-size:12.5px;color:var(--ink2);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wd-kpi .kt b{font-size:28px;line-height:1.15;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.5px}
.wd-kpi .kd{position:absolute;right:12px;bottom:12px;font-size:11.5px;font-weight:700;border-radius:99px;padding:2px 8px;background:var(--green2);color:#166534}.wd-kpi .kd.dn{background:var(--red2);color:#991b1b}
.wd-kpi.k-blue{--k:var(--blue);--k2:var(--blue2)}.wd-kpi.k-amber{--k:var(--amber);--k2:var(--amber2)}.wd-kpi.k-indigo{--k:var(--indigo);--k2:var(--indigo2)}
@media (max-width:520px){.wd-kpi{padding:12px 10px;gap:8px}.wd-kpi .ki{width:34px;height:34px;border-radius:10px}.wd-kpi .ki .ic{width:18px;height:18px}.wd-kpi .kt b{font-size:24px}.wd-kpi .kd{position:static;align-self:flex-start;margin-top:2px}.wd-kpi{flex-wrap:wrap}}
.wd-g2{display:grid;grid-template-columns:1fr;gap:14px}
@media (min-width:1000px){.wd-g2{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)}.wd-g2.even{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.wd-card{background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh);padding:16px;min-width:0}
.wd-card>h3{display:flex;align-items:center;gap:10px;font-size:16px;margin:0 0 12px;font-weight:800;letter-spacing:-.1px}.wd-card>h3 .ic{color:var(--green)}.wd-card>h3 a,.wd-card>h3 .lnk{margin-left:auto;font-size:13px;font-weight:600;color:var(--blue);background:none;border:0;padding:0;cursor:pointer}
.wd-card>h3 .live{margin-left:auto;font-size:12px;font-weight:500;color:var(--muted);display:flex;align-items:center;gap:6px}.wd-card>h3 .live i{width:7px;height:7px;border-radius:50%;background:var(--green)}
.wd-qa{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media (min-width:700px){.wd-qa{grid-template-columns:repeat(6,minmax(0,1fr))}}
.wd-qa button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:96px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 6px;font:inherit;color:var(--ink);box-shadow:0 1px 2px rgba(15,23,42,.04)}
.wd-qa button:hover{border-color:#bbf7d0;background:#f7fef9}.wd-qa button .ic{color:var(--green)}
.wd-qa b{font-size:13px;font-weight:700;line-height:1.2;text-align:center}.wd-qa small{font-size:11.5px;color:var(--muted);text-align:center;line-height:1.2}
.wd-al{display:flex;flex-direction:column;gap:8px}
.wd-al button{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;border-radius:10px;padding:10px 12px;font:inherit;color:var(--ink);background:#f8fafc}
.wd-al button .ic:first-child{flex:none}.wd-al button span{flex:1;min-width:0;font-size:14px;font-weight:600}.wd-al button em{font-style:normal;font-weight:800;font-size:12.5px;min-width:28px;text-align:center;border-radius:99px;padding:2px 8px;background:#fff}.wd-al button .chev{color:#94a3b8}
.wd-al .a-r{background:#fef2f2}.wd-al .a-r .ic:first-child,.wd-al .a-r em{color:var(--red)}.wd-al .a-r em{background:var(--red2)}
.wd-al .a-a{background:#fffbeb}.wd-al .a-a .ic:first-child,.wd-al .a-a em{color:var(--amber)}.wd-al .a-a em{background:var(--amber2)}
.wd-al .a-b{background:#eff6ff}.wd-al .a-b .ic:first-child,.wd-al .a-b em{color:var(--blue)}.wd-al .a-b em{background:var(--blue2)}
.wd-al .a-ok{background:#f0fdf4;color:#166534;cursor:default}.wd-al .a-ok .ic{color:var(--green)}
.wd-ship{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.wd-ring{position:relative;width:118px;height:118px;flex:none}.wd-ring svg{transform:rotate(-90deg)}.wd-ring div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.wd-ring b{font-size:24px;font-weight:800}.wd-ring small{font-size:11px;color:var(--muted)}
.wd-nums{display:flex;flex:1;min-width:220px}.wd-nums>div{flex:1;padding:0 14px;border-left:1px solid var(--line);display:flex;flex-direction:column}.wd-nums b{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}.wd-nums span{color:var(--muted);font-size:12.5px}
.wd-sales .wd-amt{font-size:30px;font-weight:800;letter-spacing:-.6px;font-variant-numeric:tabular-nums}
.wd-pill{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:700;border-radius:99px;padding:3px 10px;background:var(--green2);color:#166534;margin-top:6px}.wd-pill.dn{background:var(--red2);color:#991b1b}
.wd-spark{width:100%;height:84px;margin-top:8px;display:block}
.wd-tbl{width:100%;font-size:13.5px}.wd-tbl th{background:#f8fafc;font-size:12px;padding:8px 10px}.wd-tbl td{padding:9px 10px;border-bottom:1px solid #eef2f6;vertical-align:middle}.wd-tbl tr.tap:hover td{background:#f8fafc}
.wd-st{display:inline-block;font-size:11.5px;font-weight:700;border-radius:99px;padding:2px 9px;white-space:nowrap}.wd-st.s-b{background:var(--blue2);color:#1e40af}.wd-st.s-a{background:var(--amber2);color:#92400e}.wd-st.s-g{background:var(--green2);color:#166534}.wd-st.s-r{background:var(--red2);color:#991b1b}.wd-st.s-x{background:#f1f5f9;color:#475569}
.wd-act{list-style:none;margin:0;padding:0}.wd-act li{display:flex;gap:12px;align-items:flex-start;padding:8px 0;position:relative}.wd-act li::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--green);margin-top:6px;flex:none;box-shadow:0 0 0 3px var(--green2)}.wd-act li:not(:last-child)::after{content:'';position:absolute;left:3.5px;top:22px;bottom:-6px;width:1px;background:var(--line)}
.wd-act li div{flex:1;min-width:0;font-size:13.5px}.wd-act li small{display:block;color:var(--muted);font-size:12px}.wd-act li time{color:var(--muted);font-size:12px;white-space:nowrap}
.wd-more{font-size:13px;font-weight:700;color:var(--ink2);margin:6px 2px 8px;display:flex;align-items:center;gap:8px}.wd-more::after{content:'';flex:1;height:1px;background:var(--line)}
html:not(.L-ko) #drawer .dsec button .t small{display:none}
@media (min-width:561px){.wd-hd h1{display:none}}
@media (max-width:520px){.wd-kpi .kt span{white-space:normal;line-height:1.2}}
@media (max-width:640px){.wd-hide-sm{display:none}.wd-card{padding:14px 12px}.wd-nums>div{padding:0 10px}.wd-nums b{font-size:19px}}
`;
