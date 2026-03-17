/***************************************
 * 03_Gmail_Core.gs
 ***************************************/
function reply_(thread, subject, htmlBody) {
  thread.reply("", { subject, htmlBody, noReply: true });
}

function replyEmail_(to, subject, htmlBody) {
  GmailApp.sendEmail(to, subject, "", { htmlBody });
}

function mark_(thread, labelIn, labelOut) {
  if (labelIn) thread.removeLabel(labelIn);
  if (labelOut) thread.addLabel(labelOut);
  thread.markRead();
}

function extractEmail_(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim();
}

function extractName_(from) {
  const m = String(from).match(/^"?([^"<]+)"?\s*</);
  const raw = (m ? m[1] : String(from)).trim();
  if (raw.includes("@")) return "";
  return raw;
}

/***************************************
 * PRESENÇA DA ENTREVISTA
 ***************************************/

function seletivo_getInterviewerEmailByRgaOrName_(rga, nome) {
  try {
    const sh = seletivo_sheetByKey_(SETTINGS.interviewerListKey);
    if (!sh) {
      Logger.log('seletivo_getInterviewerEmailByRgaOrName_: aba Lista de entrevistadores não encontrada.');
      return '';
    }

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2) return '';

    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(h => String(h || '').trim());

    const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const idxNome = headers.findIndex(h => String(h).trim().toUpperCase() === 'NOME');
    const idxRga = headers.findIndex(h => String(h).trim().toUpperCase() === 'RGA');
    const idxEmail = headers.findIndex(h => String(h).trim().toUpperCase() === 'EMAIL');

    if (idxEmail < 0) {
      Logger.log('seletivo_getInterviewerEmailByRgaOrName_: coluna Email não encontrada.');
      return '';
    }

    const alvoRga = String(rga || '').trim();
    const alvoNome = String(nome || '').trim().toLowerCase();

    if (alvoRga && idxRga >= 0) {
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const rowRga = String(row[idxRga] || '').trim();
        const rowEmail = String(row[idxEmail] || '').trim();

        if (rowRga && rowRga === alvoRga) return rowEmail;
      }
    }

    if (alvoNome && idxNome >= 0) {
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const rowNome = String(row[idxNome] || '').trim().toLowerCase();
        const rowEmail = String(row[idxEmail] || '').trim();

        if (rowNome && rowNome === alvoNome) return rowEmail;
      }
    }

    Logger.log('seletivo_getInterviewerEmailByRgaOrName_: nenhum e-mail encontrado. RGA=' + alvoRga + ' | Nome=' + nome);
    return '';
  } catch (e) {
    console.error('seletivo_getInterviewerEmailByRgaOrName_ erro:', e);
    return '';
  }
}

function seletivo_sendPresenceCheckEmail_(reservaObj) {
  try {
    if (!reservaObj) {
      throw new Error('seletivo_sendPresenceCheckEmail_: reservaObj vazio.');
    }

    const emailEntrevistador = seletivo_getInterviewerEmailByRgaOrName_(
      reservaObj.rgaEntrevistadorResponsavel,
      reservaObj.nomeEntrevistadorResponsavel
    );

    if (!emailEntrevistador) {
      Logger.log('seletivo_sendPresenceCheckEmail_: sem e-mail do entrevistador responsável.');
      return { ok: false, reason: 'SEM_EMAIL_ENTREVISTADOR' };
    }

    const subject = SETTINGS.presenceCheckSubject || 'Confirmação de presença na entrevista – Processo Seletivo GEAPA';

    const plainBody =
      'Olá!\n\n' +
      'Confirme a presença do candidato abaixo na entrevista do Processo Seletivo GEAPA.\n\n' +
      'Candidato: ' + (reservaObj.nome || '') + '\n' +
      'RGA: ' + (reservaObj.rgaCandidato || '') + '\n' +
      'Dia: ' + (reservaObj.dia || '') + '\n' +
      'Faixa: ' + (reservaObj.faixa || '') + '\n\n' +
      'Responda APENAS com uma das opções abaixo:\n' +
      'SIM\n' +
      'NAO\n\n' +
      'Atenciosamente,\nSistema GEAPA';

    const htmlBody =
      '<p>Olá!</p>' +
      '<p>Confirme a presença do candidato abaixo na entrevista do Processo Seletivo GEAPA.</p>' +
      '<p>' +
      '<b>Candidato:</b> ' + (reservaObj.nome || '') + '<br>' +
      '<b>RGA:</b> ' + (reservaObj.rgaCandidato || '') + '<br>' +
      '<b>Dia:</b> ' + (reservaObj.dia || '') + '<br>' +
      '<b>Faixa:</b> ' + (reservaObj.faixa || '') +
      '</p>' +
      '<p>Responda <b>APENAS</b> com uma das opções abaixo:<br>SIM<br>NAO</p>' +
      '<p>Atenciosamente,<br>Sistema GEAPA</p>';

    Logger.log('seletivo_sendPresenceCheckEmail_: enviando para ' + emailEntrevistador);

    GmailApp.sendEmail(emailEntrevistador, subject, plainBody, {
      htmlBody: htmlBody
    });

    GEAPA_CORE.coreEnsureLabel(SETTINGS.presenceCheckLabel || 'Entrevistas/PresencaRespostas');
    const lbl = GEAPA_CORE.coreGetLabel(SETTINGS.presenceCheckLabel || 'Entrevistas/PresencaRespostas');

    const query = 'in:sent to:' + emailEntrevistador + ' subject:"' + subject + '" newer_than:1d';
    const threads = GmailApp.search(query, 0, 10);

    if (threads && threads.length) {
      const thread = threads[0];
      if (lbl) thread.addLabel(lbl);

      const lastMsg = thread.getMessages().slice(-1)[0];

      return {
        ok: true,
        threadId: thread.getId(),
        messageId: lastMsg ? lastMsg.getId() : ''
      };
    }

    return { ok: true, threadId: '', messageId: '' };
  } catch (e) {
    console.error('seletivo_sendPresenceCheckEmail_ erro:', e);
    return { ok: false, reason: String(e) };
  }
}

/***************************************
 * E-MAILS AO CANDIDATO APÓS PRESENÇA
 ***************************************/

function seletivo_sendPostInterviewApprovedEmail_(rga, email, nome) {
  try {
    const info = seletivo_getAvaliacaoDynamicInfoByRgaOrEmail_(rga, email);

    const dataDinamica = seletivo_formatMaybeDate_(info.dataDinamica) || 'A definir';
    const horarioDinamica = seletivo_formatMaybeTime_(info.horarioDinamica) || 'A definir';
    const localDinamica = String(info.localDinamica || '').trim() || 'A definir';

    const subject = SETTINGS.presenceApprovedSubject || 'Próxima etapa do Processo Seletivo GEAPA';

    const plainBody =
      'Olá, ' + (nome || 'candidato(a)') + '!\n\n' +
      'Sua presença na entrevista do Processo Seletivo GEAPA foi confirmada.\n\n' +
      'A próxima etapa será a dinâmica.\n' +
      'Data da dinâmica: ' + dataDinamica + '\n' +
      'Horário da dinâmica: ' + horarioDinamica + '\n' +
      'Local da dinâmica: ' + localDinamica + '\n\n' +
      'Fique atento(a) ao seu e-mail para eventuais orientações adicionais.\n\n' +
      'Atenciosamente,\nEquipe de Seleção';

    const htmlBody =
      '<p>Olá, <b>' + (nome || 'candidato(a)') + '</b>!</p>' +
      '<p>Sua presença na entrevista do Processo Seletivo GEAPA foi confirmada.</p>' +
      '<p>A próxima etapa será a dinâmica.</p>' +
      '<p><b>Data da dinâmica:</b> ' + dataDinamica + '<br>' +
      '<b>Horário da dinâmica:</b> ' + horarioDinamica + '<br>' +
      '<b>Local da dinâmica:</b> ' + localDinamica + '</p>' +
      '<p>Fique atento(a) ao seu e-mail para eventuais orientações adicionais.</p>' +
      '<p>Atenciosamente,<br>Equipe de Seleção</p>';

    GmailApp.sendEmail(email, subject, plainBody, { htmlBody });
    Logger.log('seletivo_sendPostInterviewApprovedEmail_: enviado para ' + email);
    return true;
  } catch (e) {
    console.error('seletivo_sendPostInterviewApprovedEmail_ erro:', e);
    return false;
  }
}

function seletivo_sendPostInterviewRejectedEmail_(email, nome) {
  try {
    const subject = SETTINGS.presenceRejectedSubject || 'Resultado da entrevista – Processo Seletivo GEAPA';

    const plainBody =
      'Olá, ' + (nome || 'candidato(a)') + '!\n\n' +
      'Informamos que, em razão do não comparecimento à entrevista do Processo Seletivo GEAPA, sua participação foi encerrada e você foi desclassificado(a) do processo.\n\n' +
      'Atenciosamente,\nEquipe de Seleção';

    const htmlBody =
      '<p>Olá, <b>' + (nome || 'candidato(a)') + '</b>!</p>' +
      '<p>Informamos que, em razão do <b>não comparecimento à entrevista</b> do Processo Seletivo GEAPA, sua participação foi encerrada e você foi <b>desclassificado(a)</b> do processo.</p>' +
      '<p>Atenciosamente,<br>Equipe de Seleção</p>';

    GmailApp.sendEmail(email, subject, plainBody, { htmlBody: htmlBody });

    Logger.log('seletivo_sendPostInterviewRejectedEmail_: enviado para ' + email);
    return true;
  } catch (e) {
    console.error('seletivo_sendPostInterviewRejectedEmail_ erro:', e);
    return false;
  }
}
