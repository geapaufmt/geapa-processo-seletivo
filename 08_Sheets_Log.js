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
    "MessageId",

    // NOVOS - presença
    "Status reserva",
    "Consulta presença enviada",
    "Data envio consulta presença",
    "Resposta presença",
    "Data resposta presença",
    "Thread ID consulta presença",
    "Message ID consulta presença",
    "Presença processada"
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
  setIfExists("Status reserva", payload.statusReserva || "Agendada");
  setIfExists("Consulta presença enviada", payload.consultaPresencaEnviada || "NÃO");
  setIfExists("Data envio consulta presença", payload.dataEnvioConsultaPresenca || "");
  setIfExists("Resposta presença", payload.respostaPresenca || "PENDENTE");
  setIfExists("Data resposta presença", payload.dataRespostaPresenca || "");
  setIfExists("Thread ID consulta presença", payload.threadIdConsultaPresenca || "");
  setIfExists("Message ID consulta presença", payload.messageIdConsultaPresenca || "");
  setIfExists("Presença processada", payload.presencaProcessada || "NÃO");

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

/***************************************
 * PRESENÇA DA ENTREVISTA
 ***************************************/

function seletivo_getReservasSheet_() {
  const logRef = GEAPA_CORE.coreGetRegistryRefByKey(SETTINGS.privateLogKey);
  const ssLog  = GEAPA_CORE.coreOpenSpreadsheetById(logRef.id);
  return ensureLogSheet_(ssLog, logRef.sheet || SETTINGS.privateLogSheetName);
}

function seletivo_getReservasHeaderMap_(sheet) {
  return getLogHeaderMap_(sheet);
}

function seletivo_findReservasPendentesDeConsultaPresenca_() {
  try {
    const shLog = seletivo_getReservasSheet_();
    const headerMap = getLogHeaderMap_(shLog);

    const lastRow = shLog.getLastRow();
    if (lastRow < 2) {
      Logger.log('seletivo_findReservasPendentesDeConsultaPresenca_: log sem dados.');
      return [];
    }

    const lastCol = shLog.getLastColumn();
    const values = shLog.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const idxDia = headerMap["Dia"];
    const idxFaixa = headerMap["Faixa"];
    const idxEmail = headerMap["E-mail"];
    const idxNome = headerMap["Nome"];
    const idxRga = headerMap["RGA Candidato"];
    const idxRespNome = headerMap["Entrevistador responsável"];
    const idxRespRga = headerMap["RGA Entrevistador Responsável"];
    const idxStatusReserva = headerMap["Status reserva"];
    const idxConsultaEnviada = headerMap["Consulta presença enviada"];
    const idxThread = headerMap["ThreadId"];
    const idxMessage = headerMap["MessageId"];

    Logger.log('headerMap Status reserva=' + idxStatusReserva +
      ' | Consulta presença enviada=' + idxConsultaEnviada +
      ' | Dia=' + idxDia +
      ' | Faixa=' + idxFaixa);

    const agora = new Date();
    Logger.log('Agora=' + agora);

    const pendentes = [];

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const rowNumber = i + 2;

      const statusReserva = String(row[idxStatusReserva] || "").trim().toUpperCase();
      const consultaEnviada = String(row[idxConsultaEnviada] || "").trim().toUpperCase();
      const dia = String(row[idxDia] || "").trim();
      const faixa = String(row[idxFaixa] || "").trim();

      Logger.log(
        'Linha ' + rowNumber +
        ' | statusReserva=' + statusReserva +
        ' | consultaEnviada=' + consultaEnviada +
        ' | dia=' + dia +
        ' | faixa=' + faixa
      );

      if (statusReserva && statusReserva !== "AGENDADA") {
        Logger.log('Linha ' + rowNumber + ': ignorada porque statusReserva != AGENDADA');
        continue;
      }

      if (consultaEnviada === "SIM") {
        Logger.log('Linha ' + rowNumber + ': ignorada porque consulta já foi enviada');
        continue;
      }

      const dtInicio = seletivo_tryBuildInterviewDateTime_(dia, faixa, agora);
      Logger.log('Linha ' + rowNumber + ': dtInicio=' + dtInicio);

      if (!dtInicio) {
        Logger.log('Linha ' + rowNumber + ': ignorada porque dtInicio não pôde ser montado');
        continue;
      }

      const delayMin = SETTINGS.consultaPresencaDelayMin || 20;
      const limite = new Date(dtInicio.getTime() + delayMin * 60000);

      Logger.log(
        'Linha ' + rowNumber +
        ': limite=' + limite +
        ' | agora>=limite? ' + (agora >= limite)
      );

      if (agora < limite) {
        Logger.log('Linha ' + rowNumber + ': ignorada porque ainda não venceu o delay');
        continue;
      }

      Logger.log('Linha ' + rowNumber + ': ENTROU como pendente');

      pendentes.push({
        rowNumber,
        nome: String(row[idxNome] || "").trim(),
        email: String(row[idxEmail] || "").trim(),
        rgaCandidato: String(row[idxRga] || "").trim(),
        dia,
        faixa,
        nomeEntrevistadorResponsavel: String(row[idxRespNome] || "").trim(),
        rgaEntrevistadorResponsavel: String(row[idxRespRga] || "").trim(),
        threadIdReserva: String(row[idxThread] || "").trim(),
        messageIdReserva: String(row[idxMessage] || "").trim()
      });
    }

    Logger.log('seletivo_findReservasPendentesDeConsultaPresenca_: pendentes=' + pendentes.length);
    return pendentes;
  } catch (e) {
    console.error('seletivo_findReservasPendentesDeConsultaPresenca_ erro:', e);
    return [];
  }
}

function seletivo_logMarkPresenceCheckSent_(rowNumber, meta) {
  const shLog = seletivo_getReservasSheet_();
  const map = getLogHeaderMap_(shLog);

  if (map["Consulta presença enviada"] != null) {
    shLog.getRange(rowNumber, map["Consulta presença enviada"] + 1).setValue("SIM");
  }
  if (map["Data envio consulta presença"] != null) {
    shLog.getRange(rowNumber, map["Data envio consulta presença"] + 1).setValue(new Date());
  }
  if (map["Thread ID consulta presença"] != null) {
    shLog.getRange(rowNumber, map["Thread ID consulta presença"] + 1).setValue(meta.threadId || "");
  }
  if (map["Message ID consulta presença"] != null) {
    shLog.getRange(rowNumber, map["Message ID consulta presença"] + 1).setValue(meta.messageId || "");
  }
  if (map["Resposta presença"] != null) {
    shLog.getRange(rowNumber, map["Resposta presença"] + 1).setValue("PENDENTE");
  }
  if (map["Presença processada"] != null) {
    shLog.getRange(rowNumber, map["Presença processada"] + 1).setValue("NÃO");
  }
}

function seletivo_findReservaByPresenceThreadId_(threadId) {
  try {
    const shLog = seletivo_getReservasSheet_();
    const headerMap = getLogHeaderMap_(shLog);

    const idxPresenceThread = headerMap["Thread ID consulta presença"];
    if (idxPresenceThread == null) return null;

    const lastRow = shLog.getLastRow();
    if (lastRow < 2) return null;

    const values = shLog.getRange(2, 1, lastRow - 1, shLog.getLastColumn()).getValues();
    const alvo = String(threadId || "").trim();

    for (let i = values.length - 1; i >= 0; i--) {
      const row = values[i];
      const valor = String(row[idxPresenceThread] || "").trim();
      if (valor && valor === alvo) {
        return { rowNumber: i + 2, rowValues: row };
      }
    }

    return null;
  } catch (e) {
    console.error('seletivo_findReservaByPresenceThreadId_ erro:', e);
    return null;
  }
}

function seletivo_logMarkReservaRealizada_(rowNumber) {
  const shLog = seletivo_getReservasSheet_();
  const map = getLogHeaderMap_(shLog);

  if (map["Status reserva"] != null) {
    shLog.getRange(rowNumber, map["Status reserva"] + 1).setValue("Realizada");
  }
  if (map["Resposta presença"] != null) {
    shLog.getRange(rowNumber, map["Resposta presença"] + 1).setValue("SIM");
  }
  if (map["Data resposta presença"] != null) {
    shLog.getRange(rowNumber, map["Data resposta presença"] + 1).setValue(new Date());
  }
  if (map["Presença processada"] != null) {
    shLog.getRange(rowNumber, map["Presença processada"] + 1).setValue("SIM");
  }
}

function seletivo_logMarkReservaFaltou_(rowNumber) {
  const shLog = seletivo_getReservasSheet_();
  const map = getLogHeaderMap_(shLog);

  if (map["Status reserva"] != null) {
    shLog.getRange(rowNumber, map["Status reserva"] + 1).setValue("Faltou");
  }
  if (map["Resposta presença"] != null) {
    shLog.getRange(rowNumber, map["Resposta presença"] + 1).setValue("NÃO");
  }
  if (map["Data resposta presença"] != null) {
    shLog.getRange(rowNumber, map["Data resposta presença"] + 1).setValue(new Date());
  }
  if (map["Presença processada"] != null) {
    shLog.getRange(rowNumber, map["Presença processada"] + 1).setValue("SIM");
  }
}

/**
 * Tenta montar um Date da entrevista usando "Dia" + "Faixa".
 * Assume que o log é do ciclo atual e usa a próxima ocorrência do dia da semana.
 */
function seletivo_tryBuildInterviewDateTime_(dia, faixa, baseDate) {
  try {
    Logger.log('seletivo_tryBuildInterviewDateTime_: dia=' + dia + ' | faixa=' + faixa + ' | baseDate=' + baseDate);

    const faixaStr = String(faixa || '').trim();

    // aceita "9h30-10h30", "09h30-10h30", "09:30-10:30"
    let hora = null;
    let minuto = null;

    let m = faixaStr.match(/(\d{1,2})h(\d{2})/i);
    if (m) {
      hora = Number(m[1]);
      minuto = Number(m[2]);
    } else {
      m = faixaStr.match(/(\d{1,2}):(\d{2})/);
      if (m) {
        hora = Number(m[1]);
        minuto = Number(m[2]);
      }
    }

    Logger.log('seletivo_tryBuildInterviewDateTime_: hora=' + hora + ' | minuto=' + minuto);

    if (hora == null || minuto == null) return null;

    const diasSemana = {
      "SEGUNDA": 1,
      "SEGUNDA-FEIRA": 1,
      "TERÇA": 2,
      "TERCA": 2,
      "TERÇA-FEIRA": 2,
      "TERCA-FEIRA": 2,
      "QUARTA": 3,
      "QUARTA-FEIRA": 3,
      "QUINTA": 4,
      "QUINTA-FEIRA": 4,
      "SEXTA": 5,
      "SEXTA-FEIRA": 5,
      "SÁBADO": 6,
      "SABADO": 6,
      "DOMINGO": 0
    };

    const diaNorm = String(dia || '').trim().toUpperCase();
    const alvo = diasSemana[diaNorm];

    Logger.log('seletivo_tryBuildInterviewDateTime_: diaNorm=' + diaNorm + ' | alvo=' + alvo);

    if (alvo == null) return null;

    const d = new Date(baseDate);
    const atual = d.getDay();
    let diff = alvo - atual;

    if (diff > 3) diff -= 7;
    if (diff < -3) diff += 7;

    Logger.log('seletivo_tryBuildInterviewDateTime_: atual=' + atual + ' | diff=' + diff);

    d.setDate(d.getDate() + diff);
    d.setHours(hora, minuto, 0, 0);

    Logger.log('seletivo_tryBuildInterviewDateTime_: resultado=' + d);
    return d;
  } catch (e) {
    console.error('seletivo_tryBuildInterviewDateTime_ erro:', e);
    return null;
  }
}