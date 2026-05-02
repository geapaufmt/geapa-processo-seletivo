/***************************************
 * 01_Main_ProcessInbox.gs
 ***************************************/

function processInboxReplies(e) {
  return seletivo_runOperationalFlow_(
    SELETIVO_OPERATIONAL.flows.AGENDAMENTO_INBOX,
    SELETIVO_OPERATIONAL.capabilities.INBOX,
    {
      executionType: seletivo_getExecutionTypeFromEvent_(e),
      source: 'processInboxReplies'
    },
    function(runtime) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(20000)) return;

      try {
        if (seletivo_canApplyEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'refile de follow-ups')) {
          requeueFollowUps_();
        }

        if (!runtime.dryRun) {
          GEAPA_CORE.coreEnsureLabel(SETTINGS.inboxLabel);
          GEAPA_CORE.coreEnsureLabel(SETTINGS.processedLabel);
          GEAPA_CORE.coreEnsureLabel(SETTINGS.errorLabel);
        }

        const labelInbox = GEAPA_CORE.coreGetLabel(SETTINGS.inboxLabel);
        const labelProcessed = GEAPA_CORE.coreGetLabel(SETTINGS.processedLabel);
        const labelError = GEAPA_CORE.coreGetLabel(SETTINGS.errorLabel);

        if (!labelInbox) {
          Logger.log('processInboxReplies: labelInbox nao encontrada.');
          return;
        }

        const threads = labelInbox.getThreads(0, 30);
        Logger.log('processInboxReplies: threads encontrados na label inbox = ' + threads.length);

        if (!threads.length) return;

        function mustKey_(name, value) {
          const k = String(value ?? '').trim();
          if (!k) throw new Error(`SETTINGS.${name} esta vazio/undefined`);
          return k;
        }

        const publicKey = mustKey_('publicScheduleKey', SETTINGS.publicScheduleKey);
        Logger.log('processInboxReplies: publicScheduleKey = ' + publicKey);
        const shPublic = GEAPA_CORE.coreGetSheetByKey(publicKey);

        const logKey = mustKey_('privateLogKey', SETTINGS.privateLogKey);
        Logger.log('processInboxReplies: privateLogKey = ' + logKey);
        const logRef = GEAPA_CORE.coreGetRegistryRefByKey(SETTINGS.privateLogKey);
        const ssLog = GEAPA_CORE.coreOpenSpreadsheetById(logRef.id);
        const shLog = ensureLogSheet_(ssLog, logRef.sheet || SETTINGS.privateLogSheetName);

        for (const thread of threads) {
          try {
            Logger.log('processInboxReplies: processando threadId=' + thread.getId() + ' | assunto=' + thread.getFirstMessageSubject());
            handleInterviewThread_(thread, shPublic, shLog, labelInbox, labelProcessed, runtime);
          } catch (err) {
            Logger.log('processInboxReplies: erro no threadId=' + thread.getId() + ' -> ' + err);
            handleInterviewThreadError_(thread, err, labelInbox, labelError, runtime);
          }
        }
      } finally {
        try { lock.releaseLock(); } catch (_) {}
      }
    }
  );
}

function handleInterviewThread_(thread, shPublic, shLog, labelInbox, labelProcessed, runtime) {
  const msgs = thread.getMessages();
  Logger.log('handleInterviewThread_: threadId=' + thread.getId() + ' | totalMsgs=' + msgs.length);

  const myEmails = [Session.getActiveUser().getEmail(), ...GmailApp.getAliases()]
    .map(e => String(e || '').toLowerCase());

  function isFromMe_(from) {
    const f = String(from || '').toLowerCase();
    return myEmails.some(me => me && f.includes(me));
  }

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
  const fromName = extractName_(fromRaw) || 'candidato(a)';

  Logger.log('handleInterviewThread_: ultima mensagem from=' + fromRaw);
  Logger.log('handleInterviewThread_: fromEmail=' + fromEmail + ' | fromName=' + fromName);

  const plain = msg.getPlainBody() || '';
  const html = msg.getBody() || '';
  const body = plain + '\n' + html;

  Logger.log('handleInterviewThread_: processando mensagem externa de ' + fromEmail);
  Logger.log('handleInterviewThread_: plainBody=' + plain);
  Logger.log('handleInterviewThread_: codeRegex=' + SETTINGS.codeRegex);

  const m = body.toUpperCase().match(SETTINGS.codeRegex);
  const code20 = m ? m[1].toUpperCase() : '';

  Logger.log('handleInterviewThread_: codigo detectado=' + code20);

  if (!code20) {
    Logger.log('handleInterviewThread_: nenhum codigo encontrado, enviando deny.');
    seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply deny sem codigo', function() {
      reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: '-' }));
      mark_(thread, labelInbox, labelProcessed);
    });
    return;
  }

  const pos = parseCodeToPos_(code20);
  Logger.log('handleInterviewThread_: pos=' + JSON.stringify(pos));

  if (!pos) {
    Logger.log('handleInterviewThread_: parseCodeToPos_ nao reconheceu codigo.');
    seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply deny codigo invalido', function() {
      reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
      mark_(thread, labelInbox, labelProcessed);
    });
    return;
  }

  const { row, col } = pos;
  const cell = shPublic.getRange(row, col);
  const current = String(cell.getDisplayValue()).trim();

  Logger.log('handleInterviewThread_: celula publica atual=' + current);

  const isRawCode = current.toUpperCase() === code20;
  const isAgendado = isAgendadoText_(current);

  Logger.log('handleInterviewThread_: isRawCode=' + isRawCode + ' | isAgendado=' + isAgendado);

  const weekTitle = shPublic.getRange(1, 1).getDisplayValue();
  const dayName = shPublic.getRange(1, col).getDisplayValue();
  const timeRange = shPublic.getRange(row, 1).getDisplayValue();

  const dayColLetter = colIndexToLetters_(col);
  const agg = computeAggregateCode_(dayColLetter, row, SETTINGS);

  Logger.log('handleInterviewThread_: agg=' + agg);

  if (!agg) {
    Logger.log('handleInterviewThread_: agg vazio.');
    seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply deny agg vazio', function() {
      reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
      mark_(thread, labelInbox, labelProcessed);
    });
    return;
  }

  const interviewerData = getInterviewersPairsForBlock_(agg);
  Logger.log('handleInterviewThread_: interviewerData.length=' + interviewerData.length);

  const interviewerNames = interviewerData.map(p => [p.nome1, p.nome2]);

  const nomeEntrevistadorResponsavel =
    interviewerData.length ? String(interviewerData[0].nome1 || '').trim() : '';

  const rgaEntrevistadorResponsavel =
    interviewerData.length ? String(interviewerData[0].rga1 || '').trim() : '';

  const capacity = interviewerData.length;
  if (capacity === 0) {
    Logger.log('handleInterviewThread_: capacity=0, negando.');
    seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply deny capacidade zero', function() {
      reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
      mark_(thread, labelInbox, labelProcessed);
    });
    return;
  }

  if (!isRawCode && !isAgendado) {
    Logger.log('handleInterviewThread_: celula nao esta disponivel para esse codigo.');
    seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply deny celula indisponivel', function() {
      reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
      mark_(thread, labelInbox, labelProcessed);
    });
    return;
  }

  const bookedInLog = countBookings_(shLog, weekTitle, code20);
  const parsed = parseAgendadoCounter_(current);
  const displayBooked = parsed ? parsed.booked : (isAgendado ? capacity : 0);
  const effectiveBooked = Math.max(bookedInLog, displayBooked);

  Logger.log('handleInterviewThread_: bookedInLog=' + bookedInLog + ' | displayBooked=' + displayBooked + ' | effectiveBooked=' + effectiveBooked + ' | capacity=' + capacity);

  if (effectiveBooked >= capacity) {
    Logger.log('handleInterviewThread_: slot lotado.');
    seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply deny slot lotado', function() {
      reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
      mark_(thread, labelInbox, labelProcessed);
    });
    return;
  }

  const rgaCandidato = fetchRGAByEmailUsingRegistry_(fromEmail) || '';

  Logger.log('handleInterviewThread_: rgaCandidato=' + rgaCandidato);

  const verified = isVerifiedByEmail_UsingForms_(fromEmail);
  Logger.log('handleInterviewThread_: verified=' + verified);

  if (!verified) {
    seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply cadastro em verificacao', function() {
      const htmlVerificacao = fill_(SETTINGS.verificationHtml, { NOME: fromName, CODIGO: code20 });
      reply_(thread, SETTINGS.verificationSubject, htmlVerificacao);
      mark_(thread, labelInbox, labelProcessed);
    });
    return;
  }

  if (!seletivo_canApplyEffect_(
    runtime,
    SELETIVO_OPERATIONAL.capabilities.SYNC,
    'confirmacao definitiva de reserva'
  )) {
    return;
  }

  const newBooked = effectiveBooked + 1;
  let display;
  if (capacity > 1) {
    display = (newBooked < capacity)
      ? `${code20} - ${SETTINGS.reservedTextPublic} (${newBooked}/${capacity})`
      : `${SETTINGS.reservedTextPublic} (${capacity}/${capacity})`;
  } else {
    display = SETTINGS.reservedTextPublic;
  }

  Logger.log('handleInterviewThread_: novo display=' + display);

  cell.setValue(display);

  const isFull = (capacity === 1) || (newBooked >= capacity);
  cell.setBackground(isFull ? '#f4c7c3' : null);

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

  const contatosSecretariaHtml =
    GEAPA_CORE.coreGetCurrentContactsHtmlByEmailGroup('SECRETARIA');

  const localEntrevista =
    seletivo_getLocalEntrevistaByRgaOrEmail_(rgaCandidato, fromEmail) || 'A definir';

  const confirmHtml = fill_(SETTINGS.confirmHtml, {
    NOME: fromName,
    CODIGO: code20,
    DIA: dayName || '-',
    FAIXA: timeRange || '-',
    SEMANA: weekTitle || '-',
    LOCAL_ENTREVISTA: localEntrevista,
    CONTATOS_SECRETARIA: contatosSecretariaHtml
  });

  seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'confirmacao ao candidato', function() {
    Logger.log('handleInterviewThread_: enviando confirmacao.');
    reply_(thread, SETTINGS.confirmSubject, confirmHtml);
    mark_(thread, labelInbox, labelProcessed);
    Logger.log('handleInterviewThread_: thread marcado como processado.');
  });
}

function handleInterviewThreadError_(thread, err, labelInbox, labelError, runtime) {
  seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'marcacao de erro no inbox', function() {
    try {
      if (!runtime.dryRun) {
        GEAPA_CORE.coreEnsureLabel(SETTINGS.errorLabel);
      }
      const lblErr = GEAPA_CORE.coreGetLabel(SETTINGS.errorLabel);

      if (lblErr) thread.addLabel(lblErr);
      if (labelInbox) thread.removeLabel(labelInbox);
    } catch (_) {}
  });

  seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'reply de erro operacional', function() {
    try {
      const msgs = thread.getMessages();
      const lastMsg = msgs && msgs.length ? msgs[msgs.length - 1] : null;
      if (!lastMsg) throw new Error('Thread sem mensagens.');

      const fromRaw = lastMsg.getFrom();
      const fromEmail = extractEmail_(fromRaw);
      const fromName = extractName_(fromRaw) || 'candidato(a)';

      const body = (lastMsg.getPlainBody() || '') + '\n' + (lastMsg.getBody() || '');
      const m = body.toUpperCase().match(SETTINGS.codeRegex);
      const code = m ? m[1].toUpperCase() : '-';

      const htmlErro = fill_(SETTINGS.errorHtml, {
        NOME: fromName,
        CODIGO: code
      });

      replyEmail_(fromEmail, SETTINGS.errorSubject, htmlErro);
    } catch (_) {}
  });

  console.error('Erro processando thread:', err);
}

/***************************************
 * PROCESSAMENTO DE RESPOSTAS DE PRESENCA
 ***************************************/

function seletivo_processPresenceInbox(e) {
  return seletivo_runOperationalFlow_(
    SELETIVO_OPERATIONAL.flows.POS_ENTREVISTA,
    SELETIVO_OPERATIONAL.capabilities.INBOX,
    {
      executionType: seletivo_getExecutionTypeFromEvent_(e),
      source: 'seletivo_processPresenceInbox'
    },
    function(runtime) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(20000)) return;

      try {
        if (!runtime.dryRun) {
          GEAPA_CORE.coreEnsureLabel(SETTINGS.presenceCheckLabel);
        }
        const labelPresence = GEAPA_CORE.coreGetLabel(SETTINGS.presenceCheckLabel);

        if (!labelPresence) {
          Logger.log('seletivo_processPresenceInbox: label de presenca nao encontrada.');
          return;
        }

        const threads = labelPresence.getThreads(0, 30);
        Logger.log('seletivo_processPresenceInbox: threads=' + threads.length);

        if (!threads.length) return;

        for (const thread of threads) {
          try {
            seletivo_handlePresenceThread_(thread, labelPresence, runtime);
          } catch (err) {
            console.error('seletivo_processPresenceInbox: erro no thread ' + thread.getId() + ':', err);
          }
        }
      } finally {
        try { lock.releaseLock(); } catch (_) {}
      }
    }
  );
}

function seletivo_handlePresenceThread_(thread, labelPresence, runtime) {
  const msgs = thread.getMessages();
  if (!msgs || !msgs.length) return;

  const myEmails = [Session.getActiveUser().getEmail(), ...GmailApp.getAliases()]
    .map(e => String(e || '').toLowerCase());

  function isFromMe_(from) {
    const f = String(from || '').toLowerCase();
    return myEmails.some(me => me && f.includes(me));
  }

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
    Logger.log('seletivo_handlePresenceThread_: resposta nao reconhecida.');
    return;
  }

  const reserva = seletivo_findReservaByPresenceThreadId_(thread.getId());
  if (!reserva) {
    Logger.log('seletivo_handlePresenceThread_: reserva nao encontrada para threadId=' + thread.getId());
    return;
  }

  if (!seletivo_canApplyEffect_(
    runtime,
    SELETIVO_OPERATIONAL.capabilities.SYNC,
    'atualizacao pos-entrevista'
  )) {
    return;
  }

  const rowNumber = reserva.rowNumber;
  const row = reserva.rowValues;
  const shLog = seletivo_getReservasSheet_();
  const map = getLogHeaderMap_(shLog);

  const idxRga = map['RGA Candidato'];
  const idxEmail = map['E-mail'];

  const rgaCandidato = idxRga != null ? String(row[idxRga] || '').trim() : '';
  const emailCandidato = idxEmail != null ? String(row[idxEmail] || '').trim() : '';
  const idxNome = map['Nome'];
  const nomeCandidato = idxNome != null ? String(row[idxNome] || '').trim() : '';

  if (resposta === 'SIM') {
    seletivo_logMarkReservaRealizada_(rowNumber);
    seletivo_markAvaliacaoCompareceu_(rgaCandidato, emailCandidato);

    if (seletivo_canApplyEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.EMAIL, 'email de aprovacao pos-entrevista')) {
      seletivo_sendPostInterviewApprovedEmail_(rgaCandidato, emailCandidato, nomeCandidato);
    }

    Logger.log('seletivo_handlePresenceThread_: presenca confirmada para row=' + rowNumber);
  }

  if (resposta === 'NAO') {
    seletivo_logMarkReservaFaltou_(rowNumber);
    seletivo_markAvaliacaoFaltou_(rgaCandidato, emailCandidato);

    if (seletivo_canApplyEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.EMAIL, 'email de reprovacao pos-entrevista')) {
      seletivo_sendPostInterviewRejectedEmail_(emailCandidato, row[map['Nome']] || '');
    }

    Logger.log('seletivo_handlePresenceThread_: falta registrada para row=' + rowNumber);
  }

  seletivo_runEffect_(runtime, SELETIVO_OPERATIONAL.capabilities.INBOX, 'marcar thread de presenca como processada', function() {
    thread.markRead();
    if (labelPresence) thread.removeLabel(labelPresence);
  });
  thread.markRead();
  if (labelPresence) thread.removeLabel(labelPresence);
}
