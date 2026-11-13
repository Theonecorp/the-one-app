/* Manda uma etiqueta de teste em ZPL direto para a Zebra, sem passar pela
   fila. Serve para saber se o nome da impressora no config.json esta certo —
   e se o cabo, o driver e o papel estao respondendo.

   E o irmao do testar.mjs, que fala TSPL (a lingua da TSC). Uma Zebra
   recebendo TSPL imprime lixo ou nada; por isso o PC da expedicao, que so
   tem Zebra, usa este aqui (testar-zebra.bat). */
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFile, execFileSync } from 'child_process'; import { fileURLToPath } from 'url';

function acharFila(alvo) {
  if (process.platform !== 'win32') return alvo;
  const cmd = [
    "$alvo = '" + String(alvo).replace(/'/g, "''") + "'",
    "$todas = Get-CimInstance -Class Win32_Printer",
    "$p = $todas | Where-Object { $_.Name -eq $alvo } | Select-Object -First 1",
    "if (-not $p) {",
    "  $c = @($todas | Where-Object { $_.Name -like ('*' + $alvo + '*') })",
    "  $usb = @($c | Where-Object { $_.PortName -like 'USB*' })",
    "  if ($usb.Count -gt 0) { $p = $usb[0] } elseif ($c.Count -gt 0) { $p = $c[0] }",
    "}",
    "if (-not $p) { exit 1 }",
    "$p.Name"
  ].join('; ');
  try {
    const r = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { encoding: 'utf8' }).trim();
    return r || alvo;
  } catch (e) { return null; }
}
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(fs.readFileSync(path.join(AQUI, 'config.json'), 'utf8'));
/* a Zebra e a "grande" do de-para; sem de-para, a impressora principal */
const alvo = (CFG.impressoras && CFG.impressoras.grande) || CFG.impressora;

/* 4x6 a 203 dpi = 812 x 1218 pontos */
const zpl = '^XA^PON^PW812^LL1218'
  + '^FO60,90^A0N,90,90^FDTESTE OK^FS'
  + '^FO60,220^A0N,50,50^FDTHE ONE CORP - EXPEDICAO^FS'
  + '^FO60,300^A0N,36,36^FD' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '^FS'
  + '^FO60,400^BY3^BCN,140,Y,N,N^FDTESTE123^FS'
  + '^FO60,640^A0N,32,32^FDSe leu isto, a Zebra esta pronta.^FS'
  + '^XZ';

if (process.platform !== 'win32') { console.log(zpl); process.exit(0); }
const ps = path.join(AQUI, '_raw.ps1');
fs.writeFileSync(ps, fs.readFileSync(path.join(AQUI, 'agente.mjs'), 'utf8')
  .split('const PS_RAW = `')[1].split('`;')[0], 'utf8');
const fila = acharFila(alvo);
if (!fila) {
  console.log('nao achei nenhuma impressora com "' + alvo + '" no Windows.');
  console.log('Confira o nome em Painel de Controle > Dispositivos e Impressoras,');
  console.log('ou rode  powershell Get-Printer  para ver a lista.');
  process.exit(1);
}
if (fila !== alvo) console.log('config "' + alvo + '" -> fila "' + fila + '"');

const arq = path.join(os.tmpdir(), 'teste-zebra.prn');
fs.writeFileSync(arq, zpl, 'binary');
execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-Arquivo', arq, '-Impressora', fila],
  (e, o, err) => {
    if (e) { console.log('DEU ERRO:\n' + (err || e.message)); console.log('\nConfira o nome exato em Painel de Controle > Dispositivos e Impressoras.'); }
    else console.log('Etiqueta de teste enviada para: ' + fila);
  });
