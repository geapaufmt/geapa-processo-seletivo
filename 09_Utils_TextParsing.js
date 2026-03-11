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