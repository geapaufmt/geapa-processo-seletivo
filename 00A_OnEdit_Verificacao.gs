/***************************************
 * 00A_OnEdit_Verificacao.gs
 *
 * Dispara o primeiro e-mail do seletivo quando
 * a coluna de verificacao for alterada para "Verificado".
 ***************************************/

/**
 * Trigger instalavel de edicao da planilha.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function seletivo_onEditVerificacao(e) {
  return seletivo_runOperationalFlow_(
    SELETIVO_OPERATIONAL.flows.VERIFICACAO_INSCRICAO,
    SELETIVO_OPERATIONAL.capabilities.SYNC,
    {
      executionType: seletivo_getExecutionTypeFromEvent_(e),
      source: 'seletivo_onEditVerificacao'
    },
    function(runtime) {
      seletivo_assertCore_();

      if (!e || !e.range) {
        Logger.log('onEdit: evento sem range.');
        return;
      }

      const sh = e.range.getSheet();
      const targetSheet = GEAPA_CORE.coreGetSheetByKey(SETTINGS.formsResponsesKey);

      if (!targetSheet) {
        Logger.log('onEdit: targetSheet nao encontrada via key ' + SETTINGS.formsResponsesKey);
        return;
      }

      Logger.log('onEdit: sheet editada = ' + sh.getName() + ' | sheetId=' + sh.getSheetId());
      Logger.log('onEdit: targetSheet = ' + targetSheet.getName() + ' | sheetId=' + targetSheet.getSheetId());

      if (sh.getSheetId() !== targetSheet.getSheetId()) {
        Logger.log('onEdit: edicao fora da sheet alvo.');
        return;
      }

      const row = e.range.getRow();
      const col = e.range.getColumn();

      if (row < 2) {
        Logger.log('onEdit: edicao no cabecalho.');
        return;
      }

      const lastCol = sh.getLastColumn();
      const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());

      const verificationHeader = String(SETTINGS.verificationStatusHeader || '').trim();
      const verificationIdx = headers.indexOf(verificationHeader);

      Logger.log('onEdit: header de verificacao esperado = ' + verificationHeader);
      Logger.log('onEdit: coluna editada = ' + col + ' | coluna verificacao = ' + (verificationIdx + 1));

      if (verificationIdx < 0) {
        throw new Error(`Cabecalho "${verificationHeader}" nao encontrado.`);
      }

      if (col !== verificationIdx + 1) {
        Logger.log('onEdit: coluna editada nao e a de verificacao.');
        return;
      }

      const cellValueNow = String(sh.getRange(row, col).getDisplayValue() || '').trim();
      const newValue = String(e.value ?? cellValueNow ?? '').trim().toLowerCase();
      const verifiedValue = String(SETTINGS.verifiedStatusValue || '').trim().toLowerCase();

      Logger.log('onEdit: e.value = ' + String(e.value));
      Logger.log('onEdit: valor atual da celula = ' + cellValueNow);
      Logger.log('onEdit: newValue normalizado = ' + newValue);
      Logger.log('onEdit: verifiedValue esperado = ' + verifiedValue);

      if (newValue !== verifiedValue) {
        Logger.log('onEdit: valor nao corresponde a "Verificado".');
        return;
      }

      Logger.log('onEdit: linha verificada detectada. Chamando seletivo_processVerifiedRow_...');
      seletivo_processVerifiedRow_(sh, row, headers, runtime);
    }
  );
}

function seletivo_processVerifiedRow_(sh, row, headers, runtime) {
  const lastCol = sh.getLastColumn();
  const rowValues = sh.getRange(row, 1, 1, lastCol).getValues()[0];

  const emailIdx = headers.findIndex(h => {
    const s = String(h || '').toLowerCase();
    return s.includes('e-mail') || s.includes('email') || s.includes('endereco de e-mail') || s.includes('endereço de e-mail');
  });

  const nameIdx = headers.findIndex(h => {
    const s = String(h || '').toLowerCase();
    return s === 'nome' || s.includes('nome completo');
  });

  const emailStatusIdx = headers.indexOf(String(SETTINGS.emailStatusHeader || '').trim());
  const noteIdx = headers.indexOf(String(SETTINGS.postVerificationNoteHeader || '').trim());

  Logger.log('processVerifiedRow: row=' + row);
  Logger.log(
    'processVerifiedRow: emailIdx=' + emailIdx +
    ' | nameIdx=' + nameIdx +
    ' | emailStatusIdx=' + emailStatusIdx +
    ' | noteIdx=' + noteIdx
  );

  if (emailIdx < 0) throw new Error('Coluna de email nao encontrada.');

  const email = String(rowValues[emailIdx] || '').trim();
  if (!email) throw new Error(`Linha ${row}: email vazio.`);

  const nome = nameIdx >= 0 ? String(rowValues[nameIdx] || '').trim() : '';

  Logger.log('processVerifiedRow: nome=' + nome + ' | email=' + email);

  if (emailStatusIdx >= 0) {
    const current = String(rowValues[emailStatusIdx] || '').toLowerCase();
    Logger.log('processVerifiedRow: status atual do e-mail = ' + current);

    if (current.includes('e-mail enviado')) {
      Logger.log('processVerifiedRow: e-mail ja enviado anteriormente. Saindo.');
      return;
    }
  }

  try {
    const okSync = seletivo_runEffect_(
      runtime,
      SELETIVO_OPERATIONAL.capabilities.SYNC,
      'sync inscricao -> avaliacao',
      function() {
        return seletivo_syncInscricaoVerificadaParaAvaliacaoByRow_(row);
      }
    );
    Logger.log('processVerifiedRow: sync Avaliacao resultado = ' + okSync);
  } catch (syncErr) {
    console.error('processVerifiedRow: erro no sync com Avaliacao:', syncErr);
  }

  const canSendEmail = seletivo_canApplyEffect_(
    runtime,
    SELETIVO_OPERATIONAL.capabilities.EMAIL,
    'envio inicial de agendamento'
  );

  let sentOk = false;
  if (canSendEmail) {
    Logger.log('processVerifiedRow: enviando e-mail inicial...');
    sentOk = seletivo_sendInitialSchedulingEmail_(email, nome);
    Logger.log('processVerifiedRow: resultado do envio = ' + sentOk);
  }

  if (canSendEmail && sentOk) {
    if (emailStatusIdx >= 0) {
      sh.getRange(row, emailStatusIdx + 1).setValue(
        `E-mail enviado em ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')}`
      );
      Logger.log('processVerifiedRow: status de e-mail atualizado.');
    }

    if (noteIdx >= 0) {
      sh.getRange(row, noteIdx + 1).setValue(
        'Envio disparado apos verificacao e sincronizacao com Avaliacao.'
      );
      Logger.log('processVerifiedRow: observacao atualizada.');
    }
  } else if (canSendEmail) {
    if (emailStatusIdx >= 0) {
      sh.getRange(row, emailStatusIdx + 1).setValue(
        `Falha no envio em ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')}`
      );
    }

    if (noteIdx >= 0) {
      sh.getRange(row, noteIdx + 1).setValue(
        'Falha ao enviar e-mail inicial apos verificacao.'
      );
    }

    Logger.log('processVerifiedRow: envio falhou, status registrado na planilha.');
  }
}

function seletivo_sendInitialSchedulingEmail_(email, nome) {
  try {
    const scheduleSheet = GEAPA_CORE.coreGetSheetByKey(SETTINGS.publicScheduleKey);
    const scheduleUrl = scheduleSheet ? scheduleSheet.getParent().getUrl() : '';

    const dict = {
      NOME: nome || 'candidato(a)',
      LINK_PLANILHA: scheduleUrl
    };

    const subject = SETTINGS.inviteSubject;
    const htmlBody = fill_(SETTINGS.inviteHtml, dict);

    const plainBody =
      'Ola, ' + (nome || 'candidato(a)') + '!\n\n' +
      'Seu cadastro no processo seletivo do GEAPA foi verificado.\n' +
      'Agora voce ja pode confirmar seu horario de entrevista respondendo este e-mail com o codigo do horario desejado.\n\n' +
      'Planilha de horarios:\n' + scheduleUrl + '\n\n' +
      'Atenciosamente,\nEquipe de Selecao';

    Logger.log('Enviando e-mail inicial para: ' + email);
    Logger.log('Assunto: ' + subject);

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody
    });

    GEAPA_CORE.coreEnsureLabel(SETTINGS.inboxLabel);
    const labelInbox = GEAPA_CORE.coreGetLabel(SETTINGS.inboxLabel);

    const query = 'in:sent to:' + email + ' subject:"' + subject + '" newer_than:1d';
    const threads = GmailApp.search(query, 0, 10);

    if (threads && threads.length) {
      const thread = threads[0];
      if (labelInbox) thread.addLabel(labelInbox);
      Logger.log('Thread inicial etiquetado com inboxLabel: ' + SETTINGS.inboxLabel);
    } else {
      Logger.log('Nenhum thread encontrado para etiquetar apos envio inicial.');
    }

    Logger.log('MailApp.sendEmail executado com sucesso para: ' + email);
    return true;
  } catch (err) {
    console.error('seletivo_sendInitialSchedulingEmail_ erro:', err);
    return false;
  }
}
