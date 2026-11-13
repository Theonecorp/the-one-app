/* ============================================================
 *  📦 Shipping History — 옛 THE ONE CORP WMS 의 Shipping History 화면을 그대로 (기능 · 탭 · 필터 · 문구)
 *    카드 6개(박스 수 · 누르면 필터) · 출고 × 반품 탭 · 기간 칩(전체 포함) · 검색 · 필터 5+1(운송사 포함) · 목록(페이지 · 개씩) · 오른쪽 상세(탭 5개)
 *    데이터: shipments(박스마다 한 문서)를 track.js 의 groupShipments 로 출고 단위로 묶음
 *      · shp: 'SHP-YYYY-NNNNNN' — 우리 출고 번호 (counters/shp.n 하나로 계속 늘어남 · 해는 출고일의 해). 없는 출고는 보이는 페이지에서 처음 볼 때 붙임 (있는 번호는 절대 바꾸지 않음)
 *      · carrier: 'UPS'(기본) | FEDEX | USPS | DHL | OUTRA · manual: true = 앱 밖에서 보낸 출고(옛 rpc_envio_manual) — 라벨 없음 · 배송 완료는 손으로
 *      · ret: true = UPS 반품 라벨(옛 ups-retorno) — retDe(원래 출고 key) · retDesc · retJob(shipq 문서: 라벨 · 취소)
 *      · billInv: { 인보이스#: { net, gross, adj, w } } + billNet/billGross/billAdj/billW — UPS 청구서 CSV 가져오기(옛 rpc_fatura_ups_importar)가 박스 문서에 합쳐 씀
 *    라벨은 shipq/{주문 id · adhoc id · retJob} 의 labels — 박스마다 다시 인쇄 · 기록은 첫 박스 문서의 log
 *    UPS 요청은 shipq 로 (UPS.gs 가 1분 안에 처리): void · trk · ret(반품 라벨) · mail(반품 라벨 메일)
 * ============================================================ */
import { $, esc, money, toast, confirmBox, today, addDays, Router } from './ui.js';
import { can, isTop, myJobs } from './main.js';
import { groupShipments } from './track.js';
import { searchAccounts } from './accounts.js';
import { ICO, svg, css, L3, num1, svcName, SVCS, imprimir, abrirEdicao } from './balcao.js';
import { abrirModal, fecharModal } from './etq.js';
import { devolver } from './notesups.js';

let S = null;
const H = { tipo: 'envios', per: '30', de: '', ate: '', q: '', st: '', cli: '', transp: '', serv: '', cod: '', sm: '', pag: 1, por: 10, sel: '', aba: 'geral', lista: null, chave: '', cap: false, filtrosAb: false, busy: {}, etq: {}, vendEd: '', shpBusy: false };
export const _H = H;   // 시험용
export function register(state) { S = state; Router.on('shiphist', page); }

const LIM = 5000;   // 옛 SH_LIMITE — 넘으면 "최근 5,000건만" 안내
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hoje = () => today();
const agora = () => new Date().toISOString();
const quem = () => String((S.user && S.user.email) || '').toLowerCase();
/** 옛 GERENTE || GERENTE1 → 관리자 · 오너 · 창고 매니저 (청구서 가져오기) */
const gerente = () => isTop() || (S.role === 'manager' && myJobs().includes('whmgr'));
/** 옛 podeMexerEstoque / !VENDEDOR — 출고 일을 하는 직원 (반품 · 출고 등록 · 영업 담당 변경 · 배송 완료) */
const podeAgir = () => isStaff() && can('ship');

/* ---------- 문구 (옛 앱 그대로 · KO / EN / PT) ---------- */
const TX = {
  sub: ['모든 운송사의 회사 출고를 추적하고 관리합니다', 'Track and manage every shipment of the company, from any carrier', 'Acompanhe e gerencie todos os envios da empresa, de qualquer transportadora'],
  rastrear: ['추적 업데이트', 'Update tracking', 'Atualizar rastreio'],
  imp_btn: ['UPS 청구서 가져오기', 'Import UPS invoices', 'Importar faturas UPS'],
  ret_criar: ['UPS 반품 만들기', 'Create UPS return', 'Criar retorno UPS'],
  registrar: ['출고 등록', 'Log shipment', 'Registrar envio'],
  envios: ['출고', 'Shipments', 'Envios'], retornos: ['반품', 'Returns', 'Retornos'],
  kpi_total: ['출고 박스', 'Boxes shipped', 'Caixas despachadas'], kpi_hoje: ['오늘 박스', 'Boxes today', 'Caixas hoje'], kpi_tr: ['운송 중 박스', 'Boxes in transit', 'Caixas em trânsito'],
  kpi_tr_sub: ['라벨 생성 포함', 'includes label created', 'inclui etiqueta emitida'], kpi_en: ['배송 완료 박스', 'Boxes delivered', 'Caixas entregues'], kpi_ex: ['예외 박스', 'Boxes with exception', 'Caixas com exceção'],
  kpi_custo: ['운송비', 'Shipping cost', 'Custo de frete'], no_per: ['기간 내', 'in the period', 'no período'], kpi_dica: ['클릭하면 목록을 필터링합니다', 'Click to filter the list', 'Clique para filtrar a lista'],
  hoje: ['오늘', 'Today', 'Hoje'], p7: ['7일', '7 days', '7 dias'], p30: ['30일', '30 days', '30 dias'], p90: ['90일', '90 days', '90 dias'], tudo: ['전체', 'All', 'Tudo'], pers: ['직접 지정', 'Custom', 'Personalizado'],
  periodo: ['기간', 'Period', 'Período'], busca_ph: ['출고번호, 운송장, 주문, 고객으로 검색…', 'Search by shipment, tracking, order or customer…', 'Buscar por shipment, tracking, pedido ou cliente…'],
  filtros: ['필터', 'Filters', 'Filtros'], cliente: ['고객 / 매장', 'Customer / Store', 'Cliente / Loja'], transp: ['운송사', 'Carrier', 'Transportadora'], servico: ['서비스', 'Service', 'Serviço'],
  status: ['상태', 'Status', 'Status'], todos: ['전체', 'All', 'Todos'], todas: ['전체', 'All', 'Todas'], todos_serv: ['모든 서비스', 'All services', 'Todos os serviços'], todos_st: ['모든 상태', 'All statuses', 'Todos os status'],
  cod_com: ['COD 만', 'Only COD', 'Só com COD'], cod_sem: ['COD 아님', 'No COD', 'Sem COD'], vend: ['영업 담당자', 'Sales rep', 'Vendedor'], limpar: ['필터 초기화', 'Clear filters', 'Limpar filtros'],
  cod_resumo: ['COD 출고 {n}건 · 배송 시 수금 {v}', '{n} COD shipments · {v} to collect on delivery', '{n} envios com COD · {v} a cobrar na entrega'], cod_obs: ['취소 및 void 건은 합계에 포함되지 않습니다.', 'Cancelled and voided shipments are not counted.', 'Cancelados e void não entram na soma.'],
  teto: ['기간 내 출고가 {n}건을 넘습니다 — 최근 {n}건만 표시합니다. 기간을 좁혀 나머지를 확인하세요.', 'The period has more than {n} shipments — showing the {n} most recent. Narrow the period to see the rest.', 'O período tem mais de {n} envios — a tela mostra os {n} mais recentes. Estreite o período para ver o resto.'],
  vazio: ['해당 기간에 출고가 없습니다', 'No shipments in this period', 'Nenhum envio no período'], ret_vazio: ['이 기간에 반품이 없습니다.', 'No returns in this period.', 'Nenhum retorno neste período.'],
  data: ['날짜', 'Date', 'Data'], col_ship: ['출고번호', 'Shipment', 'Shipment'], col_dest: ['목적지', 'Destination', 'Destino'], col_orig: ['보내는 곳', 'From', 'Sai de'], caixas: ['박스', 'Boxes', 'Caixas'],
  peso: ['중량', 'Weight', 'Peso'], frete: ['운임', 'Shipping', 'Frete'], tracking: ['운송장', 'Tracking', 'Tracking'], ver: ['보기', 'View', 'Ver'],
  mostrando: ['{n}건 중 {a}–{b} 표시', 'Showing {a}–{b} of {n} shipments', 'Mostrando {a}–{b} de {n} envios'], por_pag: ['페이지당 {n}', '{n} per page', '{n} por página'], mob_cx: ['{n}박스', '{n} box(es)', '{n} cx'],
  aba_geral: ['개요', 'Overview', 'Visão geral'], aba_track: ['추적', 'Tracking', 'Tracking'], aba_custos: ['비용', 'Costs', 'Custos'], aba_etq: ['라벨', 'Label', 'Etiqueta'], aba_hist: ['이력', 'History', 'Histórico'],
  fechar: ['닫기', 'Close', 'Fechar'], copiado: ['복사됨', 'Copied', 'Copiado'], rastrear_na: ['{t}에서 추적', 'Track on {t}', 'Rastrear na {t}'], teste: ['테스트', 'test', 'teste'],
  data_envio: ['출고일', 'Ship date', 'Data de envio'], entrega: ['배송', 'Delivery', 'Entrega'], entregue_em: ['배송 완료 시각', 'Delivered at', 'Entregue em'], previsao: ['예상 배송', 'Estimated delivery', 'Entrega prevista'],
  pedido: ['주문', 'Order', 'Pedido'], sem_pedido: ['주문 없음 (계정 출고)', 'No order (account shipment)', 'Sem pedido (envio pela conta)'], endereco: ['주소', 'Address', 'Endereço'], conta: ['매장 코드', 'Store code', 'Código da loja'],
  tel: ['전화', 'Phone', 'Telefone'], peso_cob: ['청구 중량', 'Billed weight', 'Peso cobrado'], peso_dim: ['부피 중량', 'Dimensional weight', 'Peso dimensional'], dim: ['치수 (in)', 'Dimensions (in)', 'Dimensões (in)'],
  resp: ['담당자', 'User', 'Responsável'], void_em: ['void {d}', 'voided {d}', 'void em {d}'], timeline: ['추적 타임라인', 'Tracking timeline', 'Linha do tempo'], resumo_custos: ['비용 요약', 'Cost summary', 'Resumo de custos'],
  rastreado_em: ['추적 업데이트 {d}', 'Tracking updated {d}', 'Rastreio atualizado em {d}'], nunca_rastr: ['운송사에 아직 조회하지 않음', 'Not yet checked with the carrier', 'Ainda não consultado na transportadora'], atualizar: ['새로고침', 'Refresh', 'Atualizar'],
  sem_eventos: ['추적 이벤트가 아직 없습니다', 'No tracking events yet', 'Nenhum evento de rastreio ainda'], mais_ev: ['이벤트 {n}개 더 보기', 'See {n} more event(s)', 'Ver mais {n} evento(s)'], origem_sis: ['시스템', 'system', 'sistema'],
  frete_cob: ['운송 요금', 'Shipping charge', 'Frete cobrado'], cotacao: ['UPS 견적 (공시)', 'UPS quote (published)', 'Cotação UPS (tabela)'], tarifa_neg: ['협상 요금', 'Negotiated rate', 'Tarifa negociada'], economia: ['절감액', 'Savings', 'Economia'], total: ['합계', 'Total', 'Total'],
  cod: ['배송 시 수금할 COD', 'COD to collect on delivery', 'COD a cobrar na entrega'], conta_emp: ['회사 {t} 계정에 청구', "Billed to the company's {t} account", 'Cobrado na conta {t} da empresa'], sem_custo: ['비용 미기록', 'Cost not recorded', 'Custo não informado'],
  faturado: ['UPS 청구서 금액', 'Billed by UPS (invoice)', 'Faturado pela UPS'], ajustes: ['청구 정정 (ADJ)', 'Billing adjustments (ADJ)', 'Correções de cobrança (ADJ)'], dif: ['견적과 차이', 'Difference vs quote', 'Diferença da cotação'], faturas: ['청구서', 'Invoice(s)', 'Fatura(s)'],
  etq_sem: ['시스템에 라벨이 저장되지 않음 — 외부에서 발행됨', 'Label not stored in the system — it was issued outside', 'Etiqueta não gravada no sistema — foi emitida fora dele'], etq_ver: ['라벨 보기', 'View label', 'Visualizar etiqueta'],
  reimp_todas: ['모두 재인쇄', 'Reprint all', 'Reimprimir todas'], reimp: ['재인쇄', 'Reprint', 'Reimprimir'], imprimindo: ['인쇄 중…', 'Printing…', 'Imprimindo…'], reimp_nota: ['재인쇄는 저장된 라벨을 사용합니다. 재발행·재청구되지 않으며 새 출고를 만들지 않습니다.', 'Reprint uses the stored label. It does not issue again, does not charge again and does not create another shipment.', 'Reimprimir usa a etiqueta gravada. Não emite de novo, não cobra de novo e não cria outro envio.'],
  etq_anulada: ['이 출고는 취소되었습니다. 라벨이 더 이상 유효하지 않아 인쇄할 수 없습니다.', 'This shipment was voided: the label is no longer valid and cannot be printed.', 'Este envio foi anulado: a etiqueta não vale mais e não pode ser impressa.'],
  caixa_n: ['박스 {n}', 'Box {n}', 'Caixa {n}'], etq_gravada: ['라벨 저장됨', 'label stored', 'etiqueta gravada'], etq_nao_gravada: ['저장된 라벨 없음', 'no stored label', 'sem etiqueta gravada'], sem_hist: ['기록 없음', 'No records', 'Sem registros'],
  ac_criado: ['출고 생성', 'Shipment created', 'Envio criado'], ac_reimp: ['라벨 재인쇄', 'Label reprinted', 'Etiqueta reimpressa'], ac_void: ['VOID — 운송사에서 라벨 무효화', 'VOID — label voided at the carrier', 'VOID — etiqueta anulada na transportadora'],
  ac_cancel: ['출고 취소', 'Shipment cancelled', 'Envio cancelado'], ac_edit: ['고쳐서 다시 만듦 (VOID)', 'Voided to edit and issue again', 'Anulada para editar e emitir de novo'], ac_status: ['상태: {de} → {para}', 'Status: {de} → {para}', 'Status: {de} → {para}'],
  ac_email: ['{para}(으)로 라벨 이메일 전송', 'Label emailed to {para}', 'Etiqueta enviada por e-mail para {para}'], ac_email_f: ['{para}(으)로 이메일 전송 실패', 'Email not sent to {para}', 'E-mail não enviado para {para}'],
  ac_vend: ['영업 담당자: {de} → {para}', 'Sales rep: {de} → {para}', 'Vendedor: {de} → {para}'], ac_fat: ['UPS 청구서 {f} · {v}', 'UPS invoice {f} · {v}', 'Fatura UPS {f} · {v}'], ac_shp: ['출고번호 {n} 부여', 'Shipment ID {n} assigned', 'Shipment ID {n} atribuído'],
  ir_etq: ['재인쇄', 'Reprint', 'Reimprimir'], editar: ['출고 수정', 'Edit shipment', 'Editar envio'], cancelar: ['출고 취소', 'Cancel shipment', 'Cancelar envio'], void_ups: ['UPS Void', 'Void at UPS', 'Void na UPS'],
  marcar_ent: ['배송 완료로 표시', 'Mark as delivered', 'Marcar como entregue'], ent_conf: ['{n}을(를) 배송 완료로 표시할까요? 운송사 사이트에서 확인한 후에만 사용하세요.', 'Mark {n} as delivered? Only after checking on the carrier website.', 'Marcar {n} como entregue? Use só depois de conferir no site da transportadora.'],
  ent_manual: ['수동으로 배송 확인', 'Delivery confirmed manually', 'Entrega confirmada manualmente'], ent_ok: ['배송 완료로 표시되었습니다', 'Shipment marked as delivered', 'Envio marcado como entregue'],
  cancel_conf: ['출고 {n}을(를) 취소할까요? UPS에서 라벨이 무효화(void)되어 더 이상 청구되지 않으며 Notes 박스는 대기열로 돌아갑니다. UPS가 이미 수거했다면 거부되고 아무것도 바뀌지 않습니다. 번호 {n}은(는) 취소됨으로 이력에 남습니다.', 'Cancel shipment {n}? The label is voided at UPS and no longer billed; the Notes box goes back to the queue. If UPS already picked the box up, it refuses and nothing changes. Number {n} stays in the history as cancelled.', 'Cancelar o envio {n}? A etiqueta é anulada na UPS (void) e deixa de ser cobrada; a caixa do Notes volta para a fila. Se a UPS já coletou a caixa, ela recusa e nada muda. O número {n} continua no histórico como cancelado.'],
  cancel_man: ['출고 {n}을(를) 취소할까요? 운송사 라벨은 그 운송사 사이트에서 따로 취소해야 합니다. 번호 {n}은(는) 취소됨으로 이력에 남습니다.', "Cancel shipment {n}? The carrier's label has to be cancelled on the carrier's own website. Number {n} stays in the history as cancelled.", 'Cancelar o envio {n}? A etiqueta da transportadora tem de ser cancelada no site dela. O número {n} continua no histórico como cancelado.'],
  editar_conf: ['{n}의 박스, 무게 또는 치수를 바꾸려면 현재 라벨을 UPS에서 무효화(void)하고, 새 라벨을 발행할 수 있도록 Shipping UPS가 모두 채워진 상태로 열립니다. 모든 박스가 함께 번호가 매겨집니다(1/3, 2/3, 3/3). 기존 라벨은 더 이상 유효하지 않으니 모든 박스에 새 라벨을 붙이세요. UPS가 이미 수거했다면 거부되고 아무것도 바뀌지 않습니다.', 'To change boxes, weight or dimensions of {n}, the current label is voided at UPS and Shipping UPS opens pre-filled to issue the new one, with all boxes numbered together (1/3, 2/3, 3/3). The old labels stop being valid: put the new ones on every box. If UPS already picked it up, it refuses and nothing changes.', 'Para mudar caixas, peso ou medidas do {n}, a etiqueta atual é anulada na UPS (void) e o Shipping UPS abre com tudo preenchido para emitir a nova, com todas as caixas numeradas juntas (1/3, 2/3, 3/3). As etiquetas antigas param de valer: cole as novas em todas as caixas. Se a UPS já coletou, ela recusa e nada muda.'],
  cancelado_ok: ['출고가 취소되었습니다', 'Shipment cancelled', 'Envio cancelado'], void_ok: ['VOID · UPS 라벨 무효화 완료', 'VOID · label voided at UPS', 'VOID · etiqueta anulada na UPS'],
  anulando: ['UPS에서 라벨을 무효화하는 중…', 'Voiding the label at UPS…', 'Anulando a etiqueta na UPS…'], recusou: ['UPS 가 취소를 거부했습니다', 'UPS refused the void', 'A UPS recusou a anulação'],
  rastreando: ['운송사에 조회 중…', 'Asking the carrier…', 'Consultando a transportadora…'], rastreio_nada: ['추적할 진행 중 출고가 없습니다', 'No open shipments to track', 'Nenhum envio aberto para rastrear'], rastreio_ok: ['추적 업데이트: {n}건', 'Tracking updated: {n} shipment(s)', 'Rastreio atualizado: {n} envio(s)'],
  sem_resposta: ['응답이 없습니다 — UPS 스크립트(UPS.gs)를 새 버전으로 바꾸었는지 확인하세요', 'No answer from the UPS script (UPS.gs) — check that the new version is deployed', 'Sem resposta do script da UPS (UPS.gs) — confira se a versão nova foi publicada'],
  vend_sem: ['담당자 없음', 'No sales rep', 'Sem vendedor'], vend_trocar: ['변경', 'Change', 'Trocar'], salvar: ['저장', 'Save', 'Salvar'], cancelar_bt: ['취소', 'Cancel', 'Cancelar'],
  vend_ok: ['이 출고의 영업 담당자: {v}.', 'Sales rep for this shipment: {v}.', 'Vendedor deste envio: {v}.'], vend_ok_cli: ['이 출고의 영업 담당자: {v}. 매장 정보도 업데이트되었습니다.', 'Sales rep for this shipment: {v}. The store record was updated too.', 'Vendedor deste envio: {v}. O cadastro da loja também foi atualizado.'],
  vend_limpo: ['이 출고에서 영업 담당자를 제거했습니다.', 'Sales rep removed from this shipment.', 'Vendedor removido deste envio.'],
  /* 반품 (옛 ups-retorno · ups-retorno-email) */
  ret_tag: ['반품', 'Return', 'Retorno'], ret_criar_bt: ['반품 라벨 만들기', 'Create return label', 'Criar etiqueta de retorno'], ret_sub: ['이 라벨로 고객 주소에서 우리 창고로 박스를 보냅니다. 운임은 회사 계정으로 청구됩니다. 박스 하나에 라벨 하나입니다.', 'The label takes the box from the customer address to our warehouse. Shipping is billed to the company account. One label per box.', 'A etiqueta leva a caixa do endereço do cliente para o nosso depósito. O frete é cobrado na conta da empresa. Uma etiqueta por caixa.'],
  ret_cliente: ['반품하는 고객', 'Customer returning the box', 'Cliente que vai devolver'], ret_desc: ['반품 내용', 'What is coming back', 'O que está voltando'], ret_peso: ['무게 (lb)', 'Weight (lb)', 'Peso (lb)'], ret_comp: ['길이 (in)', 'Length (in)', 'Comprimento (in)'], ret_larg: ['너비 (in)', 'Width (in)', 'Largura (in)'], ret_alt: ['높이 (in)', 'Height (in)', 'Altura (in)'],
  ret_de: ['보내는 곳', 'From', 'Sai de'], ret_para: ['받는 곳', 'To', 'Chega em'], ret_para_nos: ['THE ONE CORP (우리 창고)', 'THE ONE CORP (our warehouse)', 'THE ONE CORP (nosso depósito)'],
  ret_falta_cli: ['고객을 선택하세요.', 'Choose the customer.', 'Escolha o cliente.'], ret_falta_desc: ['반품 내용을 입력하세요.', 'Say what is coming back.', 'Diga o que está voltando.'], ret_falta_med: ['무게, 길이, 너비, 높이를 입력하세요.', 'Fill in weight, length, width and height.', 'Preencha peso, comprimento, largura e altura.'],
  ret_criando: ['UPS에서 라벨을 만드는 중…', 'Creating the label at UPS…', 'Criando a etiqueta na UPS…'], ret_ok_tit: ['반품 라벨이 만들어졌습니다', 'Return label created', 'Etiqueta de retorno criada'], ret_agora_nao: ['나중에', 'Not now', 'Agora não'],
  ret_enviar: ['라벨 이메일 보내기', 'Email the label', 'Enviar etiqueta por e-mail'], ret_reenviar: ['라벨 이메일 다시 보내기', 'Email the label again', 'Reenviar etiqueta por e-mail'], ret_email_para: ['어떤 이메일로 보낼까요?', 'Which email should it go to?', 'Para qual e-mail enviar?'],
  ret_email_mais: ['이메일 추가', 'Add another email', 'Adicionar outro e-mail'], ret_email_tirar: ['이 이메일 삭제', 'Remove this email', 'Tirar este e-mail'], ret_email_bt: ['이메일로 보내기', 'Send by email', 'Enviar por e-mail'], ret_email_falta: ['이메일을 하나 이상 입력하세요.', 'Type at least one email.', 'Digite pelo menos um e-mail.'],
  ret_email_enviando: ['라벨을 보내는 중…', 'Sending the label…', 'Enviando a etiqueta…'], ret_email_ok: ['{e}(으)로 라벨을 보냈습니다', 'Label sent to {e}', 'Etiqueta enviada para {e}'], ret_email_ruim: ['잘못된 이메일: {e}', 'Invalid email: {e}', 'E-mail inválido: {e}'], ret_email_max: ['한 번에 최대 {n}개까지 보낼 수 있습니다.', 'At most {n} emails at a time.', 'No máximo {n} e-mails por vez.'],
  ret_busca_env: ['출고 또는 박스 찾기', 'Find the shipment or box', 'Buscar o envio ou a caixa'], ret_busca_ph: ['SHP, 운송장 번호 또는 고객 계정', 'SHP, tracking or customer account', 'SHP, tracking ou conta do cliente'], ret_busca_limite: ['이 계정의 최근 출고 60건만 표시합니다.', 'Showing only the 60 most recent shipments for this account.', 'Mostrando só os 60 envios mais recentes desta conta.'],
  ret_busca_nada: ['해당 번호의 출고가 없습니다.', 'No shipment with that number.', 'Nenhum envio com esse número.'], ret_busca_erro: ['지금은 찾을 수 없습니다. 다시 시도하세요.', 'Could not search right now. Try again.', 'Não consegui buscar agora. Tente de novo.'], ret_busca_sem_cli: ['이 출고에는 등록된 매장이 없습니다. 아래에서 고객을 선택하세요.', 'This shipment has no store on file. Choose the customer below.', 'Esse envio não tem loja cadastrada. Escolha o cliente abaixo.'],
  ret_qual: ['어떤 박스를 반품하나요?', 'Which box is coming back?', 'Qual caixa vai voltar?'], ret_orig: ['원래 출고', 'Original shipment', 'Envio original'], ret_de_envio: ['출고 {n} 반품', 'Return of shipment {n}', 'Retorno do envio {n}'],
  ret_padrao: ['가장 많이 쓰는 박스 크기로 채워져 있습니다. 실제 크기를 알면 바꾸세요. UPS가 다시 재서 차액을 청구할 수 있습니다.', 'Filled in with our most common box. If you know the real size, change it: UPS may re-measure the box and bill the difference.', 'Já vem com a nossa caixa mais comum. Se souber a medida real, troque: a UPS pode remedir a caixa e cobrar a diferença.'],
  busca_cli_ph: ['이름, 주소 또는 계정 번호', 'Name, address or account number', 'Nome, endereço ou número da conta'], ninguem: ['해당 이름·주소·계정의 고객이 없습니다.', 'No customer with that name, address or account.', 'Nenhum cliente com esse nome, endereço ou conta.'],
  falhou: ['라벨을 생성하지 못했습니다.', 'I could not create the label.', 'Não consegui gerar a etiqueta.'],
  /* 출고 등록 (옛 rpc_envio_manual) */
  registrar_sub: ['시스템 외부에서 처리한 출고 — FedEx, USPS, DHL 또는 UPS 웹사이트. SHP 번호로 이력에 등록되며 라벨은 저장되지 않습니다.', 'Shipment made outside the system — FedEx, USPS, DHL or the UPS website. Enters the history with an SHP number, without a stored label.', 'Envio feito fora do sistema — FedEx, USPS, DHL ou UPS pelo site. Entra no histórico com número SHP, sem etiqueta gravada.'],
  man_servico: ['서비스명', 'Service (name)', 'Serviço (nome)'], man_custo: ['비용 (USD)', 'Cost (USD)', 'Custo (USD)'], man_peso: ['총 중량 (lb)', 'Total weight (lb)', 'Peso total (lb)'],
  man_falta: ['고객, 운송사, 운송장 번호를 입력하세요', 'Enter customer, carrier and tracking number', 'Informe cliente, transportadora e tracking'], man_ok: ['출고 {n} 등록됨', 'Shipment {n} logged', 'Envio {n} registrado'],
  man_dup: ['이 운송장은 이미 이력에 있습니다: {n}', 'This tracking is already in the history: {n}', 'Este tracking já está no histórico: {n}'],
  /* 청구서 가져오기 (옛 rpc_fatura_ups_importar) */
  imp_tit: ['UPS 청구서 가져오기', 'Import UPS invoices', 'Importar faturas da UPS'], imp_arquivos: ['청구서 CSV 파일', 'Invoice CSV files', 'Arquivos CSV das faturas'],
  imp_txt: ['UPS Billing Center › My Invoices › Download › CSV: Full (한 번에 최대 10개). 파일을 선택하면 청구된 금액이 운송장 번호로 이력의 출고(박스)에 붙습니다. 같은 청구서를 다시 가져와도 두 번 더해지지 않습니다.', 'UPS Billing Center › My Invoices › Download › CSV: Full (up to 10 invoices at a time). Pick the files: every billed amount is attached, by tracking number, to the shipment (box) in the history. Importing the same invoice again does not add it twice.', 'Billing Center da UPS › My Invoices › Download › CSV: Full (até 10 faturas por vez). Escolha os arquivos: cada valor cobrado entra, pelo tracking, no envio (caixa) do histórico. Importar a mesma fatura de novo não soma duas vezes.'],
  imp_erro_fmt: ['UPS CSV Full 청구서가 아닌 것 같습니다: {f}', 'Does not look like a UPS CSV Full invoice: {f}', 'Não parece fatura da UPS em CSV Full: {f}'], imp_nada: ['파일에서 출고를 찾지 못했습니다.', 'No shipment found in the files.', 'Nenhum envio encontrado nos arquivos.'],
  imp_resumo: ['청구서 {f}개 · 출고 {n}건', '{f} invoice(s) · {n} shipment(s)', '{f} fatura(s) · {n} envio(s)'], imp_periodo: ['{de} ~ {ate} · 청구 {v}', 'from {de} to {ate} · {v} billed', 'de {de} a {ate} · {v} cobrados'],
  imp_go: ['가져오기', 'Import', 'Importar'], imp_go_n: ['출고 {n}건 가져오기', 'Import {n} shipment(s)', 'Importar {n} envio(s)'], imp_feito: ['가져옴', 'Imported', 'Importado'], imp_lendo: ['청구서를 출고와 맞추는 중… {k}/{n}', 'Matching the invoice to shipments… {k}/{n}', 'Casando a fatura com os envios… {k}/{n}'],
  imp_ok: ['{m}건 맞춤 ({c}박스 · {v}) · 이력에 없는 출고 {u}건 ({w})', '{m} matched ({c} boxes · {v}) · {u} not in the history ({w})', '{m} casado(s) ({c} caixas · {v}) · {u} sem envio no histórico ({w})'],
  imp_sem: ['이력에 없는 출고 — 앱 밖에서 보낸 출고입니다 (청구서 금액만 여기 표시):', 'Shipments not in the history — shipped outside the app (billed amount shown here only):', 'Envios que não estão no histórico — feitos fora do app (o valor cobrado só aparece aqui):'],
  /* 상태 */
  st_criado: ['생성됨', 'Created', 'Criado'], st_embalado: ['포장됨', 'Packed', 'Embalado'], st_emitido: ['라벨 생성', 'Label created', 'Etiqueta emitida'], st_em_transito: ['운송 중', 'In transit', 'Em trânsito'], st_entregue: ['배송 완료', 'Delivered', 'Entregue'],
  st_faturado: ['UPS 청구됨', 'Billed by UPS', 'Faturado pela UPS'], st_excecao: ['예외', 'Exception', 'Exceção'], st_cancelado: ['취소됨', 'Cancelled', 'Cancelado'], st_void: ['VOID', 'VOID', 'VOID'], st_erro: ['오류', 'Error', 'Erro'],
  st_validos: ['취소 제외', 'Without cancelled', 'Sem cancelados'], st_andando: ['운송 중 + 라벨 생성', 'In transit + label created', 'Em trânsito + etiqueta emitida']
};
export function tx(k, v) { const a = TX[k]; if (!a) return k; let s = a[0] === a[1] && a[1] === a[2] ? a[0] : L3(a[0], a[1], a[2]); if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(v[x]); }); return s; }

/* ---------- 운송사 (옛 v_transportadoras) — UPS 만 API · 나머지는 출고 등록 + 손으로 배송 완료 ---------- */
export const CARR = [['UPS', 'UPS', 'https://www.ups.com/track?tracknum={n}', true], ['FEDEX', 'FedEx', 'https://www.fedex.com/fedextrack/?trknbr={n}'], ['USPS', 'USPS', 'https://tools.usps.com/go/TrackConfirmAction?tLabels={n}'], ['DHL', 'DHL', 'https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}'], ['OUTRA', null, '']];
const carrRow = c => CARR.find(x => x[0] === String(c || 'UPS').toUpperCase()) || null;
const carrNome = c => { const r = carrRow(c); return r ? (r[1] || L3('직접 배달 · 기타', 'Hand delivery · other', 'Entrega própria · outra')) : String(c || '—'); };
const carrUrl = (c, n) => { const r = carrRow(c); return r && r[2] && n ? r[2].replace('{n}', encodeURIComponent(n)) : ''; };
const integrada = e => e.carrier === 'UPS' && !e.manual;

/* ---------- Shipment ID ---------- */
export const shpFmt = (n, d) => 'SHP-' + String(d || hoje()).substring(0, 4) + '-' + String(n).padStart(6, '0');
async function novoShp(d) { const n = await S.DB.seq('shp', 'n', 1); return shpFmt(n, d); }

/* ---------- 상태 (옛 앱과 같은 이름 · SH_STATUS) ---------- */
const SH_STATUS = ['criado', 'embalado', 'emitido', 'em_transito', 'entregue', 'faturado', 'excecao', 'cancelado', 'void', 'erro'];
function stDe(s) {
  if (s.st === 'void') return 'void';
  if (s.boxes.every(x => x.canceled || x.voided)) return s.boxes.some(x => x.voided) ? 'void' : 'cancelado';
  if (s.st === 'dlv') return 'entregue';
  if (s.boxes.some(x => !x.voided && /exception|delay|return to sender|returned/i.test(x.status || ''))) return 'excecao';
  if (s.st === 'go') return 'em_transito';
  return 'emitido';
}
const ST_CLS = { entregue: 'ok', em_transito: 'cresc', excecao: 'out', erro: 'out', emitido: 'av', cancelado: 'off', void: 'void', criado: 'off', embalado: 'off', faturado: 'ok' };
const stHTML = st => '<span class="badge sh-st ' + (ST_CLS[st] || 'off') + '">' + esc(tx('st_' + st)) + '</span>';
const conta = e => ['cancelado', 'void', 'erro'].indexOf(e.st) < 0;
const aberto = e => ['emitido', 'em_transito', 'excecao'].indexOf(e.st) >= 0;
const stCasa = (e, f) => !f || (f === 'validos' ? conta(e) : f === 'andando' ? (e.st === 'em_transito' || e.st === 'emitido') : e.st === f);
const etqVale = e => ['void', 'cancelado', 'erro'].indexOf(e.st) < 0;

/** 출고 한 건 — 화면이 쓰는 모양으로 */
function envio(s) {
  const a = s.a, B = s.boxes, acc = a.acct && S.accounts && S.accounts.byCode ? S.accounts.byCode[a.acct] : null;
  const to = String(a.to || '').split(',').map(x => x.trim());
  const fat = B.some(x => x.billNet != null), billNet = B.reduce((t, x) => t + (Number(x.billNet) || 0), 0), billW = B.reduce((t, x) => t + (Number(x.billW) || 0), 0);
  const invs = {}; B.forEach(x => Object.keys(x.billInv || {}).forEach(k => { invs[k] = 1; }));
  const e = { key: s.key, g: s, a, no: a.no || a.trk, shp: a.shp || (B.find(x => x.shp) || {}).shp || '', trk: a.trk, data: a.shipDate || '', at: a.at || '', acct: a.acct || '', cli: a.store || (acc && acc.store) || '', sm: String(a.sm || '').toUpperCase(),
    cidade: (acc && acc.city) || a.city || to[1] || '', estado: (acc && acc.state) || a.state || to[2] || '', end: (acc ? [acc.addr, acc.addr2].filter(Boolean).join(', ') : to[0] || ''), cep: (acc && acc.zip) || a.zip || to[3] || '', tel: (acc && acc.tel) || a.tel || '',
    carrier: String(a.carrier || 'UPS').toUpperCase(), manual: !!a.manual, ret: !!a.ret, retDe: a.retDe || '', retDeShp: a.retDeShp || '', retDesc: a.retDesc || '',
    serv: a.svcName || (a.manual ? '' : svcName(a.svc)), n: s.n, peso: s.w, cotado: s.cost, custo: fat ? Math.round(billNet * 100) / 100 : s.cost, fat, billW, faturas: Object.keys(invs),
    cod: Number(a.cod) || 0, by: a.by || '', job: a.orderId || a.adhocId || a.retJob || '', pedido: a.orderId ? a.no : '', invs: a.invs || [], env: a.env || '' };
  e.st = stDe(s);
  return e;
}
function periodo() {
  if (H.per === 'pers') return { de: H.de || addDays(hoje(), -29), ate: H.ate || hoje() };
  if (H.per === 'tudo') return { de: '', ate: '' };
  if (H.per === 'hoje') return { de: hoje(), ate: hoje() };
  return { de: addDays(hoje(), -(Number(H.per) || 30) + 1), ate: hoje() };
}
/** 기간이 바뀌면 새로 읽음 — 날짜 자르기는 DB 에서, 최대 5,000건 (옛 SH_LIMITE) */
async function carregar() {
  const p = periodo(), chave = p.de + '|' + p.ate;
  if (H.lista && H.chave === chave) return;
  H.lista = null; H.chave = chave; H.erro = '';
  let L = [];
  try {
    if (isStaff()) L = await S.DB.list('shipments', p.de ? { where: [['shipDate', '>=', p.de]], order: ['shipDate', 'desc'], limit: LIM } : { order: ['shipDate', 'desc'], limit: LIM });
    else L = (await S.DB.list('shipments', { where: [['sm', '==', mySm()]] })).filter(x => !p.de || (x.shipDate || '') >= p.de);
  } catch (e) { H.erro = String(e.code || e.message); }
  if (H.chave !== chave) return;
  H.cap = isStaff() && L.length >= LIM;
  H.lista = groupShipments(L.filter(x => !p.ate || (x.shipDate || '') <= p.ate)).map(envio);
}
/** UPS.gs 가 밖에서 shipments 를 고쳤을 때 — DB 의 15초 기억을 버리고 새로 */
const fresco = () => { try { if (S.DB.fresh) S.DB.fresh('shipments'); } catch (e) {} H.chave = ''; };
const doTipo = () => (H.lista || []).filter(e => e.ret === (H.tipo === 'retornos'));
function filtrados() {
  const q = String(H.q || '').trim().toUpperCase();
  return doTipo().filter(e => stCasa(e, H.st) && (!H.cli || e.acct === H.cli) && (!H.transp || e.carrier === H.transp) && (!H.serv || e.serv === H.serv) && (!H.sm || e.sm === H.sm) &&
    (!H.cod || (H.cod === 'com' ? e.cod > 0 : !e.cod)) &&
    (!q || [e.shp, e.no, e.cli, e.acct, e.cidade, e.estado, e.retDeShp].concat(e.g.boxes.map(x => x.trk), e.invs).some(v => String(v || '').toUpperCase().includes(q))));
}
const caixas = L => L.reduce((s, e) => s + (Number(e.n) || 0), 0);

/* ---------- 화면 ---------- */
function kpi(ico, cor, valor, rot, sub, st, per) {
  const on = st && H.st === st && (!per || H.per === per), n = String(valor).length, tam = n > 11 ? ' v-xl' : n > 8 ? ' v-l' : '';
  const at = st ? ' data-act="sh-kpi" data-st="' + st + '"' + (per ? ' data-per="' + per + '"' : '') + ' role="button" tabindex="0" aria-pressed="' + (on ? 'true' : 'false') + '" title="' + esc(tx('kpi_dica')) + '"' : '';
  return '<div class="fin-kpi nu-kpi' + tam + (st ? ' sh-kpi-bt' + (on ? ' on' : '') : '') + '"' + at + '><div class="fin-kpi-ico ' + cor + '">' + svg(ico, 19) + '</div><div class="fin-kpi-c"><span class="lbl">' + esc(rot) + '</span><b>' + valor + '</b><span class="sub"><i class="nu-delta n">' + esc(sub) + '</i></span></div></div>';
}
/** 숫자는 박스 (출고 줄이 아님 — 옛 15/09 결정) · 반품 탭에는 카드 없음 (반품은 나간 것이 아님) */
function kpisHTML() {
  const vivos = doTipo().filter(conta), hj = (H.lista || []).filter(e => !e.ret && conta(e) && e.data === hoje()), noP = tx('no_per');
  const tr = vivos.filter(e => e.st === 'em_transito' || e.st === 'emitido'), en = vivos.filter(e => e.st === 'entregue'), ex = vivos.filter(e => e.st === 'excecao');
  return '<div class="nu-kpis sh-kpis' + (isStaff() ? '' : ' sh-kpis-5') + '">' +
    kpi(ICO.caixa, '', esc(String(caixas(vivos))), tx('kpi_total'), noP, 'validos') +
    kpi(ICO.relogio, 'x', esc(String(caixas(hj))), tx('kpi_hoje'), hoje(), 'validos', 'hoje') +
    kpi(ICO.entra, 'a', esc(String(caixas(tr))), tx('kpi_tr'), tx('kpi_tr_sub'), 'andando') +
    kpi(ICO.check, 'g', esc(String(caixas(en))), tx('kpi_en'), noP, 'entregue') +
    kpi(ICO.sai2, ex.length ? 'r' : '', esc(String(caixas(ex))), tx('kpi_ex'), noP, 'excecao') +
    (isStaff() ? kpi(ICO.venda, 'g', esc(money(vivos.reduce((s, e) => s + e.custo, 0))), tx('kpi_custo'), noP) : '') + '</div>';
}
function tipoHTML() {
  const ret = H.tipo === 'retornos';
  return '<div class="nu-chips sh-tipo">' + [['envios', tx('envios'), !ret], ['retornos', tx('retornos'), ret]].map(c => '<button type="button" class="nu-chip' + (c[2] ? ' on' : '') + '" data-act="sh-tipo" data-tipo="' + c[0] + '" aria-pressed="' + (c[2] ? 'true' : 'false') + '">' + esc(c[1]) + '</button>').join('') + '</div>';
}
function opcoes(id, rot, val, L, todos) { return '<div class="field"><label>' + esc(rot) + '</label><select id="' + id + '"><option value="">' + esc(todos) + '</option>' + L.map(o => '<option value="' + esc(o.v) + '"' + (o.v === val ? ' selected' : '') + '>' + esc(o.r) + '</option>').join('') + '</select></div>'; }
const nFiltros = () => [H.st, H.cli, H.transp, H.serv, H.cod, H.sm].filter(Boolean).length;
function filtrosHTML() {
  const base = doTipo(), vi = {}, clis = [], servs = [], sms = [], trs = CARR.map(c => ({ v: c[0], r: carrNome(c[0]) }));
  base.forEach(e => { if (e.acct && !vi['C' + e.acct]) { vi['C' + e.acct] = 1; clis.push({ v: e.acct, r: '#' + e.acct + ' · ' + e.cli }); } if (e.serv && !vi['S' + e.serv]) { vi['S' + e.serv] = 1; servs.push({ v: e.serv, r: e.serv }); } if (e.sm && !vi['M' + e.sm]) { vi['M' + e.sm] = 1; sms.push({ v: e.sm, r: e.sm }); } if (!trs.some(t => t.v === e.carrier)) trs.push({ v: e.carrier, r: e.carrier }); });
  const ord = a => a.sort((x, y) => String(x.r).localeCompare(String(y.r))), p = periodo();
  return '<div class="sh-filtros-top"><div class="nu-chips">' + [['hoje', tx('hoje')], ['7', tx('p7')], ['30', tx('p30')], ['90', tx('p90')], ['tudo', tx('tudo')], ['pers', tx('pers')]]
      .map(c => '<button type="button" class="nu-chip' + (H.per === c[0] ? ' on' : '') + '" data-act="sh-per" data-p="' + c[0] + '">' + esc(c[1]) + '</button>').join('') + '</div>' +
    '<div class="sh-busca-linha"><div class="sh-busca-wrap">' + svg(ICO.busca, 16) + '<input id="shBusca" autocomplete="off" placeholder="' + esc(tx('busca_ph')) + '" value="' + esc(H.q) + '"></div>' +
    '<button type="button" class="btn sh-filtro-bt' + (H.filtrosAb ? ' on' : '') + '" data-act="sh-filtros-ab" aria-expanded="' + (H.filtrosAb ? 'true' : 'false') + '" aria-label="' + esc(tx('filtros')) + '">' + svg(ICO.filtro, 17) + '<span>' + esc(tx('filtros')) + '</span>' + (nFiltros() ? '<i class="sh-filtro-n">' + nFiltros() + '</i>' : '') + '</button></div></div>' +
    '<div class="nu-filtros sh-filtros' + (H.filtrosAb ? ' aberto' : '') + '">' +
    (H.per === 'pers' ? '<div class="field per"><label>' + esc(tx('periodo')) + '</label><div class="nu-per-campos"><input type="date" id="shDe" value="' + esc(p.de) + '"><input type="date" id="shAte" value="' + esc(p.ate) + '"></div></div>'
      : '<div class="field per"><label>' + esc(tx('periodo')) + '</label><div class="sh-per-txt">' + esc(p.de ? p.de + ' – ' + p.ate : tx('tudo')) + '</div></div>') +
    opcoes('shCli', tx('cliente'), H.cli, ord(clis), tx('todos')) +
    opcoes('shTransp', tx('transp'), H.transp, trs, tx('todas')) +
    opcoes('shServ', tx('servico'), H.serv, ord(servs), tx('todos_serv')) +
    opcoes('shSt', tx('status'), H.st, ['validos', 'andando'].concat(SH_STATUS).map(s => ({ v: s, r: tx('st_' + s) })), tx('todos_st')) +
    opcoes('shCod', 'COD', H.cod, [{ v: 'com', r: tx('cod_com') }, { v: 'sem', r: tx('cod_sem') }], tx('todos')) +
    (isStaff() ? opcoes('shSm', tx('vend'), H.sm, ord(sms), tx('todos')) : '') +
    '<div class="field sh-limpar"><label>&nbsp;</label><button type="button" class="btn" data-act="sh-limpar">' + svg(ICO.repetir, 14) + ' ' + esc(tx('limpar')) + '</button></div></div>';
}
const shpDe = e => e.shp || e.no || '—';
function rastreioHTML(e, curto) {
  if (!e.trk) return '—';
  const u = carrUrl(e.carrier, e.trk), txt = curto && e.trk.length > 14 ? e.trk.slice(0, 12) + '…' : e.trk;
  return (u ? '<a class="rastreio" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(e.trk) + '">' + esc(txt) + '</a>' : '<span title="' + esc(e.trk) + '">' + esc(txt) + '</span>') + (e.g.boxes.length > 1 ? ' <span class="hint">+' + (e.g.boxes.length - 1) + '</span>' : '');
}
const retTag = e => e.ret ? ' <span class="sh-ret-tag">' + esc(tx('ret_tag')) + '</span>' : '';
const testeTag = e => e.env === 'test' ? ' <span class="sh-teste">' + esc(tx('teste')) + '</span>' : '';
function linhaHTML(e) {
  const sel = H.sel === e.key, dest = [e.cidade, e.estado].filter(Boolean).join(', ') || '—';
  return '<tr class="sh-l' + (sel ? ' sel' : '') + '" data-envio="' + esc(e.key) + '"><td data-l="' + esc(tx('data')) + '">' + esc(e.data) + '</td><td class="principal"><b class="sh-num">' + esc(shpDe(e)) + '</b>' + testeTag(e) + (e.cod ? ' <span class="sh-cod-tag" title="' + esc(tx('cod')) + '">COD ' + money(e.cod) + '</span>' : '') + retTag(e) +
    '<div class="sh-mob"><span class="sh-mob-st">' + stHTML(e.st) + '</span><span class="sh-mob-cli">' + esc((e.acct ? '#' + e.acct + ' · ' : '') + (e.cli || '—')) + '</span><span class="sh-mob-info">' + esc([carrNome(e.carrier), e.data, tx('mob_cx', { n: e.n })].filter(Boolean).join(' · ')) + (e.custo ? ' · ' + money(e.custo) : '') + '</span></div></td>' +
    '<td data-l="' + esc(tx('cliente')) + '">' + (e.acct ? '<b>#' + esc(e.acct) + '</b> ' : '') + esc(e.cli || '—') + (e.sm ? ' <span class="vend-tag">' + esc(e.sm) + '</span>' : '') + '</td><td>' + esc(dest) + '</td><td><span class="sh-transp">' + esc(carrNome(e.carrier)) + '</span></td><td>' + esc(e.serv || '—') + '</td>' +
    '<td class="num">' + e.n + '</td><td class="num">' + (e.peso ? num1(e.peso) + ' lb' : '—') + '</td><td class="num">' + (e.custo ? money(e.custo) : '—') + '</td>' +
    '<td style="font-variant-numeric:tabular-nums">' + rastreioHTML(e, true) + '</td>' +
    '<td>' + stHTML(e.st) + '</td><td class="acoes">' + (retPodeEmail(e) ? '<button type="button" class="btn sm" data-act="ret-email" data-envio="' + esc(e.key) + '" title="' + esc(tx('ret_enviar')) + '" aria-label="' + esc(tx('ret_enviar')) + '">' + svg(IC.carta, 14) + '</button> ' : '') +
    '<button type="button" class="btn sm" data-act="sh-ver" data-envio="' + esc(e.key) + '" title="' + esc(tx('ver')) + '">' + svg(ICO.olho, 14) + '</button></td></tr>';
}
function corpoHTML() {
  if (!H.lista) return '<div class="panel ups-painel sh-lista"><div class="graf-vazio">' + esc(H.erro ? H.erro : L3('로딩 중…', 'Loading…', 'Carregando…')) + '</div></div>';
  const L = filtrados(), pags = Math.max(1, Math.ceil(L.length / H.por)); H.pag = Math.min(Math.max(1, H.pag), pags);
  const de = (H.pag - 1) * H.por, pg = L.slice(de, de + H.por);
  let h = '<div class="panel ups-painel sh-lista">';
  if (H.cod === 'com') { const v = L.filter(conta); h += '<div class="sh-cod-resumo"><b>' + esc(tx('cod_resumo', { n: v.length, v: money(v.reduce((s, e) => s + e.cod, 0)) })) + '</b><span>' + esc(tx('cod_obs')) + '</span></div>'; }
  if (H.cap) h += '<div class="aviso alerta" style="margin-bottom:12px">' + svg(ICO.ajuda, 16) + '<div>' + esc(tx('teto', { n: LIM.toLocaleString('en-US') })) + '</div></div>';
  if (!L.length) return h + '<div class="graf-vazio">' + esc(tx(H.tipo === 'retornos' ? 'ret_vazio' : 'vazio')) + '</div></div>';
  h += '<div class="tbl-scroll"><table class="sh-tbl sem-resize"><thead><tr><th>' + esc(tx('data')) + '</th><th>' + esc(tx('col_ship')) + '</th><th>' + esc(tx('cliente')) + '</th><th>' + esc(tx(H.tipo === 'retornos' ? 'col_orig' : 'col_dest')) + '</th><th>' + esc(tx('transp')) + '</th><th>' + esc(tx('servico')) + '</th><th class="num">' + esc(tx('caixas')) + '</th><th class="num">' + esc(tx('peso')) + '</th><th class="num">' + esc(tx('frete')) + '</th><th>' + esc(tx('tracking')) + '</th><th>' + esc(tx('status')) + '</th><th class="acoes"></th></tr></thead><tbody>' + pg.map(linhaHTML).join('') + '</tbody></table></div>';
  const a = de + 1, b = Math.min(de + H.por, L.length);
  h += '<div class="sh-pag"><span>' + esc(tx('mostrando', { a, b, n: L.length })) + '</span><div class="sh-pag-bts">' +
    '<button type="button" class="btn sm" data-act="sh-pag" data-pag="' + (H.pag - 1) + '"' + (H.pag <= 1 ? ' disabled' : '') + '>' + svg(ICO.esq, 13) + '</button><b>' + H.pag + ' / ' + pags + '</b><button type="button" class="btn sm" data-act="sh-pag" data-pag="' + (H.pag + 1) + '"' + (H.pag >= pags ? ' disabled' : '') + '>' + svg(ICO.dir, 13) + '</button>' +
    '<select id="shPor">' + [10, 25, 50, 100].map(n => '<option value="' + n + '"' + (n === H.por ? ' selected' : '') + '>' + esc(tx('por_pag', { n })) + '</option>').join('') + '</select></div></div>';
  return h + '</div>';
}
/* ---------- 상세 ---------- */
const IC = { carta: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>', baixar: '<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/>' };
const par = (rot, v, cls) => '<div class="sh-par' + (cls ? ' ' + cls : '') + '"><i>' + esc(rot) + '</i><b>' + v + '</b></div>';
const selecionado = () => (H.lista || []).find(e => e.key === H.sel) || null;
const porKey = k => (H.lista || []).find(e => e.key === k) || null;
const podeVoid = e => podeAgir() && integrada(e) && e.st === 'emitido' && !e.pedido && !!e.job;
const podeEditar = e => podeVoid(e) && !e.ret && !!(e.acct && S.accounts.byCode && S.accounts.byCode[e.acct]);
const podeCancelarMan = e => podeAgir() && e.manual && ['criado', 'embalado', 'emitido', 'em_transito', 'excecao'].indexOf(e.st) >= 0;
const retPodeEmail = e => !!(e && e.ret && e.job && etqVale(e) && podeAgir());
const dh = s => String(s || '').replace('T', ' ').substring(0, 16);
function acoesHTML(e) {
  if (!isStaff()) return '';
  const b = [];
  if (e.job && etqVale(e)) b.push('<button type="button" class="btn" data-act="sh-ir-etq">' + svg(ICO.print, 14) + ' ' + esc(tx('ir_etq')) + '</button>');
  if (aberto(e) && integrada(e)) b.push('<button type="button" class="btn" data-act="sh-rastrear">' + svg(ICO.repetir, 14) + ' ' + esc(tx('rastrear')) + '</button>');
  if (aberto(e) && !integrada(e) && podeAgir()) b.push('<button type="button" class="btn" data-act="sh-entregue" data-envio="' + esc(e.key) + '">' + svg(ICO.check, 14) + ' ' + esc(tx('marcar_ent')) + '</button>');
  if (retPodeEmail(e)) b.push('<button type="button" class="btn primary" data-act="ret-email" data-envio="' + esc(e.key) + '">' + svg(IC.carta, 14) + ' ' + esc(tx(emailsEnviados(e).length ? 'ret_reenviar' : 'ret_enviar')) + '</button>');
  if (podeEditar(e)) b.push('<button type="button" class="btn" data-act="sh-editar">' + svg(ICO.lapis, 14) + ' ' + esc(tx('editar')) + '</button>');
  if (podeVoid(e)) b.push('<button type="button" class="btn danger" data-act="sh-cancelar">' + svg(ICO.x, 14) + ' ' + esc(tx('cancelar')) + '</button>');
  if (podeCancelarMan(e)) b.push('<button type="button" class="btn danger" data-act="sh-cancelar-man">' + svg(ICO.x, 14) + ' ' + esc(tx('cancelar')) + '</button>');
  return b.length ? '<div class="sh-acoes">' + b.join('') + '</div>' : '';
}
/** 영업 담당 — 옛 shVendedorHTML (출고 일을 하는 직원은 "변경", 그 밖은 보기만) */
function vendHTML(e) {
  const nome = e.sm ? e.sm + (S.smByCode && S.smByCode[e.sm] && S.smByCode[e.sm].name ? ' (' + S.smByCode[e.sm].name + ')' : '') : '';
  if (!podeAgir()) return nome ? esc(nome) : '<span class="hint">' + esc(tx('vend_sem')) + '</span>';
  if (H.vendEd !== e.key) return '<span class="sh-vend">' + (nome ? '<b>' + esc(nome) + '</b>' : '<span class="hint">' + esc(tx('vend_sem')) + '</span>') + ' <button type="button" class="btn sm" data-act="sh-vend-editar">' + esc(tx('vend_trocar')) + '</button></span>';
  const vs = (S.sms || []).filter(x => x.active !== false).map(x => x.code); if (e.sm && vs.indexOf(e.sm) < 0) vs.unshift(e.sm);
  return '<span class="sh-vend sh-vend-ed"><select id="shVendSel"><option value="">' + esc(tx('vend_sem')) + '</option>' + vs.map(v => '<option value="' + esc(v) + '"' + (v === e.sm ? ' selected' : '') + '>' + esc(v + (S.smByCode && S.smByCode[v] && S.smByCode[v].name ? ' (' + S.smByCode[v].name + ')' : '')) + '</option>').join('') + '</select>' +
    '<button type="button" class="btn sm primary" data-act="sh-vend-salvar">' + esc(tx('salvar')) + '</button><button type="button" class="btn sm" data-act="sh-vend-cancelar">' + esc(tx('cancelar_bt')) + '</button></span>';
}
function eventos(e) { const B = e.g.boxes; let ev = []; B.forEach(x => (x.events || []).forEach(v => ev.push(Object.assign({ bx: x.box || 1 }, v)))); return ev.sort((x, y) => ((y.d || '') + (y.t || '')).localeCompare((x.d || '') + (x.t || ''))); }
function timelineHTML(e, compacta) {
  const ev = eventos(e), B = e.g.boxes;
  if (!ev.length) return '<div class="graf-vazio">' + esc(tx('sem_eventos')) + '</div>';
  const L = compacta ? ev.slice(0, 5) : ev;
  return '<ol class="sh-timeline' + (compacta ? ' compacta' : '') + '">' + L.map((v, i) => '<li class="' + (v.st === 'D' ? 'ok' : v.st === 'X' ? 'bad' : i === 0 ? 'atual' : '') + '"><span class="sh-dot"></span><div><b>' + esc(v.desc || v.st || '') + (B.length > 1 ? ' · ' + esc(tx('caixa_n', { n: v.bx })) : '') + '</b><span>' + esc((v.d || '') + ' ' + (v.t || '')) + (v.loc ? ' · ' + esc(v.loc) : '') + (v.sys ? ' · <i>' + esc(tx('origem_sis')) + '</i>' : '') + '</span></div></li>').join('') + '</ol>' +
    (compacta && ev.length > 5 ? '<button type="button" class="btn sm" data-act="sh-aba" data-aba="tracking">' + esc(tx('mais_ev', { n: ev.length - 5 })) + '</button>' : '');
}
/** 옛 shCustosHTML — 있는 것만: 공시 견적 · 협상 요금 · 절감 · (청구서) 청구 금액 · 정정 · 차이 · COD · 합계 */
function custosHTML(e) {
  const lista = Number(e.a.list) || 0, cot = Number(e.cotado) || 0, B = e.g.boxes;
  const codH = e.cod ? '<div class="cod"><span>' + esc(tx('cod')) + '</span><b>' + money(e.cod) + '</b></div>' : '';
  if (!cot && !e.fat) return '<div class="sh-custos"><div><span>' + esc(tx('frete_cob')) + '</span><b>—</b></div>' + codH + '</div>';
  let h = '<div class="sh-custos">' + codH;
  if (cot) {
    if (lista && integrada(e)) h += '<div><span>' + esc(tx('cotacao')) + '</span><b>' + money(lista) + '</b></div><div class="neg"><span>' + esc(tx('tarifa_neg')) + '</span><b>' + money(cot) + '</b></div>' + (lista > cot ? '<div><span>' + esc(tx('economia')) + '</span><b>−' + money(lista - cot) + '</b></div>' : '');
    else h += '<div><span>' + esc(tx('frete_cob')) + '</span><b>' + money(cot) + '</b></div>';
  }
  if (e.fat) {
    const adj = B.reduce((t, x) => t + (Number(x.billAdj) || 0), 0);
    h += '<div class="fat"><span>' + esc(tx('faturado')) + (e.faturas.length ? ' · ' + esc(e.faturas.join(', ')) : '') + '</span><b>' + money(e.custo) + '</b></div>' + (adj ? '<div><span>' + esc(tx('ajustes')) + '</span><b>' + money(adj) + '</b></div>' : '') +
      (cot ? '<div><span>' + esc(tx('dif')) + '</span><b>' + (e.custo - cot >= 0 ? '+' : '') + money(e.custo - cot) + '</b></div>' : '');
  }
  return h + '<div class="tot"><span>' + esc(tx('total')) + '</span><b>' + money(e.custo) + '</b></div></div>';
}
/** 라벨 미리보기 — shipq 의 GIF (필요할 때 읽음) */
function etqMiniHTML(e, compacta) {
  if (!e.job) return '<div class="graf-vazio">' + esc(tx('etq_sem')) + '</div>';
  const k = e.key, x = H.etq[k];
  if (!x) { H.etq[k] = { loading: true }; S.DB.get('shipq', e.job).then(q => { H.etq[k] = { labels: ((q && q.labels) || []).filter(l => l && l.img) }; repintarDet(); }).catch(() => { H.etq[k] = { labels: [] }; }); }
  const gif = x && x.labels && x.labels[0] && x.labels[0].img;
  const mini = gif ? '<img class="sh-etq-mini" alt="" src="data:image/gif;base64,' + gif + '">' : '<div class="sh-etq-mini vazia">' + (x && !x.loading ? 'GIF' : svg(ICO.relogio, 16)) + '</div>';
  const nota = etqVale(e) ? (compacta ? '' : tx('reimp_nota')) : tx('etq_anulada');
  return '<div class="sh-etq">' + mini + '<div class="sh-etq-bts">' + (gif ? '<button type="button" class="btn sm" data-act="sh-etq-ver">' + svg(ICO.olho, 14) + ' ' + esc(tx('etq_ver')) + '</button>' : '') + (nota ? '<p class="hint">' + esc(nota) + '</p>' : '') + '</div></div>';
}
function topoHTML(e) {
  const u = carrUrl(e.carrier, e.trk);
  return '<div class="sh-carrier"><div class="sh-carrier-logo">' + esc(e.carrier.slice(0, 5)) + '</div><div><b>' + esc(e.serv || carrNome(e.carrier)) + '</b><span>' + esc(tx('tracking')) + ': ' + (e.trk ? '<code class="sh-rast">' + esc(e.trk) + '</code> <button type="button" class="sh-copiar" data-copiar="' + esc(e.g.boxes.map(x => x.trk).filter(Boolean).join(' ')) + '" title="' + esc(tx('copiado')) + '">' + svg(ICO.copiar, 13) + '</button>' : '—') + '</span></div>' +
    (u ? '<a class="btn sm" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(tx('rastrear_na', { t: carrNome(e.carrier) })) + ' ' + svg(ICO.link, 12) + '</a>' : '') + '</div>';
}
function abaHTML(e, aba) {
  const topo = topoHTML(e), B = e.g.boxes;
  if (aba === 'geral') {
    const dims = B.map((x, i) => '<span class="sh-dim"><em>' + (x.box || i + 1) + '</em>' + esc(String(x.dims || '—').replace(/×/g, ' × ')) + (Number(x.w) ? '<small>' + num1(x.w) + ' lb</small>' : '') + '</span>');
    const dl = e.st === 'entregue' ? '<div class="sh-par sh-entrega ok"><i>' + esc(tx('entrega')) + '</i><b>' + esc(String(e.a.deliveredAt || '').substring(0, 10)) + ' ' + svg(ICO.check, 15) + '</b><i>' + esc(tx('entregue_em')) + '</i><span>' + esc(dh(e.a.deliveredAt) + (e.a.receivedBy ? ' · ' + e.a.receivedBy : '')) + '</span></div>'
      : '<div class="sh-par sh-entrega"><i>' + esc(tx('previsao')) + '</i><b>' + esc(e.a.eta || '—') + '</b></div>';
    const pesoCob = e.billW || B.reduce((t, x) => t + (Number(x.dw) || 0), 0), dimensional = pesoCob > (Number(e.peso) || 0) + 0.05;
    const vEm = e.st === 'void' ? (B.find(x => x.voidAt) || {}).voidAt : '';
    return topo + '<div class="sh-grid">' + par(tx('data_envio'), esc(e.data + (e.at ? ' ' + String(e.at).substring(11, 16) : ''))) + dl +
      par(tx('pedido'), e.pedido ? '<b>' + esc(e.pedido) + '</b>' + (e.invs.length ? ' · ' + esc(e.invs.join(', ')) : '') : '<span class="hint">' + esc(tx('sem_pedido')) + (e.no && e.no !== e.trk ? ' · ' + esc(e.no) : '') + '</span>') +
      par(tx('cliente'), (e.acct ? '#' + esc(e.acct) + ' · ' : '') + esc(e.cli || '—')) + par(tx('vend'), vendHTML(e)) +
      par(tx(e.ret ? 'ret_de' : 'endereco'), esc(e.end) + '<br>' + esc([e.cidade, e.estado, e.cep].filter(Boolean).join(', ')), 'full') +
      (e.ret ? par(tx('ret_para'), esc(tx('ret_para_nos'))) + par(tx('ret_desc'), esc(e.retDesc || '—')) + (e.retDeShp || e.retDe ? par(tx('ret_orig'), esc(e.retDeShp || e.retDe)) : '') : '') +
      par(tx('conta'), e.acct ? '#' + esc(e.acct) : '—') + par(tx('tel'), esc(e.tel || '—')) +
      par(tx('peso'), e.peso ? num1(e.peso) + ' lb' : '—') + (pesoCob ? par(tx(dimensional ? 'peso_dim' : 'peso_cob'), num1(pesoCob) + ' lb') : par(tx('caixas'), String(e.n))) +
      par(tx('dim'), dims.length ? '<span class="sh-dims">' + dims.join('') + '</span>' : '—', pesoCob ? '' : 'full') + (pesoCob ? par(tx('caixas'), String(e.n)) : '') +
      (e.cod ? par('COD', '<b>' + money(e.cod) + '</b> · ' + esc(tx('cod'))) : '') +
      par(tx('resp'), esc(String(e.by || '—').split('@')[0])) +
      par(tx('status'), stHTML(e.st) + (vEm ? ' <span class="hint">' + esc(tx('void_em', { d: dh(vEm) })) + '</span>' : e.a.status ? ' <span class="hint">' + esc(e.a.status) + '</span>' : '')) + '</div>' +
      '<div class="sh-ov2"><div><h4 class="ups-h4">' + esc(tx('timeline')) + '</h4>' + timelineHTML(e, true) + '</div><div><h4 class="ups-h4">' + esc(tx('resumo_custos')) + '</h4>' + custosHTML(e) + '<h4 class="ups-h4">' + esc(tx('aba_etq')) + '</h4>' + etqMiniHTML(e, true) + '</div></div>' + acoesHTML(e);
  }
  if (aba === 'tracking') {
    const em = B.map(x => x.trkAt || '').sort().pop();
    return topo + '<div class="sh-track-cab"><h4 class="ups-h4">' + esc(tx('timeline')) + '</h4><span class="hint">' + esc(em ? tx('rastreado_em', { d: dh(em) }) : tx('nunca_rastr')) + '</span>' +
      (isStaff() && aberto(e) && integrada(e) ? '<button type="button" class="btn sm" data-act="sh-rastrear">' + svg(ICO.repetir, 13) + ' ' + esc(tx('atualizar')) + '</button>' : '') + '</div>' + timelineHTML(e, false) + acoesHTML(e);
  }
  if (aba === 'custos') {
    return topo + '<h4 class="ups-h4">' + esc(tx('resumo_custos')) + '</h4>' + custosHTML(e) + '<div class="sh-custos" style="margin-top:10px"><div><span>' + esc(tx('servico')) + '</span><b>' + esc(e.serv || '—') + '</b></div><div><span>' + esc(tx('peso')) + '</span><b>' + (e.peso ? num1(e.peso) + ' lb' : '—') + '</b></div>' +
      (e.billW ? '<div><span>' + esc(tx('peso_cob')) + '</span><b>' + num1(e.billW) + ' lb</b></div>' : '') + '<div><span>' + esc(tx('caixas')) + '</span><b>' + e.n + '</b></div></div>' +
      '<p class="hint">' + esc(e.custo ? tx('conta_emp', { t: carrNome(e.carrier) }) : tx('sem_custo')) + '</p>';
  }
  if (aba === 'etiqueta') {
    if (!e.job) return topo + '<div class="graf-vazio">' + esc(tx('etq_sem')) + '</div>';
    const vale = etqVale(e) && isStaff(), bz = k => H.busy[e.key + ':' + k];
    return topo + '<h4 class="ups-h4">' + esc(tx('aba_etq')) + '</h4>' + etqMiniHTML(e, false) +
      '<div class="sh-vols" style="margin-top:12px">' + B.map((x, i) => '<div class="sh-vol"><b>' + esc(tx('caixa_n', { n: (x.box || i + 1) + '/' + e.n })) + '</b><span>' + esc((Number(x.w) ? num1(x.w) + ' lb' : '') + (x.dims ? ' · ' + x.dims + ' in' : '')) + '</span>' + (x.trk ? '<code class="sh-rast">' + esc(x.trk) + '</code>' : '') +
        (vale ? '<button type="button" class="btn sm" data-act="sh-reimp" data-box="' + (x.box || i + 1) + '"' + (bz(x.box || i + 1) || bz('*') ? ' disabled' : '') + '>' + svg(bz(x.box || i + 1) ? ICO.relogio : ICO.print, 13) + ' ' + esc(tx(bz(x.box || i + 1) ? 'imprimindo' : 'reimp')) + '</button>' : '') + '</div>').join('') + '</div>' +
      (vale && B.length > 1 ? '<div class="sh-etq-bts"><button type="button" class="btn primary" data-act="sh-reimp" data-box="*"' + (bz('*') ? ' disabled' : '') + '>' + svg(ICO.print, 14) + ' ' + esc(tx(bz('*') ? 'imprimindo' : 'reimp_todas')) + '</button></div>' : '');
  }
  /* 이력 — 첫 박스의 log (옛 v_envio_auditoria) */
  const nm = s => tx('st_' + s) || s;
  const log = [{ at: e.at || e.data, t: tx('ac_criado'), by: e.by }].concat((e.a.log || []).map(l => {
    const t = l.t === 'void' ? tx('ac_void') : l.t === 'edit' ? tx('ac_edit') : l.t === 'cancel' ? tx('ac_cancel') : l.t === 'status' ? tx('ac_status', { de: nm(l.de || ''), para: nm(l.para || '') })
      : l.t === 'email' ? tx('ac_email', { para: l.para || '—' }) : l.t === 'email_falhou' ? tx('ac_email_f', { para: l.para || '—' }) + (l.err ? ' · ' + l.err : '') : l.t === 'vend' ? tx('ac_vend', { de: l.de || '—', para: l.para || '—' })
      : l.t === 'fatura' ? tx('ac_fat', { f: l.f || '', v: money(l.v || 0) }) : l.t === 'shp' ? tx('ac_shp', { n: l.n || '' })
      : tx('ac_reimp') + (l.box ? ' · ' + tx('caixa_n', { n: l.box }) : ' · ' + L3('전부', 'all', 'todas'));
    return { at: l.at, by: l.by, t };
  }));
  if (e.a.deliveredAt && !(e.a.log || []).some(l => l.t === 'status' && l.para === 'entregue')) log.push({ at: e.a.deliveredAt, t: tx('st_entregue'), by: e.a.receivedBy || '' });
  log.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  return topo + '<h4 class="ups-h4">' + esc(tx('aba_hist')) + '</h4>' + (log.length ? '<ul class="sh-aud">' + log.map(l => '<li><b>' + esc(l.t) + '</b><span>' + esc(dh(l.at) + (l.by ? ' · ' + String(l.by).split('@')[0] : '')) + '</span></li>').join('') + '</ul>' : '<div class="graf-vazio">' + esc(tx('sem_hist')) + '</div>');
}
function detHTML() {
  const e = selecionado(); if (!e) return '';
  const abas = [['geral', tx('aba_geral')], ['tracking', tx('aba_track')], ['custos', tx('aba_custos')], ['etiqueta', tx('aba_etq')], ['hist', tx('aba_hist')]];
  return '<div class="sh-det-head"><div><b class="sh-det-num">' + esc(shpDe(e)) + '</b> ' + stHTML(e.st) + retTag(e) + testeTag(e) + (e.cod ? ' <span class="sh-cod-tag">COD</span>' : '') + '</div><button type="button" class="x" data-act="sh-fechar" title="' + esc(tx('fechar')) + '">' + svg(ICO.x, 16) + '</button></div>' +
    '<div class="sh-abas">' + abas.map(a => '<button type="button" class="sh-aba' + (H.aba === a[0] ? ' on' : '') + '" data-act="sh-aba" data-aba="' + a[0] + '">' + esc(a[1]) + '</button>').join('') + '</div><div class="sh-det-corpo" id="shDetCorpo">' + abaHTML(e, H.aba) + '</div>';
}

/* ---------- 이 화면만의 CSS (옛 ret-* · 휴대폰 5FD) ---------- */
const SH2_CSS = '.sb .sh-filtro-bt{display:none}.sb .sh-busca-linha{display:flex;flex:1;min-width:240px;gap:8px}' +
  '.sb .ret-med{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.sb .ret-med input,.sb #retEnvQ,.sb #retCliQ,.sb #retDesc{font-size:16px}' +
  '.sb .ret-rota{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:8px 0 12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius,9px)}.sb .ret-rota b{display:block;overflow-wrap:anywhere}.sb .ret-rota i{display:block;font-style:normal;font-size:11px;color:var(--muted)}.sb .ret-rota span{display:block;font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}' +
  '.sb .ret-origem{margin:8px 0 4px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius,9px)}.sb .ret-origem b,.sb .ret-origem span{display:block}.sb .ret-origem span{font-size:12.5px;color:var(--muted);margin-top:6px}' +
  '.sb .ret-cxs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.sb .ret-em-l{display:flex;align-items:center;gap:8px;margin-bottom:8px}.sb .ret-em-l input{flex:1;min-width:0}.sb .ret-em-mais{margin-top:2px}' +
  '.sb .sh-pag-bts b{white-space:nowrap}.sb .sh-mob-st .badge{white-space:nowrap}@media(min-width:1401px){.sb .sh-tela:not(.com-det) .sh-filtros{grid-template-columns:repeat(8,minmax(0,1fr))}}' +
  '.sb .sh-vend{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}.sb .sh-vend-ed select{font-size:13px;padding:4px 8px;max-width:200px}.sb .sh-custos>div.fat{background:#eef4ff}.sb .sh-custos>div.fat b{color:var(--accent)}' +
  '.sb .sh-imp-tot{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.sb .sh-imp-tot div{border:1px solid var(--border);border-radius:9px;padding:8px 10px}.sb .sh-imp-tot i{display:block;font-style:normal;font-size:11px;color:var(--muted)}.sb .sh-imp-tot b{font-size:15px}' +
  '.sb .sh-man-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sb .sh-man-grid .field{margin:0}.sb .sh-man-grid .full{grid-column:1/-1}.sb .sh-man-grid input,.sb .sh-man-grid select{width:100%}' +
  '@media(max-width:760px){.sb .ret-med{grid-template-columns:repeat(2,minmax(0,1fr))}.sb .ret-rota{grid-template-columns:minmax(0,1fr)}.sb .ret-em-l .btn,.sb .ret-em-mais{min-height:44px;min-width:44px}.sb .ret-em-l input{font-size:16px}.sb .sh-man-grid{grid-template-columns:1fr}' +
  '.sb .page-head.sh-head{flex-direction:column;align-items:stretch;gap:10px;margin-bottom:12px}.sb .sh-head p{display:none}.sb .page-head.sh-head .sh-head-bts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;width:100%;margin-left:0;text-align:left}.sb .page-head.sh-head .sh-head-bts .btn{min-height:40px;font-size:12.5px;padding:6px 8px;justify-content:center;white-space:normal;line-height:1.15}.sb .page-head.sh-head .sh-head-bts .btn.primary{grid-column:1/-1;order:-1}' +
  '.sb .sh-kpis{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.sb .sh-kpis .nu-kpi{flex-direction:column;align-items:flex-start;gap:6px;padding:10px;border-radius:12px;box-shadow:none;border:1px solid var(--border);min-width:0}' +
  '.sb .sh-kpis .nu-kpi .fin-kpi-ico{width:30px;height:30px;flex-basis:auto;border-radius:9px}.sb .sh-kpis .nu-kpi .fin-kpi-c{min-width:0;width:100%}.sb .sh-kpis .nu-kpi .fin-kpi-c .lbl{display:block;font-size:10px;letter-spacing:.2px;line-height:1.2;text-transform:none;font-weight:700;color:var(--muted);overflow-wrap:anywhere}' +
  '.sb .sh-kpis .nu-kpi .fin-kpi-c b{font-size:20px;margin:2px 0 0;white-space:nowrap}.sb .sh-kpis .nu-kpi.v-l .fin-kpi-c b,.sb .sh-kpis .nu-kpi.v-xl .fin-kpi-c b{font-size:16px}.sb .sh-kpis .nu-kpi .fin-kpi-c .sub{display:none}.sb .sh-kpis .sh-kpi-bt.on{border-color:var(--accent);background:var(--accent-soft)}' +
  '.sb .sh-filtros-box{background:transparent;border:0;padding:0;margin-bottom:10px;box-shadow:none}.sb .sh-filtros-top{display:flex;flex-direction:column;align-items:stretch;gap:10px}' +
  '.sb .sh-filtros-top .nu-chips{display:flex;gap:6px;border:0;border-radius:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;margin:0;padding:0;-webkit-overflow-scrolling:touch;min-width:0;flex-wrap:nowrap}.sb .sh-filtros-top .nu-chips::-webkit-scrollbar{display:none}' +
  '.sb .sh-filtros-top .nu-chip{flex:none;white-space:nowrap;border:1px solid var(--border);border-radius:18px;background:#fff;padding:0 14px;min-height:36px;font-size:13px}.sb .sh-filtros-top .nu-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}' +
  '.sb .sh-busca-linha{width:100%;min-width:0}.sb .sh-busca-linha .sh-busca-wrap{flex:1;min-width:0;margin:0;border-radius:12px}.sb .sh-busca-wrap input{height:44px;font-size:16px}' +
  '.sb .sh-filtro-bt{display:flex;position:relative;flex:none;width:48px;min-height:44px;padding:0;align-items:center;justify-content:center;border-radius:12px;background:#fff}.sb .sh-filtro-bt span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.sb .sh-filtro-bt.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}' +
  '.sb .sh-filtro-n{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:#fff;font-style:normal;font-size:11px;font-weight:800;line-height:18px;text-align:center}' +
  '.sb .sh-filtros{display:none}.sb .sh-filtros.aberto{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px;padding:12px;background:#fff;border:1px solid var(--border);border-radius:12px}.sb .sh-filtros.aberto .field{margin:0;min-width:0}' +
  '.sb .sh-filtros.aberto .field.per,.sb .sh-filtros.aberto .field.sh-limpar{grid-column:1/-1}.sb .sh-filtros.aberto .field.sh-limpar label{display:none}.sb .sh-filtros.aberto select,.sb .sh-filtros.aberto input{min-height:44px;font-size:16px;width:100%}' +
  '.sb .sh-lista{background:transparent;border:0;padding:0;box-shadow:none}.sb .sh-lista .tbl-scroll{overflow:visible;border:0}.sb .sh-lista .tbl-scroll tbody tr.sh-l{position:relative;padding:12px 34px 12px 14px;margin-bottom:8px;cursor:pointer;background:#fff;border:1px solid var(--border);border-radius:12px}' +
  '.sb .sh-lista .tbl-scroll tbody tr.sh-l td{display:none}.sb .sh-lista .tbl-scroll tbody tr.sh-l td.principal{display:block;padding:0 92px 0 0;margin:0;border:0}' +
  '.sb .sh-lista .tbl-scroll tbody tr.sh-l::after{content:"›";position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:22px;font-weight:700;color:var(--muted-2,#98a2b3)}.sb .sh-lista .tbl-scroll tbody tr.sh-l.sel{background:var(--accent-soft);border-color:#b9d5f2}' +
  '.sb .sh-lista .sh-num{font-size:14.5px}.sb .sh-lista .sh-mob{display:flex;flex-direction:column;gap:3px;margin-top:4px;font-size:12.5px;color:var(--muted)}.sb .sh-lista .sh-mob-st{position:absolute;top:10px;right:30px}' +
  '.sb .sh-lista .sh-mob-cli{color:var(--text);font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb .sh-pag{flex-wrap:wrap;gap:10px;padding:6px 2px 0}.sb .sh-det{border-radius:12px}}';
function cssSh() { css(); if (document.getElementById('shCss2')) return; const st = document.createElement('style'); st.id = 'shCss2'; st.textContent = SH2_CSS; document.head.appendChild(st); }

export async function page() {
  cssSh();
  const ag = podeAgir();
  const cab = '<div class="page-head nu-head sh-head"><div><h1>Shipping History</h1><p>' + esc(tx('sub')) + '</p></div>' +
    (isStaff() ? '<div class="nu-head-dir sh-head-bts actions"><button type="button" class="btn" data-act="sh-rastrear-todos">' + svg(ICO.repetir, 15) + ' ' + esc(tx('rastrear')) + '</button>' +
      (gerente() ? '<button type="button" class="btn" data-act="sh-importar">' + svg(IC.baixar, 15) + ' ' + esc(tx('imp_btn')) + '</button>' : '') +
      (ag ? '<button type="button" class="btn" data-act="sh-retorno">' + svg(ICO.repetir, 15) + ' ' + esc(tx('ret_criar')) + '</button>' : '') +
      (ag ? '<button type="button" class="btn" data-act="sh-novo">' + svg(ICO.caixa, 15) + ' Shipping UPS</button><button type="button" class="btn primary" data-act="sh-manual">' + svg(ICO.mais, 15) + ' ' + esc(tx('registrar')) + '</button>' : '') + '</div>' : '') + '</div>';
  const pinta = () => { $('page').innerHTML = '<div class="sb">' + cab + tipoHTML() + '<div class="sh-tela' + (H.sel ? ' com-det' : '') + '"><div class="sh-main">' + (H.tipo === 'retornos' ? '' : kpisHTML()) + '<div class="panel ups-painel sh-filtros-box" id="shFiltros">' + filtrosHTML() + '</div><div id="shCorpo">' + corpoHTML() + '</div></div><aside class="sh-det" id="shDet">' + (H.sel ? detHTML() : '') + '</aside></div></div>'; ligar(); };
  pinta();
  const ch = H.chave; await carregar(); if (location.hash.indexOf('#/shiphist') === 0 && (H.chave !== ch || H.lista)) pinta();
  numerar();
}
const naTela = () => location.hash.indexOf('#/shiphist') === 0;
const repintar = () => { const c = $('shCorpo'); if (c) { c.innerHTML = corpoHTML(); ligarCorpo(); } };
function repintarDet() { const c = $('shDetCorpo'), e = selecionado(); if (c && e) { c.innerHTML = abaHTML(e, H.aba); ligarDet(); } }
function ligarCorpo() {
  document.querySelectorAll('.sb .sh-l').forEach(r => r.onclick = ev => { if (ev.target.closest('a, button, [data-act]')) return; abrir(r.dataset.envio); });
  document.querySelectorAll('.sb #shCorpo [data-act="sh-ver"]').forEach(b => b.onclick = ev => { ev.stopPropagation(); abrir(b.dataset.envio); });
  document.querySelectorAll('.sb #shCorpo [data-act="ret-email"]').forEach(b => b.onclick = ev => { ev.stopPropagation(); emailDe(porKey(b.dataset.envio)); });
  document.querySelectorAll('.sb [data-act="sh-pag"]').forEach(b => b.onclick = () => { H.pag = Number(b.dataset.pag) || 1; repintar(); numerar(); });
  const por = $('shPor'); if (por) por.onchange = () => { H.por = Number(por.value) || 10; H.pag = 1; repintar(); numerar(); };
}
function abrir(k) { H.sel = k; H.aba = 'geral'; H.vendEd = ''; page().then(() => { const d = $('shDet'); if (d && window.innerWidth <= 1100) { try { d.scrollIntoView({ block: 'start' }); } catch (e) {} } }); }
function ligarDet() {
  const on = (act, f) => document.querySelectorAll('.sb #shDet [data-act="' + act + '"]').forEach(b => b.onclick = ev => { ev.stopPropagation(); f(b); });
  on('sh-aba', b => { H.aba = b.dataset.aba; document.querySelectorAll('.sb .sh-aba').forEach(x => x.classList.toggle('on', x.dataset.aba === H.aba)); repintarDet(); });
  on('sh-ir-etq', () => { H.aba = 'etiqueta'; page(); });
  on('sh-reimp', b => reimprimir(selecionado(), b.dataset.box));
  on('sh-rastrear', () => { const e = selecionado(); if (e) rastrear(e.g.boxes.map(x => x.trk).filter(Boolean)); });
  on('sh-cancelar', () => cancelar(selecionado(), false));
  on('sh-editar', () => cancelar(selecionado(), true));
  on('sh-cancelar-man', () => cancelarManual(selecionado()));
  on('sh-entregue', () => marcarEntregue(selecionado()));
  on('ret-email', () => emailDe(selecionado()));
  on('sh-etq-ver', () => etqVer(selecionado()));
  on('sh-vend-editar', () => { H.vendEd = H.sel; if (!S.sms) S.sms = []; repintarDet(); });
  on('sh-vend-cancelar', () => { H.vendEd = ''; repintarDet(); });
  on('sh-vend-salvar', () => vendSalvar(selecionado()));
  document.querySelectorAll('.sb #shDet [data-copiar]').forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.copiar); toast(tx('copiado')); } catch (e) {} });
}
function ligar() {
  const on = (act, f) => document.querySelectorAll('.sb [data-act="' + act + '"]').forEach(b => b.onclick = ev => { ev.stopPropagation(); f(b); });
  on('sh-kpi', b => { const st = b.dataset.st, per = b.dataset.per || ''; const ligado = H.st === st && (!per || H.per === per); H.cli = ''; H.transp = ''; H.serv = ''; H.cod = ''; H.sm = ''; H.q = ''; H.st = ligado ? '' : st; if (per && !ligado) H.per = per; H.pag = 1; page(); });
  document.querySelectorAll('.sb [data-act="sh-kpi"]').forEach(b => b.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); b.click(); } });
  on('sh-tipo', b => { H.tipo = b.dataset.tipo; H.sel = ''; H.pag = 1; H.st = ''; page(); });
  on('sh-per', b => { H.per = b.dataset.p; H.pag = 1; page(); });
  on('sh-filtros-ab', () => { H.filtrosAb = !H.filtrosAb; page(); });
  on('sh-limpar', () => { H.st = H.cli = H.transp = H.serv = H.cod = H.sm = H.q = ''; H.pag = 1; page(); });
  on('sh-fechar', () => { H.sel = ''; page(); });
  on('sh-novo', () => Router.go('balcao'));
  on('sh-rastrear-todos', () => rastrear([].concat(...filtrados().filter(e => aberto(e) && integrada(e)).map(e => e.g.boxes.map(x => x.trk).filter(Boolean))).slice(0, 25)));
  on('sh-manual', () => modalManual());
  on('sh-retorno', () => modalRetorno());
  on('sh-importar', () => modalImportar());
  const bu = $('shBusca'); if (bu) bu.oninput = () => { H.q = bu.value; H.pag = 1; repintar(); };
  [['shCli', 'cli'], ['shTransp', 'transp'], ['shServ', 'serv'], ['shSt', 'st'], ['shCod', 'cod'], ['shSm', 'sm']].forEach(([id, k]) => { const el = $(id); if (el) el.onchange = () => { H[k] = el.value; H.pag = 1; page(); }; });
  const de = $('shDe'), ate = $('shAte');
  if (de) de.onchange = () => { H.de = de.value; page(); }; if (ate) ate.onchange = () => { H.ate = ate.value; page(); };
  ligarCorpo(); ligarDet();
}

/* ---------- Shipment ID — 없는 출고에만, 보이는 페이지(와 열린 출고)에서 처음 볼 때 (있는 번호는 절대 안 바꿈) ---------- */
async function numerar() {
  if (H.shpBusy || !H.lista || !podeAgir()) return;
  const L = filtrados(), de = (H.pag - 1) * H.por, alvo = L.slice(de, de + H.por);
  const s = selecionado(); if (s && alvo.indexOf(s) < 0) alvo.push(s);
  const falta = alvo.filter(e => !e.shp).sort((x, y) => (x.data + x.at).localeCompare(y.data + y.at));
  if (!falta.length) return;
  H.shpBusy = true;
  try {
    for (const e of falta) {
      const lead = e.g.boxes[0]; let cur = null; try { cur = await S.DB.get('shipments', lead.id || lead.trk); } catch (er) {}
      if (cur && cur.shp) { e.shp = cur.shp; continue; }
      const n = await novoShp(e.data), now = agora();
      for (const b of e.g.boxes) { try { await S.DB.update('shipments', b.id || b.trk, b === lead ? { shp: n, log: ((cur && cur.log) || []).concat([{ t: 'shp', n, by: quem(), at: now }]) } : { shp: n }); b.shp = n; } catch (er) {} }
      e.shp = n; e.a.log = ((cur && cur.log) || []).concat([{ t: 'shp', n, by: quem(), at: now }]);
    }
  } catch (er) {}
  H.shpBusy = false;
  if (!naTela()) return;
  repintar(); const d = document.querySelector('.sb .sh-det-num'), e = selecionado(); if (d && e) d.textContent = shpDe(e);
}

/* ---------- 행동 ---------- */
async function addLog(e, item) { const lead = e.g.boxes[0], id = lead.id || lead.trk; try { const cur = await S.DB.get('shipments', id); const log = ((cur && cur.log) || []).concat([item]); await S.DB.update('shipments', id, { log }); lead.log = log; e.a.log = log; } catch (er) {} }
async function reimprimir(e, box) {
  if (!e || !e.job || !etqVale(e)) return;
  const k = e.key + ':' + box; if (H.busy[k] || H.busy[e.key + ':*']) return;
  H.busy[k] = true; repintarDet();
  try {
    const q = await S.DB.get('shipq', e.job), L = ((q && q.labels) || []).filter(l => l && l.img);
    const want = box === '*' ? L : L.filter((l, i) => String(i + 1) === String(box) || l.trk === (e.g.boxes.find(x => String(x.box) === String(box)) || {}).trk);
    if (!want.length) toast(L3('저장된 라벨이 없습니다', 'No saved label', 'Etiqueta não encontrada'), 'bad');
    else { imprimir({ labels: want }); await addLog(e, { t: 'reimp', box: box === '*' ? 0 : Number(box), by: quem(), at: agora() }); }
  } catch (er) { toast(String(er.code || er.message), 'bad'); }
  setTimeout(() => { delete H.busy[k]; if (naTela()) repintarDet(); }, 5000);   /* 한 번 누르면 한 번만 (옛 5HE) */
  repintarDet();
}
function etqVer(e) {
  const x = e && H.etq[e.key], L = (x && x.labels) || []; if (!L.length) return;
  const w = abrirModal('<div class="modal-head"><h2>' + esc(shpDe(e)) + ' · ' + esc(tx('aba_etq')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body sh-etq-modal">' + L.map(l => '<img alt="" src="data:image/gif;base64,' + l.img + '">').join('') + '</div>' +
    '<div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(tx('fechar')) + '</button>' + (isStaff() && etqVale(e) ? '<button class="btn primary" id="shEtqIr">' + svg(ICO.print, 14) + ' ' + esc(tx('reimp')) + '</button>' : '') + '</div>');
  const ir = w.querySelector('#shEtqIr'); if (ir) ir.onclick = () => { fecharModal(); H.aba = 'etiqueta'; page(); };
}
function ovr(txt) {
  const d = document.createElement('div'); d.className = 'sb'; d.style.cssText = 'padding:0;margin:0;min-height:0;background:none';
  d.innerHTML = '<div class="sb-ovr"><div class="sb-ok"><div class="sb-ok-ic"><span class="fb-spin" style="width:24px;height:24px;margin:0"></span></div><b>' + esc(txt) + '</b></div></div>';
  document.body.appendChild(d); return () => { if (d.isConnected) d.remove(); };
}
async function esperar(id, ok, err, max) {
  for (let i = 0; i < (max || 40); i++) { await sleep(3000); let x = null; try { x = await S.DB.get('shipq', id); } catch (e) {} if (x && ok.includes(x.st)) return x; if (x && err.includes(x.st)) return x; }
  return null;
}
async function rastrear(trks) {
  if (!trks.length) return toast(tx('rastreio_nada'), 'bad');
  toast(tx('rastreando'));
  const id = 'TRK-' + Date.now().toString(36);
  try { await S.DB.set('shipq', id, { st: 'trk', kind: 'trk', trks, by: quem(), createdAt: agora() }); await esperar(id, ['trkdone'], [], 30); }
  catch (er) { return toast(String(er.code || er.message), 'bad'); }
  fresco(); await carregar(); if (naTela()) page();
  toast(tx('rastreio_ok', { n: trks.length }), 'good');
}
/** 🚫 VOID — UPS 에 라벨 취소 (주문 없는 출고 · 반품). 고치기면 끝난 뒤 같은 가게 · 박스로 카운터를 엶 */
async function cancelar(e, editar) {
  if (!e || !podeVoid(e)) return;
  const msg = editar ? tx('editar_conf', { n: shpDe(e) }) : tx('cancel_conf', { n: shpDe(e) });
  if (!(await confirmBox(msg + ' (' + e.trk + ')', editar ? L3('취소하고 고치기', 'Void and edit', 'Anular e editar') : L3('취소 (VOID)', 'Void', 'Anular (void)')))) return;
  toast(tx('anulando'));
  let x = null;
  try { await S.DB.update('shipq', e.job, { st: 'void', voidBy: quem(), voidAt: agora() }); for (let i = 0; i < 40; i++) { await sleep(3000); x = await S.DB.get('shipq', e.job); if (x && (x.st === 'voided' || x.st === 'voiderr')) break; } }
  catch (er) { return toast(String(er.code || er.message), 'bad'); }
  if (!x || x.st !== 'voided') return toast(tx('recusou') + (x && x.err ? ': ' + x.err : ''), 'bad');
  const now = agora();
  for (const b of e.g.boxes) { try { await S.DB.update('shipments', b.id || b.trk, { voided: true, voidAt: now, voidBy: quem() }); b.voided = true; } catch (er) {} }
  await addLog(e, { t: editar ? 'edit' : 'void', by: quem(), at: now });
  try { if (e.a.adhocId) await S.DB.update('adhoc', e.a.adhocId, { st: 'void', voidAt: now, voidBy: quem(), updatedAt: now }); } catch (er) {}
  let nNotas = 0; if (e.a.adhocId) { try { nNotas = await devolver(e.a.adhocId); } catch (er) {} }   /* Notes UPS 박스는 다시 대기 줄로 */
  fresco();
  if (editar) return abrirEdicao(e.acct, e.g.boxes.slice(0, Math.max(0, e.g.boxes.length - nNotas)).map(b => { const d = String(b.dims || '').split('×').map(Number); return { peso: b.w, c: d[0] || '', l: d[1] || '', a: d[2] || '' }; }), e.a.svc, e.cod || '', e.no);
  toast(tx('void_ok') + ' · ' + e.trk, 'good'); await carregar(); page();
}
/** 앱 밖 출고(운송사 API 없음) 취소 — 이력에는 취소됨으로 남음 (옛 rpc_envio_cancelar) */
async function cancelarManual(e) {
  if (!e || !podeCancelarMan(e)) return;
  if (!(await confirmBox(tx('cancel_man', { n: shpDe(e) }), tx('cancelar')))) return;
  const now = agora();
  for (const b of e.g.boxes) { try { await S.DB.update('shipments', b.id || b.trk, { canceled: true, cancelAt: now, cancelBy: quem(), status: 'Cancelled', trkSt: 'done' }); b.canceled = true; } catch (er) {} }
  await addLog(e, { t: 'cancel', by: quem(), at: now });
  toast(tx('cancelado_ok'), 'good'); H.chave = ''; await carregar(); page();
}
/** 운송사 API 가 없는 출고 — 운송사 사이트에서 확인한 사람이 배송 완료로 (옛 sh-entregue) */
async function marcarEntregue(e) {
  if (!e || integrada(e) || !aberto(e) || !podeAgir()) return;
  if (!(await confirmBox(tx('ent_conf', { n: shpDe(e) }), tx('marcar_ent')))) return;
  const now = agora(), d = now.substring(0, 10), t = new Date().toTimeString().substring(0, 5), de = e.st;
  for (const b of e.g.boxes) { try { const ev = (b.events || []).concat([{ d, t, st: 'D', desc: tx('ent_manual'), loc: '', sys: true }]); await S.DB.update('shipments', b.id || b.trk, { delivered: true, deliveredAt: d + ' ' + t, receivedBy: '', status: 'Delivered (manual)', trkSt: 'done', events: ev, dlvBy: quem() }); b.delivered = true; } catch (er) {} }
  await addLog(e, { t: 'status', de, para: 'entregue', by: quem(), at: now });
  toast(tx('ent_ok'), 'good'); H.chave = ''; await carregar(); page();
}
/** 영업 담당 바꾸기 (옛 rpc_envio_vendedor) — 박스 전부 · 처음 정할 때(전에 없었음) 가게에 담당이 없으면 가게에도 */
async function vendSalvar(e) {
  const sel = $('shVendSel'); if (!e || !sel || !podeAgir()) return;
  const novo = String(sel.value || '').toUpperCase(), antes = e.sm, now = agora();
  try {
    for (const b of e.g.boxes) { await S.DB.update('shipments', b.id || b.trk, { sm: novo }); b.sm = novo; }
    await addLog(e, { t: 'vend', de: antes, para: novo, by: quem(), at: now });
  } catch (er) { return toast(String(er.code || er.message), 'bad'); }
  let cli = false; const acc = e.acct && S.accounts && S.accounts.byCode ? S.accounts.byCode[e.acct] : null;
  if (novo && !antes && acc && !acc.sm) { try { await S.DB.update('accounts', acc.id || acc.acct, { sm: novo, updatedAt: now }); acc.sm = novo; cli = true; } catch (er) {} }
  e.sm = novo; e.a.sm = novo; H.vendEd = '';
  toast(novo ? tx(cli ? 'vend_ok_cli' : 'vend_ok', { v: novo }) : tx('vend_limpo'), 'good');
  page();
}

/* ====================  출고 등록 (옛 modalEnvioManual · rpc_envio_manual) — 앱 밖에서 보낸 출고  ==================== */
function cliBusca(inp, res, pick) {
  inp.oninput = () => {
    const q = inp.value.trim(); if (q.length < 2) { res.innerHTML = ''; return; }
    const L = searchAccounts(S.accounts || [], q, 8);
    res.innerHTML = L.map(c => '<button type="button" class="sh-cli-op" data-cli="' + esc(c.acct) + '"><b>#' + esc(c.acct) + '</b> ' + esc(c.store || '') + '<span>' + esc([c.city, c.state].filter(Boolean).join(', ')) + '</span></button>').join('') || '<div class="hint">' + esc(tx('ninguem')) + '</div>';
    res.querySelectorAll('[data-cli]').forEach(b => b.onclick = () => { res.innerHTML = ''; inp.value = ''; pick(S.accounts.byCode[b.dataset.cli]); });
  };
}
export function modalManual() {
  if (!podeAgir()) return;
  const M = { cli: null };
  const w = abrirModal('<div class="modal-head"><h2>' + esc(tx('registrar')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p class="hint" style="margin-top:0">' + esc(tx('registrar_sub')) + '</p><div class="sh-man-grid">' +
    '<div class="field full"><label>' + esc(tx('cliente')) + '</label><input id="shmCliQ" autocomplete="off" placeholder="' + esc(tx('busca_cli_ph')) + '"><div id="shmCliRes" class="sh-cli-res"></div><div id="shmCliSel" class="sh-cli-sel"></div></div>' +
    '<div class="field"><label>' + esc(tx('transp')) + '</label><select id="shmTransp">' + CARR.map(c => '<option value="' + c[0] + '"' + (c[0] === 'FEDEX' ? ' selected' : '') + '>' + esc(carrNome(c[0])) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>' + esc(tx('man_servico')) + '</label><input id="shmServ" autocomplete="off" placeholder="FedEx Ground"></div>' +
    '<div class="field full"><label>' + esc(tx('tracking')) + '</label><input id="shmRast" autocomplete="off" style="font-variant-numeric:tabular-nums"></div>' +
    '<div class="field"><label>' + esc(tx('man_custo')) + '</label><input id="shmCusto" type="number" step="0.01" min="0" inputmode="decimal"></div>' +
    '<div class="field"><label>' + esc(tx('caixas')) + '</label><input id="shmN" type="number" step="1" min="1" value="1" inputmode="numeric"></div>' +
    '<div class="field"><label>' + esc(tx('man_peso')) + '</label><input id="shmPeso" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
    '<div class="field"><label>' + esc(tx('data_envio')) + '</label><input id="shmData" type="date" value="' + hoje() + '"></div>' +
    '<div class="field full"><label>' + esc(tx('vend')) + '</label><select id="shmSm"><option value="">' + esc(tx('vend_sem')) + '</option>' + (S.sms || []).filter(x => x.active !== false).map(x => '<option value="' + esc(x.code) + '">' + esc(x.code + (x.name ? ' (' + x.name + ')' : '')) + '</option>').join('') + '</select></div>' +
    '</div></div><div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(tx('cancelar_bt')) + '</button><button class="btn primary" id="shmSalvar">' + esc(tx('salvar')) + '</button></div>');
  const $w = id => w.querySelector('#' + id);
  cliBusca($w('shmCliQ'), $w('shmCliRes'), c => { M.cli = c; $w('shmCliSel').innerHTML = c ? '<span class="badge cresc">' + esc('#' + c.acct + ' · ' + (c.store || '')) + '</span>' : ''; if (c && c.sm) $w('shmSm').value = String(c.sm).toUpperCase(); $w('shmRast').focus(); });
  $w('shmCliQ').focus();
  $w('shmSalvar').onclick = async () => {
    const transp = $w('shmTransp').value, rast = $w('shmRast').value.trim().toUpperCase().replace(/\s+/g, '');
    if (!M.cli || !transp || (!rast && transp !== 'OUTRA')) return toast(tx('man_falta'), 'bad');
    const n = Math.max(1, Math.min(50, Math.round(Number($w('shmN').value) || 1))), peso = Number($w('shmPeso').value) || 0, cv = $w('shmCusto').value, custo = cv === '' ? 0 : Number(cv) || 0;
    const d = $w('shmData').value || hoje(), sm = $w('shmSm').value, c = M.cli, bt = $w('shmSalvar');
    bt.disabled = true;
    try {
      if (rast) { const ja = await S.DB.get('shipments', rast); if (ja) { bt.disabled = false; return toast(tx('man_dup', { n: ja.shp || ja.no || rast }), 'bad'); } }
      const shp = await novoShp(d), now = agora(), ids = [];
      for (let i = 1; i <= n; i++) ids.push(rast ? (i === 1 ? rast : rast + '-' + i) : shp + '-' + i);
      const doc = i => ({ shp, shipId: shp, lead: ids[0], trk: rast, carrier: transp, manual: true, src: 'manual', acct: c.acct, store: c.store || '', sm, city: c.city || '', state: c.state || '', zip: c.zip || '', to: [c.addr, c.city, c.state, c.zip].filter(Boolean).join(', '),
        box: i, boxes: n, w: Math.round(peso / n * 100) / 100, dims: '', svc: '', svcName: $w('shmServ').value.trim(), shipDate: d, cost: i === 1 ? custo : 0, cod: 0, invs: [], orderId: '', adhocId: '', no: shp,
        by: quem(), at: now, status: 'Shipped', trkSt: 'done', delivered: false, events: [], log: i === 1 ? [] : undefined });
      await S.DB.batch(ids.map((id, i) => ({ op: 'set', col: 'shipments', id, data: JSON.parse(JSON.stringify(doc(i + 1))) })));
      fecharModal(); toast(tx('man_ok', { n: shp }), 'good');
      H.tipo = 'envios'; H.chave = ''; if (d < periodo().de) H.per = 'tudo';
      await carregar(); const e = (H.lista || []).find(x => x.shp === shp); H.sel = e ? e.key : ''; H.aba = 'geral'; page();
    } catch (er) { bt.disabled = false; toast(String(er.code || er.message), 'bad'); }
  };
}

/* ====================  UPS 반품 (옛 modalRetorno · ups-retorno · ups-retorno-email)  ====================
 *  shipq { st:'ret' } → UPS.gs 가 ReturnService 9 (Print Return Label) 로 라벨을 만들고 st:'retdone' + labels · shipments/{트래킹}(ret:true) 기록
 *  메일: shipq { st:'mail', job } → UPS.gs 가 MailApp 으로 라벨을 첨부해 보냄 (st:'maildone' | 'mailerr') */
const RET_MAX = 10;
export function emailsLimpar(lista) {
  const vistos = {}, bons = [], ruins = [];
  [].concat(lista || []).join(',').split(/[,;\s]+/).filter(Boolean).forEach(x => { if (!/^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/.test(x)) return void ruins.push(x); const k = x.toLowerCase(); if (!vistos[k]) { vistos[k] = 1; bons.push(x); } });
  return { bons, ruins };
}
function emailsEnviados(e) { const l = (e.a.log || []).filter(x => x.t === 'email' && x.para).pop(); return l ? String(l.para).split(/,\s*/).filter(Boolean) : []; }
export function modalRetorno() {
  if (!podeAgir()) return;
  const R = { cli: null, origem: null, vols: [] };
  const campo = (id, rot, v) => '<div class="field"><label for="' + id + '">' + esc(tx(rot)) + '</label><input id="' + id + '" type="number" min="0" step="0.1" inputmode="decimal" value="' + v + '"></div>';
  const w = abrirModal('<div class="modal-head"><h2>' + esc(tx('ret_criar')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p class="hint" style="margin-top:0">' + esc(tx('ret_sub')) + '</p>' +
    '<div class="field full"><label for="retEnvQ">' + esc(tx('ret_busca_env')) + '</label><input id="retEnvQ" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + esc(tx('ret_busca_ph')) + '"><div id="retEnvRes" class="sh-cli-res ret-env-res"></div><div id="retEnvSel"></div></div>' +
    '<div class="field full"><label for="retCliQ">' + esc(tx('ret_cliente')) + '</label><input id="retCliQ" autocomplete="off" placeholder="' + esc(tx('busca_cli_ph')) + '"><div id="retCliRes" class="sh-cli-res"></div><div id="retCliSel"></div></div>' +
    '<div class="grid2"><div class="field"><label for="retDesc">' + esc(tx('ret_desc')) + '</label><input id="retDesc" maxlength="35" autocomplete="off" value="Jewelry"></div><div class="field"><label for="retServ">' + esc(tx('servico')) + '</label><select id="retServ">' + SVCS.map(x => '<option value="' + x[0] + '"' + (x[0] === '03' ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select></div></div>' +
    '<div class="ret-med">' + campo('retP', 'ret_peso', 4) + campo('retC', 'ret_comp', 8) + campo('retL', 'ret_larg', 8) + campo('retA', 'ret_alt', 8) + '</div><p class="hint" style="margin-bottom:0">' + esc(tx('ret_padrao')) + '</p></div>' +
    '<div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(tx('cancelar_bt')) + '</button><button class="btn primary" id="retCriarBt">' + esc(tx('ret_criar_bt')) + '</button></div>', 'ret-modal');
  const $w = id => w.querySelector('#' + id);
  const escolherCli = c => { R.cli = c; $w('retCliSel').innerHTML = c ? '<div class="ret-rota"><div><i>' + esc(tx('ret_de')) + '</i><b>' + esc('#' + c.acct + ' · ' + (c.store || '')) + '</b><span>' + esc([c.addr, c.addr2, c.city, c.state, c.zip].filter(Boolean).join(', ')) + '</span></div><div><i>' + esc(tx('ret_para')) + '</i><b>' + esc(tx('ret_para_nos')) + '</b></div></div>' : ''; };
  cliBusca($w('retCliQ'), $w('retCliRes'), c => { R.origem = null; $w('retEnvSel').innerHTML = ''; escolherCli(c); $w('retP').focus(); });
  const pintarOrigem = vol => {
    const e = R.origem, v = R.vols.find(x => String(x.box || 1) === String(vol)) || null;
    $w('retEnvSel').innerHTML = '<div class="ret-origem"><b>' + esc(tx('ret_de_envio', { n: shpDe(e) })) + '</b>' + (R.vols.length > 1 ? '<span>' + esc(tx('ret_qual')) + '</span><div class="ret-cxs">' + R.vols.map(x => '<button type="button" class="btn sm' + (v === x ? ' primary' : '') + '" data-ret-vol="' + (x.box || 1) + '">' + esc(tx('caixa_n', { n: x.box || 1 }) + (Number(x.w) ? ' · ' + num1(x.w) + ' lb' : '') + (x.dims ? ' · ' + x.dims : '')) + '</button>').join('') + '</div>' : '') + '</div>';
    $w('retEnvSel').querySelectorAll('[data-ret-vol]').forEach(b => b.onclick = () => pintarOrigem(b.dataset.retVol));
    if (!v) return;
    const d = String(v.dims || '').split('×').map(Number);
    [['retP', v.w], ['retC', d[0]], ['retL', d[1]], ['retA', d[2]]].forEach(p => { if (Number(p[1]) > 0) $w(p[0]).value = String(Number(p[1])); });
  };
  /* 출고 · 박스 찾기 — SHP · 운송장(박스) · 가게 계정: 지금 목록 + DB */
  let seq = 0, tmr = 0;
  const buscar = async txt => {
    const x = String(txt || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''), my = ++seq, res = $w('retEnvRes');
    if (x.length < 4) { res.innerHTML = ''; return; }
    res.innerHTML = '<div class="hint">' + esc(L3('로딩 중…', 'Loading…', 'Carregando…')) + '</div>';
    let docs = [], cortada = false;
    try {
      const [a, b, c] = await Promise.all([S.DB.get('shipments', x).catch(() => null), S.DB.list('shipments', { where: [['shp', '==', x]] }).catch(() => []), /^\d{1,5}$/.test(x) ? S.DB.list('shipments', { where: [['acct', '==', x.padStart(4, '0')]] }).catch(() => []) : Promise.resolve([])]);
      docs = [].concat(a ? [a] : [], b, c);
      const keys = {}, lead = [];
      for (const d of docs) { const k = d.shipId || d.lead || d.adhocId || d.orderId || d.trk; if (!keys[k]) { keys[k] = 1; lead.push(d); } }
      /* 같은 출고의 박스 전부 */
      let all = [];
      for (const d of lead.slice(0, 60)) { const k = d.shipId ? ['shipId', d.shipId] : d.lead ? ['lead', d.lead] : d.adhocId ? ['adhocId', d.adhocId] : d.orderId ? ['orderId', d.orderId] : null; all = all.concat(k ? await S.DB.list('shipments', { where: [k] }).catch(() => [d]) : [d]); }
      cortada = lead.length > 60;
      const locais = (H.lista || []).filter(e => !e.ret && [e.shp, e.no].concat(e.g.boxes.map(y => y.trk)).some(v => String(v || '').toUpperCase().includes(x))).map(e => e.g);
      const G = groupShipments(all.filter(d => !d.ret)).concat(locais), vis = {};
      R.achados = G.filter(g => !vis[g.key] && (vis[g.key] = 1)).map(envio).sort((p, q) => String(q.data).localeCompare(String(p.data))).slice(0, 60);
    } catch (er) { if (my === seq) res.innerHTML = '<div class="hint">' + esc(tx('ret_busca_erro')) + '</div>'; return; }
    if (my !== seq || !w.isConnected) return;
    R.buscado = x;
    res.innerHTML = (R.achados.map(e => '<button type="button" class="sh-cli-op" data-ret-env="' + esc(e.key) + '"><b>' + esc(shpDe(e)) + '</b> ' + esc((e.acct ? '#' + e.acct + ' · ' : '') + (e.cli || '—')) + '<span>' + esc([e.data, e.trk, tx('mob_cx', { n: e.g.boxes.length })].filter(Boolean).join(' · ')) + '</span></button>').join('') || '<div class="hint">' + esc(tx('ret_busca_nada')) + '</div>') + (cortada ? '<div class="hint">' + esc(tx('ret_busca_limite')) + '</div>' : '');
    res.querySelectorAll('[data-ret-env]').forEach(b => b.onclick = () => {
      const e = R.achados.find(y => y.key === b.dataset.retEnv); if (!e) return;
      const c = e.acct && S.accounts.byCode ? S.accounts.byCode[e.acct] : null;
      if (!c) return toast(tx('ret_busca_sem_cli'), 'bad');
      R.origem = e; R.vols = e.g.boxes; res.innerHTML = ''; $w('retEnvQ').value = '';
      escolherCli(c);
      const marcada = String(e.trk || '').toUpperCase() === R.buscado || e.shp === R.buscado ? null : R.vols.find(v => String(v.trk || '').toUpperCase().indexOf(R.buscado) >= 0);
      pintarOrigem(R.vols.length === 1 ? (R.vols[0].box || 1) : marcada ? marcada.box : null);
    });
  };
  $w('retEnvQ').oninput = () => { clearTimeout(tmr); const v = $w('retEnvQ').value; tmr = setTimeout(() => buscar(v), 300); };
  $w('retEnvQ').focus();
  $w('retCriarBt').onclick = () => retCriar(R, w);
}
async function retCriar(R, w) {
  if (R.emitindo) return;
  const $w = id => w.querySelector('#' + id), num = id => Number($w(id).value) || 0, c = R.cli, desc = String($w('retDesc').value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 35), sv = $w('retServ').value;
  const vol = { w: num('retP'), l: num('retC'), wd: num('retL'), h: num('retA') };
  if (!c) return toast(tx('ret_falta_cli'), 'bad');
  if (!desc) return toast(tx('ret_falta_desc'), 'bad');
  if (!(vol.w > 0 && vol.l > 0 && vol.wd > 0 && vol.h > 0)) return toast(tx('ret_falta_med'), 'bad');
  R.emitindo = true; const bt = $w('retCriarBt'); bt.disabled = true; bt.textContent = tx('ret_criando');
  const soltar = () => { R.emitindo = false; if (bt.isConnected) { bt.disabled = false; bt.textContent = tx('ret_criar_bt'); } };
  const id = 'RET-' + c.acct + '-' + Date.now().toString(36), o = R.origem;
  let x = null;
  try {
    const shp = await novoShp(hoje());
    await S.DB.set('shipq', id, { id, st: 'ret', kind: 'ret', shp, acct: c.acct, store: c.store || '', sm: (o && o.sm) || String(c.sm || '').toUpperCase(), by: quem(), createdAt: agora(), svc: sv, svcName: svcName(sv), desc,
      to: { name: c.store || '', attn: c.store || '', phone: c.tel || '', email: c.email || '', addr1: c.addr || '', addr2: c.addr2 || '', city: c.city || '', state: String(c.state || '').toUpperCase(), zip: c.zip || '' },
      box: vol, retDe: o ? o.key : '', retDeShp: o ? o.shp || o.no : '', retDeTrk: o ? o.trk : '' });
    x = await esperar(id, ['retdone'], ['reterr'], 40);
  } catch (er) { x = { st: 'reterr', err: String(er.code || er.message) }; }
  if (!x || x.st !== 'retdone') { soltar(); return toast(x ? (x.err || tx('falhou')) : tx('sem_resposta'), 'bad'); }
  fecharModal();
  H.tipo = 'retornos'; fresco(); H.pag = 1; H.st = '';
  await carregar();
  const e = (H.lista || []).find(y => y.job === id) || (H.lista || []).find(y => y.trk === String(x.track || '').split(/\s+/)[0]);
  H.sel = e ? e.key : ''; H.aba = 'geral';
  await page();
  modalEmail({ e, id, numero: e ? shpDe(e) : x.shp || '', trk: String(x.track || ''), custo: Number(x.charge) || 0, recem: true, emails: c.email ? [c.email] : [] });
}
function emailDe(e) { if (!retPodeEmail(e)) return; const ja = emailsEnviados(e), c = e.acct && S.accounts.byCode ? S.accounts.byCode[e.acct] : null; modalEmail({ e, id: e.job, numero: shpDe(e), trk: e.trk, reenvio: ja.length > 0, emails: ja.length ? ja : c && c.email ? [c.email] : [] }); }
/** 어느 이메일로 — 줄마다 하나, 최대 10개 (옛 modalRetornoEmail) */
function modalEmail(o) {
  o.emails = (o.emails && o.emails.length ? o.emails.slice(0, RET_MAX) : ['']);
  let w = null;
  const ler = () => { o.emails = Array.from(w.querySelectorAll('.ret-em-in')).map(i => i.value); };
  const pintar = () => {
    const n = o.emails.length;
    w = abrirModal('<div class="modal-head"><h2>' + esc(tx(o.recem ? 'ret_ok_tit' : o.reenvio ? 'ret_reenviar' : 'ret_enviar')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body">' +
      (o.recem ? '<div class="aviso gravado" style="margin:0 0 12px">' + svg(ICO.check, 16) + '<div><b>' + esc(o.numero) + '</b><br>' + esc(tx('tracking')) + ': ' + esc(o.trk) + (o.custo ? '<br>' + esc(tx('frete')) + ': ' + money(o.custo) : '') + '</div></div>' : '<p class="hint" style="margin-top:0">' + esc(o.numero + ' · ' + o.trk) + '</p>') +
      '<div class="field full"><label>' + esc(tx('ret_email_para')) + '</label>' + o.emails.map((v, i) => '<div class="ret-em-l"><input class="ret-em-in" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="name@store.com" value="' + esc(v) + '" aria-label="' + esc(tx('ret_email_para')) + '">' +
        (n > 1 ? '<button type="button" class="btn sm" data-rm="' + i + '" title="' + esc(tx('ret_email_tirar')) + '" aria-label="' + esc(tx('ret_email_tirar')) + '">' + svg(ICO.x, 14) + '</button>' : '') + '</div>').join('') +
      (n < RET_MAX ? '<button type="button" class="btn sm ret-em-mais" id="retEmMais">' + svg(ICO.mais, 14) + ' ' + esc(tx('ret_email_mais')) + '</button>' : '') + '</div></div>' +
      '<div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(tx(o.recem ? 'ret_agora_nao' : 'cancelar_bt')) + '</button><button class="btn primary" id="retEmailGo">' + svg(IC.carta, 15) + ' ' + esc(tx('ret_email_bt')) + '</button></div>', 'ret-modal');
    w.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { ler(); o.emails.splice(Number(b.dataset.rm), 1); pintar(); });
    const mais = w.querySelector('#retEmMais'); if (mais) mais.onclick = () => { ler(); o.emails.push(''); pintar(); };
    w.querySelector('#retEmailGo').onclick = () => { ler(); enviar(); };
    const L = w.querySelectorAll('.ret-em-in'), u = L[L.length - 1]; if (u) u.focus();
  };
  const enviar = async () => {
    if (o.enviando) return;
    const v = emailsLimpar(o.emails);
    if (v.ruins.length) return toast(tx('ret_email_ruim', { e: v.ruins.join(', ') }), 'bad');
    if (!v.bons.length) return toast(tx('ret_email_falta'), 'bad');
    if (v.bons.length > RET_MAX) return toast(tx('ret_email_max', { n: RET_MAX }), 'bad');
    o.enviando = true; const go = w.querySelector('#retEmailGo'); go.disabled = true; go.textContent = tx('ret_email_enviando');
    const id = 'MAIL-' + Date.now().toString(36); let x = null;
    try { await S.DB.set('shipq', id, { id, st: 'mail', kind: 'retmail', job: o.id, trk: o.trk, shp: o.numero, emails: v.bons, by: quem(), createdAt: agora() }); x = await esperar(id, ['maildone'], ['mailerr'], 30); }
    catch (er) { x = { st: 'mailerr', err: String(er.code || er.message) }; }
    const e = o.e || porKey(H.sel), para = v.bons.join(', ');
    if (x && x.st === 'maildone') {
      if (e) await addLog(e, { t: 'email', para, by: quem(), at: agora() });
      fecharModal(); toast(tx('ret_email_ok', { e: para }), 'good'); if (naTela()) repintarDet();
    } else {
      const err = x ? x.err || '' : tx('sem_resposta');
      if (e) await addLog(e, { t: 'email_falhou', para, err, by: quem(), at: agora() });
      o.enviando = false; if (go.isConnected) { go.disabled = false; go.innerHTML = svg(IC.carta, 15) + ' ' + esc(tx('ret_email_bt')); }
      toast(err || tx('falhou'), 'bad');
    }
  };
  pintar();
}

/* ====================  UPS 청구서 가져오기 (옛 modalImportarFaturas · rpc_fatura_ups_importar)  ====================
 *  Billing Center 의 "CSV: Full" (v2.1 · 머리줄 없음 · 250/270칸) — 한 줄 = 청구 하나 (운임 · 연료 · 할증 · 정정 ADJ · 청구서 수수료 MIS)
 *  칸(0부터): 5 청구서 · 11 출고일 · 13 lead(출고) · 20 운송장(박스) · 26 신고 무게 · 28 청구 무게 · 34 SHP/ADJ/RTN/MIS · 43 FRT/FSC/ACC/INF · 45 설명 · 51 할인 · 52 순 청구액 · 74~81 받는 곳
 *  앱: 운송장으로 shipments 박스 문서를 찾아 billInv[청구서#] 에 그 청구서의 금액을 넣음 (다시 가져와도 같은 칸을 덮어써 두 번 더해지지 않음 · 문서 통째로는 안 바꿈) */
export function csvLinhas(txt) {
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
const r2 = n => Math.round(n * 100) / 100;
/** 청구서 여러 개 → 출고(lead)별 · 박스(운송장)별 · 청구서별 금액 */
export function agruparFaturas(arquivos) {
  const env = {}, faturas = {}, erros = [];
  arquivos.forEach(a => {
    let ok = 0;
    csvLinhas(a.texto).forEach(r => {
      if (r.length < 90 || String(r[0]).slice(0, 2) !== '2.') return;
      ok++;
      const lead = String(r[13] || '').trim(); if (!lead) return;
      const inv = String(r[5] || '').replace(/^0+/, ''); faturas[inv] = 1;
      const e = env[lead] || (env[lead] = { lead, datas: [], trk: {}, ordem: [], net: 0, bruto: 0, adj: 0, faturas: {}, temShp: false, rec: null });
      e.faturas[inv] = 1;
      const net = Number(r[52]) || 0, inc = Number(r[51]) || 0, t = String(r[20] || '').trim() || lead;
      e.net += net; e.bruto += net + inc; if (r[34] === 'ADJ') e.adj += net;
      if (r[34] === 'SHP') { e.temShp = true; if (r[11]) e.datas.push(r[11]); }
      let p = e.trk[t]; if (!p) { p = e.trk[t] = { inv: {}, peso: 0, cobrado: 0 }; e.ordem.push(t); }
      const q = p.inv[inv] || (p.inv[inv] = { net: 0, gross: 0, adj: 0, w: 0 });
      q.net += net; q.gross += net + inc; if (r[34] === 'ADJ') q.adj += net;
      if (r[34] === 'SHP' && r[43] === 'FRT' && Number(r[26]) > 0) p.peso = Number(r[26]);   /* 신고 무게는 운임 줄에만 (연료 · 정보 줄은 0.0) */
      if (r[28]) { p.cobrado = Math.max(p.cobrado, Number(r[28]) || 0); q.w = Math.max(q.w, Number(r[28]) || 0); }
      if (!e.rec && (r[75] || r[74])) e.rec = { nome: r[74] || '', empresa: r[75] || '', cidade: r[78] || '', estado: r[79] || '', cep: String(r[80] || '').slice(0, 5) };
    });
    if (!ok) erros.push(a.nome);
  });
  const lista = Object.keys(env).map(k => { const e = env[k]; Object.keys(e.trk).forEach(t => Object.keys(e.trk[t].inv).forEach(i => { const q = e.trk[t].inv[i]; q.net = r2(q.net); q.gross = r2(q.gross); q.adj = r2(q.adj); })); return Object.assign(e, { net: r2(e.net), bruto: r2(e.bruto), adj: r2(e.adj), data: e.datas.slice().sort()[0] || '', faturas: Object.keys(e.faturas) }); })
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return { envios: lista, faturas: Object.keys(faturas).length, erros };
}
/** 박스 문서에 합칠 칸 — billInv 의 청구서별 금액을 더해 billNet · billGross · billAdj · billW */
export function somaBill(inv) { const v = Object.keys(inv || {}).map(k => inv[k]); return { billNet: r2(v.reduce((s, x) => s + (Number(x.net) || 0), 0)), billGross: r2(v.reduce((s, x) => s + (Number(x.gross) || 0), 0)), billAdj: r2(v.reduce((s, x) => s + (Number(x.adj) || 0), 0)), billW: Math.max(0, ...v.map(x => Number(x.w) || 0)) }; }
export function modalImportar() {
  if (!gerente()) return;
  let lidos = null;
  const w = abrirModal('<div class="modal-head"><h2>' + esc(tx('imp_tit')) + '</h2><button class="x" data-act="fechar-modal">' + svg(ICO.x, 17) + '</button></div><div class="modal-body"><p class="hint" style="margin-top:0">' + esc(tx('imp_txt')) + '</p>' +
    '<div class="field full"><label>' + esc(tx('imp_arquivos')) + '</label><input id="shImpArq" type="file" multiple accept=".csv,text/csv"></div><div id="shImpResumo" class="sh-imp-resumo"></div></div>' +
    '<div class="modal-foot"><button class="btn" data-act="fechar-modal">' + esc(tx('cancelar_bt')) + '</button><button class="btn primary" id="shImpGo" disabled>' + svg(ICO.entra, 15) + ' ' + esc(tx('imp_go')) + '</button></div>', 'sh-imp-modal');
  const res = w.querySelector('#shImpResumo'), go = w.querySelector('#shImpGo');
  w.querySelector('#shImpArq').onchange = async ev => {
    const files = Array.from(ev.target.files || []); if (!files.length) return;
    res.innerHTML = '<div class="graf-vazio">' + esc(L3('로딩 중…', 'Loading…', 'Carregando…')) + '</div>';
    const arqs = await Promise.all(files.map(f => new Promise(ok => { const rd = new FileReader(); rd.onload = () => ok({ nome: f.name, texto: String(rd.result || '') }); rd.onerror = () => ok({ nome: f.name, texto: '' }); rd.readAsText(f); })));
    lidos = agruparFaturas(arqs);
    const n = lidos.envios.length, tot = lidos.envios.reduce((s, e) => s + e.net, 0);
    res.innerHTML = (lidos.erros.length ? '<div class="aviso alerta">' + svg(ICO.ajuda, 16) + '<div>' + esc(tx('imp_erro_fmt', { f: lidos.erros.join(', ') })) + '</div></div>' : '') +
      (!n ? '<div class="graf-vazio">' + esc(tx('imp_nada')) + '</div>' : '<div class="aviso">' + svg(ICO.caixa, 16) + '<div><b>' + esc(tx('imp_resumo', { f: lidos.faturas, n })) + '</b><br>' + esc(tx('imp_periodo', { de: lidos.envios[0].data || '—', ate: lidos.envios[n - 1].data || '—', v: money(tot) })) + '</div></div>');
    go.disabled = !n; go.innerHTML = svg(ICO.entra, 15) + ' ' + esc(n ? tx('imp_go_n', { n }) : tx('imp_go'));
  };
  go.onclick = async () => {
    if (!lidos || !lidos.envios.length) return;
    go.disabled = true;
    const r = await importarFaturas(lidos.envios, (k, n) => { res.innerHTML = '<div class="graf-vazio">' + esc(tx('imp_lendo', { k, n })) + '</div>'; });
    res.innerHTML = '<div class="aviso gravado">' + svg(ICO.check, 16) + '<div><b>' + esc(tx('imp_ok', { m: r.casados, c: r.caixas, v: money(r.vCasado), u: r.sem.length, w: money(r.vSem) })) + '</b></div></div>' +
      '<div class="sh-imp-tot"><div><i>' + esc(L3('맞춘 출고', 'Matched shipments', 'Envios casados')) + '</i><b>' + r.casados + '</b></div><div><i>' + esc(L3('맞춘 금액', 'Matched amount', 'Valor casado')) + '</i><b>' + money(r.vCasado) + '</b></div><div><i>' + esc(L3('이력에 없음', 'Not in history', 'Sem envio')) + '</i><b>' + r.sem.length + '</b></div><div><i>' + esc(L3('이력에 없는 금액', 'Amount not in history', 'Valor sem envio')) + '</i><b>' + money(r.vSem) + '</b></div></div>' +
      (r.sem.length ? '<div class="hint" style="margin-top:8px">' + esc(tx('imp_sem')) + '</div><div class="sh-imp-sem">' + r.sem.slice(0, 60).map(s => '<span>' + esc([s.lead, s.empresa, [s.cidade, s.estado].filter(Boolean).join(' ')].filter(Boolean).join(' · ') + ' · ' + money(s.net)) + '</span>').join('') + (r.sem.length > 60 ? '<span>…</span>' : '') + '</div>' : '') +
      (r.erros ? '<div class="aviso alerta" style="margin-top:8px">' + svg(ICO.ajuda, 16) + '<div>' + esc(r.erros + ' ' + L3('개 저장 실패', 'failed to save', 'não gravaram')) + '</div></div>' : '');
    go.innerHTML = svg(ICO.check, 15) + ' ' + esc(tx('imp_feito'));
    H.chave = ''; await carregar(); if (naTela()) { const c = $('shCorpo'); if (c) { c.innerHTML = corpoHTML(); ligarCorpo(); } }
  };
}
/** 청구서 → 박스 문서 (운송장으로 찾음 · 박스가 없으면 lead 의 첫 박스로) — 결과: { casados, caixas, vCasado, sem:[…], vSem, erros } */
export async function importarFaturas(envios, prog) {
  const out = { casados: 0, caixas: 0, vCasado: 0, sem: [], vSem: 0, erros: 0 }, at = agora(), by = quem();
  for (let k = 0; k < envios.length; k++) {
    if (prog && k % 20 === 0) prog(k + 1, envios.length);
    const e = envios[k], docs = {};
    await Promise.all(e.ordem.concat([e.lead]).map(async t => { if (docs[t] !== undefined) return; docs[t] = null; try { docs[t] = await S.DB.get('shipments', t); } catch (er) {} }));
    const achados = e.ordem.filter(t => docs[t]), leadDoc = docs[e.lead] || (achados.length ? docs[achados[0]] : null);
    if (!leadDoc) { out.sem.push({ lead: e.lead, empresa: (e.rec && (e.rec.empresa || e.rec.nome)) || '', cidade: (e.rec && e.rec.cidade) || '', estado: (e.rec && e.rec.estado) || '', net: e.net }); out.vSem += e.net; continue; }
    /* 박스별로 모음 — 이력에 없는 운송장(정정 · lead 줄)의 금액은 lead 박스로 */
    const alvo = {};
    e.ordem.forEach(t => { const d = docs[t] || leadDoc, id = d.id || d.trk; const A = alvo[id] || (alvo[id] = { d, inv: {} }); Object.keys(e.trk[t].inv).forEach(i => { const s = e.trk[t].inv[i], q = A.inv[i] || (A.inv[i] = { net: 0, gross: 0, adj: 0, w: 0 }); q.net = r2(q.net + s.net); q.gross = r2(q.gross + s.gross); q.adj = r2(q.adj + s.adj); q.w = Math.max(q.w, s.w); }); });
    for (const id of Object.keys(alvo)) {
      const A = alvo[id], inv = Object.assign({}, A.d.billInv || {}, A.inv), patch = Object.assign({ billInv: inv, billAt: at, billBy: by }, somaBill(inv));
      try {
        if (id === (leadDoc.id || leadDoc.trk)) patch.log = (A.d.log || []).concat([{ t: 'fatura', f: e.faturas.join(', '), v: e.net, by, at }]);
        await S.DB.update('shipments', id, patch); out.caixas++;
      } catch (er) { out.erros++; }
    }
    out.casados++; out.vCasado = r2(out.vCasado + e.net);
  }
  out.vSem = r2(out.vSem);
  return out;
}
