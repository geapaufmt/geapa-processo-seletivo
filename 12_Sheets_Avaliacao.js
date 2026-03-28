/***************************************
 * 12_Sheets_Avaliacao.js
 ***************************************/

function seletivo_getAvaliacaoSheet_() {
  const sheet = seletivo_sheetByKey_('SELETIVO_AVALIACAO');
  Logger.log('seletivo_getAvaliacaoSheet_: sheet=' + sheet);

  if (!sheet) {
    throw new Error('Nao foi possivel abrir a aba SELETIVO_AVALIACAO.');
  }

  return sheet;
}

function getAvaliacaoHeaderMap_(sheet) {
  Logger.log('getAvaliacaoHeaderMap_: sheet=' + sheet);

  if (!sheet) {
    throw new Error('getAvaliacaoHeaderMap_: sheet veio indefinido.');
  }

  const data = GEAPA_CORE.coreReadSheetData(sheet, { headerRow: 1 });
  return GEAPA_CORE.coreBuildHeaderIndexMap(data.headers, {
    normalize: false,
    oneBased: true,
    keepFirst: true
  });
}

function seletivo_setAvaliacaoFieldByHeader_(rowNumber, headerName, value) {
  const sheet = seletivo_getAvaliacaoSheet_();
  const headers = getAvaliacaoHeaderMap_(sheet);

  const resolved = GEAPA_CORE.coreFindFirstExistingHeader(
    headers,
    Array.isArray(headerName) ? headerName : [headerName],
    { normalize: false }
  );

  if (!resolved || !resolved.found) {
    Logger.log('Cabecalho nao encontrado na Avaliacao: ' + headerName);
    return false;
  }

  const wrote = GEAPA_CORE.coreWriteCellByHeader(sheet, rowNumber, headers, resolved.headerName, value, {
    normalize: false,
    oneBased: true
  });

  if (!wrote) {
    Logger.log('Cabecalho nao encontrado na Avaliacao: ' + headerName);
    return false;
  }

  return true;
}

function seletivo_getAvaliacaoRecords_() {
  return GEAPA_CORE.coreReadSheetRecords(seletivo_getAvaliacaoSheet_(), { headerRow: 1 });
}

function seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email) {
  const records = seletivo_getAvaliacaoRecords_();
  let found = null;

  if (String(rga || '').trim()) {
    found = GEAPA_CORE.coreFindFirstRecordByField(records, 'RGA', rga, {
      normalizer: function(input) {
        return String(input || '').trim();
      }
    });
  }

  if (!found && String(email || '').trim()) {
    found = GEAPA_CORE.coreFindFirstRecordByField(records, 'Email', email, {
      normalizer: function(input) {
        return String(input || '').trim().toLowerCase();
      }
    });
  }

  if (!found) {
    return { found: false, rowNumber: null, rowValues: null, record: null };
  }

  const headerMap = getAvaliacaoHeaderMap_(seletivo_getAvaliacaoSheet_());
  const headers = Object.keys(headerMap).sort(function(a, b) {
    return headerMap[a] - headerMap[b];
  });

  return {
    found: true,
    rowNumber: found.__rowNumber || null,
    rowValues: GEAPA_CORE.coreBuildRowFromObjectByHeaders(headers, found),
    record: found
  };
}

function seletivo_buildAvaliacaoRowFromInscricao_(inscricaoObj) {
  return {
    'Seletivo semestre': seletivo_getSemestreSeletivoAtual_(),
    'Nome Completo': inscricaoObj['Nome Completo'] || inscricaoObj['Nome completo'] || '',
    'Email': inscricaoObj['Email'] || inscricaoObj['Endereco de e-mail'] || inscricaoObj['Endereço de e-mail'] || '',
    'RGA': inscricaoObj['RGA'] || '',
    'Semestre atual': inscricaoObj['Semestre atual'] || '',
    'Participa/Participou de algum/alguns laborat\u00f3rio(s), projeto(s), pesquisa(s), empresa j\u00fanior, monitoria, etc? se sim, citar qual/quais.':
      inscricaoObj['Participa/Participou de algum/alguns laborat\u00f3rio(s), projeto(s), pesquisa(s), empresa j\u00fanior, monitoria, etc? se sim, citar qual/quais.'] || '',
    'CR': inscricaoObj['CR'] || '',
    'Status no processo': (typeof SELETIVO_STATUS !== 'undefined' ? SELETIVO_STATUS.INSCRITO : 'Inscrito'),
    'Resultado': (typeof SELETIVO_RESULTADO !== 'undefined' ? SELETIVO_RESULTADO.EM_ANALISE : 'Em analise'),
    'Presenca entrevista': (typeof SELETIVO_PRESENCA !== 'undefined' ? SELETIVO_PRESENCA.PENDENTE : 'Pendente'),
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
    'Participa/Participou de algum/alguns laborat\u00f3rio(s), projeto(s), pesquisa(s), empresa j\u00fanior, monitoria, etc? se sim, citar qual/quais.',
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
  const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(candidato.RGA, candidato.Email);

  if (lookup.found) {
    seletivo_updateAvaliacaoCamposBasicos_(lookup.rowNumber, candidato);
    Logger.log('Avaliacao atualizada na linha ' + lookup.rowNumber);
    return { action: 'updated', rowNumber: lookup.rowNumber };
  }

  const sheet = seletivo_getAvaliacaoSheet_();
  GEAPA_CORE.coreAppendObjectByHeaders(sheet, candidato, { headerRow: 1 });
  const rowNumber = sheet.getLastRow();

  Logger.log('Nova linha criada na Avaliacao: ' + rowNumber);
  return { action: 'inserted', rowNumber: rowNumber };
}

function seletivo_markAvaliacaoCompareceu_(rga, email) {
  const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
  if (!lookup.found) return false;

  seletivo_setAvaliacaoFieldByHeader_(
    lookup.rowNumber,
    ['Presença entrevista', 'Presenca entrevista'],
    typeof SELETIVO_PRESENCA !== 'undefined' ? SELETIVO_PRESENCA.COMPARECEU : 'Compareceu'
  );
  seletivo_setAvaliacaoFieldByHeader_(
    lookup.rowNumber,
    'Status no processo',
    typeof SELETIVO_STATUS !== 'undefined' ? SELETIVO_STATUS.ENTREVISTADO : 'Entrevistado'
  );

  return true;
}

function seletivo_markAvaliacaoFaltou_(rga, email) {
  const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
  if (!lookup.found) return false;

  seletivo_setAvaliacaoFieldByHeader_(
    lookup.rowNumber,
    ['Presença entrevista', 'Presenca entrevista'],
    typeof SELETIVO_PRESENCA !== 'undefined' ? SELETIVO_PRESENCA.FALTOU : 'Faltou'
  );
  seletivo_setAvaliacaoFieldByHeader_(
    lookup.rowNumber,
    'Status no processo',
    typeof SELETIVO_STATUS !== 'undefined' ? SELETIVO_STATUS.ENCERRADO : 'Encerrado'
  );
  seletivo_setAvaliacaoFieldByHeader_(
    lookup.rowNumber,
    'Resultado',
    typeof SELETIVO_RESULTADO !== 'undefined' ? SELETIVO_RESULTADO.DESCLASSIFICADO : 'Desclassificado'
  );
  seletivo_setAvaliacaoFieldByHeader_(
    lookup.rowNumber,
    'Motivo desclassificação',
    typeof SELETIVO_MOTIVO_DESC !== 'undefined' ? SELETIVO_MOTIVO_DESC.FALTA_ENTREVISTA : 'Falta a entrevista'
  );
  seletivo_setAvaliacaoFieldByHeader_(lookup.rowNumber, 'Data desclassificação', new Date());

  return true;
}

function seletivo_getLocalEntrevistaByRgaOrEmail_(rga, email) {
  try {
    const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
    if (!lookup || !lookup.found) {
      Logger.log('seletivo_getLocalEntrevistaByRgaOrEmail_: candidato nao encontrado.');
      return '';
    }

    const sheet = seletivo_getAvaliacaoSheet_();
    const headers = getAvaliacaoHeaderMap_(sheet);
    const colLocal = headers['Local entrevista'];

    if (!colLocal) {
      Logger.log('seletivo_getLocalEntrevistaByRgaOrEmail_: cabecalho "Local entrevista" nao encontrado.');
      return '';
    }

    return String(GEAPA_CORE.coreGetNearestFilledValueUp(sheet, lookup.rowNumber, colLocal) || '').trim();
  } catch (e) {
    console.error('seletivo_getLocalEntrevistaByRgaOrEmail_ erro:', e);
    return '';
  }
}

function seletivo_getAvaliacaoDynamicInfoByRgaOrEmail_(rga, email) {
  try {
    const lookup = seletivo_findAvaliacaoRowByRgaOrEmail_(rga, email);
    if (!lookup || !lookup.found) {
      Logger.log('seletivo_getAvaliacaoDynamicInfoByRgaOrEmail_: candidato nao encontrado.');
      return {
        rowNumber: null,
        dataDinamica: '',
        horarioDinamica: '',
        localDinamica: ''
      };
    }

    const sheet = seletivo_getAvaliacaoSheet_();
    const headers = getAvaliacaoHeaderMap_(sheet);

    const colData = headers['Data da dinâmica'] || headers['Data da din\u00e2mica'];
    const colHorario = headers['Horário da dinâmica'] || headers['Hor\u00e1rio da din\u00e2mica'];
    const colLocal = headers['Local da dinâmica'] || headers['Local da din\u00e2mica'];

    return {
      rowNumber: lookup.rowNumber,
      dataDinamica: colData ? GEAPA_CORE.coreGetNearestFilledValueUp(sheet, lookup.rowNumber, colData) : '',
      horarioDinamica: colHorario ? GEAPA_CORE.coreGetNearestFilledValueUp(sheet, lookup.rowNumber, colHorario) : '',
      localDinamica: colLocal ? GEAPA_CORE.coreGetNearestFilledValueUp(sheet, lookup.rowNumber, colLocal) : ''
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
    return GEAPA_CORE.coreGetNearestFilledValueUp(sheet, startRow, colNumber);
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
