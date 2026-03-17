/***************************************
 * 00B_OnEdit_Log_Remarcacao.gs
 *
 * Reenvia o e-mail inicial de agendamento
 * quando Status reserva = "Remarcada antecipadamente"
 * no log de entrevistas.
 ***************************************/

/**
 * Trigger instalável de edição da planilha de log.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function seletivo_onEditLogRemarcacao(e) {
  try {
    seletivo_assertCore_();

    if (!e || !e.range) {
      Logger.log('seletivo_onEditLogRemarcacao: evento sem range.');
      return;
    }

    const sh = e.range.getSheet();
    const targetSheet = GEAPA_CORE.coreGetSheetByKey(SETTINGS.privateLogKey);

    if (!targetSheet) {
      Logger.log('seletivo_onEditLogRemarcacao: targetSheet não encontrada via key ' + SETTINGS.privateLogKey);
      return;
    }

    if (sh.getSheetId() !== targetSheet.getSheetId()) {
      Logger.log('seletivo_onEditLogRemarcacao: edição fora da sheet alvo.');
      return;
    }

    const row = e.range.getRow();
    const col = e.range.getColumn();

    if (row < 2) {
      Logger.log('seletivo_onEditLogRemarcacao: edição no cabeçalho.');
      return;
    }

    const lastCol = sh.getLastColumn();
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(h => String(h || '').trim());

    const statusHeader = 'Status reserva';
    const statusIdx = headers.indexOf(statusHeader);

    if (statusIdx < 0) {
      throw new Error('Cabeçalho "Status reserva" não encontrado no log.');
    }

    if (col !== statusIdx + 1) {
      Logger.log('seletivo_onEditLogRemarcacao: coluna editada não é Status reserva.');
      return;
    }

    const cellValueNow = String(sh.getRange(row, col).getDisplayValue() || '').trim();
    const newValue = String(e.value ?? cellValueNow ?? '').trim().toLowerCase();
    const targetValue = String(SETTINGS.remarcadaAntecipadamenteStatus || 'Remarcada antecipadamente')
      .trim()
      .toLowerCase();

    Logger.log('seletivo_onEditLogRemarcacao: newValue=' + newValue + ' | targetValue=' + targetValue);

    if (newValue !== targetValue) {
      Logger.log('seletivo_onEditLogRemarcacao: status não corresponde ao status de remarcação.');
      return;
    }

    seletivo_processRemarcacaoAntecipadaRow_(sh, row, headers);

  } catch (err) {
    console.error('seletivo_onEditLogRemarcacao erro:', err);
    throw err;
  }
}

function seletivo_processRemarcacaoAntecipadaRow_(sh, row, headers) {
  const lastCol = sh.getLastColumn();
  const rowValues = sh.getRange(row, 1, 1, lastCol).getValues()[0];

  const emailIdx = headers.indexOf('E-mail');
  const nomeIdx = headers.indexOf('Nome');
  const statusIdx = headers.indexOf('Status reserva');

  if (emailIdx < 0) throw new Error('Coluna "E-mail" não encontrada no log.');
  if (nomeIdx < 0) throw new Error('Coluna "Nome" não encontrada no log.');

  const email = String(rowValues[emailIdx] || '').trim();
  const nome = String(rowValues[nomeIdx] || '').trim();
  const status = statusIdx >= 0 ? String(rowValues[statusIdx] || '').trim() : '';

  if (!email) {
    throw new Error('Linha ' + row + ': e-mail do candidato está vazio.');
  }

  Logger.log(
    'seletivo_processRemarcacaoAntecipadaRow_: row=' + row +
    ' | nome=' + nome +
    ' | email=' + email +
    ' | status=' + status
  );

  const sentOk = seletivo_sendInitialSchedulingEmail_(email, nome);
  Logger.log('seletivo_processRemarcacaoAntecipadaRow_: resultado do envio=' + sentOk);

  // Opcional: registrar um comentário simples na própria linha, se houver coluna apropriada no futuro.
}