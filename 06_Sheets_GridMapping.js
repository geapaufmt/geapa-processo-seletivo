/***************************************
 * 06_Sheets_GridMapping.gs
 * (puro — sem integração necessária)
 ***************************************/
function parseCodeToPos_(code) {
  const m = String(code).toUpperCase().match(/^([A-Z]{1,3})(\d{1,4})$/);
  if (!m) return null;
  const col = colLettersToIndex_(m[1]);
  const row = parseInt(m[2], 10);
  if (!col || !row) return null;
  return { row, col };
}

function colLettersToIndex_(letters) {
  const s = String(letters || "").toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function colIndexToLetters_(n) {
  let num = Number(n) || 0;
  let s = "";
  while (num > 0) {
    const r = (num - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function computeAggregateCode_(dayColLetter, row, cfg = SETTINGS) {
  const day = String(dayColLetter || "").toUpperCase();
  const rules = (cfg && cfg.AGG_RULES) || [];
  const firstSlotRow = (cfg && cfg.firstSlotRow) || 1;
  const groupSize = (cfg && cfg.groupSize) || 1;

  const rule = rules.find(r => String(r.dayColumnLetter || "").toUpperCase() === day);
  if (!rule) return "";

  const offset = Number(row) - firstSlotRow;
  if (offset < 0) return "";

  const blockNumber = Math.floor(offset / groupSize) + 1;
  return `${rule.aggPrefix}${blockNumber}`;
}