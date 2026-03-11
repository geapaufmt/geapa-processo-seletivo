/***************************************
 * 00_Config.gs  (Gestor de Entrevistas)
 *
 * ✅ Refatorado para:
 * - NÃO depender de IDs hardcoded
 * - Buscar tudo via GEAPA-CORE (Library) + Planilha Geral (Registry)
 *
 * Pré-requisito no projeto:
 * - Adicionar a library do GEAPA-CORE com o identificador: GEAPA_CORE
 ***************************************/

/**
 * KEYS (Planilha Geral -> aba "Registry")
 * (essas chaves já existem no seu .xlsx "Planilha Geral")
 */
const SETTINGS = Object.freeze({
  inboxLabel: "Entrevistas/Respostas",
  processedLabel: "Entrevistas/Processados",
  errorLabel: "Entrevistas/Erros",

  publicScheduleKey: "SELETIVO_AGENDAMENTO",
  privateLogKey: "SELETIVO_RESERVAS",
  interviewerKey: "SELETIVO_ENTREVISTADORES",
  formsResponsesKey: "SELETIVO_INSCRICAO",

  // Registry keys (GEAPA-CORE vai resolver para {id, sheet})
 // registryKeys: SELETIVO_REGISTRY_KEYS,

  // Aba/colunas (iguais ao original)
  interviewerCodeHeader: "Código",
  interviewerRgaHeaders: ["RGA1", "RGA2"],

  formsRgaHeader: "RGA",

  verifiedStatusValue: "Verificado",       // valor que libera a confirmação
  verificationStatusHeader: "Verificação", // NOME exato da coluna na planilha do Forms

  verificationSubject: "Aguardando verificação do cadastro",
  verificationHtml: `
    <p>Olá, <b>{{NOME}}</b>!</p>
    <p>Recebemos seu código <b>{{CODIGO}}</b>, mas seu cadastro ainda está em <b>verificação</b>.</p>
    <p>Assim que concluirmos a triagem e seu status for <b>Verificado</b>, você poderá confirmar o horário.</p>
    <p>Se já regularizou, aguarde alguns minutos e tente novamente, ou aguarde até enviarmos outro email de agendamento.</p>
  `,

  // Regras de mapeamento por dia (coluna da grade -> prefixo do bloco)
  AGG_RULES: [
    { dayColumnLetter: "B", aggPrefix: "AB" }, // Segunda
    { dayColumnLetter: "C", aggPrefix: "AC" }, // Terça
    // { dayColumnLetter: "D", aggPrefix: "AD" }, // Quarta (opcional)
  ],
  groupSize: 3,    // 3 slots de 20' formam 1 bloco de 1h
  firstSlotRow: 2, // primeira linha válida de horário (B2/C2...)

  // Texto da célula
  reservedTextPublic: "Agendado",

  // Templates de e-mail
  confirmSubject: "Confirmação de Entrevista",
  confirmHtml: `
    <p>Olá, <b>{{NOME}}</b>!</p>
    <p>Seu horário <b>{{CODIGO}}</b> foi <b>confirmado</b> para <b>{{DIA}}</b> – <b>{{FAIXA}}</b> ({{SEMANA}}).</p>
    <p>Qualquer imprevisto, nos envie um email, ou entre em contato com um dos número abaixo:</p>
    <p><b>Gabriela: 66 99614-5270<br>Matheus: 99 99137-8278<b></p>
    <p>Até breve!<br>Equipe de Seleção</p>
  `,

  denySubject: "Horário indisponível",
  denyHtml: `
    <p>Olá, <b>{{NOME}}</b>!</p>
    <p>O horário <b>{{CODIGO}}</b> informado <b>não está disponível</b>.</p>
    <p>Por favor, consulte a planilha de horários e responda com outro código.</p>
  `,

  // Regex do código (B2, C12, AB3…)
  codeRegex: /([A-Z]{1,3}\d{1,4})/i,
});

/**
 * Script B: placeholder quando bloco inativo (mantido do original)
 */
const PLACEHOLDER_WHEN_BLOCK_INACTIVE = ""; // ou "—"


/* ======================================================================
 * Helpers de integração com o GEAPA-CORE (resolução via Registry)
 * - Mantém o módulo independente da planilha do Forms
 * - A partir daqui, o restante do código só “chama” as planilhas
 * ====================================================================== */

function seletivo_assertCore_() {
  if (typeof GEAPA_CORE === "undefined") {
    throw new Error(
      'Library "GEAPA-CORE" não encontrada. Adicione a library e use o identificador GEAPA_CORE.'
    );
  }
}

/** Retorna {id, sheet} para uma key do registry. */
function seletivo_ref_(key) {
  seletivo_assertCore_();
  return GEAPA_CORE.coreGetRegistryRefByKey(key);
}

/** Abre o Sheet diretamente pela key. */
function seletivo_sheetByKey_(key) {
  seletivo_assertCore_();
  return GEAPA_CORE.coreGetSheetByKey(key);
}

/** Sheets do seletivo (atalhos) */
function seletivo_getPublicScheduleSheet_() {
  return seletivo_sheetByKey_(SETTINGS.publicScheduleKey);
}
function seletivo_getPrivateLogSheet_() {
  return seletivo_sheetByKey_(SETTINGS.privateLogKey);
}
function seletivo_getInterviewersSheet_() {
  return seletivo_sheetByKey_(SETTINGS.interviewerKey);
}
function seletivo_getFormsResponsesSheet_() {
  return seletivo_sheetByKey_(SETTINGS.formsResponsesKey);
}