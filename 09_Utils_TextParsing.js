/***************************************
 * 09_Utils_TextParsing.gs
 ***************************************/
function fill_(tpl, dict) {
  const map = dict || {};
  return String(tpl).replace(/{{\s*([A-Z_]+)\s*}}/gi, (_, k) => {
    const key = String(k || "").toUpperCase();
    // tenta chave exata e chave em upper
    return String((map[k] ?? map[key]) ?? "");
  });
}

function isAgendadoText_(text) {
  return /agendado/i.test(String(text || ""));
}

function parseAgendadoCounter_(text) {
  const m = String(text || "").match(/agendado.*?\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
  return m ? { booked: parseInt(m[1], 10), capacity: parseInt(m[2], 10) } : null;
}

function seletivo_normalizeYesNo_(text) {
  const s = String(text || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/^SIM\b/.test(s)) return 'SIM';
  if (/^NAO\b/.test(s)) return 'NAO';

  return '';
}

function seletivo_parsePresenceAnswer_(body) {
  const text = String(body || '').trim();
  if (!text) return '';

  // tenta no corpo todo
  let ans = seletivo_normalizeYesNo_(text);
  if (ans) return ans;

  // tenta linha por linha
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    ans = seletivo_normalizeYesNo_(line);
    if (ans) return ans;
  }

  return '';
}

function seletivo_normalizeHeaderKey_(headerName) {
  return String(headerName || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function seletivo_getFieldAliases_(fieldKey) {
  const aliases = (typeof SELETIVO_FIELD_ALIASES !== 'undefined' && SELETIVO_FIELD_ALIASES[fieldKey])
    ? SELETIVO_FIELD_ALIASES[fieldKey]
    : [];
  return aliases.slice();
}

function seletivo_getOcupacaoAliases_() {
  return seletivo_getFieldAliases_('OCUPACAO');
}

function seletivo_findHeaderByAliases_(headersOrMap, aliases) {
  const names = Array.isArray(headersOrMap)
    ? headersOrMap
    : Object.keys(headersOrMap || {});

  const aliasList = Array.isArray(aliases) ? aliases : [aliases];
  for (let i = 0; i < aliasList.length; i++) {
    const alias = String(aliasList[i] || '').trim();
    if (!alias) continue;
    if (names.indexOf(alias) !== -1) return alias;
  }

  const normalizedToName = {};
  names.forEach(function(name) {
    const key = seletivo_normalizeHeaderKey_(name);
    if (key && !Object.prototype.hasOwnProperty.call(normalizedToName, key)) {
      normalizedToName[key] = name;
    }
  });

  for (let j = 0; j < aliasList.length; j++) {
    const normalizedAlias = seletivo_normalizeHeaderKey_(aliasList[j]);
    if (normalizedAlias && Object.prototype.hasOwnProperty.call(normalizedToName, normalizedAlias)) {
      return normalizedToName[normalizedAlias];
    }
  }

  return '';
}

function seletivo_getValueByAliases_(recordObj, aliases) {
  if (!recordObj) return '';

  const aliasList = Array.isArray(aliases) ? aliases : [aliases];
  for (let i = 0; i < aliasList.length; i++) {
    const alias = String(aliasList[i] || '').trim();
    if (!alias) continue;
    if (Object.prototype.hasOwnProperty.call(recordObj, alias)) {
      const value = recordObj[alias];
      if (String(value || '').trim()) return value;
    }
  }

  const normalizedAliases = aliasList
    .map(seletivo_normalizeHeaderKey_)
    .filter(Boolean);

  const keys = Object.keys(recordObj);
  for (let j = 0; j < keys.length; j++) {
    const key = keys[j];
    if (normalizedAliases.indexOf(seletivo_normalizeHeaderKey_(key)) !== -1) {
      const value = recordObj[key];
      if (String(value || '').trim()) return value;
    }
  }

  return '';
}

function seletivo_getOcupacaoFromRecord_(recordObj) {
  return seletivo_getValueByAliases_(recordObj, seletivo_getOcupacaoAliases_());
}
