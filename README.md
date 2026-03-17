# GEAPA – Processo Seletivo (Automação)

Este módulo automatiza o **processo seletivo do GEAPA**, cobrindo desde a verificação da inscrição até o acompanhamento da entrevista e o encaminhamento pós-entrevista.

O sistema foi desenvolvido em **Google Apps Script**, com integração ao **GEAPA-CORE** e versionamento via **GitHub + CLASP**.

---

# Visão geral do que o módulo faz

O módulo atualmente é responsável por:

- verificação manual de inscrições
- sincronização de candidatos verificados para a planilha de avaliação
- envio automático de e-mail inicial para escolha de horário
- leitura de respostas por e-mail com código de agendamento
- validação de disponibilidade dos horários
- reserva do horário na planilha pública
- registro da entrevista no log privado
- identificação automática dos entrevistadores do bloco
- envio de e-mail de confirmação ao candidato
- envio de consulta de presença ao entrevistador responsável
- processamento da resposta do entrevistador (`SIM` / `NAO`)
- atualização da planilha de avaliação
- envio de e-mail ao candidato após a entrevista
- suporte a remarcação antecipada com reaproveitamento do fluxo de agendamento

---

# Arquitetura geral

O módulo funciona em conjunto com:

- Google Sheets
- Gmail
- GEAPA-CORE (Library)

Fluxo geral:

```text
Candidato
→ Formulário de inscrição
→ Planilha de inscrição
→ Verificação manual
→ Sync para planilha de avaliação
→ E-mail inicial de agendamento
→ Resposta com código
→ Processamento do inbox
→ Reserva de horário
→ Registro no log
→ Entrevista
→ Confirmação de presença pelo entrevistador
→ Atualização da avaliação
→ Encaminhamento do candidato
```

---

# Planilhas utilizadas

O módulo utiliza as seguintes planilhas/abas via Registry do GEAPA-CORE.

## 1. SELETIVO_INSCRICAO

Planilha de respostas do formulário de inscrição.

Contém os dados completos do candidato, incluindo:

- Nome Completo
- Email principal
- Telefone
- Data de nascimento
- RGA
- CPF
- Sexo
- Semestre atual
- Naturalidade
- Experiências acadêmicas
- CR
- Status de verificação

Essa planilha é a base de origem dos dados do candidato.

---

## 2. SELETIVO_AVALIACAO

Planilha de avaliação dos candidatos.

É usada para:

- registrar status do processo
- armazenar informações operacionais
- registrar presença na entrevista
- registrar resultado final
- definir o destino do candidato no fluxo do GEAPA

Também é usada para recuperar:

- Local entrevista
- Data da dinâmica
- Horário da dinâmica
- Local da dinâmica

Quando algum desses campos está vazio na linha do candidato, o sistema pode procurar o valor nas linhas acima, usando o último valor preenchido.

---

## 3. SELETIVO_AGENDAMENTO

Planilha pública de horários.

É a visualização usada pelo candidato para escolher o horário da entrevista.

Contém:

- semana
- dia
- faixa de horário
- códigos dos slots de 20 minutos
- blocos agregados de 1 hora

---

## 4. SELETIVO_ENTREVISTADORES

Aba privada com a composição das duplas por bloco.

Usada para identificar:

- entrevistadores do bloco
- entrevistador responsável
- capacidade total do bloco

---

## 5. SELETIVO_LISTA_ENTREVISTADORES

Lista de entrevistadores com dados de apoio.

Usada para mapear:

- Nome
- RGA
- Email

Essa aba é usada especialmente no fluxo de confirmação de presença pós-entrevista.

---

## 6. SELETIVO_RESERVAS

Log privado das entrevistas.

Essa é a fonte oficial do histórico de reservas.

Registra:

- semana
- dia
- faixa
- código
- bloco
- capacidade
- total de reservas
- nome / email / RGA do candidato
- dupla do bloco
- entrevistador responsável
- threadId / messageId
- status da reserva
- status da consulta de presença

---

# Fluxo funcional completo

## 1. Verificação da inscrição

A inscrição é inicialmente recebida em `SELETIVO_INSCRICAO`.

Quando a coluna de verificação é alterada para o valor configurado como **Verificado**:

- o sistema sincroniza os dados básicos do candidato para `SELETIVO_AVALIACAO`
- envia o e-mail inicial de agendamento
- registra o status do envio na planilha de inscrição

Esse fluxo é disparado por trigger instalável `onEdit`.

---

## 2. Agendamento por código

Após receber o e-mail inicial, o candidato responde com um código de horário.

Exemplo:

```text
B3
```

O sistema então:

- lê threads da label de inbox do seletivo
- identifica a última **mensagem externa**
- ignora mensagens enviadas pelo próprio GEAPA
- extrai o código
- valida a posição na planilha pública
- verifica a capacidade do bloco
- registra a reserva no log
- envia confirmação ao candidato

### Correção importante implementada

O sistema foi ajustado para **ignorar mensagens do próprio GEAPA** ao processar o thread.

Isso evita falsos códigos vindos de links internos do e-mail, como ocorria em casos de captura indevida de trechos do URL da planilha.

---

## 3. Confirmação da entrevista

Quando a reserva é aceita:

- o horário é marcado na planilha pública
- a entrevista é registrada em `SELETIVO_RESERVAS`
- o candidato recebe o e-mail de confirmação

Esse e-mail já pode incluir o **Local entrevista**, obtido da planilha `SELETIVO_AVALIACAO`.

Se a linha atual do candidato estiver vazia nesse campo, o sistema pode procurar o último valor preenchido acima.

---

## 4. Consulta de presença ao entrevistador

Após o horário da entrevista e um tempo de tolerância configurável, o sistema:

- identifica entrevistas pendentes de confirmação
- envia um e-mail ao entrevistador responsável
- pede resposta com `SIM` ou `NAO`

O thread é etiquetado para posterior processamento.

---

## 5. Processamento da resposta de presença

Quando o entrevistador responde:

### Se responder `SIM`
O sistema:

- marca a reserva como realizada
- atualiza a planilha de avaliação indicando comparecimento
- envia e-mail ao candidato com informações da próxima etapa (dinâmica)

### Se responder `NAO`
O sistema:

- marca a reserva como falta
- atualiza a avaliação
- desclassifica automaticamente o candidato por ausência na entrevista
- envia e-mail informando a desclassificação

---

## 6. Remarcação antecipada

O log suporta o status:

```text
Remarcada antecipadamente
```

Quando esse status é definido manualmente:

- a linha permanece no log como histórico
- ela deixa de contar como reserva ativa
- o sistema pode reenviar o e-mail inicial de agendamento ao candidato
- o candidato escolhe um novo código
- uma nova linha é criada no log para a nova marcação

Essa estratégia preserva histórico e evita sobrescrever reservas anteriores.

---

# Estrutura do código

## `00_seletivo_config.js`
Configurações do módulo:

- keys do Registry
- templates de e-mail
- cabeçalhos e valores de referência
- labels Gmail
- parâmetros de agendamento e presença

## `00A_OnEdit_Verificacao.gs`
Trigger de edição da planilha de inscrição.

Responsável por:

- detectar candidato verificado
- sincronizar com avaliação
- enviar e-mail inicial de agendamento

## `00B_OnEdit_Log_Remarcacao.gs`
Trigger de edição do log.

Responsável por:

- detectar `Status reserva = Remarcada antecipadamente`
- reenviar o e-mail inicial de agendamento

## `01_main_processInbox.js`
Responsável por:

- processar respostas com código de horário
- registrar reservas
- enviar confirmação ao candidato
- processar respostas de presença do entrevistador

## `02_Main_RefreshVisualization.js`
Responsável por atualizar a visualização pública de horários.

## `03_Gmail_Core.js`
Helpers de Gmail e envio de e-mails do módulo.

## `04_Gmail_FollowUps.js`
Rotinas periódicas relacionadas ao Gmail, incluindo envio de consultas de presença.

## `05_Forms_VerificationAndLookup.js`
Leitura da planilha de inscrição, verificação e sincronização para avaliação.

## `07_Sheets_Interviewers.js`
Mapeamento dos entrevistadores por bloco.

## `08_Sheets_Log.js`
Gerenciamento do log de reservas e presença.

## `09_Utils_TextParsing.js`
Parsers e helpers de texto, incluindo leitura de respostas `SIM` / `NAO`.

## `12_Sheets_Avaliacao.js`
Operações sobre a planilha de avaliação:

- localizar candidato
- atualizar status
- buscar local da entrevista
- buscar dados da dinâmica
- fallback em linhas superiores

## `50_seletivo_install.js`
Instalação e remoção de triggers.

---

# Triggers utilizados

O módulo utiliza triggers instaláveis para:

- verificar alterações em inscrição
- verificar alterações em remarcação no log
- processar inbox do seletivo
- enviar consultas de presença
- processar respostas de presença
- atualizar visualização e demais rotinas periódicas

---

# Integração com o módulo de membros

O módulo de processo seletivo não integra diretamente candidatos nas bases de membros.

A função da planilha `SELETIVO_AVALIACAO` é definir o **resultado final** do candidato.

A importação para o módulo de membros é feita no repositório `geapa-membros`, usando:

- `SELETIVO_AVALIACAO` como definidora do destino
- `SELETIVO_INSCRICAO` como fonte dos dados cadastrais

---

# Observações importantes

## Sobre contas iCloud e e-mails não Google

O restante do fluxo funciona normalmente com e-mails como:

- iCloud
- Outlook
- Hotmail
- outros

A única limitação importante está no **Google Forms com upload de arquivos**, que exige conta Google para responder.

Por isso, se o formulário do seletivo precisar aceitar candidatos sem conta Google, a recomendação é:

- remover perguntas de upload
- usar links de documentos ou envio posterior por e-mail

## Sobre leitura de threads

O sistema foi corrigido para processar apenas a **última mensagem externa válida** do thread.

Isso evita que o próprio e-mail enviado pelo GEAPA seja interpretado como resposta do candidato.

---

# Versionamento

O sistema usa:

```text
GitHub + CLASP
```

Fluxo típico:

```text
clasp pull / clasp push
git add
git commit
git push
```

---

# Autor

Sistema desenvolvido para o  
**GEAPA – Grupo de Estudos e Apoio à Produção Agrícola (UFMT)**.