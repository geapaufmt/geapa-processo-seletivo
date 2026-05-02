# GEAPA - Processo Seletivo

Modulo de automacao do processo seletivo do GEAPA, cobrindo inscricao, verificacao, agendamento de entrevistas, log privado, confirmacao de presenca e encaminhamento pos-entrevista.

---

## O que o modulo faz hoje

- sincroniza candidatos verificados para `SELETIVO_AVALIACAO`;
- envia e-mail inicial para escolha de horario;
- processa respostas com codigo de agendamento;
- valida disponibilidade e capacidade dos blocos;
- registra reservas no log privado;
- envia confirmacao ao candidato;
- envia consulta de presenca ao entrevistador responsavel;
- processa respostas `SIM` / `NAO` do entrevistador;
- atualiza `SELETIVO_AVALIACAO` apos a entrevista;
- envia comunicacoes pos-entrevista ao candidato;
- apoia remarcacao antecipada com reaproveitamento do fluxo de agendamento.

---

## Dependencias

### Library

- `GEAPA-CORE`

### Planilhas/keys usadas

- `SELETIVO_INSCRICAO`
- `SELETIVO_AVALIACAO`
- `SELETIVO_AGENDAMENTO`
- `SELETIVO_ENTREVISTADORES`
- `SELETIVO_LISTA_ENTREVISTADORES`
- `SELETIVO_RESERVAS`

Alemdisso, o modulo usa contatos institucionais da secretaria via `GEAPA-CORE` quando necessario nas comunicacoes.

---

## Fluxo funcional

### 1. Verificacao da inscricao

Arquivos principais:

- `00A_OnEdit_Verificacao.gs`
- `05_Forms_VerificationAndLookup.js`
- `12_Sheets_Avaliacao.js`

Fluxo:

1. o candidato entra por `SELETIVO_INSCRICAO`;
2. a verificacao manual altera o status configurado como valido;
3. o sistema sincroniza os dados basicos para `SELETIVO_AVALIACAO`;
4. envia o e-mail inicial de agendamento;
5. registra o status do envio.

### 2. Processamento do inbox de agendamento

Arquivo principal:

- `01_main_processInbox.js`

Fluxo:

- le threads do inbox do seletivo;
- identifica a ultima mensagem externa valida;
- extrai o codigo de agendamento;
- valida slot, bloco e capacidade;
- registra a reserva;
- envia confirmacao ao candidato.

### 3. Log e reservas

Arquivo principal:

- `08_Sheets_Log.js`

Responsabilidades:

- registrar a reserva no log oficial;
- calcular capacidade e total de reservas do bloco;
- manter o historico privado das entrevistas;
- suportar remarcacao antecipada.

### 4. Entrevistadores e presenca

Arquivos principais:

- `07_Sheets_Interviewers.js`
- `04_Gmail_FollowUps.js`
- `03_Gmail_Core.js`

Responsabilidades:

- identificar dupla e entrevistador responsavel do bloco;
- enviar consulta de presenca ao entrevistador;
- rastrear thread e label da consulta;
- processar `SIM` / `NAO` apos a entrevista.

### 5. Atualizacao da avaliacao

Arquivo principal:

- `12_Sheets_Avaliacao.js`

Responsabilidades:

- localizar candidato por `RGA` ou `Email`;
- atualizar campos basicos da avaliacao;
- marcar comparecimento/falta;
- recuperar valores dinamicos como local e dados da dinamica;
- appendar novas linhas respeitando a ordem real dos cabecalhos.

### 6. Pos-entrevista

Fluxo:

- se o entrevistador responder `SIM`, o candidato e marcado como compareceu e recebe o e-mail da proxima etapa;
- se responder `NAO`, o candidato e marcado como faltou, e desclassificado e recebe o e-mail correspondente.

---

## Estrutura do modulo

- `00_seletivo_config.js`: configuracao central.
- `00A_OnEdit_Verificacao.gs`: onEdit da verificacao da inscricao.
- `00B_OnEdit_Log_Remarcacao.gs`: onEdit da remarcacao no log.
- `00C_Operational_Control.gs`: integracao com `MODULOS_CONFIG` e `MODULOS_STATUS`.
- `01_main_processInbox.js`: processamento principal do inbox e respostas.
- `02_Main_RefreshVisualization.js`: atualizacao da visualizacao publica de horarios.
- `03_Gmail_Core.js`: adapter Gmail do modulo, apoiado pelo `GEAPA-CORE`.
- `04_Gmail_FollowUps.js`: follow-ups e consultas de presenca.
- `05_Forms_VerificationAndLookup.js`: leitura da inscricao e sync para avaliacao.
- `05A_registry_first_helpers.gs`: helpers de acesso orientados ao Registry.
- `06_Sheets_GridMapping.js`: mapeamento dos grids de agendamento.
- `07_Sheets_Interviewers.js`: entrevistadores por bloco.
- `08_Sheets_Log.js`: log privado e reservas.
- `09_Utils_TextParsing.js`: parsing de texto e codigos.
- `10_Secretary_Contacts.gs`: contatos da secretaria.
- `11_Forms_CurrentSemester.gs`: resolucao do semestre vigente.
- `12_Sheets_Avaliacao.js`: CRUD e leitura da avaliacao.
- `50_seletivo_install.js`: instalacao de triggers.

---

## Integracao atual com o GEAPA-CORE

O modulo ja usa o core para:

- envio HTML e replies em Gmail;
- envio rastreado de e-mails quando precisa recuperar `threadId` e `messageId`;
- extracao padronizada de e-mail e nome do remetente;
- labels e marcacao de threads;
- contatos institucionais da secretaria;
- leitura e escrita orientadas a cabecalhos na aba de avaliacao;
- busca por registros e subida de valores preenchidos na planilha;
- controle operacional central via `MODULOS_CONFIG`;
- status operacional via `MODULOS_STATUS`.

---

## Observacoes operacionais

- o processamento do inbox depende da thread correta e do codigo responder ao grid vigente;
- o log privado e a fonte oficial das reservas;
- a aba `SELETIVO_AVALIACAO` concentra o estado operacional do candidato apos a verificacao;
- quando o core ganhar novas funcoes usadas pelo modulo, e necessario atualizar a versao da Library no Apps Script caso o projeto esteja preso em versao fixa.

---

## Controle operacional central

O modulo agora consulta `MODULOS_CONFIG` antes de rodar os entrypoints principais, sempre via API publica do `GEAPA-CORE`. A busca usa `MODULO = SELETIVO`, primeiro no fluxo especifico e depois em `GERAL` como fallback.

Fluxos cobertos nesta etapa:

- `VERIFICACAO_INSCRICAO`
- `AGENDAMENTO_INBOX`
- `REMARCACAO`
- `PRESENCA_ENTREVISTADOR`
- `POS_ENTREVISTA`
- `REFRESH_VISUALIZACAO`

Capability principal por entrypoint:

- `VERIFICACAO_INSCRICAO`: `SYNC`
- `AGENDAMENTO_INBOX`: `INBOX`
- `REMARCACAO`: `SYNC`
- `PRESENCA_ENTREVISTADOR`: `EMAIL`
- `POS_ENTREVISTA`: `INBOX`
- `REFRESH_VISUALIZACAO`: `SYNC`

Subefeitos operacionais respeitados nesta integracao:

- `VERIFICACAO_INSCRICAO`: `SYNC` e `EMAIL`
- `AGENDAMENTO_INBOX`: `INBOX` e `SYNC`
- `REMARCACAO`: `EMAIL`
- `PRESENCA_ENTREVISTADOR`: `EMAIL`
- `POS_ENTREVISTA`: `INBOX`, `SYNC` e `EMAIL`
- `REFRESH_VISUALIZACAO`: `SYNC`

Tratamento dos modos:

- `ON`: execucao normal
- `OFF`: bloqueia o fluxo e registra o bloqueio em `MODULOS_STATUS`
- `MANUAL`: bloqueia execucao automatica por trigger, mas permite chamada manual
- `DRY_RUN`: deixa o fluxo ler, validar e registrar status, mas impede efeitos reais como envio de e-mail, alteracao de labels, confirmacao definitiva de reserva e escritas operacionais

Observabilidade registrada:

- `ULTIMA_EXECUCAO`
- `ULTIMO_SUCESSO`
- `ULTIMO_ERRO`
- `MENSAGEM_ULTIMO_ERRO`
- `ULTIMO_BLOQUEIO_CONFIG`
- `MOTIVO_ULTIMO_BLOQUEIO`
- `ULTIMO_MODO_LIDO`
- `ULTIMA_CAPABILITY`

Ponto ainda nao coberto por esta etapa:

- `seletivo_updateCurrentSemesterColumn` permanece fora da camada central de controle operacional.

---

## Compatibilidade de campos

- `Ocupacao` e o termo preferencial para novos textos, labels e integracoes do modulo.
- Durante a transicao, o modulo aceita os cabecalhos `Ocupacao`, `Cargo/Função`, `Cargo/Funcao` e `Ocupação`.
- A sincronizacao da inscricao para `SELETIVO_AVALIACAO` resolve esses aliases por uma camada centralizada.
- Ao escrever na avaliacao, a ordem preferida e `Ocupacao`/`Ocupação`; bases legadas com `Cargo/Função`/`Cargo/Funcao` continuam funcionando sem renomeacao fisica dos cabecalhos.

---

## Changelog

### 2026-04-24

- Adicionada camada central de aliases para a transicao semantica de `Cargo/Função` para `Ocupação`.
- A escrita da ocupacao em `SELETIVO_AVALIACAO` agora prefere cabecalhos novos e preserva compatibilidade com cabecalhos legados.
- Documentada a estrategia de compatibilidade para a futura renomeacao fisica dos cabecalhos oficiais.

### 2026-05-01

- Integrada a camada central de controle operacional do `GEAPA-CORE` com `MODULOS_CONFIG` e `MODULOS_STATUS`.
- Os entrypoints principais agora consultam `MODULO = SELETIVO` com fallback de fluxo especifico para `GERAL`.
- `DRY_RUN` passou a executar leitura, parsing, validacao e logs, mas suprimir efeitos reais como e-mail, labels, confirmacao de reserva e escritas operacionais.
