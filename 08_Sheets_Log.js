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
    shLog.appendRow([
      "Timestamp","Semana","Dia","Faixa","Código (20min)","Bloco (1h)","Capacidade",
      "Reservas (após)","Nome","E-mail","RGA Candidato",
      "Duplas do bloco (RGA1/RGA2 | ...)","ThreadId","MessageId"
    ]);
  }
  return shLog;
}

function getLogHeaders_() {
  return [
    "Timestamp","Semana","Dia","Faixa","Código (20min)","Bloco (1h)","Capacidade",
    "Reservas (após)","Nome","E-mail","RGA Candidato",
    "Duplas do bloco (RGA1/RGA2 | ...)","ThreadId","MessageId"
  ];
}

function countBookings_(shLog, weekTitle, code20) {
  try {
    const lastRow = shLog.getLastRow();
    if (lastRow < 2) return 0;

    const lastCol = shLog.getLastColumn();
    const values = shLog.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const weekTarget = String(weekTitle || "").trim();
    const codeTarget = String(code20 || "").toUpperCase().trim();

    let cnt = 0;
    for (const r of values) {
      const week = String(r[1] || "").trim();              // Semana
      const cod  = String(r[4] || "").toUpperCase().trim(); // Código (20min)
      if (week === weekTarget && cod === codeTarget) cnt++;
    }
    return cnt;
  } catch (e) {
    console.error("countBookings_ erro:", e);
    return 0;
  }
}

/**
 * Recomendado: idempotência simples (evita duplicar log da mesma thread/código)
 * - Se já existe linha com mesmo (Semana + Código + ThreadId), não append.
 * - Não muda seu fluxo, só evita inflar contagem por reruns.
 */
function appendLogRow_(shLog, payload) {
  const interviewerRGAsFlat = (payload.interviewerPairs || []).map(p => p.join("/")).join(" | ");

  // idempotência
  if (alreadyLogged_(shLog, payload.weekTitle, payload.code20, payload.threadId)) return;

  shLog.appendRow([
    new Date(),
    payload.weekTitle,
    payload.dayName,
    payload.timeRange,
    payload.code20,
    payload.agg,
    payload.capacity,
    payload.newBooked,
    payload.fromName,
    payload.fromEmail,
    payload.rgaCandidato,
    interviewerRGAsFlat,
    payload.threadId,
    payload.messageId
  ]);
}

function alreadyLogged_(shLog, weekTitle, code20, threadId) {
  try {
    if (!threadId) return false;

    const lastRow = shLog.getLastRow();
    if (lastRow < 2) return false;

    const lastCol = shLog.getLastColumn();
    const values = shLog.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const weekTarget = String(weekTitle || "").trim();
    const codeTarget = String(code20 || "").toUpperCase().trim();
    const threadTarget = String(threadId || "").trim();

    // colunas: Semana=2 (idx 1), Código=5 (idx 4), ThreadId=13 (idx 12)
    for (let i = values.length - 1; i >= 0; i--) {
      const r = values[i];
      const week = String(r[1] || "").trim();
      const cod  = String(r[4] || "").toUpperCase().trim();
      const th   = String(r[12] || "").trim();
      if (week === weekTarget && cod === codeTarget && th === threadTarget) return true;
    }
    return false;
  } catch (e) {
    console.error("alreadyLogged_ erro:", e);
    return false;
  }
}