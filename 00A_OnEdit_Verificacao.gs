/***************************************
 * 00A_OnEdit_Verificacao.gs
 *
 * Dispara o primeiro e-mail do seletivo quando
 * a coluna de verificação for alterada para "Verificado".
 ***************************************/

/**
 * Trigger instalável de edição da planilha.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function seletivo_onEditVerificacao(e) {
  try {
    seletivo_assertCore_();

    if (!e || !e.range) return;

    const sh = e.range.getSheet();
    const targetSheet = GEAPA_CORE.coreGetSheetByKey(SETTINGS.formsResponsesKey);
    if (!targetSheet) return;

    if (sh.getSheetId() !== targetSheet.getSheetId()) return;

    const row = e.range.getRow();
    if (row < 2) return;

    const lastCol = sh.getLastColumn();
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());

    const verificationIdx = headers.indexOf(String(SETTINGS.verificationStatusHeader || "").trim());
    if (verificationIdx < 0) {
      throw new Error(`Cabeçalho "${SETTINGS.verificationStatusHeader}" não encontrado.`);
    }

    if (e.range.getColumn() !== verificationIdx + 1) return;

    const newValue = String(e.value || "").trim().toLowerCase();
    const verifiedValue = String(SETTINGS.verifiedStatusValue || "").trim().toLowerCase();

    if (newValue !== verifiedValue) return;

    seletivo_processVerifiedRow_(sh, row, headers);
  } catch (err) {
    console.error("seletivo_onEditVerificacao erro:", err);
  }
}

function seletivo_processVerifiedRow_(sh, row, headers) {
  const lastCol = sh.getLastColumn();
  const rowValues = sh.getRange(row, 1, 1, lastCol).getValues()[0];

  const emailIdx = headers.findIndex(h => {
    const s = String(h || "").toLowerCase();
    return s.includes("e-mail") || s.includes("email") || s.includes("endereço de e-mail");
  });

  const nameIdx = headers.findIndex(h => {
    const s = String(h || "").toLowerCase();
    return s === "nome" || s.includes("nome completo");
  });

  const emailStatusIdx = headers.indexOf(String(SETTINGS.emailStatusHeader || "").trim());
  const noteIdx = headers.indexOf(String(SETTINGS.postVerificationNoteHeader || "").trim());

  if (emailIdx < 0) throw new Error("Coluna de email não encontrada.");

  const email = String(rowValues[emailIdx] || "").trim();
  if (!email) throw new Error(`Linha ${row}: email vazio.`);

  const nome = nameIdx >= 0 ? String(rowValues[nameIdx] || "").trim() : "";

  // evita reenvio
  if (emailStatusIdx >= 0) {
    const current = String(rowValues[emailStatusIdx] || "").toLowerCase();
    if (current.includes("e-mail enviado")) return;
  }

  seletivo_sendInitialSchedulingEmail_(email, nome);

  if (emailStatusIdx >= 0) {
    sh.getRange(row, emailStatusIdx + 1).setValue(
      `E-mail enviado em ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss")}`
    );
  }

  if (noteIdx >= 0) {
    sh.getRange(row, noteIdx + 1).setValue("Envio disparado após verificação.");
  }
}

function seletivo_sendInitialSchedulingEmail_(email, nome) {
  const scheduleSheet = GEAPA_CORE.coreGetSheetByKey(SETTINGS.publicScheduleKey);
  const scheduleUrl = scheduleSheet ? scheduleSheet.getParent().getUrl() : "";

  const dict = {
    NOME: nome || "candidato(a)",
    LINK_PLANILHA: scheduleUrl
  };

  const subject = SETTINGS.inviteSubject;
  const htmlBody = fill_(SETTINGS.inviteHtml, dict);

  MailApp.sendEmail({
    to: email,
    subject,
    htmlBody
  });
}