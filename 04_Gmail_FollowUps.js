/***************************************
 * 04_Gmail_FollowUps.gs
 ***************************************/
function requeueFollowUps_() {
  GEAPA_CORE.coreEnsureLabel(SETTINGS.inboxLabel);
  GEAPA_CORE.coreEnsureLabel(SETTINGS.processedLabel);
  GEAPA_CORE.coreEnsureLabel(SETTINGS.errorLabel);

  const labelInbox = GEAPA_CORE.coreGetLabel(SETTINGS.inboxLabel);
  const labelProcessed = GEAPA_CORE.coreGetLabel(SETTINGS.processedLabel);
  const labelError = GEAPA_CORE.coreGetLabel(SETTINGS.errorLabel);

  const myEmails = [Session.getActiveUser().getEmail(), ...GmailApp.getAliases()]
    .map(e => String(e || '').toLowerCase());

  function isFromMe_(from) {
    const f = String(from || '').toLowerCase();
    return myEmails.some(me => me && f.includes(me));
  }

  const buckets = [];
  if (labelProcessed) buckets.push('label:"' + SETTINGS.processedLabel + '" newer_than:30d');
  if (labelError) buckets.push('label:"' + SETTINGS.errorLabel + '" newer_than:30d');

  let moved = 0;
  buckets.forEach(q => {
    const threads = GmailApp.search(q, 0, 100);
    threads.forEach(t => {
      const msgs = t.getMessages();
      if (!msgs.length) return;

      const last = msgs[msgs.length - 1];
      const from = last.getFrom();
      const body = (last.getPlainBody() || '') + '\n' + (last.getBody() || '');
      const m = body.toUpperCase().match(SETTINGS.codeRegex);
      const hasCode = !!(m && m[1]);

      if (!isFromMe_(from) && hasCode) {
        if (labelInbox) t.addLabel(labelInbox);
        if (labelProcessed) t.removeLabel(labelProcessed);
        if (labelError) t.removeLabel(labelError);
        t.markUnread();
        moved++;
      }
    });
  });

  console.log('requeueFollowUps_: threads refiled =', moved);
}

function seletivo_sendPendingPresenceChecks(e) {
  return seletivo_runOperationalFlow_(
    SELETIVO_OPERATIONAL.flows.PRESENCA_ENTREVISTADOR,
    SELETIVO_OPERATIONAL.capabilities.EMAIL,
    {
      executionType: seletivo_getExecutionTypeFromEvent_(e),
      source: 'seletivo_sendPendingPresenceChecks'
    },
    function(runtime) {
      Logger.log('seletivo_sendPendingPresenceChecks: INICIO');

      const pendentes = seletivo_findReservasPendentesDeConsultaPresenca_();
      Logger.log('seletivo_sendPendingPresenceChecks: pendentes=' + pendentes.length);

      if (!pendentes || !pendentes.length) {
        Logger.log('seletivo_sendPendingPresenceChecks: nenhuma reserva pendente.');
        return;
      }

      pendentes.forEach(reserva => {
        try {
          Logger.log(
            'seletivo_sendPendingPresenceChecks: processando row=' + reserva.rowNumber +
            ' | candidato=' + reserva.nome +
            ' | entrevistador=' + reserva.nomeEntrevistadorResponsavel
          );

          if (!seletivo_canApplyEffect_(
            runtime,
            SELETIVO_OPERATIONAL.capabilities.EMAIL,
            'consulta de presenca ao entrevistador'
          )) {
            return;
          }

          const envio = seletivo_sendPresenceCheckEmail_(reserva);
          Logger.log('seletivo_sendPendingPresenceChecks: resultado envio=' + JSON.stringify(envio));

          if (envio && envio.ok) {
            seletivo_logMarkPresenceCheckSent_(reserva.rowNumber, {
              threadId: envio.threadId || '',
              messageId: envio.messageId || ''
            });

            Logger.log('seletivo_sendPendingPresenceChecks: log atualizado para row=' + reserva.rowNumber);
          } else {
            Logger.log(
              'seletivo_sendPendingPresenceChecks: envio nao concluido para row=' +
              reserva.rowNumber + ' | motivo=' + (envio ? envio.reason : 'desconhecido')
            );
          }
        } catch (innerErr) {
          console.error(
            'seletivo_sendPendingPresenceChecks: erro ao processar row=' +
            reserva.rowNumber + ':', innerErr
          );
        }
      });

      Logger.log('seletivo_sendPendingPresenceChecks: FIM');
    }
  );
}
