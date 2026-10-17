export const CSS = `
:root{--navy:#0f172a;--blue:#1d4ed8;--blue2:#dbeafe;--green:#15803d;--red:#b91c1c;--amber:#b45309;--bg:#eef2f7;--card:#fff;--ink:#0f172a;--ink2:#334155;--muted:#64748b;--line:#e3e8ef;--r:18px;--sh:0 1px 3px rgba(15,23,42,.06),0 6px 18px -12px rgba(15,23,42,.18);--hdr:56px}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.45;padding-bottom:calc(var(--navh,78px) + 12px);-webkit-tap-highlight-color:transparent}
button{transition:transform .08s,filter .08s}button:active{transform:scale(.95);filter:brightness(.88)}.pr.tap:active,.htile:active,.gcard:active,.cats button:active,.pick:active{transform:scale(.985);filter:brightness(.94)}.b-blue:active,.b-green:active{box-shadow:inset 0 0 0 99px rgba(0,0,0,.12)}
header{position:sticky;top:0;z-index:40;background:var(--navy);color:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px}
header h1{font-size:15px;margin:0;font-weight:700}header .hlogo{width:26px;height:26px;border-radius:50%}
header .hr{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12px;color:#94a3b8}
header .hb{background:rgba(255,255,255,.12);color:#fff;border:0;font-size:17px;padding:5px 11px;border-radius:9px}
#hBack{display:none;font-size:22px;line-height:1;padding:2px 12px 5px;margin-right:2px}#hBack.show{display:inline-block}
.wrap{max-width:880px;margin:0 auto;padding:12px 12px 0}
.card{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:14px;margin-bottom:12px}
.card h2{font-size:15px;margin:0 0 10px;color:var(--ink);font-weight:800;letter-spacing:-.1px}
.hero{font-size:32px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.heroSub{font-size:13px;color:var(--ink2);margin-top:2px}
.muted{color:var(--muted);font-size:12.5px;line-height:1.6}
.up{color:var(--green);font-weight:700}.down{color:var(--red);font-weight:700}
.warn{color:var(--red);font-weight:800}.ok{color:var(--green);font-weight:700}
.login{text-align:center;padding:40px 16px}.login .logo{font-size:40px;margin-bottom:6px}.login .logo img{width:110px;height:110px}.login h1{font-size:22px;margin:0 0 4px}.login p{color:var(--muted);font-size:14px;margin:0 0 22px}
.load{text-align:center;padding:36px 0;color:var(--muted);font-size:14px}
.none{text-align:center;padding:22px 0;color:#94a3b8;font-size:14px}
button{font-family:inherit;cursor:pointer}
.b-blue,.b-green,.b-ghost,.b-red,.b-navy{border:0;border-radius:13px;padding:13px 14px;font-size:15px;font-weight:800;width:100%}
.b-blue{background:var(--blue);color:#fff}.b-green{background:var(--green);color:#fff}.b-red{background:var(--red);color:#fff}.b-navy{background:var(--navy);color:#fff}.b-ghost{background:#e2e8f0;color:var(--ink)}
.b-sm{width:auto;padding:7px 11px;font-size:12.5px;border-radius:8px}
.btns{display:flex;gap:8px;margin-top:12px}
.sticky{position:sticky;bottom:calc(var(--navh,72px) + env(safe-area-inset-bottom,0px));z-index:30;padding:10px 0 0;background:linear-gradient(to top,var(--bg) 70%,transparent)}
input,select,textarea{width:100%;font-size:16px;padding:12px 13px;border:1.5px solid var(--line);border-radius:12px;outline:none;font-family:inherit;background:#fff;color:var(--ink)}
input:focus,select:focus,textarea:focus{border-color:var(--blue)}
input.sm{padding:7px 9px;font-size:14px}
.fg{margin-bottom:10px}.fg label{display:block;font-size:11.5px;font-weight:700;color:#64748b;margin-bottom:4px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;color:var(--muted);font-weight:700}
tr:last-child td{border-bottom:none}
td.r,th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40vw}
.tap{cursor:pointer}
.tag{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;white-space:nowrap;vertical-align:middle}
.trow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}.trow:last-child{border-bottom:0}.trow .tb{flex:0 0 36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#fff;background:#64748b}.trow .tb.A{background:#1d4ed8}.trow .tb.P{background:#0f766e}.trow .tb.W{background:#7c3aed}.trow .tb.R,.trow .tb.CM{background:#b91c1c}.trow .tx{flex:1;min-width:0}.trow .tx b{display:block;font-size:14px}.trow .tx small{color:var(--muted);font-size:12px}.trow .ta{font-weight:900;font-variant-numeric:tabular-nums;font-size:16px;white-space:nowrap}.trow.sum{background:#f8fafc;border-radius:12px;padding:10px 12px;margin-top:6px;border:0}
.t-f{background:#e0f2fe;color:#075985}.t-c{background:#fef3c7;color:#92400e}.t-a{background:#ede9fe;color:#5b21b6}.t-k{background:#dcfce7;color:#14532d}.t-r{background:#fee2e2;color:#991b1b}.t-g{background:#f1f5f9;color:#64748b}.t-b{background:#dbeafe;color:#1e40af}
.seg{display:flex;gap:6px;overflow:auto;padding-bottom:4px;margin-bottom:10px}
.seg button{background:#fff;color:#475569;border:1.5px solid var(--line);font-size:13px;padding:8px 12px;border-radius:9px;white-space:nowrap;font-weight:700}
.seg button.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.seg.big{position:sticky;top:var(--hdr,56px);z-index:25;background:var(--bg);padding:6px 0;margin:0 0 8px}.seg.big button{flex:1;min-width:0;font-size:15px;padding:12px 4px;border-width:2px;border-radius:12px;overflow:hidden;text-overflow:ellipsis}@media (max-width:460px){.seg.big .en{display:none}.seg.big button{font-size:14.5px}}.seg.big .cnt{display:inline-block;min-width:22px;padding:0 6px;border-radius:99px;background:var(--green);color:#fff;font-size:12px;line-height:22px;text-align:center;margin-left:4px}.seg.big button.on .cnt{background:#fff;color:var(--navy)}
.chips{display:flex;gap:6px;overflow:auto;padding-bottom:4px;margin:8px 0 2px}
.chips button{background:#fff;color:#475569;border:1.5px solid var(--line);font-size:12.5px;padding:7px 11px;border-radius:99px;white-space:nowrap;font-weight:700}
.chips button.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.kpi div{background:#f8fafc;border-radius:9px;padding:8px 4px;text-align:center}.kpi b{display:block;font-size:14px;font-variant-numeric:tabular-nums}.kpi span{font-size:10.5px;color:var(--muted)}
.alert{border-radius:10px;padding:9px 12px;font-size:12.5px;margin-top:8px;line-height:1.5}
.a-red{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.a-amb{background:#fff7ed;color:#7c2d12;border:1px solid #fed7aa}.a-blu{background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe}.a-grn{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
.pr{display:flex;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid var(--line)}.pr.tap{border-radius:12px;padding:11px 8px;margin:0 -6px}.pr.tap:hover{background:#f8fafc}
.en{font-weight:500;opacity:.72;font-size:.88em;white-space:nowrap}nav button .en{display:block;font-size:9px;opacity:.75;font-weight:600;line-height:1.1}.htile .en{display:block;font-size:12px}h2 .en,.chips .en,.seg .en{font-size:.85em}
.kpi.strip div{cursor:pointer}.kpi.strip b{font-size:15px}
.iday{display:flex;justify-content:space-between;align-items:center;background:#f1f5f9;border-radius:8px;padding:6px 10px;margin:10px 0 2px;font-size:13px}.iday span{color:var(--muted);font-size:12px}
.pr .ct{flex:1;min-width:0}.pr .ct b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pr .ct small{color:var(--muted);font-size:11.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr .pa{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.pr .pa b{font-size:14.5px}.pr .pa small{display:block;font-size:10.5px;color:var(--muted)}
.pr .mk{flex:0 0 28px;height:28px;border-radius:8px;background:#e2e8f0;color:#94a3b8;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center}
.pr.sb{background:#fefce8}.pr.rc{background:#eff6ff}.pr.v{background:#f0fdf4}.pr.bad{background:#fef2f2}
.pr.v .mk{background:var(--green);color:#fff}.pr.rc .mk{background:#2563eb;color:#fff}.pr.sb .mk{background:#eab308;color:#fff}
.dayhd{font-size:12px;font-weight:800;color:var(--ink2);padding:8px 2px 6px;border-bottom:2px solid var(--line);display:flex;justify-content:space-between;margin-top:6px}
.bars{display:flex;align-items:flex-end;gap:3px;height:80px;margin-top:6px}
.bars .b{flex:1;min-width:3px;background:#cbd5e1;border-radius:3px 3px 0 0;position:relative}.bars .b.on{background:var(--blue)}
.bars .b:hover::after{content:attr(data-v);position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;font-size:11px;padding:3px 7px;border-radius:6px;white-space:nowrap;z-index:5}
.xlab{display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-top:4px}
nav{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#fff;border-top:1px solid var(--line);display:flex;padding:3px 0 env(safe-area-inset-bottom)}
nav button{flex:1;background:none;border:none;color:#94a3b8;font-size:11px;font-weight:700;padding:6px 2px;line-height:1.2}
nav button .i{display:block;font-size:20px;line-height:1.15}
nav button.on{color:var(--blue)}
#busy{position:fixed;inset:0;z-index:95;display:none;align-items:center;justify-content:center;background:rgba(241,245,249,.5)}#busy.on{display:flex}
.spin{width:34px;height:34px;border:4px solid #cbd5e1;border-top-color:var(--blue);border-radius:50%;animation:sp .8s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
#toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%) translateY(16px);opacity:0;background:var(--navy);color:#fff;padding:10px 16px;border-radius:10px;font-size:13.5px;transition:.2s;z-index:99;max-width:90vw;text-align:center;pointer-events:none}
#toast.on{opacity:1;transform:translateX(-50%) translateY(0)}#toast.bad{background:var(--red)}#toast.good{background:var(--green)}
#modal{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:90;display:none;align-items:flex-end;justify-content:center}
#modal.on{display:flex}
#modal .box{background:#fff;border-radius:16px 16px 0 0;padding:16px;width:100%;max-width:600px;max-height:90vh;overflow:auto}
#modal .box h2{font-size:16px;margin:0 0 8px}
.hits{border:1.5px solid var(--line);border-radius:10px;margin-top:4px;max-height:55vh;overflow:auto;background:#fff}
.hits div{padding:11px 12px;border-bottom:1px solid var(--line);font-size:15px;cursor:pointer}.hits div:last-child{border-bottom:0}.hits div small{display:block;color:var(--muted);font-size:11.5px}
.hits div.on{background:#eff6ff}
.payrow{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#f8fafc;border-radius:10px;padding:8px;margin-bottom:8px;position:relative}
.payrow.big{border-radius:14px;padding:10px;gap:8px;border:1.5px solid var(--line)}.payrow.big .seg button{flex:1;font-size:14px;padding:11px 6px}.payrow.big details{margin-top:2px}.payrow.big summary{cursor:pointer;font-size:12px}
.amt{display:flex;align-items:center;background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:0 10px}.amt span{font-size:20px;font-weight:800;color:var(--muted)}.amt input{border:0;padding:10px 6px;font-size:24px;font-weight:900;text-align:right;font-variant-numeric:tabular-nums;min-width:0}.amt input:focus{outline:none}.amt:focus-within{border-color:var(--blue)}.amt.sm{padding:0 8px}.amt.sm span{font-size:15px}.amt.sm input{font-size:17px;padding:8px 4px}
.steps{display:flex;gap:6px;margin:0 0 10px}.steps .st{flex:1;background:#fff;border-radius:12px;padding:8px 6px;text-align:center;border:1.5px solid var(--line);color:var(--muted)}.steps .st b{display:block;font-size:13px;color:var(--ink2)}.steps .st small{font-size:10.5px}.steps .n{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#e2e8f0;align-items:center;justify-content:center;font-size:12px;font-weight:800;margin-bottom:2px}.steps .st.done .n{background:var(--green);color:#fff}.steps .st.now{border-color:var(--blue);background:#eff6ff}.steps .st.now .n{background:var(--blue);color:#fff}
.pick.inv{padding:11px 12px;border-radius:12px;margin-bottom:8px}.pick.inv.late{border-color:#fecaca;background:#fff7f7}.pick.inv.on{background:#eff6ff;border-color:var(--blue)}.pick.inv .ck{width:24px;height:24px;flex:0 0 24px;border-radius:8px}.pick.inv .pm b{font-size:15px}
.payrow .full{grid-column:1/3}
.payrow .x{position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;background:#94a3b8;color:#fff;border:0;font-size:13px;line-height:1;padding:0}
.invrow{display:grid;grid-template-columns:1fr 130px 32px;gap:8px;align-items:center;margin-bottom:8px}
.invrow input{padding:9px 10px;font-size:15px}
.pick{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1.5px solid var(--line);border-radius:10px;margin-bottom:6px;cursor:pointer;font-size:13.5px}
.pick.on{border-color:var(--blue);background:#eff6ff}.pick .ck{width:20px;height:20px;border-radius:6px;border:2px solid #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;flex:0 0 20px}
.pick.on .ck{background:var(--blue);border-color:var(--blue)}.pick .pm{flex:1}.pick small{color:var(--muted);display:block;font-size:11px}
.ck-big{width:22px;height:22px}
.sumbox{background:#f8fafc;border-radius:10px;padding:10px 12px;font-size:13.5px;margin:8px 0}
.sumbox b{font-variant-numeric:tabular-nums}
.stage{display:inline-flex;gap:3px}.stage i{width:10px;height:10px;border-radius:3px;background:#e2e8f0;display:inline-block}.stage i.sb{background:#eab308}.stage i.rc{background:#2563eb}.stage i.v{background:#16a34a}
.irow{gap:10px;padding:11px 2px}.irow.v{background:#f0fdf4}.irow .ct b{font-size:15px}.irow .ct small.desc{font-size:13.5px;color:#1e293b;white-space:normal;line-height:1.3}
.ith{flex:0 0 64px;width:64px;height:64px;border-radius:8px;object-fit:cover;background:#f1f5f9}
.qty{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.qty button{width:34px;height:38px;border:0;border-radius:9px;background:#e2e8f0;font-size:18px;font-weight:800;color:var(--ink)}
.qty input{width:58px;padding:8px 4px;text-align:center;font-size:16px;font-weight:800}
.pin.chg{border-color:#f59e0b!important;background:#fffbeb!important}
table.pk td{vertical-align:top}table.pk tr.bo td{background:#fef2f2}
.pq{width:64px!important;padding:6px!important;text-align:center;font-weight:800}
.tsel{width:auto!important;padding:2px 4px!important;font-size:11.5px!important;display:inline-block}
.pin{width:84px!important;padding:3px 6px!important;font-size:13px!important;display:inline-block}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}@media (max-width:400px){.grid{grid-template-columns:1fr 1fr}}
.gcard{position:relative;background:#fff;border:2px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:transform .08s}
.gcard.on{border-color:var(--green);background:#f0fdf4}.gcard.pop{animation:pop .18s}@keyframes pop{50%{transform:scale(.95)}}
.gimg{aspect-ratio:1/1;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden}.gimg img{width:100%;height:100%;object-fit:cover}.gimg span{font-weight:800;color:#94a3b8;font-size:14px}
.gt{padding:7px 9px 9px}.gt b{display:block;font-size:14.5px}.gt small{display:block;font-size:13px;color:#334155;line-height:1.3;min-height:34px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.gt em{display:block;font-style:normal;font-size:11.5px;color:#5b21b6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gt span{font-weight:800;font-size:15px}
.gcard.kit{border-color:#c4b5fd}.mosaic{display:grid;width:100%;height:100%;gap:2px;background:#e9d5ff}.mosaic img{width:100%;height:100%;object-fit:cover}.mosaic.m1{grid-template-columns:1fr}.mosaic.m2{grid-template-columns:1fr 1fr}.mosaic.m3,.mosaic.m4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.mosaic.m3 img:first-child{grid-column:1/3}
.tbar{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--navy);color:#fff;border-radius:12px;padding:8px 14px}.sticky .btns button{padding:12px}.tbar .tl{min-width:0}.tbar .tl b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tbar .tl small{color:#cbd5e1;font-size:12px}.tbar .ta{font-size:24px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
.gq{position:absolute;top:6px;right:6px;min-width:30px;height:30px;border-radius:99px;background:var(--green);color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;padding:0 8px}.gq:empty{display:none}
.gm{position:absolute;top:6px;left:6px;width:30px;height:30px;border-radius:99px;border:0;background:rgba(15,23,42,.75);color:#fff;font-size:18px;font-weight:800;line-height:1}
.gkit{position:absolute;top:6px;left:6px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin:8px 0}
.cats button{background:#f8fafc;border:1.5px solid var(--line);border-radius:12px;padding:14px 12px;text-align:left;min-height:64px}.cats b{display:block;font-size:15px}.cats span{font-size:12px;color:var(--muted)}
.chips.crumbs{position:sticky;top:calc(var(--hdr,56px) + 62px);z-index:24;background:var(--bg);margin:0 -4px;padding:8px 4px 6px}.chips.crumbs button{font-size:14px;padding:9px 14px}@media (min-width:900px){.chips.crumbs{top:62px}}.cats button.pop{background:#fff7ed;border-color:#fdba74}.cats button.pop.on{background:#fb923c;color:#fff}.cats button.pop.on span{color:#fff7ed}
.kitg{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin:10px 0;max-height:55vh;overflow:auto}.kitg b{display:block;font-size:12px;margin-top:3px}.kitg small{display:block;font-size:10.5px;color:var(--muted)}
#viewer{position:fixed;inset:0;z-index:150;background:#0b1220;color:#fff;display:flex;flex-direction:column}
#viewer .vtop{display:flex;gap:8px;align-items:center;padding:10px 12px;font-size:13px}#viewer .vtop span{flex:1;color:#94a3b8}#viewer .vtop button{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:9px;padding:8px 12px;font-weight:700}
#viewer .vimg{flex:1;display:flex;align-items:center;justify-content:center;position:relative;min-height:0}#viewer .vimg img{max-width:100%;max-height:100%;object-fit:contain}
#viewer .vnav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);color:#fff;border:0;width:46px;height:64px;border-radius:12px;font-size:30px;z-index:2}#viewer #vL{left:8px}#viewer #vR{right:8px}
#viewer .vinfo{padding:12px 16px 18px;background:#0f172a}#viewer .vinfo b{font-size:18px}#viewer .vprice{font-size:22px;font-weight:800;margin-top:4px}#viewer .vkit{color:#c4b5fd;font-weight:700;margin-top:4px}
.hgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.htile{background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:18px 12px;text-align:center;box-shadow:var(--sh);min-height:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.htile .hi{font-size:30px;line-height:1.1}.htile b{font-size:15px}.htile small{color:var(--muted);font-size:11.5px}
.htile.blue{background:var(--blue);border-color:var(--blue);color:#fff}.htile.blue small{color:#dbeafe}.htile.green{background:var(--green);border-color:var(--green);color:#fff}.htile.green small{color:#dcfce7}
.qbar{display:flex;gap:4px;align-items:center;background:var(--navy);border-radius:11px;padding:6px;margin-bottom:8px;overflow:auto}
.qbar span{flex:1;min-width:0;color:#cbd5e1;font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px}
.qbar button{flex:0 0 auto;min-width:46px;height:46px;border:0;border-radius:9px;background:rgba(255,255,255,.14);color:#fff;font-size:18px;font-weight:800}.qbar button:last-child{background:#b91c1c;min-width:40px;font-size:15px}.qbar button.on{background:#f59e0b;color:#1e1b4b;box-shadow:0 0 0 2px #fde68a inset}
.irow.foc{outline:2px solid var(--blue);outline-offset:-2px;border-radius:10px}
.hist{color:#1d4ed8!important;font-weight:700}
#hNet{width:9px;height:9px;border-radius:50%;background:#22c55e;display:inline-block;box-shadow:0 0 0 2px rgba(255,255,255,.15)}#hNet.off{background:#ef4444}
#prt{display:none;position:fixed;inset:0;z-index:200;background:#fff;overflow:auto}#prt.on{display:block}
#prtbar{position:sticky;top:0;background:var(--navy);color:#fff;padding:10px 14px;display:flex;gap:8px}
#prtbar button{background:rgba(255,255,255,.16);color:#fff;border:0;padding:9px 14px;border-radius:9px;font-size:14px;font-weight:700}
#prtbody{padding:22px;max-width:860px;margin:0 auto;color:#111;font-size:13px}
#prtbody h1{font-size:21px;margin:0 0 2px}#prtbody .meta{font-size:12.5px;color:#444;margin-bottom:16px}
#prtbody table{font-size:12px}#prtbody th,#prtbody td{border:1px solid #bbb;padding:5px 6px}#prtbody th{background:#eef2f7;font-size:11px}
#prtbody .fin td{background:#fef08a;font-weight:800;font-size:15px}
/* 인보이스 (SmartBee 양식) */
#prtbody .iv{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11.5px;page-break-after:always;min-height:9.6in;display:flex;flex-direction:column}
#prtbody .iv table{font-size:11px}#prtbody .iv th,#prtbody .iv td{border:1px solid #333;padding:3px 5px}#prtbody .iv th{background:#fff;font-weight:700;text-align:center;font-size:10.5px}
#prtbody .ivh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}#prtbody .ivh .ivlogo{width:62px;height:62px;margin-right:10px;float:left}
#prtbody .ivco{font-size:20px;font-weight:800;letter-spacing:.3px}#prtbody .ivad{font-size:11px;line-height:1.4;margin-top:2px}
#prtbody .ivt{font-size:20px;font-weight:800;margin-bottom:6px}#prtbody .ivbox{margin-left:auto;min-width:170px}#prtbody .ivbox td{text-align:center;font-weight:700}
#prtbody .ivparties{display:flex;gap:30px;margin:6px 0 10px}#prtbody .ivp{flex:1;font-size:11.5px;line-height:1.45}#prtbody .ivp b{display:block;font-size:10.5px;margin-bottom:2px}
#prtbody .ivinfo{width:100%;margin-bottom:8px}#prtbody .ivinfo td{text-align:center;font-weight:700}
#prtbody .ivlines{width:100%}#prtbody .ivlines td{vertical-align:top}#prtbody .ivlines th:nth-child(1),#prtbody .ivlines td:nth-child(1){width:84px}#prtbody .ivlines th:nth-child(2),#prtbody .ivlines td:nth-child(2){width:36px}
#prtbody .ivsub td{background:#d9d9d9;font-weight:700;font-size:10.5px;border-top:1px solid #333}
#prtbody .ivkit{font-size:9.5px;color:#444}
#prtbody .ivar{margin:14px auto 0;text-align:center;width:70%}#prtbody .ivart{font-weight:800;font-size:11.5px;margin-bottom:3px}#prtbody .ivar table{width:100%}#prtbody .ivar td{text-align:right;font-weight:700}
#prtbody .ivfoot{margin-top:auto;display:flex;gap:12px;border:1px solid #333;padding:8px;align-items:flex-start}
#prtbody .ivthx{flex:1 1 60%;min-width:0;font-size:11.5px;line-height:1.5;white-space:pre-line}#prtbody .ivpcs{color:#555;font-size:10px;margin-top:6px}
#prtbody .ivtot{flex:0 0 240px;border-left:1px solid #333;padding-left:8px}#prtbody .ivtot td{border:0;padding:1px 6px;font-size:11.5px;white-space:nowrap}#prtbody .ivtot td:first-child{text-align:right;color:#333;width:120px}#prtbody .ivT td{font-weight:800;font-size:13px}
#prtbody .ivpg{text-align:right;font-size:9.5px;color:#555;margin-top:6px}
@page{size:letter;margin:.45in}
#prtbody .sig{margin-top:26px;display:flex;gap:40px;font-size:12.5px}#prtbody .sig div{flex:1;border-top:1px solid #333;padding-top:5px}
@media print{html,body{background:#fff!important;padding:0!important}body>*{display:none!important}body>#prt{display:block!important;position:static!important}#prtbar{display:none!important}#prtbody{padding:0!important;max-width:none!important}}
/* ---------- 수금 허브 (collect.js) ---------- */
.ctabs{position:sticky;top:var(--hdr,56px);z-index:25;display:flex;gap:6px;background:var(--bg);padding:6px 0 8px;margin:0 0 6px}.ctabs button{flex:1;min-width:0;position:relative;border:2px solid var(--line);background:#fff;border-radius:12px;padding:11px 4px;font-size:14.5px;font-weight:800;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ctabs button .en{display:block;font-size:10.5px;font-weight:600;color:var(--muted)}.ctabs button.on{background:var(--navy);border-color:var(--navy);color:#fff}.ctabs button.on .en{color:#cbd5e1}
.badge{position:absolute;top:4px;right:4px;min-width:20px;height:20px;line-height:20px;padding:0 6px;border-radius:99px;background:var(--red);color:#fff;font-size:11.5px;font-weight:800;text-align:center}
@media (max-width:420px){.ctabs button{font-size:13.5px;padding:10px 2px}.ctabs button .en{display:none}}
.hint{font-size:12.5px;color:var(--muted);line-height:1.6;margin:6px 0 10px}.hint b{color:var(--navy)}
.code{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:7px;background:#e2e8f0;color:#334155;font-size:12px;font-weight:800;letter-spacing:.5px;vertical-align:middle}.newtag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:7px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:800;vertical-align:middle}
.info{background:linear-gradient(135deg,#0f2b46,#143a5c);color:#fff;border-radius:14px;padding:14px;margin-bottom:6px}.info .nm{font-size:19px;font-weight:800;margin-bottom:6px}.info .nm .code{background:rgba(255,255,255,.18);color:#fff}.info .kv{display:flex;gap:10px;font-size:13.5px;margin:3px 0}.info .kv b{flex:0 0 76px;color:#93c5fd;font-weight:700}.info .kv a{color:#fff;text-decoration:underline}
.info .hist{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.2);font-size:13px}.info .hist .h1{color:#5eead4;font-weight:800;font-size:12px;margin-bottom:4px}.info .hist .pr{border-color:rgba(255,255,255,.15);padding:6px 0;color:#fff}.info .hist .pr .ct small,.info .hist .pr .pa small{color:#cbd5e1}
.info .hist .r{display:flex;gap:8px;justify-content:space-between;padding:3px 0;color:#e2e8f0}.info .hist .r span:nth-child(2){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.info .hist .r span:last-child{font-weight:800;color:#fff}.histbtn{margin-top:6px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);color:#fff;border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:700}
.info .tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.info .tools button{flex:1;min-width:0;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:9px;padding:8px 6px;font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pdrow{display:flex;gap:6px;align-items:stretch}.pdrow input{flex:1;min-width:0}.pdclr{flex:0 0 auto;border:1.5px solid var(--line);background:#fff;border-radius:10px;padding:0 12px;font-size:13px;font-weight:700;color:var(--navy)}
input.past{border-color:var(--amber);background:#fffbeb}input.later{border-color:#7c3aed;background:#f5f3ff}
.xpay{border:1.5px solid var(--line);border-radius:14px;padding:12px;margin:10px 0}.xpay.first{border-color:#bfdbfe;background:#f8fbff}.xpay .xh{display:flex;justify-content:space-between;align-items:center;font-weight:800;margin-bottom:6px}.xpay .xh button{border:0;background:none;color:var(--red);font-weight:700;font-size:13px}
.seg.big2{display:flex;gap:6px}.seg.big2 button{flex:1;padding:12px 4px;font-size:15px;font-weight:800;border-width:2px;border-radius:12px}
.mobbtn,.rplbtn{display:block;width:100%;text-align:left;border:1.5px dashed var(--line);background:#fff;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700;color:var(--navy);margin:8px 0}.mobbtn.on{border-style:solid;border-color:var(--blue);background:#eff6ff;color:#1d4ed8}.rplbtn.on{border-style:solid;border-color:#f97316;background:#fff7ed;color:#9a3412}
.rplbox{border:1.5px solid #fdba74;background:#fff7ed;border-radius:10px;padding:10px;margin:0 0 8px}.rplbox label{font-size:13px}.origHint{font-size:12.5px;line-height:1.6;margin-top:6px;color:#9a3412}.origHint.ok{color:#166534}
.paytot{background:#ecfdf5;border:1.5px solid #a7f3d0;border-radius:10px;padding:10px 12px;font-weight:600;margin-bottom:12px}.paytot b{font-size:18px;color:#065f46}
.arpick{border:1.5px solid #bae6fd;background:#f0f9ff;border-radius:12px;padding:8px;margin-bottom:8px}.aph{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:700;color:#075985;padding:2px 4px 6px}.aph span:last-child{font-weight:500;color:var(--muted)}
.apr{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #e0f2fe;border-radius:10px;padding:9px 10px;margin-top:5px;cursor:pointer}.apr .cb{flex:0 0 26px;height:26px;border-radius:7px;border:2px solid #94a3b8;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff}.apr.on{border-color:var(--blue);background:#eff6ff}.apr.on .cb{background:var(--blue);border-color:var(--blue)}.apr .ai{flex:1;min-width:0}.apr .ai b{display:block;font-size:14.5px}.apr .ai small{display:block;color:var(--muted);font-size:11.5px}.apr .ab{text-align:right;font-weight:800;font-variant-numeric:tabular-nums}.apr .ab small{display:block;font-weight:500;color:var(--muted);font-size:10.5px}
.invl{border:1.5px solid var(--line);border-radius:12px;padding:8px;margin-bottom:6px;background:#fff}.invl.ar{border-color:#bfdbfe;background:#f8fbff}.invl.oth{border-color:#c4b5fd;background:#faf5ff}.invl.zero{opacity:.55}
.ivr{display:flex;gap:6px;align-items:center}.ivr .ity{flex:0 0 30px;height:30px;line-height:30px;text-align:center;border-radius:8px;font-weight:800;font-size:13px;background:#e2e8f0;color:#334155}.ity.A{background:#dbeafe;color:#1e40af}.ity.P{background:#dcfce7;color:#166534}.ity.W{background:#fef3c7;color:#92400e}.ity.CM,.ity.R{background:#fee2e2;color:#991b1b}.ity.X{background:#fecaca;color:#7f1d1d}
.ivr .ino{flex:1 1 40%;min-width:0;text-transform:uppercase;font-weight:700}.ivr .ino[readonly]{background:#f1f5f9;color:#334155}.ivr .isgn{flex:0 0 34px;height:44px;border:1.5px solid var(--line);border-radius:10px;background:#fff;font-size:18px;font-weight:800;color:#166534}.ivr .isgn.on{background:#fee2e2;border-color:#fca5a5;color:#991b1b}.ivr .iam{flex:1 1 32%;min-width:0;text-align:right;font-weight:800}.ivr .iam.neg{color:#991b1b;background:#fff1f2}.ivr .idel{flex:0 0 34px;height:44px;border:0;background:none;color:var(--muted);font-size:16px}
.ibal{font-size:12px;color:var(--muted);margin:5px 2px 0}.part{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:99px;background:#fef3c7;color:#92400e;font-weight:800;font-size:11px}
.ivs{margin-bottom:6px}.ivsr{display:flex;gap:6px;align-items:center}.istag{flex:0 0 30px;text-align:center;font-size:18px}.isr{flex:1;min-width:0}.isn{font-size:12.5px;color:#6b21a8;font-weight:700;margin:4px 2px}.isn.ok{color:#166534}.oap{margin-top:6px}
.invsum{border-radius:10px;padding:9px 12px;font-size:13px;font-weight:700;margin:6px 0 4px;line-height:1.5}.invsum.ok{background:#ecfdf5;color:#065f46}.invsum.over{background:#fffbeb;color:#92400e}.invsum.bad{background:#fef2f2;color:#991b1b}
.sumcard{background:linear-gradient(135deg,#065f46,#0f766e);color:#fff;border-radius:16px;padding:16px;margin-bottom:10px}.sumcard .lbl{font-size:13px;color:#a7f3d0;font-weight:700}.sumcard .big{font-size:34px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums}.sumcard .split{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;color:#d1fae5;margin-top:6px}.sumcard .split b{color:#fff}
.pendbar{background:#fffbeb;border:1.5px solid #fcd34d;color:#78350f;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.6;margin-bottom:10px}
.ent{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:12px 14px;margin-bottom:8px;border-left:5px solid var(--green)}.ent.bad{border-left-color:var(--red)}.ent.void{opacity:.5;border-left-color:#94a3b8;text-decoration:line-through}.ent .t{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.ent .store{font-weight:800;font-size:15.5px;min-width:0}.ent .amt{font-weight:800;font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap}.ent .meta{font-size:12.5px;color:#475569;line-height:1.7;margin-top:4px}.ent .invs{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.ent .invs span{background:#f1f5f9;border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:700}.ent .invs span.neg{background:#fee2e2;color:#991b1b}.ent .warn{color:var(--red);font-weight:700}
.ent .act{display:flex;gap:6px;margin-top:8px}.ent .act button{flex:1;border:1.5px solid var(--line);background:#fff;border-radius:9px;padding:8px;font-weight:700;color:var(--red)}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;background:#fef3c7;color:#92400e;font-size:11.5px;font-weight:800}.pill.sent{background:#dcfce7;color:#166534}
.latetag,.posttag,.rpltag,.mobtag{display:inline-block;padding:0 6px;border-radius:6px;font-size:11px;font-weight:800}.latetag{background:#fee2e2;color:#991b1b}.posttag{background:#ede9fe;color:#5b21b6}.rpltag{background:#fff7ed;color:#9a3412}.mobtag{background:#eff6ff;color:#1d4ed8}
.phgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-top:8px}.ph{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#f1f5f9}.ph img{width:100%;height:100%;object-fit:cover}.ph button{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;font-weight:800}
.hsum{background:#eff6ff;border-radius:12px;padding:10px 14px;font-weight:700;color:#1e3a8a;margin-bottom:10px}
.hent{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:11px 14px;margin-bottom:8px}.hent .t{display:flex;justify-content:space-between;gap:8px;font-weight:800;font-size:14.5px}.hent .amt{font-variant-numeric:tabular-nums;white-space:nowrap}.hent .meta{font-size:12.5px;color:#475569;line-height:1.8;margin-top:4px}.kv2{display:inline-block;margin-right:10px}.kv2 b{color:var(--navy)}
.heroSub{font-size:12.5px;color:var(--muted);margin-top:2px}.heroSub .warn{color:var(--amber);font-weight:700}
.arbk{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:10px}.arbk div{text-align:center;border-radius:9px;padding:7px 2px;background:#f1f5f9}.arbk b{display:block;font-size:14px;font-variant-numeric:tabular-nums}.arbk span{font-size:10px;color:var(--muted)}.arbk .k2{background:#fef3c7}.arbk .k3{background:#fed7aa}.arbk .k4{background:#fecaca}
.agebadge{flex:0 0 auto;padding:3px 8px;border-radius:99px;font-size:11px;font-weight:800;white-space:nowrap}.agebadge.a0{background:#dcfce7;color:#166534}.agebadge.a1{background:#e0f2fe;color:#075985}.agebadge.a2{background:#fef3c7;color:#92400e}.agebadge.a3{background:#fed7aa;color:#9a3412}.agebadge.a4{background:#fecaca;color:#991b1b}
/* ---------- ACH 허브 (ach.js) ---------- */
.ctabs.five button{padding:9px 2px;font-size:13.5px}.ctabs.five button .en{font-size:10px}@media (max-width:460px){.ctabs.five button{font-size:12.5px}}
.b-amb{border:0;border-radius:13px;padding:13px 14px;font-size:15px;font-weight:800;background:#fef3c7;color:#92400e}
.job{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:12px 14px;margin-bottom:8px;border-left:5px solid #cbd5e1}.job.set{border-left-color:var(--blue)}.job.soon{border-left-color:var(--amber)}.job.late{border-left-color:var(--red)}.job.hold{border-left-color:#94a3b8;opacity:.75}
.job .t{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.job .st{font-weight:800;font-size:15.5px;min-width:0}.job .am{font-weight:800;font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.job .m{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px;color:#475569;margin-top:3px}.job .m .open{color:var(--blue);font-weight:700;margin-left:auto}.job .tap{cursor:pointer}
.job .acts{display:flex;gap:6px;margin-top:8px}.job .acts button{flex:1;min-width:0;padding:10px 6px;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.job .acts .b-sm{padding:8px 6px;font-size:12.5px}
.dayhd{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:800;font-size:13.5px;color:var(--navy);margin:12px 0 6px;padding:0 2px}.dayhd.late{color:var(--red)}.dayhd button{border:0;background:var(--navy);color:#fff;border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:800;white-space:nowrap}
.fld{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}.fld .fk{flex:0 0 74px;color:var(--muted);font-size:12px;font-weight:700}.fld .fv{flex:1;min-width:0;font-weight:700;word-break:break-all}.fld .fv.big{font-size:19px;letter-spacing:.5px;font-variant-numeric:tabular-nums}.fld button{border:1.5px solid var(--line);background:#fff;border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:700;color:var(--navy)}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.stat{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:12px 14px;border-top:4px solid #cbd5e1}.stat .k{font-size:12px;color:var(--muted);font-weight:700}.stat .n{font-size:26px;font-weight:800;line-height:1.2}.stat .a{font-size:12.5px;color:#475569;font-variant-numeric:tabular-nums}.stat.red{border-top-color:var(--red)}.stat.amber{border-top-color:var(--amber)}.stat.blue{border-top-color:var(--blue)}.stat.green{border-top-color:var(--green)}
@media (min-width:700px){.stats{grid-template-columns:repeat(4,1fr)}}
.calhd{display:flex;gap:6px;align-items:center;margin-bottom:6px}.calhd button{border:1.5px solid var(--line);background:#fff;border-radius:9px;padding:8px 14px;font-size:16px;font-weight:800;color:var(--navy)}
.calg{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.calg .ch{text-align:center;font-size:11px;color:var(--muted);font-weight:700;padding:4px 0}.cd{min-height:58px;border:1px solid var(--line);border-radius:8px;padding:3px 4px;font-size:12px;background:#fff;cursor:pointer;position:relative}.cd.off{border:0;background:none;cursor:default}.cd.wk{background:#f8fafc}.cd.today{border-color:var(--blue);border-width:2px}.cd.on{background:#eff6ff}.cd b{display:block;font-size:12px}.cd small{display:block;font-size:10.5px;font-weight:800;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd .dots{display:flex;gap:2px;flex-wrap:wrap;margin-top:2px}.cd .dots i,.calleg i{display:inline-block;min-width:14px;height:14px;line-height:14px;border-radius:7px;font-size:9.5px;font-style:normal;font-weight:800;text-align:center;padding:0 3px;color:#fff}.c-done{background:var(--green)}.c-set{background:var(--blue)}.c-need{background:#94a3b8}.c-nsf{background:var(--red)}
.calleg{display:flex;gap:12px;justify-content:center;font-size:11.5px;color:var(--muted);margin-top:8px}.calleg span{display:flex;gap:4px;align-items:center}.calleg i{min-width:10px;height:10px;padding:0}
/* ---------- 루크 대시보드 · 정산 (boss.js) ---------- */
.rank{display:inline-block;min-width:20px;color:var(--muted);font-size:12px}.minibar{height:4px;border-radius:2px;background:#dbeafe;margin-top:4px}.minibar div{height:4px;border-radius:2px;background:#1d4ed8}
.payhd{display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;margin-top:6px}.payhd select,.payhd input{width:100%;min-width:0}@media (max-width:460px){.payhd{grid-template-columns:1fr 1fr}.payhd select{grid-column:1/-1}.payhd span{display:none}}
.payopt{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}.payopt label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#475569;flex:1;min-width:200px}.payopt label input{width:20px;height:20px}
.paybar{height:8px;border-radius:4px;background:#e2e8f0;overflow:hidden;display:flex;margin-top:8px}.paybar i{display:block;height:8px}
.histstrip{display:flex;gap:6px;overflow:auto;margin-top:8px;padding-bottom:2px}.histstrip div{flex:0 0 auto;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:9px;padding:5px 9px;font-size:11px;color:#6d28d9;cursor:pointer}.histstrip b{display:block;font-size:13px;color:#4c1d95}
.pr.pl{align-items:flex-start}.pr.pl .mk{margin-top:2px}.pr.pl.ok{background:#f0fdf4}.pr.pl.ok .mk{background:var(--green);color:#fff}.pr.pl.bad{background:#fef2f2}.pr.pl.bad .mk{background:var(--red);color:#fff}.pr .seq{flex:0 0 18px;font-size:11px;color:#94a3b8;text-align:right;padding-top:6px}
.rt{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.rtag{display:inline-block;font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:99px;background:#f1f5f9;color:#475569}.rtag.s-a{background:#dbeafe;color:#1e40af}.rtag.s-ex{background:#fef3c7;color:#92400e}.rtag.s-dc{background:#fee2e2;color:#991b1b}.rtag.s-w{background:#ede9fe;color:#5b21b6}.rtag.s-p{background:#dcfce7;color:#166534}
.pw{font-size:12px;color:#991b1b;margin-top:4px;line-height:1.5}
.whybox{background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:12.5px;color:#475569;line-height:1.6;margin-top:10px}.whybox.bad{background:#fef2f2;border-color:#fecaca;color:#991b1b}.whybox.blu{background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a}.whybox.vio{background:#f5f3ff;border-color:#ddd6fe;color:#4c1d95}
.fixbox{background:#fff;border:1px solid #fecaca;border-radius:9px;padding:9px 10px;margin-top:9px;color:#0f172a}.fixrows{display:flex;flex-direction:column;gap:4px;margin-top:6px}.fixrows label{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700}.fixrows label input{width:120px;margin-left:auto;padding:6px 8px;font-size:14px;text-align:right}.fixrows .ity{flex:0 0 26px;height:26px;line-height:26px;font-size:11px}
.paybtns{display:flex;gap:6px;margin:0 0 10px}.paybtns button{flex:1;min-width:0;padding:12px 6px;font-size:14px;white-space:nowrap}
.dedSub{font-size:12.5px;font-weight:800;color:var(--navy);margin:12px 0 6px;padding-top:8px;border-top:1px solid var(--line)}.dedCard{border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px}.dedTop{display:flex;gap:8px;align-items:flex-start}.dedNums{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:8px;font-size:12.5px;font-weight:700;text-align:center}.dedNums small{display:block;color:var(--muted);font-weight:500;font-size:10.5px}.dedWarn{background:#fffbeb;border-radius:8px;padding:6px 8px;font-size:12px;color:#92400e;margin-top:8px}.dedDet{font-size:12px;color:#475569;line-height:1.7;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.dedTotBar{display:flex;justify-content:space-between;background:#fef2f2;border-radius:9px;padding:8px 12px;font-weight:700;color:#991b1b;margin-top:6px}.dedCand{border:1px dashed #fca5a5;border-radius:10px;padding:10px;margin-bottom:8px}.dedInv{font-size:11.5px;margin-top:6px}.dedInv td{padding:3px 4px;border-bottom:1px solid #f1f5f9;color:#64748b}.dedInv tr.on td{color:#0f172a;font-weight:700}
.cashkeep{display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}.cashkeep input{width:20px;height:20px;flex:none}
.trend{display:flex;align-items:flex-end;gap:4px;height:92px;padding:4px 2px}.trend>div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;min-width:0}.trend i{display:flex;flex-direction:column;justify-content:flex-end;width:100%;max-width:26px;background:#bfdbfe;border-radius:3px 3px 0 0;overflow:hidden}.trend i b{display:block;background:#dc2626;width:100%}.trend span{font-size:9px;color:#94a3b8;white-space:nowrap}
.stack{display:flex;height:5px;border-radius:3px;overflow:hidden;margin-top:4px;background:#f1f5f9}.stack i{display:block;height:5px}.stack .s0{background:#86efac}.stack .s1{background:#7dd3fc}.stack .s2{background:#fde68a}.stack .s3{background:#fdba74}.stack .s4{background:#fca5a5}
.kpi .k2 b{color:#92400e}.kpi .k3 b{color:#9a3412}.kpi .k4 b{color:#991b1b}
#prtbody .pgbrk{page-break-after:always}#prtbody .fin td{font-weight:800;border-top:2px solid #333}#prtbody table.box{margin-bottom:12px}
@media (min-width:900px){
  body{padding-bottom:0;padding-left:210px}
  nav{top:0;bottom:0;right:auto;width:210px;flex-direction:column;border-top:none;border-right:1px solid var(--line);padding:70px 12px 12px;gap:4px}
  nav button{flex:none;text-align:left;display:flex;align-items:center;gap:10px;font-size:15px;padding:12px 12px;border-radius:12px;white-space:nowrap;color:var(--ink2)}
  nav button .i{display:inline;font-size:20px}nav button.on{background:var(--blue2);color:var(--blue)}nav button .en{display:inline;margin-left:6px;font-size:11px}
  header{padding-left:224px}
  .sticky{bottom:0}
  #modal{align-items:center}#modal .box{border-radius:16px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
}
/* ---- 화면 크기별: 폰(기본) · 태블릿(700+) · 컴퓨터(1200+) — 글씨 · 아이콘 · 칸 수가 따라 커짐 ---- */
@media (min-width:700px){
  body{font-size:16px}.wrap{padding:16px 20px 0}.card{padding:18px}.card h2{font-size:16px}
  header{padding:12px 20px}header h1{font-size:17px}header .hlogo{width:30px;height:30px}header .hr{font-size:13px}
  .hgrid{grid-template-columns:repeat(3,1fr);gap:14px}.htile{min-height:132px;padding:22px 14px}.htile .hi{font-size:38px}.htile b{font-size:17px}.htile small{font-size:12.5px}
  .grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.cats{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}.cats b{font-size:16px}
  .kpi b{font-size:16px}.kpi span{font-size:11.5px}.pr .ct b{font-size:15px}.pr .ct small{font-size:12.5px}.pr .pa b{font-size:15.5px}
  .qbar button{min-width:52px;height:50px;font-size:19px}.tbar .ta{font-size:28px}.b-blue,.b-green,.b-ghost,.b-red,.b-navy{font-size:16px;padding:14px 16px}
  .seg.big button{font-size:16px;padding:13px 10px}.chips button{font-size:13.5px;padding:8px 13px}.chips.crumbs button{font-size:15px;padding:10px 16px}
}
@media (min-width:1200px){
  .wrap{max-width:1120px}.hgrid{grid-template-columns:repeat(4,1fr)}.grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}.cats{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
  .two{gap:14px}.kpi{gap:10px}.htile{min-height:140px}
}
`;
