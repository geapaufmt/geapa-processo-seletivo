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

/***************************************
 * Sync Inscrição verificada -> Avaliação
 ***************************************/

/**
 * Sincroniza UMA linha da planilha de inscrição para a Avaliação,
 * mas somente se o status de verificação estiver como "Verificado".
 */
function seletivo_syncInscricaoVerificadaParaAvaliacaoByRow_(rowNumber) {
  try {
    const inscricaoObj = seletivo_getInscricaoObjByRow_(rowNumber);
    if (!inscricaoObj) {
      Logger.log('seletivo_syncInscricaoVerificadaParaAvaliacaoByRow_: linha inválida ' + rowNumber);
      return false;
    }

    if (!seletivo_isInscricaoVerificada_(inscricaoObj)) {
      Logger.log('Linha ' + rowNumber + ' ainda não está verificada. Nada enviado para Avaliação.');
      return false;
    }

    const res = seletivo_upsertAvaliacaoFromInscricao_(inscricaoObj);
    Logger.log('Sync inscrição -> Avaliação concluído. Linha ' + rowNumber + ' | ação=' + JSON.stringify(res));
    return true;
  } catch (e) {
    console.error('seletivo_syncInscricaoVerificadaParaAvaliacaoByRow_ erro:', e);
    return false;
  }
}

/**
 * Sincroniza TODAS as inscrições verificadas para a Avaliação.
 * Útil para rodar manualmente e corrigir/repovoar.
 */
function seletivo_syncAllInscricoesVerificadasParaAvaliacao_() {
  try {
    const sh = getFormsResponsesSheet_();
    if (!sh) {
      throw new Error('Planilha de respostas do Forms não encontrada.');
    }

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2) {
      Logger.log('Nenhuma resposta de inscrição encontrada.');
      return { total: 0, verificadas: 0, sincronizadas: 0 };
    }

    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
    const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

    let verificadas = 0;
    let sincronizadas = 0;

    for (let i = 0; i < values.length; i++) {
      const rowObj = seletivo_rowArrayToObject_(headers, values[i]);
      if (!seletivo_isInscricaoVerificada_(rowObj)) continue;

      verificadas++;
      const ok = seletivo_upsertAvaliacaoFromInscricao_(rowObj);
      if (ok) sincronizadas++;
    }

    const resumo = {
      total: values.length,
      verificadas: verificadas,
      sincronizadas: sincronizadas
    };

    Logger.log('seletivo_syncAllInscricoesVerificadasParaAvaliacao_ -> ' + JSON.stringify(resumo));
    return resumo;
  } catch (e) {
    console.error('seletivo_syncAllInscricoesVerificadasParaAvaliacao_ erro:', e);
    return { error: String(e) };
  }
}

/**
 * Lê uma linha específica da planilha do Forms e devolve como objeto.
 */
function seletivo_getInscricaoObjByRow_(rowNumber) {
  const sh = getFormsResponsesSheet_();
  Logger.log('seletivo_getInscricaoObjByRow_: sh=' + sh);
  Logger.log('seletivo_getInscricaoObjByRow_: rowNumber=' + rowNumber);

  if (!sh) {
    throw new Error('Planilha de respostas do Forms não encontrada.');
  }

  const lastCol = sh.getLastColumn();
  Logger.log('seletivo_getInscricaoObjByRow_: lastCol=' + lastCol);

  if (rowNumber < 2 || rowNumber > sh.getLastRow()) {
    Logger.log('seletivo_getInscricaoObjByRow_: rowNumber fora do intervalo.');
    return null;
  }

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const row = sh.getRange(rowNumber, 1, 1, lastCol).getValues()[0];

  return seletivo_rowArrayToObject_(headers, row);
}

/**
 * Diz se a inscrição está marcada como verificada.
 * Usa SETTINGS.verificationStatusHeader e SETTINGS.verifiedStatusValue,
 * mantendo compatibilidade com a config que você já usa.
 */
function seletivo_isInscricaoVerificada_(inscricaoObj) {
  if (!inscricaoObj) return false;

  const statusHeader = String(SETTINGS.verificationStatusHeader || '').trim();
  const verifiedValue = String(SETTINGS.verifiedStatusValue || 'Verificado').trim().toLowerCase();

  if (!statusHeader) return false;

  const statusAtual = String(inscricaoObj[statusHeader] || '').trim().toLowerCase();
  return statusAtual === verifiedValue;
}

/**
 * Helper simples: converte linha array em objeto usando os headers.
 */
function seletivo_rowArrayToObject_(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i];
  }
  return obj;
}

/**
 * Semestre atual do seletivo.
 * Se você já tiver uma função melhor no 11_Forms_CurrentSemester.gs,
 * pode trocar a implementação daqui para chamá-la.
 */
function seletivo_getSemestreSeletivoAtual_() {
  try {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const periodo = mes <= 6 ? '1' : '2';
    return ano + '/' + periodo;
  } catch (e) {
    console.error('seletivo_getSemestreSeletivoAtual_ erro:', e);
    return '';
  }
}