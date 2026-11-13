@echo off
rem Ja tem um agente ligado nesta maquina? Entao esta janela nao faz falta.
rem (dois agentes no mesmo PC nao imprimem em dobro - a fila entrega cada
rem etiqueta a um so - mas confundem: duas janelas, dois logs, e ninguem sabe
rem qual fechar.) Procura pelo processo do node rodando o agente.mjs; o
rem titulo da janela nao serve, porque quem fica com a janela e o node.
powershell -NoProfile -ExecutionPolicy Bypass -Command "exit [int]((Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*agente.mjs*' } | Measure-Object).Count -gt 0)"
if errorlevel 1 (
  echo.
  echo   O agente de impressao JA ESTA LIGADO em outra janela.
  echo   Pode fechar esta. Esta janela fecha sozinha em 8 segundos.
  echo.
  timeout /t 8 /nobreak >nul
  exit
)
title Agente de impressao - THE ONE CORP
cd /d "%~dp0"
:loop
node agente.mjs
echo.
echo O agente parou. Reiniciando em 10 segundos... (feche esta janela para encerrar)
timeout /t 10 /nobreak >nul
goto loop
