/***************************************
 * 08_Sheets_Log.gs — OK c/ GEAPA-CORE
 ***************************************/

function ensureLogSheet_(ssLog, sheetNameOverride) {
  const sheetName = String(sheetNameOverride ?? SETTINGS.privateLogSheetName ?? "").trim();

  if (!sheetName) {
    throw new Error("ensureLogSheet_: nome da aba de log está vazio. Confira SETTINGS.privateLogSheetName ou Registry(SHEET_NAME).");
  }

  let shLog = ssLog.getSheetByName(sheetName);
  if (!shLog) {
    shLog = ssLog.insertSheet(sheetName);
    shLog.appendRow(getLogHeaders_());
  }

  return shLog;
}

function getLogHeaders_() {
  return [
    "Timestamp",
    "Semana",
    "Dia",
    "Faixa",
    "Código (20min)",
    "Bloco (1h)",
    "Capacidade",
    "Reservas (após)",
    "Nome",
    "E-mail",
    "RGA Candidato",
    "Entrevistadores do bloco",
    "Entrevistador responsável",
    "RGA Entrevistador Responsável",
    "ThreadId",
    "MessageId"
  ];
}

function getLogHeaderMap_(shLog) {
  const headers = shLog.getRange(1, 1, 1, shLog.getLastColumn()).getValues()[0]
    .map(h => String(h || "").trim());

  const map = {};
  headers.forEach((h, i) => {
    map[h] = i;
  });

  return map;
}

function countBookings_(shLog, weekTitle, code20) {
  try {
    const lastRow = shLog.getLastRow();
    if (lastRow < 2) return 0;

    const headerMap = getLogHeaderMap_(shLog);
    const weekIdx = headerMap["Semana"];
    const codeIdx = headerMap["Código (20min)"];

    if (weekIdx == null || codeIdx == null) {
      throw new Error('countBookings_: cabeçalhos "Semana" e/ou "Código (20min)" não encontrados.');
    }

    const lastCol = shLog.getLastColumn();
    const values = shLog.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const weekTarget = String(weekTitle || "").trim();
    const codeTarget = String(code20 || "").toUpperCase().trim();

    let cnt = 0;
    for (const r of values) {
      const week = String(r[weekIdx] || "").trim();
      const cod = String(r[codeIdx] || "").toUpperCase().trim();
      if (week === weekTarget && cod === codeTarget) cnt++;
    }

    return cnt;
  } catch (e) {
    console.error("countBookings_ erro:", e);
    return 0;
  }
}

/**
 * Idempotência:
 * evita duplicar log da mesma combinação Semana + Código + ThreadId
 */
function appendLogRow_(shLog, payload) {
  const interviewerNamesFlat = (payload.interviewerNames || [])
    .map(p => Array.isArray(p) ? p.join("/") : String(p || ""))
    .join(" | ");

  if (alreadyLogged_(shLog, payload.weekTitle, payload.code20, payload.threadId)) return;

  const headerMap = getLogHeaderMap_(shLog);
  const headers = shLog.getRange(1, 1, 1, shLog.getLastColumn()).getValues()[0]
    .map(h => String(h || "").trim());

  const row = new Array(headers.length).fill("");

  function setIfExists(headerName, value) {
    if (Object.prototype.hasOwnProperty.call(headerMap, headerName)) {
      row[headerMap[headerName]] = value;
    }
  }

  setIfExists("Timestamp", new Date());
  setIfExists("Semana", payload.weekTitle);
  setIfExists("Dia", payload.dayName);
  setIfExists("Faixa", payload.timeRange);
  setIfExists("Código (20min)", payload.code20);
  setIfExists("Bloco (1h)", payload.agg);
  setIfExists("Capacidade", payload.capacity);
  setIfExists("Reservas (após)", payload.newBooked);
  setIfExists("Nome", payload.fromName);
  setIfExists("E-mail", payload.fromEmail);
  setIfExists("RGA Candidato", payload.rgaCandidato);
  setIfExists("Entrevistadores do bloco", interviewerNamesFlat);
  setIfExists("Entrevistador responsável", payload.nomeEntrevistadorResponsavel || "");
  setIfExists("RGA Entrevistador Responsável", payload.rgaEntrevistadorResponsavel || "");
  setIfExists("ThreadId", payload.threadId);
  setIfExists("MessageId", payload.messageId);

  shLog.appendRow(row);
}

function alreadyLogged_(shLog, weekTitle, code20, threadId) {
  try {
    if (!threadId) return false;

    const lastRow = shLog.getLastRow();
    if (lastRow < 2) return false;

    const headerMap = getLogHeaderMap_(shLog);
    const weekIdx = headerMap["Semana"];
    const codeIdx = headerMap["Código (20min)"];
    const threadIdx = headerMap["ThreadId"];

    if (weekIdx == null || codeIdx == null || threadIdx == null) {
      throw new Error('alreadyLogged_: cabeçalhos "Semana", "Código (20min)" e/ou "ThreadId" não encontrados.');
    }

    const lastCol = shLog.getLastColumn();
    const values = shLog.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const weekTarget = String(weekTitle || "").trim();
    const codeTarget = String(code20 || "").toUpperCase().trim();
    const threadTarget = String(threadId || "").trim();

    for (let i = values.length - 1; i >= 0; i--) {
      const r = values[i];
      const week = String(r[weekIdx] || "").trim();
      const cod = String(r[codeIdx] || "").toUpperCase().trim();
      const th = String(r[threadIdx] || "").trim();

      if (week === weekTarget && cod === codeTarget && th === threadTarget) {
        return true;
      }
    }

    return false;
  } catch (e) {
    console.error("alreadyLogged_ erro:", e);
    return false;
  }
}