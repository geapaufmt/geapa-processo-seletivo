# GEAPA – Processo Seletivo (Automação)

Este módulo automatiza o **processo seletivo do GEAPA**, gerenciando:

- verificação de inscrições
- envio automático de convites
- agendamento de entrevistas por código
- controle de disponibilidade de horários
- registro das entrevistas no log
- identificação de entrevistadores responsáveis
- integração futura com a planilha de avaliação dos candidatos

O sistema foi desenvolvido em **Google Apps Script**, com integração ao **GEAPA-CORE** e versionamento via **GitHub + CLASP**.

---

# Arquitetura do sistema

O módulo funciona em conjunto com:

- Google Sheets  
- Gmail  
- GEAPA-CORE (Library)

Fluxo geral do sistema:

```
Candidato → Planilha de Inscrição
           → Verificação manual
           → Envio automático de e-mail
           → Candidato responde com código
           → Sistema processa inbox
           → Reserva horário de entrevista
           → Registro na planilha de log
           → Processo de avaliação posterior
```

---

# Estrutura das Planilhas

O sistema utiliza várias planilhas com funções específicas.

---

# 1. Planilha de Inscrição

Contém os dados enviados pelo formulário de inscrição.

Campos principais:

- Nome
- Email
- RGA
- Semestre
- Experiências acadêmicas
- CR
- Verificado

Quando **Verificado = TRUE**, o sistema:

1. envia o e-mail de convite para agendamento  
2. inicia o fluxo de entrevistas

---

# 2. Planilha Pública de Agendamento

Contém os horários disponíveis para entrevista.

Cada slot possui:

- Semana
- Dia
- Faixa de horário
- Código de agendamento (20 min)
- Bloco de entrevista (1h)

Exemplo:

```
Semana 1
Segunda

18:00–18:20 → A1
18:20–18:40 → A2
18:40–19:00 → A3
```

O candidato agenda respondendo o e-mail com o código.

Exemplo:

```
B3
```

---

# 3. Planilha de Entrevistadores

Define quais entrevistadores participam de cada bloco.

Exemplo:

| Bloco | Entrevistador 1 | Entrevistador 2 |
|------|------|------|
| A | João | Maria |
| B | Pedro | Ana |

Esses nomes são convertidos automaticamente em **RGA** usando a lista de entrevistadores.

---

# 4. Lista de Entrevistadores

Contém o mapeamento:

| Nome | RGA |
|-----|-----|
| João | 202011234 |
| Maria | 202022345 |

Essa planilha é usada para:

- identificar entrevistadores
- registrar RGAs no log
- determinar entrevistador responsável

---

# 5. Planilha de Log (Reservas)

Registra cada entrevista agendada.

Campos principais:

| Campo | Descrição |
|------|------|
Timestamp | momento do registro |
Semana | semana da entrevista |
Dia | dia da semana |
Faixa | horário da entrevista |
Código (20min) | código escolhido |
Bloco (1h) | bloco da entrevista |
Capacidade | capacidade do bloco |
Reservas (após) | total após registro |
Nome | candidato |
Email | candidato |
RGA candidato | identificador |
Entrevistadores do bloco | dupla completa |
Entrevistador responsável | responsável pelo slot |
RGA entrevistador responsável | identificador |
ThreadId | conversa no Gmail |
MessageId | mensagem específica |

Essa planilha é a **fonte oficial das entrevistas agendadas**.

---

# Fluxo completo do processo seletivo

## 1. Inscrição

O candidato preenche o formulário.

Os dados vão para:

```
Planilha de Inscrição
```

---

# 2. Verificação

Um membro do GEAPA verifica a inscrição.

Quando a coluna **Verificado** é marcada:

```
onEdit trigger
```

O sistema:

1. envia e-mail ao candidato  
2. inclui os códigos disponíveis  
3. inicia o processo de agendamento  

---

# 3. Escolha do horário

O candidato responde ao e-mail com um código.

Exemplo:

```
B3
```

---

# 4. Processamento do Inbox

A função responsável é:

```
seletivo_processInbox()
```

Essa função:

1. lê novos e-mails
2. extrai o código enviado
3. valida se o código existe
4. verifica se ainda há vaga
5. reserva o horário

---

# 5. Identificação do entrevistador

O sistema identifica:

- bloco da entrevista
- dupla de entrevistadores
- entrevistador responsável

Função responsável:

```
getInterviewersPairsForBlock_()
```

---

# 6. Registro da entrevista

A reserva é registrada no log.

Função:

```
appendLogRow_()
```

---

# Estrutura do código

Arquivos principais do módulo.

---

## 00_Config.gs

Contém:

- constantes do sistema
- nomes de planilhas
- cabeçalhos
- templates de e-mail

---

## 01_Main_ProcessInbox.gs

Responsável por:

- ler e-mails recebidos
- identificar códigos
- validar disponibilidade
- registrar reservas

---

## 02_Main_RefreshVisualization.gs

Atualiza:

- planilha pública de horários
- disponibilidade dos slots

---

## 07_Sheets_Interviewers.gs

Responsável por:

- localizar entrevistadores do bloco
- converter nomes em RGAs
- identificar entrevistador responsável

Funções principais:

```
getInterviewersPairsForBlock_
getInterviewersNameToRgaMap_
```

---

## 08_Sheets_Log.gs

Gerencia o log de entrevistas.

Funções:

```
ensureLogSheet_
appendLogRow_
countBookings_
alreadyLogged_
```

---

# Integração com GEAPA-CORE

O sistema utiliza o **GEAPA-CORE como library**.

Funções usadas:

```
coreGetSheetByKey()
core_getRegistry_()
```

Isso permite que:

- planilhas sejam referenciadas por **KEY**
- o sistema não dependa de IDs fixos

---

# Triggers utilizados

## onEdit

Disparado quando:

```
coluna Verificado = TRUE
```

Função executada:

```
enviarConviteEntrevista
```

---

## Time Trigger

Executa periodicamente:

```
seletivo_processInbox
```

Responsável por processar respostas de e-mail.

---

# Integração futura: Planilha de Avaliação

Quando o candidato for **verificado**, seus dados poderão ser copiados automaticamente para:

```
Planilha Avaliação dos Candidatos
```

Campos transferidos:

- semestre do seletivo
- nome
- email
- RGA
- semestre atual
- experiências
- CR

Essa planilha será usada para:

- registrar notas da entrevista
- registrar dinâmica
- calcular nota final
- definir resultado

---

# Melhorias futuras

## Confirmação automática da entrevista

Após o horário da entrevista:

- o sistema envia e-mail ao entrevistador responsável
- pergunta se a entrevista ocorreu

Possíveis respostas:

```
Entrevistado
Ausente
Remarcado
```

---

## Desclassificação automática por ausência

Se:

- candidato não compareceu
- não houve justificativa

o sistema poderá marcar:

```
Resultado = Desclassificado
```

---

## Envio automático de resultados

Com base na planilha de avaliação.

---

# Versionamento

O sistema usa:

```
GitHub + CLASP
```

Fluxo de desenvolvimento:

```
Apps Script
↓
clasp pull
↓
Git commit
↓
Git push
```

---

# Autor

Sistema desenvolvido para o  
**GEAPA – Grupo de Estudos e Apoio à Produção Agrícola (UFMT)**.