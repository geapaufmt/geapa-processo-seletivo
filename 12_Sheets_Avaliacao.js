/***************************************
 * 12_Sheets_Avaliacao.js
 ***************************************/

function seletivo_getAvaliacaoSheet_() {
  const sheet = seletivo_sheetByKey_('SELETIVO_AVALIACAO');
  Logger.log('seletivo_getAvaliacaoSheet_: sheet=' + sheet);

  if (!sheet) {
    throw new Error('Não foi possível abrir a aba SELETIVO_AVALIACAO.');
  }

  return sheet;
}

function getAvaliacaoHeaderMap_(sheet) {
  Logger.log('getAvaliacaoHeaderMap_: sheet=' + sheet);

  if (!sheet) {
    throw new Error('getAvaliacaoHeaderMap_: sheet veio indefinido.');
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h || '').trim());

  const map = {};
  headers.forEach((h, i) => {
    if (h) map[h] = i + 1; // 1-based
  });

  return map;
}

function seletivo_setAvaliacaoFieldByHeader_(rowNumber, headerName, value) {
  const sheet = seletivo_getAvaliacaoSheet_();
  const headers = getAvaliacaoHeaderMap_(sheet);
  const col = headers[headerName];

  if (!col) {
    Logger.log('Cabeçalho não encontrado na Avaliação: ' + headerName);
    return false;
  }

  sheet.getRange(rowNumber, col).setValue(value);
  return true;
}

function seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email) {
  const sheet = seletivo_getAvaliacaoSheet_();
  Logger.log('seletivo_findAvaliacaoRowByRgaOrEmail_: sheet=' + sheet);

  const headers = getAvaliacaoHeaderMap_(sheet);
  const data = sheet.getDataRange().getValues();

  const rgaNorm = String(rga || '').trim();
  const emailNorm = String(email || '').trim().toLowerCase();

  const colRga = headers['RGA'];
  const colEmail = headers['Email'];

  if (!colRga && !colEmail) {
    throw new Error('Aba Avaliação sem cabeçalhos "RGA" e/ou "Email".');
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowRga = colRga ? String(row[colRga - 1] || '').trim() : '';
    const rowEmail = colEmail ? String(row[colEmail - 1] || '').trim().toLowerCase() : '';

    if (rgaNorm && rowRga && rowRga === rgaNorm) {
      return { found: true, rowNumber: i + 1, rowValues: row };
    }

    if (emailNorm && rowEmail && rowEmail === emailNorm) {
      return { found: true, rowNumber: i + 1, rowValues: row };
    }
  }

  return { found: false, rowNumber: null, rowValues: null };
}

function seletivo_buildAvaliacaoRowFromInscricao_(inscricaoObj) {
  return {
    'Seletivo semestre': seletivo_getSemestreSeletivoAtual_(),
    'Nome Completo': inscricaoObj['Nome Completo'] || inscricaoObj['Nome completo'] || '',
    'Email': inscricaoObj['Email'] || inscricaoObj['Endereço de e-mail'] || '',
    'RGA': inscricaoObj['RGA'] || '',
    'Semestre atual': inscricaoObj['Semestre atual'] || '',
    'Participa/Participou de algum/alguns laboratório(s), projeto(s), pesquisa(s), empresa júnior, monitoria, etc? se sim, citar qual/quais.':
      inscricaoObj['Participa/Participou de algum/alguns laboratório(s), projeto(s), pesquisa(s), empresa júnior, monitoria, etc? se sim, citar qual/quais.'] || '',
    'CR': inscricaoObj['CR'] || '',
    'Status no processo': (typeof SELETIVO_STATUS !== 'undefined' ? SELETIVO_STATUS.INSCRITO : 'Inscrito'),
    'Resultado': (typeof SELETIVO_RESULTADO !== 'undefined' ? SELETIVO_RESULTADO.EM_ANALISE : 'Em análise'),
    'Presença entrevista': (typeof SELETIVO_PRESENCA !== 'undefined' ? SELETIVO_PRESENCA.PENDENTE : 'Pendente')
  };
}

function seletivo_updateAvaliacaoCamposBasicos_(rowNumber, candidatoObj) {
  const camposPermitidos = [
    'Seletivo semestre',
    'Nome Completo',
    'Email',
    'RGA',
    'Semestre atual',
    'Participa/Participou de algum/alguns laboratório(s), projeto(s), pesquisa(s), empresa júnior, monitoria, etc? se sim, citar qual/quais.',
    'CR'
  ];

  camposPermitidos.forEach(function(headerName) {
    if (Object.prototype.hasOwnProperty.call(candidatoObj, headerName)) {
      seletivo_setAvaliacaoFieldByHeader_(rowNumber, headerName, candidatoObj[headerName]);
    }
  });
}

function seletivo_upsertAvaliacaoFromInscricao_(inscricaoObj) {
  const candidato = seletivo_buildAvaliacaoRowFromInscricao_(inscricaoObj);
  const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(candidato['RGA'], candidato['Email']);

  if (lookup.found) {
    seletivo_updateAvaliacaoCamposBasicos_(lookup.rowNumber, candidato);
    Logger.log('Avaliação atualizada na linha ' + lookup.rowNumber);
    return { action: 'updated', rowNumber: lookup.rowNumber };
  }

  const sheet = seletivo_getAvaliacaoSheet_();
  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h || '').trim());

  const novaLinha = headerRow.map(function(header) {
    return Object.prototype.hasOwnProperty.call(candidato, header) ? candidato[header] : '';
  });

  sheet.appendRow(novaLinha);
  const rowNumber = sheet.getLastRow();

  Logger.log('Nova linha criada na Avaliação: ' + rowNumber);
  return { action: 'inserted', rowNumber: rowNumber };
}

function seletivo_markAvaliacaoCompareceu_(rga, email) {
  const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
  if (!lookup.found) return false;

  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Presença entrevista',
    typeof SELETIVO_PRESENCA !== 'undefined' ? SELETIVO_PRESENCA.COMPARECEU : 'Compareceu');
  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Status no processo',
    typeof SELETIVO_STATUS !== 'undefined' ? SELETIVO_STATUS.ENTREVISTADO : 'Entrevistado');

  return true;
}

function seletivo_markAvaliacaoFaltou_(rga, email) {
  const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
  if (!lookup.found) return false;

  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Presença entrevista',
    typeof SELETIVO_PRESENCA !== 'undefined' ? SELETIVO_PRESENCA.FALTOU : 'Faltou');
  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Status no processo',
    typeof SELETIVO_STATUS !== 'undefined' ? SELETIVO_STATUS.ENCERRADO : 'Encerrado');
  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Resultado',
    typeof SELETIVO_RESULTADO !== 'undefined' ? SELETIVO_RESULTADO.DESCLASSIFICADO : 'Desclassificado');
  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Motivo desclassificação',
    typeof SELETIVO_MOTIVO_DESC !== 'undefined' ? SELETIVO_MOTIVO_DESC.FALTA_ENTREVISTA : 'Falta à entrevista');
  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Data desclassificação', new Date());

  return true;
}

function seletivo_getLocalEntrevistaByRgaOrEmail_(rga, email) {
  try {
    const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
    if (!lookup || !lookup.found) {
      Logger.log('seletivo_getLocalEntrevistaByRgaOrEmail_: candidato não encontrado.');
      return '';
    }

    const sheet = seletivo_getAvaliacaoSheet_();
    const headers = getAvaliacaoHeaderMap_(sheet);
    const colLocal = headers['Local entrevista'];

    if (!colLocal) {
      Logger.log('seletivo_getLocalEntrevistaByRgaOrEmail_: cabeçalho "Local entrevista" não encontrado.');
      return '';
    }

    const valor = seletivo_getNearestFilledValueUp_(sheet, lookup.rowNumber, colLocal);
    return String(valor || '').trim();
  } catch (e) {
    console.error('seletivo_getLocalEntrevistaByRgaOrEmail_ erro:', e);
    return '';
  }
}

function seletivo_getAvaliacaoDynamicInfoByRgaOrEmail_(rga, email) {
  try {
    const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
    if (!lookup || !lookup.found) {
      Logger.log('seletivo_getAvaliacaoDynamicInfoByRgaOrEmail_: candidato não encontrado.');
      return {
        rowNumber: null,
        dataDinamica: '',
        horarioDinamica: '',
        localDinamica: ''
      };
    }

    const sheet = seletivo_getAvaliacaoSheet_();
    const headers = getAvaliacaoHeaderMap_(sheet);

    const colData = headers['Data da dinâmica'];
    const colHorario = headers['Horário da dinâmica'];
    const colLocal = headers['Local da dinâmica'];

    const dataDinamica = colData
      ? seletivo_getNearestFilledValueUp_(sheet, lookup.rowNumber, colData)
      : '';

    const horarioDinamica = colHorario
      ? seletivo_getNearestFilledValueUp_(sheet, lookup.rowNumber, colHorario)
      : '';

    const localDinamica = colLocal
      ? seletivo_getNearestFilledValueUp_(sheet, lookup.rowNumber, colLocal)
      : '';

    return {
      rowNumber: lookup.rowNumber,
      dataDinamica,
      horarioDinamica,
      localDinamica
    };
  } catch (e) {
    console.error('seletivo_getAvaliacaoDynamicInfoByRgaOrEmail_ erro:', e);
    return {
      rowNumber: null,
      dataDinamica: '',
      horarioDinamica: '',
      localDinamica: ''
    };
  }
}

function seletivo_getNearestFilledValueUp_(sheet, startRow, colNumber) {
  try {
    for (let row = startRow; row >= 2; row--) {
      const value = sheet.getRange(row, colNumber).getValue();
      const display = sheet.getRange(row, colNumber).getDisplayValue();

      if (value instanceof Date) return value;
      if (String(display || '').trim()) return value || display;
    }
    return '';
  } catch (e) {
    console.error('seletivo_getNearestFilledValueUp_ erro:', e);
    return '';
  }
}

function seletivo_formatMaybeDate_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }

  return String(value).trim();
}

function seletivo_formatMaybeTime_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(value || '').trim();
}