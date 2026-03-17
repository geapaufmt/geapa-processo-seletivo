/***************************************
 * 01_Main_ProcessInbox.gs
 * (Script A - processamento) — INTEGRADO c/ GEAPA-CORE + Registry
 *
 * Pré-requisitos no SETTINGS:
 * - inboxLabel, processedLabel, errorLabel (mantém)
 * - publicScheduleKey (ex.: "SELETIVO_AGENDAMENTO")
 * - privateLogKey     (ex.: "SELETIVO_RESERVAS")
 * (e opcionalmente remover: publicScheduleSpreadsheetId/privateLogSpreadsheetId/publicScheduleSheetName)
 ***************************************/

function processInboxReplies() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    requeueFollowUps_();

    GEAPA_CORE.coreEnsureLabel(SETTINGS.inboxLabel);
    GEAPA_CORE.coreEnsureLabel(SETTINGS.processedLabel);
    GEAPA_CORE.coreEnsureLabel(SETTINGS.errorLabel);

    const labelInbox     = GEAPA_CORE.coreGetLabel(SETTINGS.inboxLabel);
    const labelProcessed = GEAPA_CORE.coreGetLabel(SETTINGS.processedLabel);
    const labelError     = GEAPA_CORE.coreGetLabel(SETTINGS.errorLabel);

    if (!labelInbox) {
      Logger.log('processInboxReplies: labelInbox não encontrada.');
      return;
    }

    const threads = labelInbox.getThreads(0, 30);
    Logger.log('processInboxReplies: threads encontrados na label inbox = ' + threads.length);

    if (!threads.length) return;

    function mustKey_(name, value) {
      const k = String(value ?? "").trim();
      if (!k) throw new Error(`SETTINGS.${name} está vazio/undefined`);
      return k;
    }

    const publicKey = mustKey_("publicScheduleKey", SETTINGS.publicScheduleKey);
    Logger.log("processInboxReplies: publicScheduleKey = " + publicKey);
    const shPublic = GEAPA_CORE.coreGetSheetByKey(publicKey);

    const logKey = mustKey_("privateLogKey", SETTINGS.privateLogKey);
    Logger.log("processInboxReplies: privateLogKey = " + logKey);
    const logRef = GEAPA_CORE.coreGetRegistryRefByKey(SETTINGS.privateLogKey);
    const ssLog  = GEAPA_CORE.coreOpenSpreadsheetById(logRef.id);
    const shLog  = ensureLogSheet_(ssLog, logRef.sheet || SETTINGS.privateLogSheetName);

    for (const thread of threads) {
      try {
        Logger.log('processInboxReplies: processando threadId=' + thread.getId() + ' | assunto=' + thread.getFirstMessageSubject());
        handleInterviewThread_(thread, shPublic, shLog, labelInbox, labelProcessed);
      } catch (err) {
        Logger.log('processInboxReplies: erro no threadId=' + thread.getId() + ' -> ' + err);
        handleInterviewThreadError_(thread, err, labelInbox, labelError);
      }
    }
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function handleInterviewThread_(thread, shPublic, shLog, labelInbox, labelProcessed) {
  const msgs = thread.getMessages();
  Logger.log('handleInterviewThread_: threadId=' + thread.getId() + ' | totalMsgs=' + msgs.length);

  const myEmails = [Session.getActiveUser().getEmail(), ...GmailApp.getAliases()]
    .map(e => String(e || '').toLowerCase());

  function isFromMe_(from) {
    const f = String(from || '').toLowerCase();
    return myEmails.some(me => me && f.includes(me));
  }

  // pega a última mensagem que NÃO é do próprio GEAPA
  let msg = null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (!isFromMe_(msgs[i].getFrom())) {
      msg = msgs[i];
      break;
    }
  }

  if (!msg) {
    Logger.log('handleInterviewThread_: nenhuma resposta externa no thread ' + thread.getId() + '. Ignorando.');
    return;
  }

  const fromRaw = msg.getFrom();
  const fromEmail = extractEmail_(fromRaw);
  const fromName  = extractName_(fromRaw) || "candidato(a)";

  Logger.log('handleInterviewThread_: última mensagem from=' + fromRaw);
  Logger.log('handleInterviewThread_: fromEmail=' + fromEmail + ' | fromName=' + fromName);

  const plain = msg.getPlainBody() || "";
  const html  = msg.getBody() || "";
  const body = plain + "\n" + html;

  Logger.log('handleInterviewThread_: processando mensagem externa de ' + fromEmail);
  Logger.log('handleInterviewThread_: plainBody=' + plain);
  Logger.log('handleInterviewThread_: codeRegex=' + SETTINGS.codeRegex);

  const m = body.toUpperCase().match(SETTINGS.codeRegex);
  const code20 = m ? m[1].toUpperCase() : "";

  Logger.log('handleInterviewThread_: código detectado=' + code20);

  if (!code20) {
    Logger.log('handleInterviewThread_: nenhum código encontrado, enviando deny.');
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: "—" }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const pos = parseCodeToPos_(code20);
  Logger.log('handleInterviewThread_: pos=' + JSON.stringify(pos));

  if (!pos) {
    Logger.log('handleInterviewThread_: parseCodeToPos_ não reconheceu código.');
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const { row, col } = pos;
  const cell = shPublic.getRange(row, col);
  const current = String(cell.getDisplayValue()).trim();

  Logger.log('handleInterviewThread_: célula pública atual=' + current);

  const isRawCode  = current.toUpperCase() === code20;
  const isAgendado = isAgendadoText_(current);

  Logger.log('handleInterviewThread_: isRawCode=' + isRawCode + ' | isAgendado=' + isAgendado);

  const weekTitle = shPublic.getRange(1,1).getDisplayValue();
  const dayName   = shPublic.getRange(1, col).getDisplayValue();
  const timeRange = shPublic.getRange(row, 1).getDisplayValue();

  const dayColLetter = colIndexToLetters_(col);
  const agg = computeAggregateCode_(dayColLetter, row, SETTINGS);

  Logger.log('handleInterviewThread_: agg=' + agg);

  if (!agg) {
    Logger.log('handleInterviewThread_: agg vazio.');
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const interviewerData = getInterviewersPairsForBlock_(agg);
  Logger.log('handleInterviewThread_: interviewerData.length=' + interviewerData.length);

  const interviewerNames = interviewerData.map(p => [p.nome1, p.nome2]);

  const nomeEntrevistadorResponsavel =
    interviewerData.length ? String(interviewerData[0].nome1 || "").trim() : "";

  const rgaEntrevistadorResponsavel =
    interviewerData.length ? String(interviewerData[0].rga1 || "").trim() : "";

  const capacity = interviewerData.length;
  if (capacity === 0) {
    Logger.log('handleInterviewThread_: capacity=0, negando.');
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  if (!isRawCode && !isAgendado) {
    Logger.log('handleInterviewThread_: célula não está disponível para esse código.');
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const bookedInLog = countBookings_(shLog, weekTitle, code20);
  const parsed = parseAgendadoCounter_(current);
  const displayBooked = parsed ? parsed.booked : (isAgendado ? capacity : 0);
  const effectiveBooked = Math.max(bookedInLog, displayBooked);

  Logger.log('handleInterviewThread_: bookedInLog=' + bookedInLog + ' | displayBooked=' + displayBooked + ' | effectiveBooked=' + effectiveBooked + ' | capacity=' + capacity);

  if (effectiveBooked >= capacity) {
    Logger.log('handleInterviewThread_: slot lotado.');
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const rgaCandidato = fetchRGAByEmail_(
    SETTINGS.formsResponsesSpreadsheetId,
    SETTINGS.formsResponsesSheetName,
    SETTINGS.formsRgaHeader,
    fromEmail
  ) || "";

  Logger.log('handleInterviewThread_: rgaCandidato=' + rgaCandidato);

  const verified = isVerifiedByEmail_UsingForms_(fromEmail);
  Logger.log('handleInterviewThread_: verified=' + verified);

  if (!verified) {
    const html = fill_(SETTINGS.verificationHtml, { NOME: fromName, CODIGO: code20 });
    reply_(thread, SETTINGS.verificationSubject, html);
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const newBooked = effectiveBooked + 1;
  let display;
  if (capacity > 1) {
    display = (newBooked < capacity)
      ? `${code20} — ${SETTINGS.reservedTextPublic} (${newBooked}/${capacity})`
      : `${SETTINGS.reservedTextPublic} (${capacity}/${capacity})`;
  } else {
    display = SETTINGS.reservedTextPublic;
  }

  Logger.log('handleInterviewThread_: novo display=' + display);

  cell.setValue(display);

  const isFull = (capacity === 1) || (newBooked >= capacity);
  cell.setBackground(isFull ? "#f4c7c3" : null);

  appendLogRow_(shLog, {
    weekTitle,
    dayName,
    timeRange,
    code20,
    agg,
    capacity,
    newBooked,
    fromName,
    fromEmail,
    rgaCandidato,
    interviewerNames,
    nomeEntrevistadorResponsavel,
    rgaEntrevistadorResponsavel,
    threadId: thread.getId(),
    messageId: msg.getId()
  });

  const contatosSecretariaHtml = getSecretaryContactsHtml_();

  const localEntrevista =
    seletivo_getLocalEntrevistaByRgaOrEmail_(rgaCandidato, fromEmail) || 'A definir';

  const confirmHtml = fill_(SETTINGS.confirmHtml, {
    NOME: fromName,
    CODIGO: code20,
    DIA: dayName || "—",
    FAIXA: timeRange || "—",
    SEMANA: weekTitle || "—",
    LOCAL_ENTREVISTA: localEntrevista,
    CONTATOS_SECRETARIA: contatosSecretariaHtml
  });

  Logger.log('handleInterviewThread_: enviando confirmação.');
  reply_(thread, SETTINGS.confirmSubject, confirmHtml);

  mark_(thread, labelInbox, labelProcessed);
  Logger.log('handleInterviewThread_: thread marcado como processado.');
}

function handleInterviewThreadError_(thread, err, labelInbox, labelError) {
  try {
    // garante label de erro via Core e pega
    GEAPA_CORE.coreEnsureLabel(SETTINGS.errorLabel);
    const lblErr = GEAPA_CORE.coreGetLabel(SETTINGS.errorLabel);

    if (lblErr) thread.addLabel(lblErr);
    if (labelInbox) thread.removeLabel(labelInbox);
  } catch (_) {}

  try {
    const lastMsg = thread.getMessages().pop();
    const fromEmail = extractEmail_(lastMsg.getFrom());
    replyEmail_(
      fromEmail,
      SETTINGS.denySubject,
      SETTINGS.denyHtml + `<p><small>Detalhe técnico: ${String(err && err.message || err)}</small></p>`
    );
  } catch (_) {}

  console.error("Erro processando thread:", err);
}

/***************************************
 * PROCESSAMENTO DE RESPOSTAS DE PRESENÇA
 ***************************************/

function seletivo_processPresenceInbox() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    GEAPA_CORE.coreEnsureLabel(SETTINGS.presenceCheckLabel);
    const labelPresence = GEAPA_CORE.coreGetLabel(SETTINGS.presenceCheckLabel);

    if (!labelPresence) {
      Logger.log('seletivo_processPresenceInbox: label de presença não encontrada.');
      return;
    }

    const threads = labelPresence.getThreads(0, 30);
    Logger.log('seletivo_processPresenceInbox: threads=' + threads.length);

    if (!threads.length) return;

    for (const thread of threads) {
      try {
        seletivo_handlePresenceThread_(thread, labelPresence);
      } catch (err) {
        console.error('seletivo_processPresenceInbox: erro no thread ' + thread.getId() + ':', err);
      }
    }
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function seletivo_handlePresenceThread_(thread, labelPresence) {
  const msgs = thread.getMessages();
  if (!msgs || !msgs.length) return;

  const myEmails = [Session.getActiveUser().getEmail(), ...GmailApp.getAliases()]
    .map(e => String(e || '').toLowerCase());

  function isFromMe_(from) {
    const f = String(from || '').toLowerCase();
    return myEmails.some(me => me && f.includes(me));
  }

  // pega a última mensagem que NÃO é sua
  let msg = null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (!isFromMe_(msgs[i].getFrom())) {
      msg = msgs[i];
      break;
    }
  }

  if (!msg) {
    Logger.log('seletivo_handlePresenceThread_: nenhuma resposta externa no thread ' + thread.getId());
    return;
  }

  const body = (msg.getPlainBody() || '') + '\n' + (msg.getBody() || '');
  const resposta = seletivo_parsePresenceAnswer_(body);

  Logger.log('seletivo_handlePresenceThread_: threadId=' + thread.getId() + ' | resposta=' + resposta);

  if (!resposta) {
    Logger.log('seletivo_handlePresenceThread_: resposta não reconhecida.');
    return;
  }

  const reserva = seletivo_findReservaByPresenceThreadId_(thread.getId());
  if (!reserva) {
    Logger.log('seletivo_handlePresenceThread_: reserva não encontrada para threadId=' + thread.getId());
    return;
  }

  const rowNumber = reserva.rowNumber;
  const row = reserva.rowValues;
  const shLog = seletivo_getReservasSheet_();
  const map = getLogHeaderMap_(shLog);

  const idxRga = map["RGA Candidato"];
  const idxEmail = map["E-mail"];

  const rgaCandidato = idxRga != null ? String(row[idxRga] || '').trim() : '';
  const emailCandidato = idxEmail != null ? String(row[idxEmail] || '').trim() : '';
  const idxNome = map["Nome"];
  const nomeCandidato = idxNome != null ? String(row[idxNome] || '').trim() : '';

  if (resposta === 'SIM') {
    seletivo_logMarkReservaRealizada_(rowNumber);
    seletivo_markAvaliacaoCompareceu_(rgaCandidato, emailCandidato);
    seletivo_sendPostInterviewApprovedEmail_(rgaCandidato, emailCandidato, nomeCandidato);
    Logger.log('seletivo_handlePresenceThread_: presença confirmada para row=' + rowNumber);
  }

  if (resposta === 'NAO') {
    seletivo_logMarkReservaFaltou_(rowNumber);
    seletivo_markAvaliacaoFaltou_(rgaCandidato, emailCandidato);
    seletivo_sendPostInterviewRejectedEmail_(emailCandidato, row[map["Nome"]] || '');
    Logger.log('seletivo_handlePresenceThread_: falta registrada para row=' + rowNumber);
  }

  thread.markRead();
  if (labelPresence) thread.removeLabel(labelPresence);
}