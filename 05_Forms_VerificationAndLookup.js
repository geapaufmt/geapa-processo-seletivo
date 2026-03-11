/***************************************
 * 05_Forms_VerificationAndLookup.gs
 * (Script C - parte 2 + fetchRGA) — INTEGRADO c/ GEAPA-CORE + Registry
 *
 * O que muda:
 * - Abre a planilha do Forms via KEY do Registry (SETTINGS.formsResponsesKey)
 * - Mantém a lógica de varrer de baixo pra cima (último registro prevalece)
 *
 * Compatibilidade:
 * - Mantive fetchRGAByEmail_ com a mesma assinatura antiga (sheetId, sheetName, ...)
 *   para você não quebrar chamadas existentes.
 * - Mas por dentro, se SETTINGS.formsResponsesKey existir, ele ignora sheetId/sheetName
 *   e usa o Registry (mais seguro).
 ***************************************/

function isVerifiedByEmail_UsingForms_(candidateEmail) {
  try {
    if (!candidateEmail || !SETTINGS.verificationStatusHeader) return false;

    const sh = getFormsResponsesSheet_();
    if (!sh) return false;

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2) return false;

    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

    const emailIdx = headers.findIndex(h => {
      const s = String(h).toLowerCase();
      return s.includes("e-mail") || s.includes("email") || s.includes("endereço de e-mail");
    });
    if (emailIdx === -1) return false;

    const statusIdx = headers.indexOf(String(SETTINGS.verificationStatusHeader).trim());
    if (statusIdx === -1) return false;

    const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const target = String(candidateEmail).trim().toLowerCase();
    const wanted = String(SETTINGS.verifiedStatusValue || "").trim().toLowerCase();

    for (let i = values.length - 1; i >= 0; i--) {
      const row = values[i];
      const email = String(row[emailIdx] || "").trim().toLowerCase();
      if (email && email === target) {
        const status = String(row[statusIdx] || "").trim().toLowerCase();
        return status === wanted;
      }
    }
    return false;
  } catch (err) {
    console.error("isVerifiedByEmail_UsingForms_ erro:", err);
    return false;
  }
}

/**
 * Mantém assinatura original usada no Script A.
 * Se SETTINGS.formsResponsesKey estiver definido, usa Registry e ignora sheetId/sheetName.
 */
function fetchRGAByEmail_(sheetId, sheetName, rgaHeader, candidateEmail) {
  try {
    if (!rgaHeader || !candidateEmail) return "";

    const sh = SETTINGS.formsResponsesKey
      ? getFormsResponsesSheet_()
      : getSheetByIdAndName_(sheetId, sheetName);

    if (!sh) return "";

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2) return "";

    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

    const rgaIdx = headers.indexOf(String(rgaHeader).trim());
    if (rgaIdx === -1) return "";

    const emailIdx = headers.findIndex(h => {
      const s = String(h).toLowerCase();
      return s.includes("e-mail") || s.includes("email") || s.includes("endereço de e-mail");
    });
    if (emailIdx === -1) return "";

    const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const target = String(candidateEmail).trim().toLowerCase();

    for (let i = values.length - 1; i >= 0; i--) {
      const row = values[i];
      const e = String(row[emailIdx] || "").trim().toLowerCase();
      if (e && e === target) return String(row[rgaIdx] || "").trim();
    }
    return "";
  } catch (e) {
    console.error("fetchRGAByEmail_ erro:", e);
    return "";
  }
}

/**
 * ===== Helpers =====
 */

function getFormsResponsesSheet_() {
  // Preferencial: Registry
  if (SETTINGS.formsResponsesKey) {
    return GEAPA_CORE.coreGetSheetByKey(SETTINGS.formsResponsesKey);
  }

  // Fallback: config antiga
  if (SETTINGS.formsResponsesSpreadsheetId && SETTINGS.formsResponsesSheetName) {
    return GEAPA_CORE.coreGetSheetById(SETTINGS.formsResponsesSpreadsheetId, SETTINGS.formsResponsesSheetName);
  }
  return null;
}

function getSheetByIdAndName_(sheetId, sheetName) {
  if (!sheetId || !sheetName) return null;
  return GEAPA_CORE.coreGetSheetById(sheetId, sheetName);
}