/* Manda uma etiqueta de teste direto pra impressora, sem passar pela fila.
   Serve pra saber se o nome da impressora no config.json está certo. */
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFile, execFileSync } from 'child_process'; import { fileURLToPath } from 'url';

/* O config guarda um PEDACO do nome ("TSC", "Zebra") — e o agente resolve
   isso para a fila real antes de imprimir. Este teste passava o pedaco cru
   para o OpenPrinter, que so aceita o nome exato: com "TSC" no config o
   agente imprimia e o teste dizia que a impressora nao existia. Agora os
   dois procuram do mesmo jeito. */
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
const dpi = CFG.dpi || 300, mm = v => Math.round(v * dpi / 25.4);
const t = CFG.etiquetas.etiqueta_produto;
const tspl = [
  'SIZE ' + t.largura_mm + ' mm,' + t.altura_mm + ' mm',
  'GAP ' + t.gap_mm + ' mm,0 mm', 'DIRECTION 1', 'REFERENCE 0,0', 'CLS',
  'TEXT ' + mm(3) + ',' + mm(3) + ',"3",0,1,1,"TESTE OK"',
  'TEXT ' + mm(3) + ',' + mm(11) + ',"2",0,1,1,"THE ONE CORP"',
  'BARCODE ' + mm(3) + ',' + mm(17) + ',"128",' + mm(9) + ',1,0,2,4,"TESTE123"',
  'PRINT 1,1'
].join('\r\n') + '\r\n';

if (process.platform !== 'win32') { console.log(tspl); process.exit(0); }
const ps = path.join(AQUI, '_raw.ps1');
fs.writeFileSync(ps, fs.readFileSync(path.join(AQUI, 'agente.mjs'), 'utf8')
  .split('const PS_RAW = `')[1].split('`;')[0], 'utf8');
const fila = acharFila(CFG.impressora);
if (!fila) {
  console.log('nao achei nenhuma impressora com "' + CFG.impressora + '" no Windows.');
  console.log('Confira o nome em Painel de Controle > Dispositivos e Impressoras,');
  console.log('ou rode  powershell Get-Printer  para ver a lista.');
  process.exit(1);
}
if (fila !== CFG.impressora) console.log('config "' + CFG.impressora + '" -> fila "' + fila + '"');

const arq = path.join(os.tmpdir(), 'teste.prn');
fs.writeFileSync(arq, tspl, 'binary');
execFile('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File', ps, '-Arquivo', arq, '-Impressora', fila],
  (e, o, err) => {
    if (e) { console.log('DEU ERRO:\n' + (err || e.message)); console.log('\nConfira o nome exato em Painel de Controle > Dispositivos e Impressoras.'); }
    else console.log('Etiqueta de teste enviada para: ' + fila);
  });
