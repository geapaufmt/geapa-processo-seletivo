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
  // ⚠️ Lock via Library não funciona com callback (limitação do Apps Script Libraries),
  // então aqui mantém LockService local mesmo.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    requeueFollowUps_(); // 04_Gmail_FollowUps.gs

    // Labels via Core (garante e pega)
    GEAPA_CORE.coreEnsureLabel(SETTINGS.inboxLabel);
    GEAPA_CORE.coreEnsureLabel(SETTINGS.processedLabel);
    GEAPA_CORE.coreEnsureLabel(SETTINGS.errorLabel);

    const labelInbox     = GEAPA_CORE.coreGetLabel(SETTINGS.inboxLabel);
    const labelProcessed = GEAPA_CORE.coreGetLabel(SETTINGS.processedLabel);
    const labelError     = GEAPA_CORE.coreGetLabel(SETTINGS.errorLabel);

    // Se por algum motivo labelInbox não existir, aborta
    if (!labelInbox) return;

    const threads = labelInbox.getThreads(0, 30);
    if (!threads.length) return;

    // Sheets via Registry (Planilha Geral)
    // público (horários)
    // ===== DEBUG + HARD ASSERT =====
    function mustKey_(name, value) {
      const k = String(value ?? "").trim();
      if (!k) throw new Error(`SETTINGS.${name} está vazio/undefined`);
      return k;
    }

    // Público (Horários)
    const publicKey = mustKey_("publicScheduleKey", SETTINGS.publicScheduleKey);
    console.log("publicScheduleKey =", publicKey);
    const shPublic = GEAPA_CORE.coreGetSheetByKey(publicKey);

    // Log (Reservas)
    const logKey = mustKey_("privateLogKey", SETTINGS.privateLogKey);
    console.log("privateLogKey =", logKey);
    const logRef = GEAPA_CORE.coreGetRegistryRefByKey(SETTINGS.privateLogKey);
    const ssLog  = GEAPA_CORE.coreOpenSpreadsheetById(logRef.id);
    const shLog  = ensureLogSheet_(ssLog, logRef.sheet || SETTINGS.privateLogSheetName);

    // log (reservas) — mantém ensureLogSheet_ (ele espera Spreadsheet)
    
//    const ssLog  = GEAPA_CORE.coreOpenSpreadsheetById(logRef.id);
//    const shLog  = ensureLogSheet_(ssLog);

    for (const thread of threads) {
      try {
        handleInterviewThread_(thread, shPublic, shLog, labelInbox, labelProcessed);
      } catch (err) {
        handleInterviewThreadError_(thread, err, labelInbox, labelError);
      }
    }
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function handleInterviewThread_(thread, shPublic, shLog, labelInbox, labelProcessed) {
  const msg = thread.getMessages().pop();
  const fromEmail = extractEmail_(msg.getFrom());
  const fromName  = extractName_(msg.getFrom()) || "candidato(a)";

  const body = (msg.getPlainBody() || "") + "\n" + (msg.getBody() || "");
  const m = body.toUpperCase().match(SETTINGS.codeRegex);
  const code20 = m ? m[1].toUpperCase() : "";

  if (!code20) {
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: "—" }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const pos = parseCodeToPos_(code20);
  if (!pos) {
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  const { row, col } = pos;
  const cell = shPublic.getRange(row, col);
  const current = String(cell.getDisplayValue()).trim();

  const isRawCode  = current.toUpperCase() === code20;
  const isAgendado = isAgendadoText_(current);

  // Infos auxiliares
  const weekTitle = shPublic.getRange(1,1).getDisplayValue();
  const dayName   = shPublic.getRange(1, col).getDisplayValue();
  const timeRange = shPublic.getRange(row, 1).getDisplayValue();

  // Mapeia para bloco de 1h
  const dayColLetter = colIndexToLetters_(col);
  const agg = computeAggregateCode_(dayColLetter, row, SETTINGS);
  if (!agg) {
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  // Lê capacidade = nº de duplas completas no bloco
  const interviewerPairs = getInterviewersPairsForBlock_(
    SETTINGS.interviewerSpreadsheetId,
    SETTINGS.interviewerSheetName,
    SETTINGS.interviewerCodeHeader,
    SETTINGS.interviewerRgaHeaders,
    agg
  );
  const capacity = interviewerPairs.length;
  if (capacity === 0) {
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  // Disponibilidade objetiva
  if (!isRawCode && !isAgendado) {
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  // Sincroniza contadores (log vs célula)
  const bookedInLog = countBookings_(shLog, weekTitle, code20);
  const parsed = parseAgendadoCounter_(current);
  const displayBooked = parsed ? parsed.booked : (isAgendado ? capacity : 0);
  const effectiveBooked = Math.max(bookedInLog, displayBooked);

  if (effectiveBooked >= capacity) {
    reply_(thread, SETTINGS.denySubject, fill_(SETTINGS.denyHtml, { NOME: fromName, CODIGO: code20 }));
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  // Busca RGA do candidato
  const rgaCandidato = fetchRGAByEmail_(
    SETTINGS.formsResponsesSpreadsheetId,
    SETTINGS.formsResponsesSheetName,
    SETTINGS.formsRgaHeader,
    fromEmail
  ) || "";

  if (!isVerifiedByEmail_UsingForms_(fromEmail)) {
    const html = fill_(SETTINGS.verificationHtml, { NOME: fromName, CODIGO: code20 });
    reply_(thread, SETTINGS.verificationSubject, html);
    mark_(thread, labelInbox, labelProcessed);
    return;
  }

  // CONFIRMA: monta display — mostra código enquanto houver vaga; some quando lotado
  const newBooked = effectiveBooked + 1;
  let display;
  if (capacity > 1) {
    display = (newBooked < capacity)
      ? `${code20} — ${SETTINGS.reservedTextPublic} (${newBooked}/${capacity})`
      : `${SETTINGS.reservedTextPublic} (${capacity}/${capacity})`;
  } else {
    display = SETTINGS.reservedTextPublic;
  }

  cell.setValue(display);

  // pinta vermelho quando lota
  const isFull = (capacity === 1) || (newBooked >= capacity);
  cell.setBackground(isFull ? "#f4c7c3" : null);

  // LOG
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
    interviewerPairs,
    threadId: thread.getId(),
    messageId: msg.getId()
  });

  // E-mail de confirmação
  const confirmHtml = fill_(SETTINGS.confirmHtml, {
    NOME: fromName,
    CODIGO: code20,
    DIA: dayName || "—",
    FAIXA: timeRange || "—",
    SEMANA: weekTitle || "—"
  });
  reply_(thread, SETTINGS.confirmSubject, confirmHtml);

  mark_(thread, labelInbox, labelProcessed);
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