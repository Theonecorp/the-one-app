/* ============================================================
   Agente de impressão — THE ONE CORP
   Roda no Windows do estoque, 24 horas. Fica olhando a fila no
   Supabase e manda cada etiqueta para a TSC em TSPL.
   Não usa nenhuma biblioteca: só Node 18 ou mais novo.
   ============================================================ */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import crypto from 'crypto';

const VERSAO = 'app-2026-11-13a';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(fs.readFileSync(path.join(AQUI, 'config.json'), 'utf8'));
const LOG = path.join(AQUI, 'agente.log');

function log(...p) {
  const linha = new Date().toISOString().slice(0, 19).replace('T', ' ') + '  ' + p.join(' ');
  console.log(linha);
  try { fs.appendFileSync(LOG, linha + '\n'); } catch (e) {}
}

/* Este agente imprime? No PC que so tem leitor, nao.

   Ausente ou true = como sempre foi; quem ja imprime nao precisa mexer no
   config. O PC do leitor poe false e simplesmente nao PEDE trabalho. */
const IMPRIME = CFG.imprimir !== false;

/* Onde este agente esta.

   Ate 08/09/2026 a fila nao distinguia um agente do outro: rpc_impressao_pegar
   olhava status='pendente' e entregava para quem pedisse primeiro. Com uma
   impressora so, bastava. Com DUAS Zebras em DOIS Windows, a etiqueta sai na
   sala errada — e sem erro nenhum, porque para a fila o trabalho foi entregue.

   O job carrega o TIPO de impressora ('grande'/'pequena'), que e o que a
   etiqueta E. A estacao e ONDE ela deve sair.

   Sem 'estacao' no config, este agente so pega trabalho que tambem nao tem
   estacao — nunca rouba o que foi endereçado a outro PC. Com um PC so,
   deixar em branco continua sendo o certo. */
const ESTACAO = (CFG.estacao || '').trim() || null;

function conferirConfig() {
  const faltando = [];
  /* o modelo ja usou 'COLE-AQUI-...' e hoje usa 'PREENCHER-...'. Aceitar so
     um dos dois fazia o agente tentar entrar com o texto do proprio modelo e
     morrer com 'login recusado' — mensagem que nao diz o que fazer. */
  const emBranco = v => !v || /^(COLE|PREENCHER)/i.test(String(v));
  if (emBranco(CFG.firebase_api_key)) faltando.push('firebase_api_key');
  if (emBranco(CFG.firebase_projeto)) faltando.push('firebase_projeto');
  if (emBranco(CFG.google_client_id)) faltando.push('google_client_id');
  /* so-leitor nao tem impressora nenhuma, e exigir uma impedia o agente
     de subir no PC da bancada */
  if (IMPRIME && !CFG.impressora) faltando.push('impressora');
  if (faltando.length) {
    log('PARE: falta preencher no config.json:', faltando.join(', '));
    process.exit(1);
  }
  /* nem imprime nem le: o agente subiria e ficaria olhando para o teto.
     Isso e sempre engano no config, e calado custa caro — melhor parar */
  if (!IMPRIME && !leitorCfg().ligado) {
    log('PARE: nada para fazer — "imprimir" esta false e o leitor esta desligado.');
    log('      Ligue um dos dois: "imprimir": true, ou "leitor": { "ligado": true }.');
    process.exit(1);
  }
}

/* ---------------- Firebase (THE ONE APP) ----------------

   O sistema antigo falava com o Supabase por usuario e senha. O THE ONE APP
   usa o Firebase, e as regras dele (firestore.rules) so confiam em LOGIN DO
   GOOGLE — usuario e senha nao entram, de proposito (ninguem se passa por
   gerente criando uma conta com o e-mail dele).

   Entao o agente entra com uma CONTA GOOGLE so dele (ex.: impressora@...),
   cadastrada no app como gerente (manager) com o trabalho 'agente'. Isso se
   faz UMA VEZ, no PC, com o entrar-google.bat: abre o navegador, a pessoa
   escolhe a conta, e fica guardado um "refresh token" no login-google.json
   (que, como o config.json, nao vai para o GitHub). Dai em diante o agente
   renova sozinho, sem ninguem digitar nada.

   As funcoes de fila mantem os nomes das antigas (rpc_impressao_pegar,
   _feita, _erro, _agente_vivo) para o resto do agente nao mudar nada. */
const FB_KEY = () => CFG.firebase_api_key;
const FS_BASE = () => (CFG.firestore_url || 'https://firestore.googleapis.com/v1') + '/projects/' + CFG.firebase_projeto + '/databases/(default)/documents';
const URL_GOOGLE_TOKEN = () => CFG.google_token_url || 'https://oauth2.googleapis.com/token';
const URL_IDP = () => (CFG.identity_url || 'https://identitytoolkit.googleapis.com/v1') + '/accounts:signInWithIdp?key=' + encodeURIComponent(FB_KEY());
const ARQ_LOGIN = path.join(AQUI, 'login-google.json');
let TOKEN = null, EXPIRA = 0, EMAIL = '';

function lerLogin() { try { return JSON.parse(fs.readFileSync(ARQ_LOGIN, 'utf8')); } catch (e) { return null; } }

async function entrar() {
  const L = lerLogin();
  if (!L || !L.refresh_token) throw new Error('falta entrar com a conta Google do agente — rode o entrar-google.bat uma vez');
  /* 1. o Google troca o refresh token por um id_token novo */
  const r1 = await fetch(URL_GOOGLE_TOKEN(), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: L.refresh_token, client_id: CFG.google_client_id, client_secret: CFG.google_client_secret || '' }).toString()
  });
  const g = await r1.json().catch(function () { return {}; });
  if (!r1.ok || !g.id_token) throw new Error('login recusado pelo Google: ' + (g.error_description || g.error || r1.status) + ' — rode o entrar-google.bat de novo');
  /* 2. o Firebase troca o id_token do Google por um login do app (provedor google.com — o que as regras aceitam) */
  const r2 = await fetch(URL_IDP(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: 'id_token=' + g.id_token + '&providerId=google.com', requestUri: 'http://localhost', returnSecureToken: true, returnIdpCredential: true })
  });
  const d = await r2.json().catch(function () { return {}; });
  if (!r2.ok || !d.idToken) throw new Error('login recusado pelo Firebase: ' + ((d.error && d.error.message) || r2.status));
  TOKEN = d.idToken; EMAIL = d.email || L.email || '';
  EXPIRA = Date.now() + ((Number(d.expiresIn) || 3600) - 120) * 1000;
  log('conectado como', EMAIL);
}

async function renovar() { if (!TOKEN || Date.now() >= EXPIRA) await entrar(); }

/* ---- valores do Firestore (REST) <-> JS ---- */
function paraFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraFs) } };
  const f = {}; Object.keys(v).forEach(function (k) { f[k] = paraFs(v[k]); }); return { mapValue: { fields: f } };
}
function deFs(x) {
  if (!x) return null;
  if ('stringValue' in x) return x.stringValue;
  if ('integerValue' in x) return Number(x.integerValue);
  if ('doubleValue' in x) return x.doubleValue;
  if ('booleanValue' in x) return x.booleanValue;
  if ('nullValue' in x) return null;
  if ('timestampValue' in x) return x.timestampValue;
  if ('arrayValue' in x) return (x.arrayValue.values || []).map(deFs);
  if ('mapValue' in x) return campos(x.mapValue.fields);
  return null;
}
function campos(f) { const o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = deFs(f[k]); }); return o; }

async function fsPedir(metodo, url, corpo) {
  await renovar();
  const r = await fetch(url, { method: metodo, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text();
  let d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (r.status === 401) TOKEN = null;
  return { ok: r.ok, status: r.status, d: d, txt: txt };
}
/* grava SO os campos dados (updateMask); com updateTime, so se ninguem mexeu no documento desde que lemos */
async function fsGravar(col, id, dados, updateTime) {
  const ks = Object.keys(dados);
  const q = ks.map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&')
    + (updateTime ? '&currentDocument.updateTime=' + encodeURIComponent(updateTime) : '');
  const f = {}; ks.forEach(function (k) { f[k] = paraFs(dados[k]); });
  return fsPedir('PATCH', FS_BASE() + '/' + col + '/' + encodeURIComponent(id) + '?' + q, { fields: f });
}
async function fsBuscar(col, filtros, limite) {
  const r = await fsPedir('POST', FS_BASE() + ':runQuery', { structuredQuery: {
    from: [{ collectionId: col }],
    where: { compositeFilter: { op: 'AND', filters: filtros.map(function (w) { return { fieldFilter: { field: { fieldPath: w[0] }, op: 'EQUAL', value: paraFs(w[1]) } }; }) } },
    limit: limite || 50 } });
  if (!r.ok) throw new Error(col + ': ' + r.status + ' ' + String(r.txt).slice(0, 200));
  return (r.d || []).filter(function (x) { return x.document; }).map(function (x) {
    return { id: x.document.name.split('/').pop(), updateTime: x.document.updateTime, dados: campos(x.document.fields) };
  });
}

/* ---- a fila (printJobs) ---- */
const TENTATIVAS = 3;          /* a primeira + mais duas, como no sistema antigo */
const PRESO_MS = 3 * 60000;    /* 'imprimindo' ha mais que isso = o agente caiu no meio; volta para quem pedir */
const PEGOS = new Map();       /* id -> tentativas, para o rpc_impressao_erro saber a conta */

async function pegar(limite, estacao) {
  const est = estacao || '';
  const pend = await fsBuscar('printJobs', [['st', 'pendente'], ['estacao', est]], 50);
  const presos = (await fsBuscar('printJobs', [['st', 'imprimindo'], ['estacao', est]], 50))
    .filter(function (j) { return Date.now() - Date.parse(j.dados.pegoEm || 0) > PRESO_MS; });
  const L = pend.concat(presos).sort(function (a, b) { return String(a.dados.em || '').localeCompare(String(b.dados.em || '')); }).slice(0, limite || 5);
  const meus = [];
  for (const j of L) {
    /* pega so se ninguem pegou antes: a gravacao exige o mesmo updateTime que lemos.
       Dois agentes no mesmo instante — um ganha, o outro recebe 'precondition' e segue */
    const r = await fsGravar('printJobs', j.id, { st: 'imprimindo', agente: MAQUINA, pegoEm: new Date().toISOString() }, j.updateTime);
    if (!r.ok) continue;
    PEGOS.set(j.id, Number(j.dados.tentativas) || 0);
    meus.push({ id: j.id, tipo: j.dados.tipo, titulo: j.dados.titulo, copias: Number(j.dados.copias) || 1, impressora: j.dados.impressora, estacao: j.dados.estacao, dados: j.dados.dados || {} });
  }
  return meus;
}

async function rpc(nome, args) {
  args = args || {};
  if (nome === 'rpc_impressao_pegar') return pegar(args.p_limite, args.p_estacao);
  if (nome === 'rpc_impressao_feita') {
    PEGOS.delete(args.p_id);
    const r = await fsGravar('printJobs', args.p_id, { st: 'feito', feitoEm: new Date().toISOString(), agente: String(args.p_agente || MAQUINA).slice(0, 300) });
    if (!r.ok) throw new Error(nome + ': ' + r.status + ' ' + String(r.txt).slice(0, 200));
    return true;
  }
  if (nome === 'rpc_impressao_erro') {
    const n = (PEGOS.get(args.p_id) || 0) + 1; PEGOS.delete(args.p_id);
    const r = await fsGravar('printJobs', args.p_id, { st: n >= TENTATIVAS ? 'erro' : 'pendente', tentativas: n, erro: String(args.p_erro || '').slice(0, 300) });
    if (!r.ok) throw new Error(nome + ': ' + r.status + ' ' + String(r.txt).slice(0, 200));
    return true;
  }
  if (nome === 'rpc_impressao_agente_vivo') {
    const id = String(args.p_maquina || MAQUINA).replace(/[\/\s]+/g, '_').slice(0, 80) || 'sem-nome';
    const r = await fsGravar('printAgents', id, { maquina: String(args.p_maquina || ''), estacao: args.p_estacao || '', versao: String(args.p_versao || ''),
      impressoras: args.p_impressoras || null, imprime: args.p_imprime !== false, email: EMAIL, em: new Date().toISOString() });
    if (!r.ok) throw new Error(nome + ': ' + r.status + ' ' + String(r.txt).slice(0, 200));
    return true;
  }
  /* sem servidor de versoes no THE ONE APP: o agente se atualiza copiando a pasta nova (LEIA-ME) */
  if (nome === 'rpc_agente_codigo') return null;
  /* o leitor (bipou, baixou) dava baixa no estoque do sistema antigo pelo banco. No THE ONE APP
     isso ainda nao foi ligado */
  if (/^rpc_baixar_/.test(nome)) throw new Error('leitor ainda nao ligado ao THE ONE APP');
  throw new Error('funcao desconhecida: ' + nome);
}

/* ---- entrar-google.bat: login da conta Google do agente, uma vez ---- */
async function entrarGoogle() {
  if (!CFG.google_client_id) { log('PARE: falta "google_client_id" no config.json (o administrador cria no Google Cloud — ver LEIA-ME)'); process.exit(1); }
  const http = await import('http');
  const estado = crypto.randomBytes(12).toString('hex');
  const verif = crypto.randomBytes(32).toString('base64url');
  const desafio = crypto.createHash('sha256').update(verif).digest('base64url');
  const srv = http.createServer();
  await new Promise(function (ok) { srv.listen(0, '127.0.0.1', ok); });
  const volta = 'http://127.0.0.1:' + srv.address().port;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: CFG.google_client_id, redirect_uri: volta, response_type: 'code',
    scope: 'openid email', access_type: 'offline', prompt: 'consent', state: estado, code_challenge: desafio, code_challenge_method: 'S256' }).toString();
  log('Abrindo o navegador para entrar com a conta Google DO AGENTE (nao a sua pessoal).');
  log('Se nao abrir, copie este endereco no navegador:'); log(url);
  try { execFile('cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]); } catch (e) {}
  const codigo = await new Promise(function (ok, erro) {
    srv.on('request', function (q, s) {
      const u = new URL(q.url, volta);
      if (u.searchParams.get('state') !== estado) { s.end(); return; }
      s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      s.end('<h2>Pronto. Pode fechar esta janela e voltar ao agente.</h2>');
      const c = u.searchParams.get('code'); if (c) ok(c); else erro(new Error(u.searchParams.get('error') || 'sem codigo'));
    });
    setTimeout(function () { erro(new Error('tempo esgotado (5 min)')); }, 300000);
  });
  srv.close();
  const r = await fetch(URL_GOOGLE_TOKEN(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: codigo, redirect_uri: volta, client_id: CFG.google_client_id, client_secret: CFG.google_client_secret || '', code_verifier: verif }).toString() });
  const d = await r.json().catch(function () { return {}; });
  if (!r.ok || !d.refresh_token) { log('PARE: o Google nao devolveu o acesso:', d.error_description || d.error || r.status); process.exit(1); }
  let email = '';
  try { email = JSON.parse(Buffer.from(String(d.id_token).split('.')[1], 'base64url').toString()).email || ''; } catch (e) {}
  fs.writeFileSync(ARQ_LOGIN, JSON.stringify({ refresh_token: d.refresh_token, email: email, em: new Date().toISOString() }, null, 2));
  log('OK — conta guardada:', email || '(sem e-mail)', '— agora rode o iniciar.bat');
  await entrar();
  log('teste do Firebase: OK');
}

/* ---------------- TSPL ---------------- */
const mm = (v) => Math.round((Number(v) || 0) * (CFG.dpi || 300) / 25.4);
const lim = (s, n) => String(s == null ? '' : s).replace(/["\\]/g, ' ').slice(0, n);
/* As fontes internas da TSC tem tamanho fixo em pontos. Numa 300 dpi elas
   saem com metade do tamanho de uma 203 dpi — por isso o multiplicador
   acompanha a resolucao. */
const ESC = (CFG.dpi || 300) >= 300 ? 2 : 1;
const txt = (x, y, fonte, mult, conteudo, limite) => {
  const m = Math.max(1, Math.round((mult || 1) * ESC));
  return 'TEXT ' + mm(x) + ',' + mm(y) + ',"' + fonte + '",0,' + m + ',' + m + ',"' + lim(conteudo, limite || 40) + '"';
};

function cabecalho(tam) {
  return [
    'SIZE ' + tam.largura_mm + ' mm,' + tam.altura_mm + ' mm',
    'GAP ' + (tam.gap_mm == null ? 2 : tam.gap_mm) + ' mm,0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CLS'
  ];
}

/* etiqueta de produto — 2,25 x 1,25 pol */
function tsplProduto(d, tam) {
  const L = cabecalho(tam);
  const larg = Number(tam.largura_mm) || 57.1;
  L.push(txt(3, 2, '1', 1, d.marca || 'THE ONE CORP', 24));
  L.push(txt(3, 6, '3', 2, d.codigo || d.sku, 14));
  if (d.nome) L.push(txt(3, 15, '2', 1, d.nome, 26));
  if (d.corredor) L.push(txt(larg - 14, 2, '2', 1, d.corredor, 6));
  if (d.barcode) L.push('BARCODE ' + mm(3) + ',' + mm(20) + ',"128",' + mm(7) + ',1,0,2,4,"' + lim(d.barcode, 40) + '"');
  return L;
}

/* etiqueta de caixa — 6 x 4 pol DEITADA (152,4 x 101,6 mm) */
function tsplCaixa(d, tam) {
  const L = cabecalho(tam);
  const alt = Number(tam.altura_mm) || 101.6;
  const larg = Number(tam.largura_mm) || 152.4;
  const colQr = larg - 42;          /* o QR mora na direita */

  L.push(txt(6, 5, '2', 1, d.marca || 'THE ONE CORP', 30));
  L.push(txt(6, 12, '4', 2, d.codigo, 16));                 /* o codigo e o que se le de longe */
  if (d.nome) L.push(txt(6, 34, '3', 1, d.nome, 24));
  if (d.descricao) L.push(txt(6, 46, '2', 1, d.descricao, 40));
  if (d.corredor) L.push(txt(6, 56, '4', 1, 'CORREDOR ' + d.corredor, 18));

  if (d.qr) L.push('QRCODE ' + mm(colQr) + ',' + mm(6) + ',M,' + Math.max(5, Math.round(mm(1.1))) + ',A,0,"' + lim(d.qr, 180) + '"');

  /* codigo de barras rente ao rodape, com folga para os digitos embaixo */
  if (d.barcode) {
    const hBar = 14, yBar = alt - hBar - 12;
    L.push('BARCODE ' + mm(6) + ',' + mm(yBar) + ',"128",' + mm(hBar) + ',1,0,3,6,"' + lim(d.barcode, 40) + '"');
  }
  if (d.rodape) L.push(txt(6, alt - 6, '1', 1, d.rodape, 46));
  return L;
}

/* recibo simples de separação */
function tsplRecibo(d, tam) {
  const L = cabecalho(tam);
  const fim = Number(tam.altura_mm) - 14;   /* reserva o rodape pro codigo de barras */
  let y = 4, cortou = 0;
  L.push(txt(3, y, '3', 1, d.titulo || 'SEPARACAO', 28)); y += 8;
  const linhas = d.linhas || [];
  for (let i = 0; i < linhas.length; i++) {
    if (y + 5 > fim) { cortou = linhas.length - i; break; }
    L.push(txt(3, y, '2', 1, linhas[i], 40)); y += 5;
  }
  if (cortou) { L.push(txt(3, y, '2', 1, '+ ' + cortou + ' item(s)', 20)); y += 5; }
  if (d.barcode && y + 10 <= Number(tam.altura_mm)) {
    L.push('BARCODE ' + mm(3) + ',' + mm(y + 2) + ',"128",' + mm(8) + ',1,0,2,4,"' + lim(d.barcode, 40) + '"');
  }
  return L;
}

function montarTSPL(job) {
  const tams = CFG.etiquetas || {};
  const tam = tams[job.tipo] || tams.etiqueta_produto || { largura_mm: 57.1, altura_mm: 31.7, gap_mm: 2 };
  const d = job.dados || {};
  let linhas;
  if (job.tipo === 'etiqueta_caixa') linhas = tsplCaixa(d, tam);
  else if (job.tipo === 'recibo') linhas = tsplRecibo(d, tam);
  else linhas = tsplProduto(d, tam);
  linhas.push('PRINT ' + Math.max(1, Number(job.copias) || 1) + ',1');
  return linhas.join('\r\n') + '\r\n';
}

/* ---------------- Windows: manda cru pro spooler ---------------- */
const PS_RAW = `
param([string]$Arquivo, [string]$Impressora)
Add-Type @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void Enviar(string impressora, byte[] bytes) {
    IntPtr h; int escritos = 0;
    if (!OpenPrinter(impressora, out h, IntPtr.Zero)) throw new Exception("nao abriu a impressora: " + impressora);
    DOCINFO di = new DOCINFO(); di.pDocName = "ONECORP"; di.pDataType = "RAW";
    try {
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter falhou");
      if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter falhou");
      IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
      try { Marshal.Copy(bytes, 0, p, bytes.Length);
            if (!WritePrinter(h, p, bytes.Length, out escritos)) throw new Exception("WritePrinter falhou"); }
      finally { Marshal.FreeCoTaskMem(p); }
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@
[RawPrinter]::Enviar($Impressora, [System.IO.File]::ReadAllBytes($Arquivo))
`;

const PS_ARQ = path.join(os.tmpdir(), 'onecorp-raw.ps1');

function imprimirCru(texto, alvo) {
  return new Promise(function (ok, erro) {
    /* Desvio de teste: grava o que SERIA enviado, em vez de imprimir.

       Ate 08/09/2026 a condicao era so `process.platform !== 'win32'`, e isso
       tinha dois efeitos ruins no Windows: o teste 14 nunca gerava o arquivo
       que ele mesmo le depois (falhava com ENOENT), e — pior — mandava o
       trabalho para a impressora DE VERDADE. Um job de 4 KB foi parar na fila
       da Zebra durante a rodada da suite. Quem manda agora e a variavel
       ONECORP_SAIDA; sem ela, o comportamento nos dois sistemas e o de antes. */
    const arquivoTeste = process.env.ONECORP_SAIDA
      || (process.platform !== 'win32' ? path.join(AQUI, 'saida-teste.tspl') : null);
    if (arquivoTeste) {
      fs.appendFileSync(arquivoTeste, texto);
      return ok('gravado em ' + arquivoTeste + ' (modo teste)');
    }
    fs.writeFileSync(PS_ARQ, PS_RAW, 'utf8');
    const dados = path.join(os.tmpdir(), 'onecorp-' + Date.now() + '.prn');
    fs.writeFileSync(dados, texto, 'binary');
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_ARQ, '-Arquivo', dados, '-Impressora', alvo || CFG.impressora],
      { timeout: 30000 },
      function (e, saida, err) {
        try { fs.unlinkSync(dados); } catch (x) {}
        if (e) return erro(new Error((err || e.message || '').toString().trim().slice(0, 300)));
        ok('enviado');
      });
  });
}

/* ---------------- Edge: imprime a etiqueta do site tal como ela e ----------------
   O site manda a propria pagina da etiqueta. O Edge abre e imprime na
   impressora padrao do Windows. Assim o que sai no papel e exatamente o
   que aparece na tela — nao existe segundo desenho para divergir. */
const EDGES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

function acharEdge() {
  const doAmbiente = process.env.ONECORP_EDGE;
  if (doAmbiente && fs.existsSync(doAmbiente)) return doAmbiente;
  if (CFG.edge && fs.existsSync(CFG.edge)) return CFG.edge;
  for (const p of EDGES) if (fs.existsSync(p)) return p;
  return null;
}

/* O Edge sempre imprime na impressora PADRAO do Windows — nao existe
   parametro de linha de comando para escolher outra. Entao, ao iniciar,
   o agente torna a impressora do config.json a padrao da maquina. */
function psRodar(cmd, tempo) {
  return new Promise(function (ok, erro) {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
      { timeout: tempo || 20000 }, function (e, saida, err) {
        if (e) return erro(new Error((err || e.message || '').toString().trim().slice(0, 300)));
        ok(String(saida || '').trim());
      });
  });
}

/* O site manda um apelido ("grande" / "pequena"), nao o nome da fila do
   Windows. O de-para fica aqui no config, entao trocar de impressora nao
   exige publicar o site de novo. */
const APELIDOS = ['grande', 'pequena'];
const AVISADOS = {};

function impressoraDo(job) {
  const mapa = CFG.impressoras || {};
  const apelido = job && job.impressora ? String(job.impressora) : '';
  if (apelido && mapa[apelido]) return mapa[apelido];
  if (apelido && APELIDOS.indexOf(apelido) >= 0) {
    /* o site pediu um apelido que nao existe no config: nao inventamos
       impressora, usamos a principal e dizemos o que falta arrumar */
    if (!AVISADOS[apelido]) {
      AVISADOS[apelido] = 1;
      log('ATENCAO: o site pediu "' + apelido + '" mas isso nao esta no bloco "impressoras" do config.json.');
      log('         Usando ' + CFG.impressora + ' por enquanto. Acrescente no config.json:');
      log('         "impressoras": { "grande": "Zebra", "pequena": "TSC RAW" },');
    }
    return CFG.impressora;
  }
  if (apelido) return apelido;            /* veio o nome da fila direto */
  if (mapa[job && job.tipo]) return mapa[job.tipo];
  return CFG.impressora;
}

let PADRAO_ATUAL = '';

/* Nao exigimos o nome exato da fila. Basta um pedaco ("Zebra", "TSC"):
   procuramos primeiro o nome igual, depois o que contem o pedaco, e entre
   varios preferimos o que esta numa porta USB — as filas velhas costumam
   ficar penduradas em LPT1 e nao imprimem nada. */
async function definirPadrao(alvo) {
  if (process.platform !== 'win32') return '(nao e Windows)';
  const nome = String(alvo || CFG.impressora).replace(/'/g, "''");
  const cmd = [
    "$alvo = '" + nome + "'",
    "$todas = Get-CimInstance -Class Win32_Printer",
    "$p = $todas | Where-Object { $_.Name -eq $alvo } | Select-Object -First 1",
    "if (-not $p) {",
    "  $c = @($todas | Where-Object { $_.Name -like ('*' + $alvo + '*') })",
    "  $usb = @($c | Where-Object { $_.PortName -like 'USB*' })",
    "  if ($usb.Count -gt 0) { $p = $usb[0] } elseif ($c.Count -gt 0) { $p = $c[0] }",
    "}",
    "if (-not $p) { Write-Error ('impressora nao encontrada: ' + $alvo); exit 1 }",
    "Invoke-CimMethod -InputObject $p -MethodName SetDefaultPrinter | Out-Null",
    "$p.Name"
  ].join('; ');
  let virou;
  try {
    virou = await psRodar(cmd);
  } catch (e) {
    /* o PowerShell devolve o script inteiro no erro; nao serve para nada */
    throw new Error('nao achei nenhuma impressora com "' + nome + '" no Windows — confira o nome com Get-Printer');
  }
  PADRAO_ATUAL = virou || nome;
  return virou;
}

/* so troca quando muda de verdade: mexer no padrao a cada etiqueta e lento */
let PEDIDO_ATUAL = '';

async function garantirPadrao(alvo) {
  if (!alvo) return '';
  if (process.platform !== 'win32') return String(alvo);
  if (PEDIDO_ATUAL === String(alvo)) return PADRAO_ATUAL;   /* ja e essa, nao mexe */
  const virou = await definirPadrao(alvo);
  PEDIDO_ATUAL = String(alvo);
  log('padrao do Windows ->', virou || alvo);
  return virou || String(alvo);
}

/* O Edge guarda no perfil a ultima impressora que usou e volta a usar
   ela, mesmo depois de o Windows mudar de padrao. Por isso cada impressora
   ganha o seu proprio perfil: assim o que ficou guardado nunca aponta
   para a impressora errada. */
function perfilDe(fila) {
  const limpo = String(fila || 'padrao').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
  return path.join(AQUI, '_edge', limpo);
}

function imprimirPagina(html, fila) {
  return new Promise(function (ok, erro) {
    const arq = path.join(os.tmpdir(), 'onecorp-etq-' + Date.now() + '.html');
    fs.writeFileSync(arq, html, 'utf8');
    if (process.platform !== 'win32') {
      const alvo = path.join(AQUI, 'saida-teste.html');
      fs.writeFileSync(alvo, html);
      return ok('gravado em ' + alvo + ' (nao e Windows)');
    }
    const edge = acharEdge();
    if (!edge) return erro(new Error('nao achei o Microsoft Edge; aponte o caminho no config.json em "edge"'));

    const perfil = perfilDe(fila);
    const p = execFile(edge, [
      '--user-data-dir=' + perfil,
      '--kiosk-printing',
      '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-sync',
      '--window-position=-32000,-32000', '--window-size=900,700',
      'file:///' + arq.replace(/\\/g, '/')
    ], { timeout: 45000 }, function (e) {
      try { fs.unlinkSync(arq); } catch (x) {}
      /* o Edge fecha sozinho depois de imprimir; se estourar o tempo,
         encerramos e seguimos — o papel ja saiu */
      ok('impresso pelo Edge');
    });
    setTimeout(function () { try { p.kill(); } catch (x) {} }, 20000);
  });
}

/* ---------------- laço principal ---------------- */
let parando = false;
['SIGINT', 'SIGTERM'].forEach(function (s) {
  process.on(s, function () { parando = true; log('encerrando…'); try { leitorFechar(); } catch (e) {} setTimeout(function () { process.exit(0); }, 300); });
});


/* ============================================================
   Caminho da IMAGEM — o que realmente coloca tinta no papel.
   Pedir para o Edge imprimir depende de driver, impressora padrão
   e do diálogo do Windows; qualquer um deles pode engolir o
   trabalho em silêncio. Então só pedimos ao Edge uma FOTO da
   etiqueta e mandamos essa foto direto para a impressora, em ZPL
   na Zebra e em TSPL na TSC. É o mesmo caminho RAW que já imprimiu
   antes, e o desenho é o do site, pixel por pixel.
   ============================================================ */

function pngParaBits(buf, limiar) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('a foto nao saiu em PNG');
  let p = 8, larg = 0, alt = 0, prof = 0, cor = 0, inter = 0, paleta = null;
  const pedacos = [];
  while (p < buf.length) {
    const tam = buf.readUInt32BE(p), tipo = buf.toString('ascii', p + 4, p + 8);
    const dado = buf.subarray(p + 8, p + 8 + tam);
    if (tipo === 'IHDR') {
      larg = dado.readUInt32BE(0); alt = dado.readUInt32BE(4);
      prof = dado[8]; cor = dado[9]; inter = dado[12];
    } else if (tipo === 'PLTE') paleta = Buffer.from(dado);
    else if (tipo === 'IDAT') pedacos.push(Buffer.from(dado));
    else if (tipo === 'IEND') break;
    p += 12 + tam;
  }
  if (prof !== 8) throw new Error('so sei ler PNG de 8 bits (veio ' + prof + ')');
  if (inter) throw new Error('PNG entrelacado nao serve');
  const canais = cor === 6 ? 4 : cor === 2 ? 3 : cor === 4 ? 2 : 1;
  const bruto = zlib.inflateSync(Buffer.concat(pedacos));
  const linha = larg * canais;
  const img = Buffer.alloc(alt * linha);
  let ant = Buffer.alloc(linha);
  for (let y = 0, q = 0; y < alt; y++) {
    const filtro = bruto[q++];
    const atual = bruto.subarray(q, q + linha); q += linha;
    const saida = img.subarray(y * linha, (y + 1) * linha);
    for (let i = 0; i < linha; i++) {
      const a = i >= canais ? saida[i - canais] : 0, b = ant[i],
        c = i >= canais ? ant[i - canais] : 0, x = atual[i];
      let v;
      if (filtro === 0) v = x;
      else if (filtro === 1) v = x + a;
      else if (filtro === 2) v = x + b;
      else if (filtro === 3) v = x + ((a + b) >> 1);
      else {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      saida[i] = v & 255;
    }
    ant = saida;
  }
  const lim = limiar == null ? 128 : limiar;
  const bytesLinha = Math.ceil(larg / 8);
  const bits = Buffer.alloc(bytesLinha * alt, 0);   /* 1 = preto */
  for (let y = 0; y < alt; y++) {
    for (let x = 0; x < larg; x++) {
      const i = y * linha + x * canais;
      let cinza, alfa = 255;
      if (cor === 3) { const k = img[i] * 3; cinza = (paleta[k] * 299 + paleta[k + 1] * 587 + paleta[k + 2] * 114) / 1000; }
      else if (cor === 0) cinza = img[i];
      else if (cor === 4) { cinza = img[i]; alfa = img[i + 1]; }
      else { cinza = (img[i] * 299 + img[i + 1] * 587 + img[i + 2] * 114) / 1000; if (cor === 6) alfa = img[i + 3]; }
      if (alfa < 128) cinza = 255;
      if (cinza < lim) bits[y * bytesLinha + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { larg: larg, alt: alt, bytesLinha: bytesLinha, bits: bits };
}

/* quantas etiquetas vêm na página e de que tamanho */
function medidasDaPagina(html) {
  const m = String(html).match(/@page\{size:([0-9.]+)in ([0-9.]+)in/);
  let n = (String(html).match(/class="etq-pag"/g) || []).length;
  if (!n) n = (String(html).match(/class="etq[cgpz]"/g) || []).length || 1;
  return {
    pol_larg: m ? parseFloat(m[1]) : 4,
    pol_alt: m ? parseFloat(m[2]) : 6,
    paginas: Math.max(1, Math.min(n, 20))
  };
}

/* Falamos com o navegador pelo protocolo de depuração. O parâmetro de
   escala da linha de comando deforma o desenho; por aqui pedimos o
   tamanho em CSS e a ampliação separadamente, e a foto sai no ponto. */
function cdpEsperar(porta, ate) {
  return new Promise(function (ok, erro) {
    (function tentar() {
      fetch('http://127.0.0.1:' + porta + '/json/version')
        .then(function (r) { return r.json(); })
        .then(function (d) { ok(d.webSocketDebuggerUrl); })
        .catch(function () {
          if (Date.now() > ate) return erro(new Error('o navegador nao abriu a porta de depuracao'));
          setTimeout(tentar, 200);
        });
    })();
  });
}

function cdpSessao(url) {
  if (typeof WebSocket === 'undefined')
    throw new Error('este Node e antigo demais; preciso da versao 22 ou mais nova');
  const ws = new WebSocket(url);
  let seq = 0;
  const esperando = {}, ouvintes = {};
  const pronto = new Promise(function (ok, erro) {
    ws.addEventListener('open', function () { ok(); });
    ws.addEventListener('error', function () { erro(new Error('nao consegui falar com o navegador')); });
  });
  ws.addEventListener('message', function (ev) {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && esperando[m.id]) {
      const e = esperando[m.id]; delete esperando[m.id];
      m.error ? e.erro(new Error(m.error.message || 'erro no navegador')) : e.ok(m.result);
    } else if (m.method && ouvintes[m.method]) {
      const l = ouvintes[m.method]; delete ouvintes[m.method]; l(m.params);
    }
  });
  return {
    pronto: pronto,
    enviar: function (metodo, params, sessao) {
      const id = ++seq;
      return new Promise(function (ok, erro) {
        esperando[id] = { ok: ok, erro: erro };
        const msg = { id: id, method: metodo, params: params || {} };
        if (sessao) msg.sessionId = sessao;
        ws.send(JSON.stringify(msg));
        setTimeout(function () {
          if (esperando[id]) { delete esperando[id]; erro(new Error('o navegador nao respondeu a ' + metodo)); }
        }, 30000);
      });
    },
    aoEvento: function (metodo) {
      return new Promise(function (ok) { ouvintes[metodo] = ok; setTimeout(ok, 8000); });
    },
    fechar: function () { try { ws.close(); } catch (e) {} }
  };
}

let DIAG = '';

async function edgeFoto(arqHtml, arqPng, cssL, cssA, escala) {
  const edge = acharEdge();
  if (!edge) throw new Error('nao achei o Microsoft Edge; aponte o caminho no config.json em "edge"');
  const porta = Number(CFG.porta_navegador) || 9333;
  const perfil = path.join(os.tmpdir(), 'onecorp-foto-' + porta);
  const extras = process.platform === 'win32' ? [] : ['--no-sandbox'];
  const nav = execFile(edge, extras.concat([
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    '--remote-debugging-port=' + porta,
    '--user-data-dir=' + perfil,
    'about:blank'
  ]), { timeout: 90000 }, function () {});
  let ses = null, alvoId = null;
  try {
    const wsUrl = await cdpEsperar(porta, Date.now() + 20000);
    ses = cdpSessao(wsUrl);
    await ses.pronto;
    const alvo = await ses.enviar('Target.createTarget', { url: 'about:blank' });
    alvoId = alvo.targetId;
    const anexo = await ses.enviar('Target.attachToTarget', { targetId: alvo.targetId, flatten: true });
    const sid = anexo.sessionId;
    await ses.enviar('Page.enable', {}, sid);
    await ses.enviar('Emulation.setDeviceMetricsOverride',
      { width: cssL, height: cssA, deviceScaleFactor: 1, mobile: false }, sid);
    const carregou = ses.aoEvento('Page.loadEventFired');
    await ses.enviar('Page.navigate', { url: 'file:///' + arqHtml.replace(/\\/g, '/') }, sid);
    await carregou;
    await new Promise(function (r) { setTimeout(r, 400); });
    /* refaz o tamanho da letra AQUI, com a pagina ja montada */
    try {
      const rr = await ses.enviar('Runtime.evaluate',
        { expression: AJUSTE, returnByValue: true, awaitPromise: true }, sid);
      DIAG = (rr && rr.result && rr.result.value) || '';
    } catch (e) { DIAG = 'ajuste falhou'; }
    await new Promise(function (r) { setTimeout(r, 200); });
    const foto = await ses.enviar('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssL, height: cssA, scale: escala }
    }, sid);
    const png = Buffer.from(foto.data, 'base64');
    fs.writeFileSync(arqPng, png);
    return png;
  } finally {
    /* A ABA TEM DE SER FECHADA AQUI, uma por uma.

       O `nav.kill()` abaixo nao mata o navegador: o Edge se relanca sozinho
       (a linha de comando do processo vivo tem um `--edge-skip-compat-layer-relaunch`
       que nao esta na nossa lista), entao quem o Node matou foi um coto que ja
       tinha saido, e o navegador de verdade fica de pe. A cada nova etiqueta o
       segundo lancamento so entrega o servico ao que ja estava rodando — mesmo
       `--user-data-dir` — e ganhamos mais uma aba no MESMO navegador.

       Sem este `closeTarget` cada etiqueta impressa deixa um processo de
       renderizacao para tras, para sempre. Em 10/09/2026 achamos 277 deles,
       de um navegador aberto no dia anterior as 7h21, ocupando 9,2 GB — a
       maquina inteira arrastando. Fechar a aba devolve tudo. */
    if (ses && alvoId) {
      try { await ses.enviar('Target.closeTarget', { targetId: alvoId }); } catch (e) {}
    }
    if (ses) ses.fechar();
    try { nav.kill(); } catch (e) {}
  }
}

/* Gira o desenho depois de pronto. Fica aqui, e nao no site, porque
   assim da para experimentar orientacao sem publicar nada. */
function girarBits(f, graus) {
  const g = ((Number(graus) || 0) % 360 + 360) % 360;
  if (!g) return f;
  const L = f.larg, A = f.alt, bl = f.bytesLinha;
  const ler = (x, y) => (f.bits[y * bl + (x >> 3)] >> (7 - (x & 7))) & 1;
  const nL = (g === 180) ? L : A, nA = (g === 180) ? A : L;
  const nbl = Math.ceil(nL / 8);
  const bits = Buffer.alloc(nbl * nA, 0);
  const por = (x, y) => { bits[y * nbl + (x >> 3)] |= 0x80 >> (x & 7); };
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
    if (!ler(x, y)) continue;
    if (g === 90) por(A - 1 - y, x);
    else if (g === 180) por(L - 1 - x, A - 1 - y);
    else por(y, L - 1 - x);              /* 270 */
  }
  return { larg: nL, alt: nA, bytesLinha: nbl, bits: bits };
}

/* Quanto girar, POR IMPRESSORA.

   O giro nasceu como um numero so, valendo para todas — e isso nao serve
   quando cada impressora tem um rolo diferente. Em 09/09/2026 o Joao relatou
   as duas de uma vez: na TSC a 3x1.5 saia com o texto ao longo do lado de 3in,
   e a 6x4 da Zebra precisava sair 90 graus invertida.

   Aceita as duas formas, para nao quebrar quem ja tinha um numero no config:

     "girar": 180                        vale para todas
     "girar": { "grande": 180,           por apelido, com "padrao" opcional
                "pequena": 90,
                "padrao": 0 }

   E o trabalho ainda manda mais que o config (d.girar), que e como se testa
   uma etiqueta sem reiniciar nada. */
function giroDe(apelido, op) {
  if (op && op.girar != null) return Number(op.girar) || 0;
  const g = CFG.girar;
  if (g == null) return 0;
  if (typeof g === 'object') {
    const v = g[apelido] != null ? g[apelido] : g.padrao;
    return Number(v) || 0;
  }
  return Number(g) || 0;
}

function fatia(img, deLinha, quantas) {
  const bl = img.bytesLinha;
  return {
    larg: img.larg, alt: quantas, bytesLinha: bl,
    bits: img.bits.subarray(deLinha * bl, (deLinha + quantas) * bl)
  };
}

/* A ZP 450 tem pouca memoria. Em hexadecimal cru uma etiqueta 4x6 vira
   248 mil caracteres e a impressora corta no meio do caminho. Comprimido
   (Z64) a mesma etiqueta cabe em poucos milhares — e ainda entra mais
   rapido pelo cabo. */
function crc16(txt) {
  let c = 0;
  for (let i = 0; i < txt.length; i++) {
    c ^= txt.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

/* Deslocamento fino no papel. dx anda no sentido da largura do cabecote,
   dy no sentido em que o papel corre. Vem do trabalho ou do config, para
   dar para acertar a margem sem publicar nada. */
function desloc(op) {
  const c = CFG.deslocar || {};
  return {
    x: Math.round(Number((op || {}).dx != null ? op.dx : c.x) || 0),
    y: Math.round(Number((op || {}).dy != null ? op.dy : c.y) || 0)
  };
}

function zplDaImagem(f, copias, d) {
  const o = d || { x: 0, y: 0 };
  const total = f.bytesLinha * f.alt;
  let campo;
  if (CFG.zpl_compacto === false) {
    campo = f.bits.toString('hex').toUpperCase();
  } else {
    const b64 = zlib.deflateSync(f.bits, { level: 9 }).toString('base64');
    campo = ':Z64:' + b64 + ':' + crc16(b64);
  }
  return '^XA\r\n^PON\r\n^LH0,0\r\n^PW' + (f.larg + Math.max(0, o.x)) + '\r\n^LL' + (f.alt + Math.max(0, o.y)) + '\r\n'
    + '^FO' + o.x + ',' + o.y + '^GFA,' + total + ',' + total + ',' + f.bytesLinha + ',' + campo + '^FS\r\n'
    + '^PQ' + Math.max(1, copias || 1) + '\r\n^XZ\r\n';
}

function tsplDaImagem(f, copias, polL, polA, gapMm, d) {
  const o = d || { x: 0, y: 0 };
  /* no TSPL o bit 0 é que marca o papel: invertemos */
  const inv = Buffer.from(f.bits);
  for (let i = 0; i < inv.length; i++) inv[i] = ~inv[i] & 255;
  const cab = 'SIZE ' + polL + ',' + polA + '\r\n'
    + 'GAP ' + ((gapMm == null ? 3 : gapMm) / 25.4).toFixed(2) + ',0\r\n'
    + 'DIRECTION 1\r\nREFERENCE 0,0\r\nCLS\r\n'
    + 'BITMAP ' + o.x + ',' + o.y + ',' + f.bytesLinha + ',' + f.alt + ',0,';
  return Buffer.concat([
    Buffer.from(cab, 'binary'), inv,
    Buffer.from('\r\nPRINT ' + Math.max(1, copias || 1) + ',1\r\n', 'binary')
  ]);
}

/* No modo imagem nao trocamos a impressora padrao: mandamos direto para a
   fila. Mas o config guarda so um pedaco do nome ("Zebra"), entao aqui
   descobrimos o nome exato uma vez e guardamos. */
const FILAS = {};

async function resolverFila(alvo) {
  const chave = String(alvo);
  if (FILAS[chave]) return FILAS[chave];
  if (process.platform !== 'win32') return (FILAS[chave] = chave);
  if (process.env.ONECORP_SAIDA) return (FILAS[chave] = chave);   /* modo teste: nada de procurar impressora de verdade */
  const nome = chave.replace(/'/g, "''");
  const cmd = [
    "$alvo = '" + nome + "'",
    "$todas = Get-CimInstance -Class Win32_Printer",
    "$p = $todas | Where-Object { $_.Name -eq $alvo } | Select-Object -First 1",
    "if (-not $p) {",
    "  $c = @($todas | Where-Object { $_.Name -like ('*' + $alvo + '*') })",
    "  $usb = @($c | Where-Object { $_.PortName -like 'USB*' })",
    "  if ($usb.Count -gt 0) { $p = $usb[0] } elseif ($c.Count -gt 0) { $p = $c[0] }",
    "}",
    "if (-not $p) { Write-Error 'nao achei'; exit 1 }",
    "$p.Name"
  ].join('; ');
  let nomeReal;
  try { nomeReal = await psRodar(cmd); }
  catch (e) { throw new Error('nao achei nenhuma impressora com "' + chave + '" no Windows — confira com Get-Printer'); }
  if (!nomeReal) throw new Error('nao achei nenhuma impressora com "' + chave + '" no Windows');
  FILAS[chave] = nomeReal;
  log('fila resolvida:', chave, '->', nomeReal);
  return nomeReal;
}

function dpiDe(apelido, fila) {
  const mapa = CFG.dpis || {};
  if (mapa[apelido]) return Number(mapa[apelido]);
  if (/zebra/i.test(String(fila))) return 203;      /* ZP 450 e irmãs */
  return Number(CFG.dpi) || 203;
}

function linguagemDe(apelido, fila) {
  const mapa = CFG.linguagens || {};
  if (mapa[apelido]) return String(mapa[apelido]).toLowerCase();
  return /zebra/i.test(String(fila)) ? 'zpl' : 'tspl';
}

/* O tamanho da letra do codigo e calculado no navegador de QUEM criou a
   etiqueta. Se esse navegador for outro (Safari no Mac), as fontes tem
   larguras diferentes das do Windows e o texto estoura a caixa — que
   corta em silencio, porque tem overflow:hidden. Refazemos a conta aqui,
   no mesmo navegador que tira a foto, e so depois que a pagina terminou
   de carregar e as fontes ja estao valendo. De quebra devolvemos as
   medidas, para dar para conferir de longe o que aconteceu. */
const AJUSTE = `(async function(){
  try { await document.fonts.ready; } catch(e){}
  var d = [];
  function enc(t){ var s=t.firstElementChild; if(!s) return;
    var a = t.classList.contains('etqc-cod') ? 92
          : t.classList.contains('etqg-cod') ? 60
          : t.classList.contains('etqz-cod') ? 22 : 112;
    s.style.fontSize=a+'px';
    for(var n=0; a>10 && n++<220 && (s.scrollWidth>t.clientWidth+1 || s.scrollHeight>t.clientHeight+1);){
      a-=2; s.style.fontSize=a+'px'; }
    d.push('cod=' + a + 'px ' + s.scrollWidth + '/' + t.clientWidth); }
  document.querySelectorAll('.etqp-cod,.etqc-cod,.etqg-cod,.etqz-cod').forEach(enc);
  function cabe(el){ var f=parseFloat(getComputedStyle(el).fontSize)||12, m=0;
    for(var n=0; f>5 && n++<120 && el.scrollWidth>el.clientWidth+1;){ f-=0.5; el.style.fontSize=f+'px'; m=1; }
    if(m) d.push(el.className.split(' ')[0]+'->'+f+'px'); }
  document.querySelectorAll('.etqc-topo,.etqc-track,.etqc-bc,.etqp-topo,.etqc-nome,.etqp-desc').forEach(cabe);
  var r = document.querySelector('.etqc,.etqp,.etqg,.etqz');
  if (r) d.push('cx=' + Math.round(r.getBoundingClientRect().width) + 'x' + Math.round(r.getBoundingClientRect().height));
  return d.join(' ');
})()`;

async function imprimirImagem(html, apelido, fila, copias, extra) {
  const op = extra || {};
  const med = medidasDaPagina(html);
  const dpi = Number(op.dpi) || dpiDe(apelido, fila);
  /* --window-size é o tamanho em CSS (1in = 96px) e a escala multiplica
     para virar ponto de impressora. Com escala = dpi/96, a foto sai do
     tamanho exato do papel: 4in a 203dpi = 812 pontos. */
  const escala = dpi / 96;
  const cssL = Math.round(med.pol_larg * 96), cssA = Math.round(med.pol_alt * 96);
  const arqHtml = path.join(os.tmpdir(), 'onecorp-etq-' + Date.now() + '.html');
  const arqPng = path.join(os.tmpdir(), 'onecorp-etq-' + Date.now() + '.png');
  /* tiramos o auto-print da página: em headless ele só atrapalha */
  fs.writeFileSync(arqHtml,
    String(html).replace(/<script>[\s\S]*?window\.print[\s\S]*?<\/script>/, ''), 'utf8');
  try {
    const png = await edgeFoto(arqHtml, arqPng, cssL, cssA * med.paginas, escala);
    const img = pngParaBits(png, Number(CFG.limiar) || 128);
    const altPag = Math.round(img.alt / med.paginas);
    const ling = linguagemDe(apelido, fila);
    for (let i = 0; i < med.paginas; i++) {
      const giro = giroDe(apelido, op);
      const f = girarBits(fatia(img, i * altPag, Math.min(altPag, img.alt - i * altPag)), giro);
      const dl = desloc(op);
      const dados = ling === 'zpl'
        ? Buffer.from(zplDaImagem(f, copias, dl), 'binary')
        : tsplDaImagem(f, copias, med.pol_larg,
          /* tspl_ajuste.<apelido>: a TSC do estoque so para no espaco certo
             se o SIZE for um pouco menor que o papel (03/11/2026) */
          Math.max(0.5, med.pol_alt - (Number(((CFG.tspl_ajuste || {})[apelido] || {}).menos_alt) || 0)),
          ((CFG.tspl_ajuste || {})[apelido] || {}).gap_mm != null ? Number(CFG.tspl_ajuste[apelido].gap_mm)
            : ((CFG.etiquetas || {}).etiqueta_caixa || {}).gap_mm, dl);
      await imprimirCru(dados, fila);
    }
    return med.paginas + (med.paginas > 1 ? ' etiquetas' : ' etiqueta') + ' em '
      + ling.toUpperCase() + ' ' + img.larg + 'x' + altPag + ' a ' + dpi + 'dpi'
      + (giroDe(apelido, op) ? ' girada ' + giroDe(apelido, op) : '')
      + (desloc(op).x || desloc(op).y ? ' deslocada ' + desloc(op).x + ',' + desloc(op).y : '');
  } finally {
    try { fs.unlinkSync(arqHtml); } catch (e) {}
    try { fs.unlinkSync(arqPng); } catch (e) {}
  }
}


/* ============================================================
   Atualizacao sozinha. O agente pergunta ao servidor qual e a
   versao mais nova; se for outra, grava o arquivo novo, guarda o
   anterior e sai. O iniciar.bat sobe de novo em 10 segundos, ja
   com o codigo novo. Assim ninguem precisa copiar arquivo no
   Windows a cada correcao.
   ============================================================ */
const ARQ_AGENTE = fileURLToPath(import.meta.url);
let PROXIMA_OLHADA = 0;

async function verSeTemVersaoNova() {
  if (CFG.auto_atualizar === false) return false;
  if (Date.now() < PROXIMA_OLHADA) return false;
  PROXIMA_OLHADA = Date.now() + (Number(CFG.minutos_atualizacao) || 5) * 60000;
  let novo;
  try { novo = await rpc('rpc_agente_codigo', { p_versao: VERSAO }); }
  catch (e) { return false; }
  const v = novo && novo[0];
  if (!v || !v.codigo || v.versao === VERSAO) return false;

  /* so troca se o arquivo chegou inteiro e parece mesmo o agente */
  const conferido = crypto.createHash('md5').update(v.codigo, 'utf8').digest('hex');
  if (v.md5 && conferido !== v.md5) {
    log('versao', v.versao, 'chegou incompleta — fico na', VERSAO);
    return false;
  }
  if (v.codigo.length < 5000 || v.codigo.indexOf('const VERSAO') < 0) {
    log('versao', v.versao, 'nao parece o agente — fico na', VERSAO);
    return false;
  }

  try {
    fs.copyFileSync(ARQ_AGENTE, ARQ_AGENTE.replace(/\.mjs$/, '.anterior.mjs'));
    fs.writeFileSync(ARQ_AGENTE, v.codigo, 'utf8');
  } catch (e) {
    log('nao consegui gravar a versao nova:', (e && e.message || e).toString().slice(0, 150));
    return false;
  }
  log('---------------------------------------------');
  log('versao nova instalada:', VERSAO, '->', v.versao);
  log('saindo para subir de novo (o iniciar.bat reabre em 10s)');
  log('---------------------------------------------');
  return true;
}

/* ===================== LEITOR DE CODIGO DE BARRAS ======================
   "esse scanner vai ficar pelo warehouse e qualquer pessoa vai poder usar
    o scanner pra dar baixa, bipou, baixou"

   POR QUE AQUI E NAO NO SITE

   Um navegador so recebe as teclas quando a janela dele esta na frente.
   Numa maquina que as pessoas tambem usam para trabalhar, a bipada iria
   para o Excel, para o e-mail, para o que estivesse aberto. O agente le
   a porta direto: nao depende de janela, de quem esta logado no site,
   nem de alguem ter fechado o navegador. Reinicia a maquina e ele volta
   sozinho pelo iniciar.bat.

   O QUE O LEITOR PRECISA TER

   Modo COM (porta serial virtual), nao modo teclado. Troca-se bipando um
   codigo de barras de configuracao que vem no manual do proprio leitor —
   e esse codigo muda de modelo para modelo. A porta e a velocidade ficam
   no config.json; nada disso esta no codigo.

   O QUE CADA LEITURA FAZ

     codigo de barras          -> rpc_baixar_barcode, 1 unidade
     URL ?e=XXXXXXXX           -> rpc_baixar_etiqueta com qtd NULA, que no
     ou TOC1|XXXXXXXX             banco significa a CAIXA INTEIRA
     URL ?p=...                -> recusa: o QR de consulta abre o produto
                                  e nao carrega quantidade nenhuma
     menos de 4 caracteres     -> ignora

   Um codigo de 8 caracteres solto NAO conta como etiqueta: seria
   indistinguivel de um codigo de barras e sairia do produto errado. So
   vale no formato que o proprio sistema gera.
   ====================================================================== */
const LEITOR = { fluxo: null, buf: '', ocupado: false, n: 0, recusas: 0, timer: null };

function leitorCfg() {
  const c = CFG.leitor || {};
  return {
    ligado: !!c.ligado,
    porta: String(c.porta || '').trim().toUpperCase(),
    baud: Number(c.baud) || 9600,
    estacao: String(c.estacao || '').trim(),
    reconecta: Math.max(Number(c.reconecta_segundos) || 5, 2)
  };
}

function leitorClassificar(cod) {
  const s = String(cod == null ? '' : cod).trim();
  if (!s) return { tipo: 'vazio' };
  const m = s.match(/[?&]e=([0-9A-Za-z]{8})(?:[&#]|$)/);
  if (m) return { tipo: 'etiqueta', codigo: m[1].toUpperCase() };
  const t = s.match(/^TOC1\|([0-9A-Za-z]{8})$/i);
  if (t) return { tipo: 'etiqueta', codigo: t[1].toUpperCase() };
  if (/[?&]p=/.test(s)) return { tipo: 'consulta' };
  if (s.length < 4) return { tipo: 'curto', codigo: s };
  return { tipo: 'barcode', codigo: s };
}

/* O leitor manda os caracteres e termina com CR (ou LF). Cada linha
   completa e uma leitura. O que sobra fica no buffer esperando o resto —
   leitura nao chega necessariamente inteira num pedaco so. */
function leitorAlimentar(pedaco, aoLer) {
  LEITOR.buf += String(pedaco == null ? '' : pedaco);
  /* buffer sem fim seria vazamento se o leitor mandasse lixo sem CR */
  if (LEITOR.buf.length > 4096) LEITOR.buf = LEITOR.buf.slice(-256);
  let i;
  while ((i = LEITOR.buf.search(/[\r\n]/)) >= 0) {
    const linha = LEITOR.buf.slice(0, i).trim();
    LEITOR.buf = LEITOR.buf.slice(i + 1);
    if (linha) aoLer(linha);
  }
}

/* apito curto para leitura aceita, tres para recusada: quem bipa esta de
   pe na bancada e nao olhando a tela do agente */
function leitorApito(ok) {
  try { process.stdout.write(ok ? '\x07' : '\x07\x07\x07'); } catch (e) {}
}

async function leitorBaixar(cod, estacao) {
  const c = leitorClassificar(cod);
  if ('vazio' === c.tipo || 'curto' === c.tipo) return { ok: false, ignorado: true, tipo: c.tipo };
  if ('consulta' === c.tipo) {
    return { ok: false, tipo: 'consulta',
             texto: 'QR de consulta: abre o produto e nao tem quantidade. Bipe o codigo de barras ou o QR da etiqueta.' };
  }
  if ('etiqueta' === c.tipo) {
    const motivo = 'Leitor' + (estacao ? ' \u00b7 ' + estacao : '') + ' \u00b7 QR da etiqueta';
    const d = await rpc('rpc_baixar_etiqueta', { p_codigo: c.codigo, p_qtd: null, p_motivo: motivo });
    return { ok: true, tipo: 'etiqueta', codigo: c.codigo,
             nome: d && (d.nome || d.sku) || c.codigo,
             baixado: d && d.baixado || 0, saldo: d && d.saldo_produto };
  }
  const d = await rpc('rpc_baixar_barcode',
    { p_barcode: c.codigo, p_qtd: 1, p_estacao: estacao || null });
  /* esta RPC nao levanta excecao quando recusa: devolve ok:false com o
     motivo, e ja avisa os gerentes por notificacao */
  if (!d || !d.ok) {
    return { ok: false, tipo: 'barcode', codigo: c.codigo,
             texto: (d && (d.texto || d.motivo)) || 'recusado' };
  }
  return { ok: true, tipo: 'barcode', codigo: c.codigo,
           nome: d.nome || d.sku || c.codigo, baixado: d.baixado || 1, saldo: d.saldo };
}

async function leitorProcessar(cod) {
  /* uma leitura por vez: o leitor dispara rapido, e duas baixas do mesmo
     produto ao mesmo tempo sairiam do saldo duas vezes sem ninguem ver */
  if (LEITOR.ocupado) { log('LEITOR: leitura descartada, ainda processando a anterior'); return; }
  LEITOR.ocupado = true;
  const est = leitorCfg().estacao;
  try {
    const r = await leitorBaixar(cod, est);
    if (r.ignorado) return;
    if (r.ok) {
      LEITOR.n++;
      leitorApito(true);
      log('LEITOR ok:', r.nome, '-' + r.baixado,
          null == r.saldo ? '' : '| saldo ' + r.saldo,
          '|', r.tipo, '|', est || '(sem estacao)');
    } else {
      LEITOR.recusas++;
      leitorApito(false);
      log('LEITOR RECUSADO:', r.codigo || cod, '|', r.texto);
    }
  } catch (e) {
    LEITOR.recusas++;
    leitorApito(false);
    log('LEITOR ERRO:', String(e && e.message || e).slice(0, 200));
  } finally {
    LEITOR.ocupado = false;
  }
}

/* O Windows configura a porta pelo proprio comando "mode" — assim o
   agente continua sem nenhuma dependencia externa para instalar. */
function leitorPreparaPorta(c) {
  return new Promise(function (pronto) {
    execFile('cmd', ['/c', 'mode', c.porta + ':', 'BAUD=' + c.baud, 'PARITY=n', 'DATA=8',
                     'STOP=1', 'to=off', 'xon=off', 'odsr=off', 'octs=off',
                     'dtr=on', 'rts=on', 'idsr=off'],
      { timeout: 8000 }, function (e, saida, err) {
        if (e) log('LEITOR: "mode" reclamou da porta', c.porta + ':',
                   String(err || e.message || '').trim().slice(0, 160));
        pronto(!e);
      });
  });
}

function leitorFechar() {
  if (LEITOR.timer) { clearTimeout(LEITOR.timer); LEITOR.timer = null; }
  if (LEITOR.fluxo) { try { LEITOR.fluxo.destroy(); } catch (e) {} LEITOR.fluxo = null; }
  LEITOR.buf = '';
}

function leitorReabrir(motivo) {
  const c = leitorCfg();
  leitorFechar();
  if (!c.ligado) return;
  log('LEITOR: ' + motivo + ' — tentando de novo em ' + c.reconecta + 's');
  LEITOR.timer = setTimeout(function () { LEITOR.timer = null; leitorAbrir(); }, c.reconecta * 1000);
}

async function leitorAbrir() {
  const c = leitorCfg();
  if (!c.ligado) return;
  if (!c.porta) {
    log('LEITOR: ligado no config.json mas sem "porta". Ponha a COM do leitor, por exemplo "COM3".');
    return;
  }
  await leitorPreparaPorta(c);
  try {
    /* no Windows a porta serial se abre como arquivo: \\.\COM3 */
    const alvo = /^COM\d+$/.test(c.porta) ? '\\\\.\\' + c.porta : c.porta;
    const fluxo = fs.createReadStream(alvo, { encoding: 'latin1' });
    LEITOR.fluxo = fluxo;
    fluxo.on('data', function (pedaco) { leitorAlimentar(pedaco, leitorProcessar); });
    fluxo.on('error', function (e) { leitorReabrir('erro na porta: ' + String(e && e.message || e).slice(0, 120)); });
    fluxo.on('close', function () { if (LEITOR.fluxo === fluxo) leitorReabrir('a porta fechou'); });
    log('LEITOR ligado em', c.porta, '|', c.baud, 'baud | estacao:', c.estacao || '(sem nome)');
  } catch (e) {
    leitorReabrir('nao consegui abrir: ' + String(e && e.message || e).slice(0, 120));
  }
}

async function rodada() {
  const jobs = await rpc('rpc_impressao_pegar', { p_limite: 5, p_estacao: ESTACAO });
  if (!jobs || !jobs.length) return 0;
  for (const job of jobs) {
    try {
      const d = job.dados || {};
      /* pagina pronta do site tem prioridade; o desenho em TSPL fica de reserva */
      const alvo = impressoraDo(job), apelido = String((job && job.impressora) || '');
      let res, fila = alvo;
      if (d.zpl) {
        /* comando cru para a impressora: calibrar, escurecer, testar */
        fila = await resolverFila(alvo);
        res = await imprimirCru(Buffer.from(String(d.zpl), 'binary'), fila) + ' (comando cru)';
      } else if (d.html && (CFG.modo || 'imagem') === 'imagem') {
        fila = await resolverFila(alvo);
        res = await imprimirImagem(d.html, apelido, fila, job.copias,
          { girar: d.girar, dpi: d.dpi, dx: d.dx, dy: d.dy });
      } else if (d.html) {
        fila = await garantirPadrao(alvo) || alvo;
        res = await imprimirPagina(d.html, fila);
      } else if ((CFG.linguagem || 'tspl') === 'tspl') res = await imprimirCru(montarTSPL(job), alvo);
      else throw new Error('trabalho antigo, sem a pagina do site, e o desenho TSPL esta desligado no config (linguagem: ' + CFG.linguagem + ')');
      /* volta pro banco quem imprimiu: da pra conferir daqui, sem olhar o log */
      await rpc('rpc_impressao_feita',
        { p_id: job.id, p_agente: (VERSAO + ' | ' + fila + (DIAG ? ' | ' + DIAG : '')).slice(0, 300) });
      log('#' + job.id, job.tipo, 'x' + job.copias, '→', fila, '→', res);
    } catch (e) {
      const msg = (e && e.message || String(e)).slice(0, 300);
      log('#' + job.id, 'ERRO:', msg);
      try { await rpc('rpc_impressao_erro', { p_id: job.id, p_erro: msg }); } catch (x) {}
    }
  }
  return jobs.length;
}

/* "Estou aqui."

   A fila nao tinha nocao de quem estava do outro lado. Quem clicava
   "imprimir" via "mandei para a fila" e ia embora; sem agente no ar, o
   trabalho ficava parado e nada dizia isso. Em 08/09/2026 uma etiqueta
   esperou 40 minutos e um lote de 72 saiu todo de uma vez quando o agente
   subiu — sem erro nenhum, porque para a fila estava tudo certo.

   A cada 30s, e nao a cada rodada: o laco gira a cada 3s, e gravar 20 vezes
   por minuto para dizer a mesma coisa e desperdicio. A tela considera vivo
   quem bateu nos ultimos 2 minutos, entao ha folga para perder tres batidas
   antes de acender o alarme.

   Falhar aqui NAO pode parar de imprimir: se o ponto nao for batido o pior
   que acontece e a tela avisar que ninguem esta ouvindo, o que e chato mas
   inofensivo. Deixar de imprimir por causa disso seria trocar um aviso
   errado por uma parada de verdade. */
const MAQUINA = String(CFG.maquina || os.hostname() || 'sem-nome').trim();
let ULTIMA_BATIDA = 0;

async function bater() {
  if (Date.now() - ULTIMA_BATIDA < 30000) return;
  ULTIMA_BATIDA = Date.now();
  try {
    await rpc('rpc_impressao_agente_vivo', {
      p_maquina: MAQUINA,
      p_estacao: ESTACAO,
      p_versao: VERSAO,
      p_impressoras: CFG.impressoras || null,
      p_imprime: IMPRIME
    });
  } catch (e) {
    /* uma vez so no log: repetir a cada 30s enterraria o que importa */
    if (!bater.avisou) { bater.avisou = true; log('nao consegui avisar que estou no ar:', (e && e.message || e).toString().slice(0, 120)); }
  }
}

async function principal() {
  conferirConfig();
  if (!IMPRIME) {
    log('agente iniciado — versao', VERSAO, '| SO LEITOR: este PC nao vai imprimir');
    log('  (imprimir: false no config.json — ele nunca pede trabalho da fila,');
    log('   entao nao disputa etiqueta com o PC da impressora)');
  } else {
    log('agente iniciado — versao', VERSAO, '| impressora:', CFG.impressora, '| dpi:', CFG.dpi);
    const mapa = CFG.impressoras || {};
    Object.keys(mapa).forEach(function (k) { log('  ' + k + ' -> ' + mapa[k]); });
    log('modo:', CFG.modo || 'imagem', '(a etiqueta vai como desenho pronto, direto para a impressora)');
    /* com mais de um PC imprimindo, esta linha e a que diz se a etiqueta vai
       sair aqui ou na outra sala. Vale gritar. */
    if (ESTACAO) log('ESTACAO:', ESTACAO, '— este PC so pega etiqueta endereçada a ele (ou sem endereco)');
    else log('ESTACAO: nenhuma no config.json — este PC so pega etiqueta SEM endereco.');
  }
  /* o leitor vive fora da fila de impressao: abre a porta e fica ouvindo,
     enquanto o laco de baixo continua cuidando das etiquetas */
  if (leitorCfg().ligado) { try { await leitorAbrir(); } catch (e) { log('LEITOR: falhou ao abrir —', e && e.message || e); } }
  else log('leitor: desligado no config.json');
  /* daqui para baixo e tudo preparo de impressao: mexer na impressora
     padrao do Windows e achar o Edge. No PC so-leitor nada disso faz
     sentido — e trocar a impressora padrao da maquina de outra pessoa
     seria francamente indelicado */
  if (IMPRIME) {
    if ((CFG.modo || 'imagem') !== 'imagem') {
      try {
        const padrao = await definirPadrao(CFG.impressora);
        PEDIDO_ATUAL = String(CFG.impressora);
        log('impressora padrao do Windows agora e:', padrao || '(nao consegui ler)');
      } catch (e) {
        log('ATENCAO: nao consegui definir a impressora padrao —', (e && e.message || e).toString().slice(0, 200));
      }
    }
    log('Edge:', acharEdge() || 'NAO ENCONTRADO — o caminho pode ser apontado no config.json em "edge"');
    /* perfil unico das versoes antigas: podia estar preso na impressora errada */
    try {
      const antigo = path.join(AQUI, '_edge', 'Default');
      if (fs.existsSync(antigo)) {
        fs.rmSync(path.join(AQUI, '_edge'), { recursive: true, force: true });
        log('apaguei o perfil antigo do Edge (ele guardava a impressora errada)');
      }
    } catch (e) {}
  }
  await entrar();
  await bater();            /* diz que chegou, antes da primeira rodada */
  let calado = 0;
  while (!parando) {
    try {
      if (await verSeTemVersaoNova()) { process.exit(0); }
      await bater();
      /* o so-leitor continua no laco — e por aqui que ele recebe versao
         nova sozinha — mas nunca pede trabalho da fila */
      const n = IMPRIME ? await rodada() : 0;
      if (n) calado = 0; else calado++;
    } catch (e) {
      log('falha na rodada:', (e && e.message || e).toString().slice(0, 200));
      try { await entrar(); } catch (x) { log('nao consegui reconectar, tentando de novo em 30s'); await espera(30000); }
    }
    await espera((CFG.intervalo_segundos || 3) * 1000);
    if (calado === 1200) { log('sem trabalho há um tempo — continuo olhando'); calado = 0; }
  }
}

function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* rodando pelo iniciar.bat: comeca. Importado por um teste: fica quieto. */
const CHAMADO_DIRETO = (function () {
  try {
    /* os dois lados passam por realpath antes de comparar. Sem isso, uma
       pasta alcancada por atalho — /tmp que e /private/tmp no Mac, unidade
       de rede mapeada ou junction no Windows — dava caminhos diferentes
       para o mesmo arquivo, e o agente subia, nao se reconhecia como
       chamado direto e ficava parado SEM ESCREVER NADA no log. Parecia
       ligado e nao estava. */
    const real = function (p) { try { return fs.realpathSync(p); } catch (e) { return path.resolve(p); } };
    return real(fileURLToPath(import.meta.url)) === real(path.resolve(process.argv[1] || ''));
  }
  catch (e) { return true; }
})();

if (CHAMADO_DIRETO && process.argv.includes('--entrar')) entrarGoogle().then(function () { process.exit(0); }, function (e) { log('parou:', e && e.message || e); process.exit(1); });
else if (CHAMADO_DIRETO) principal().catch(function (e) { log('parou:', e && e.message || e); process.exit(1); });

export { imprimirImagem, pngParaBits, medidasDaPagina, zplDaImagem, tsplDaImagem, dpiDe, linguagemDe, impressoraDo,
         leitorClassificar, leitorAlimentar, leitorBaixar, leitorCfg, LEITOR, rpc, entrar, paraFs, deFs };
