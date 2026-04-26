# GEAPA - Processo Seletivo

Módulo de automação do processo seletivo do GEAPA, cobrindo inscrição, verificação, agendamento de entrevistas, log privado, confirmação de presença e encaminhamento pós-entrevista.

---

## O que o módulo faz hoje

- sincroniza candidatos verificados para `SELETIVO_AVALIACAO`;
- envia e-mail inicial para escolha de horário;
- processa respostas com código de agendamento;
- valida disponibilidade e capacidade dos blocos;
- registra reservas no log privado;
- envia confirmação ao candidato;
- envia consulta de presença ao entrevistador responsável;
- processa respostas `SIM` / `NAO` do entrevistador;
- atualiza `SELETIVO_AVALIACAO` após a entrevista;
- envia comunicações pós-entrevista ao candidato;
- apoia remarcação antecipada com reaproveitamento do fluxo de agendamento.

---

## Dependências

### Library

- `GEAPA-CORE`

### Planilhas/keys usadas

- `SELETIVO_INSCRICAO`
- `SELETIVO_AVALIACAO`
- `SELETIVO_AGENDAMENTO`
- `SELETIVO_ENTREVISTADORES`
- `SELETIVO_LISTA_ENTREVISTADORES`
- `SELETIVO_RESERVAS`

Além disso, o módulo usa contatos institucionais da secretaria via `GEAPA-CORE` quando necessário nas comunicações.

---

## Fluxo funcional

### 1. Verificação da inscrição

Arquivos principais:

- `00A_OnEdit_Verificacao.gs`
- `05_Forms_VerificationAndLookup.js`
- `12_Sheets_Avaliacao.js`

Fluxo:

1. o candidato entra por `SELETIVO_INSCRICAO`;
2. a verificação manual altera o status configurado como válido;
3. o sistema sincroniza os dados básicos para `SELETIVO_AVALIACAO`;
4. envia o e-mail inicial de agendamento;
5. registra o status do envio.

### 2. Processamento do inbox de agendamento

Arquivo principal:

- `01_main_processInbox.js`

Fluxo:

- lê threads do inbox do seletivo;
- identifica a última mensagem externa válida;
- extrai o código de agendamento;
- valida slot, bloco e capacidade;
- registra a reserva;
- envia confirmação ao candidato.

### 3. Log e reservas

Arquivo principal:

- `08_Sheets_Log.js`

Responsabilidades:

- registrar a reserva no log oficial;
- calcular capacidade e total de reservas do bloco;
- manter o histórico privado das entrevistas;
- suportar remarcação antecipada.

### 4. Entrevistadores e presença

Arquivos principais:

- `07_Sheets_Interviewers.js`
- `04_Gmail_FollowUps.js`
- `03_Gmail_Core.js`

Responsabilidades:

- identificar dupla e entrevistador responsável do bloco;
- enviar consulta de presença ao entrevistador;
- rastrear thread e label da consulta;
- processar `SIM` / `NAO` após a entrevista.

### 5. Atualização da avaliação

Arquivo principal:

- `12_Sheets_Avaliacao.js`

Responsabilidades:

- localizar candidato por `RGA` ou `Email`;
- atualizar campos básicos da avaliação;
- marcar comparecimento/falta;
- recuperar valores dinâmicos como local e dados da dinâmica;
- appendar novas linhas respeitando a ordem real dos cabeçalhos.

### 6. Pós-entrevista

Fluxo:

- se o entrevistador responder `SIM`, o candidato é marcado como compareceu e recebe o e-mail da próxima etapa;
- se responder `NAO`, o candidato é marcado como faltou, é desclassificado e recebe o e-mail correspondente.

---

## Estrutura do módulo

- `00_seletivo_config.js`: configuração central.
- `00A_OnEdit_Verificacao.gs`: onEdit da verificação da inscrição.
- `00B_OnEdit_Log_Remarcacao.gs`: onEdit da remarcação no log.
- `01_main_processInbox.js`: processamento principal do inbox e respostas.
- `02_Main_RefreshVisualization.js`: atualização da visualização pública de horários.
- `03_Gmail_Core.js`: adapter Gmail do módulo, apoiado pelo `GEAPA-CORE`.
- `04_Gmail_FollowUps.js`: follow-ups e consultas de presença.
- `05_Forms_VerificationAndLookup.js`: leitura da inscrição e sync para avaliação.
- `05A_registry_first_helpers.gs`: helpers de acesso orientados ao Registry.
- `06_Sheets_GridMapping.js`: mapeamento dos grids de agendamento.
- `07_Sheets_Interviewers.js`: entrevistadores por bloco.
- `08_Sheets_Log.js`: log privado e reservas.
- `09_Utils_TextParsing.js`: parsing de texto e códigos.
- `10_Secretary_Contacts.gs`: contatos da secretaria.
- `11_Forms_CurrentSemester.gs`: resolução do semestre vigente.
- `12_Sheets_Avaliacao.js`: CRUD e leitura da avaliação.
- `50_seletivo_install.js`: instalação de triggers.

---

## Integração atual com o GEAPA-CORE

O módulo já usa o core para:

- envio HTML e replies em Gmail;
- envio rastreado de e-mails quando precisa recuperar `threadId` e `messageId`;
- extração padronizada de e-mail e nome do remetente;
- labels e marcação de threads;
- contatos institucionais da secretaria;
- leitura e escrita orientadas a cabeçalhos na aba de avaliação;
- busca por registros e subida de valores preenchidos na planilha.

---

## Observações operacionais

- o processamento do inbox depende da thread correta e do código responder ao grid vigente;
- o log privado é a fonte oficial das reservas;
- a aba `SELETIVO_AVALIACAO` concentra o estado operacional do candidato após a verificação;
- quando o core ganhar novas funções usadas pelo módulo, é necessário atualizar a versão da Library no Apps Script caso o projeto esteja preso em versão fixa.

---

## Compatibilidade de campos

- `Ocupação` é o termo preferencial para novos textos, labels e integrações do módulo.
- Durante a transição, o módulo aceita os cabeçalhos `Ocupação`, `Ocupacao`, `Cargo/Função` e `Cargo/Funcao`.
- A sincronização da inscrição para `SELETIVO_AVALIACAO` resolve esses aliases por uma camada centralizada.
- Ao escrever na avaliação, a ordem preferida é `Ocupação`/`Ocupacao`; bases legadas com `Cargo/Função`/`Cargo/Funcao` continuam funcionando sem renomeação física dos cabeçalhos.

---

## Changelog

### 2026-04-24

- Adicionada camada central de aliases para a transição semântica de `Cargo/Função` para `Ocupação`.
- A escrita da ocupação em `SELETIVO_AVALIACAO` agora prefere cabeçalhos novos e preserva compatibilidade com cabeçalhos legados.
- Documentada a estratégia de compatibilidade para a futura renomeação física dos cabeçalhos oficiais.
