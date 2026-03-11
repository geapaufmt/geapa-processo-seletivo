/***************************************
 * 07_Sheets_Interviewers.gs — INTEGRADO c/ GEAPA-CORE + Registry
 *
 * Objetivo:
 * - Parar de depender de sheetId/sheetName hardcoded.
 * - Usar a planilha/aba via KEY do Registry quando disponível.
 *
 * Compatibilidade:
 * - Mantém a assinatura original (sheetId, sheetName, ...) para não quebrar
 *   o Script A agora.
 * - Mas se SETTINGS.interviewerKey existir, ele IGNORA sheetId/sheetName e usa
 *   GEAPA_CORE.coreGetSheetByKey(SETTINGS.interviewerKey).
 ***************************************/

function getInterviewersPairsForBlock_(sheetId, sheetName, codeHeader, rgaHeaders, aggCode) {
  try {
    const sh = SETTINGS.interviewerKey
      ? GEAPA_CORE.coreGetSheetByKey(SETTINGS.interviewerKey)
      : GEAPA_CORE.coreGetSheetById(sheetId, sheetName);

    if (!sh) return [];

    const data = sh.getDataRange().getValues();
    const header = data.shift();
    if (!header) return [];

    const codeIdx = header.indexOf(codeHeader);
    const rgaIdxs = (rgaHeaders || []).map(h => header.indexOf(h));
    if (codeIdx < 0 || rgaIdxs.some(i => i < 0)) return [];

    const target = String(aggCode || "").toUpperCase().trim();
    if (!target) return [];

    const pairs = [];
    for (const row of data) {
      const codeCell = String(row[codeIdx] || "").toUpperCase().trim();
      if (codeCell !== target) continue;

      const rgas = rgaIdxs.map(i => String(row[i] || "").trim()).filter(Boolean);
      if (rgas.length >= 2) pairs.push([rgas[0], rgas[1]]);
    }
    return pairs;
  } catch (e) {
    console.error("getInterviewersPairsForBlock_ erro:", e);
    return [];
  }
}