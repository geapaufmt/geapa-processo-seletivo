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
/***************************************
 * 07_Sheets_Interviewers.gs — PRODUÇÃO
 ***************************************/

function getInterviewersPairsForBlock_(aggCode) {
  try {
    const target = String(aggCode || "").toUpperCase().trim();
    Logger.log("getInterviewersPairsForBlock_: aggCode=%s", target);

    const sh = GEAPA_CORE.coreGetSheetByKey(SETTINGS.interviewerKey);
    if (!sh) {
      Logger.log("getInterviewersPairsForBlock_: aba não encontrada para key=%s", SETTINGS.interviewerKey);
      return [];
    }

    const data = sh.getDataRange().getValues();
    if (!data.length) return [];

    const header = data.shift().map(h => String(h || "").trim());
    const codeIdx = header.indexOf(SETTINGS.interviewerCodeHeader);
    const nameIdxs = SETTINGS.interviewerNameHeaders.map(h => header.indexOf(h));

    if (codeIdx < 0 || nameIdxs.some(i => i < 0)) {
      Logger.log("getInterviewersPairsForBlock_: cabeçalhos obrigatórios não encontrados");
      return [];
    }

    const interviewerMap = getInterviewersNameToRgaMap_();
    Logger.log("getInterviewersPairsForBlock_: mapa Nome->RGA com %s entradas", Object.keys(interviewerMap).length);

    const pairs = [];

    for (const row of data) {
      const codeCell = String(row[codeIdx] || "").toUpperCase().trim();
      if (codeCell !== target) continue;

      const nome1 = String(row[nameIdxs[0]] || "").trim();
      const nome2 = String(row[nameIdxs[1]] || "").trim();
      if (!nome1 || !nome2) continue;

      const rga1 = interviewerMap[nome1] || "";
      const rga2 = interviewerMap[nome2] || "";

      if (!rga1 || !rga2) {
        Logger.log(
          "getInterviewersPairsForBlock_: nomes sem RGA no bloco %s -> nome1=%s rga1=%s | nome2=%s rga2=%s",
          target, nome1, rga1, nome2, rga2
        );
        continue;
      }

      pairs.push({
        nome1,
        nome2,
        rga1,
        rga2
      });
    }

    Logger.log("getInterviewersPairsForBlock_: bloco=%s paresEncontrados=%s", target, pairs.length);
    return pairs;
  } catch (e) {
    Logger.log("getInterviewersPairsForBlock_ erro: %s", e && e.stack ? e.stack : e);
    console.error("getInterviewersPairsForBlock_ erro:", e);
    return [];
  }
}

/**
 * Retorna um mapa Nome -> RGA a partir da planilha
 * SELETIVO_LISTA_ENTREVISTADORES.
 *
 * @return {Object<string,string>}
 */
function getInterviewersNameToRgaMap_() {
  try {
    const sh = GEAPA_CORE.coreGetSheetByKey(SETTINGS.interviewerListKey);
    if (!sh) {
      Logger.log("getInterviewersNameToRgaMap_: aba não encontrada para key=%s", SETTINGS.interviewerListKey);
      return {};
    }

    const values = sh.getDataRange().getValues();
    if (!values.length) return {};

    const headers = values.shift().map(h => String(h || "").trim());
    const nameIdx = headers.indexOf(SETTINGS.interviewerListNameHeader);
    const rgaIdx = headers.indexOf(SETTINGS.interviewerListRgaHeader);

    if (nameIdx < 0 || rgaIdx < 0) {
      Logger.log(
        "getInterviewersNameToRgaMap_: cabeçalhos não encontrados. Esperado nome=%s rga=%s. Encontrados=%s",
        SETTINGS.interviewerListNameHeader,
        SETTINGS.interviewerListRgaHeader,
        JSON.stringify(headers)
      );
      return {};
    }

    const map = {};
    values.forEach(row => {
      const name = String(row[nameIdx] || "").trim();
      const rga = String(row[rgaIdx] || "").trim();
      if (name && rga) map[name] = rga;
    });

    return map;
  } catch (e) {
    Logger.log("getInterviewersNameToRgaMap_ erro: %s", e && e.stack ? e.stack : e);
    console.error("getInterviewersNameToRgaMap_ erro:", e);
    return {};
  }
}