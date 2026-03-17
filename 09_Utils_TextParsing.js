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