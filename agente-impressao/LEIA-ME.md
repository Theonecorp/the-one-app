# Agente de impressão — THE ONE APP

O mesmo agente do sistema antigo (THE ONE CORP WMS), agora ligado ao THE ONE
APP. Ele roda no Windows da **expedição** e manda as etiquetas do
**Shipping UPS** e do **Notes UPS** direto para a Zebra, sem abrir a janela de
impressão do navegador.

## Como funciona

1. No app, alguém clica em imprimir no Shipping UPS ou no Notes UPS. Pode ser
   de qualquer lugar, até do celular.
2. A etiqueta entra numa fila no banco do app (`printJobs`), com a estação
   **Expedicao**.
3. Este agente olha a fila a cada 3 segundos e pega **só** o que é da estação
   dele.
4. Ele desenha a etiqueta e manda direto para a Zebra:
   - Etiqueta UPS em **GIF** e etiqueta 6×4 do Notes vão como imagem.
   - Etiqueta UPS em **ZPL** vai como comando, sem conversão.
5. Ele marca a etiqueta como impressa, e a tela do app mostra ✓ em tela cheia.
   Se der erro, ele tenta mais duas vezes e depois a tela mostra um aviso
   vermelho.

A cada 30 segundos o agente avisa que está ligado. Se ele estiver desligado, o
app avisa "Agente desligado — fica na fila". A etiqueta não se perde: ela sai
quando o agente voltar.

## Ligar e desligar no app

No topo do **Shipping UPS** e do **Notes UPS** há a caixa
**🖨 Imprimir direto no PC da expedição (agente)**. Ela aparece para o
administrador, o dono e o gerente de estoque. A escolha vale para a empresa
toda.

- **Desligada:** o app imprime como antes, pela janela do navegador.
- **Ligada:** as etiquetas vão para a fila do agente. Ao lado aparece se o
  agente está **Conectada** (bolinha verde) ou **desligado** (vermelha).

## O que muda em relação ao sistema antigo: o login

O sistema antigo entrava com e-mail e senha. O THE ONE APP só aceita **login
do Google**, de propósito, para que ninguém se passe por outra pessoa. Por
isso o agente entra com uma **conta Google só dele**.

### Uma vez só, o administrador faz:

1. **Conta Google do agente.** Use um e-mail só para isso, por exemplo
   `impressora@theonefl.com`.
2. **Cadastro no app.** Em Usuários, cadastre esse e-mail como **gerente
   (manager)** com o trabalho **`agente`**. Esse trabalho não abre nenhuma tela
   e não mexe em pedido nem em estoque: só deixa o agente ler e marcar a fila de
   impressão.
3. **ID de cliente OAuth.** No Google Cloud do projeto `the-one-app-ff40e`, em
   *APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth*,
   escolha o tipo **App para computador**. Anote o *ID do cliente* e a
   *chave secreta do cliente*.
4. **Regras novas do banco.** Publique as regras (`firestore.rules`) com
   `printJobs`, `printAgents` e `printDireta`.

## Instalação no PC da expedição (uma vez só)

1. **Node.js:** baixe a versão **LTS** em https://nodejs.org. Para conferir,
   rode `node --version` no Prompt de Comando: precisa ser v18 ou maior.
2. **Pasta:** copie esta pasta para um lugar fixo, por exemplo
   `C:\theoneapp\agente-impressao`.
3. **Configuração:** copie `config-expedicao.exemplo.json` como `config.json`
   e preencha só **`google_client_id`** e **`google_client_secret`** (os
   valores que o administrador passou). O resto já vem preenchido.
4. **Login:** dê dois cliques em **`entrar-google.bat`**. O navegador abre;
   entre com a **conta Google do agente** (não com a sua) e autorize. A janela
   deve mostrar `OK — conta guardada` e `teste do Firebase: OK`. O login fica
   guardado no `login-google.json`, que nunca vai para o GitHub.
5. **Teste da Zebra:** dê dois cliques em **`testar-zebra.bat`**. Deve sair uma
   etiqueta de teste.
6. **Ligar:** dê dois cliques em **`iniciar.bat`** e deixe a janela aberta. Para
   ele começar junto com o Windows, aperte `Windows + R`, digite
   `shell:startup` e ponha ali um atalho para o `iniciar.bat`.

## Ajustes iguais ao sistema antigo

Valem as mesmas regras do agente antigo:

- **`girar`:** use só 0 ou 180. 90 e 270 cortam a etiqueta de 6 polegadas.
- **`deslocar`:** ajuste fino da margem.
- **`impressoras`:** o apelido que vem do app (`grande`) vira o nome da
  impressora no Windows.
- **`estacao`:** precisa ser exatamente `Expedicao`, igual a
  `ESTACAO_EXPEDICAO` em `src/prtq.js`. Se um lado for diferente do outro, a
  etiqueta fica na fila para sempre.
- **Reinicie o agente depois de mudar o `config.json`.** Ele só lê o arquivo
  ao iniciar.

## Diferenças em relação ao agente antigo

- **Atualização:** não há atualização automática pelo banco. Para atualizar,
  copie a pasta nova por cima, sem apagar o `config.json` nem o
  `login-google.json`, e reabra o `iniciar.bat`.
- **Leitor de código de barras:** ainda não está ligado ao THE ONE APP. Deixe
  `"leitor": { "ligado": false }`.
- **Etiquetas do estoque (produto e caixa):** ainda saem pelo navegador. A
  fila já aceita etiquetas sem estação; falta ligar as telas do estoque.

## Quando algo não sai

| Mensagem na janela do agente | O que fazer |
|---|---|
| `falta entrar com a conta Google do agente` | Rode o `entrar-google.bat`. |
| `login recusado pelo Google` | O acesso foi revogado ou expirou. Rode o `entrar-google.bat` de novo. |
| Erro `403` ao ler a fila | A conta do agente não está cadastrada como gerente com o trabalho `agente`, ou as regras novas não foram publicadas. |
| `nao achei nenhuma impressora` | O nome em `impressoras.grande` não bate com o nome da impressora no Windows. |

O arquivo `agente.log`, nesta pasta, guarda tudo o que aconteceu.
