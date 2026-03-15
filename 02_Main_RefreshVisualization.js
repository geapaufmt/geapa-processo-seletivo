/***************************************
 * 02_Main_RefreshVisualization.gs
 * (Script B - atualização visual) — INTEGRADO c/ GEAPA-CORE + Registry
 *
 * Pré-requisitos no SETTINGS:
 * - publicScheduleKey (ex.: "SELETIVO_AGENDAMENTO")
 * - interviewerKey    (ex.: "SELETIVO_ENTREVISTADORES")
 *
 * Mantém a lógica: só mostra/oculta códigos 20min conforme blocos (1h) ativos,
 * sem mexer em células já "Agendado".
 ***************************************/

function refreshVisualizationFromInterviewers() {
  // Sheet público via Registry
  const shPublic = GEAPA_CORE.coreGetSheetByKey(SETTINGS.publicScheduleKey);
  if (!shPublic) return;

  const activeBlocks = new Set(getActiveBlocks_());
  const lastRow = shPublic.getLastRow();
  if (lastRow < SETTINGS.firstSlotRow) return;

  // Para performance: processa em lote por coluna/dia
  SETTINGS.AGG_RULES.forEach(rule => {
    const colIndex = colLettersToIndex_(rule.dayColumnLetter);
    const numRows = lastRow - SETTINGS.firstSlotRow + 1;

    const rng = shPublic.getRange(SETTINGS.firstSlotRow, colIndex, numRows, 1);
    const values = rng.getValues();           // [[...]]
    const displays = rng.getDisplayValues();  // [[...]] para avaliar "Agendado" sem depender de fórmulas
    let changed = false;

    for (let i = 0; i < numRows; i++) {
      const row = SETTINGS.firstSlotRow + i;
      const currentDisplay = String(displays[i][0] || "").trim();

      // não mexe onde já está Agendado (qualquer formato)
      if (isAgendadoText_(currentDisplay)) continue;

      const code20 = `${rule.dayColumnLetter}${row}`;
      const aggCode = computeAggregateCode_(rule.dayColumnLetter, row, SETTINGS);
      if (!aggCode) continue;

      const isActive = activeBlocks.has(aggCode);
      const currentValue = String(values[i][0] ?? "").trim();

      if (isActive) {
        // exibir o código quando bloco está ativo
        if (currentValue !== code20) {
          values[i][0] = code20;
          changed = true;
        }
      } else {
        // ocultar código quando bloco está inativo
        if (currentValue === code20) {
          values[i][0] = PLACEHOLDER_WHEN_BLOCK_INACTIVE;
          changed = true;
        }
      }
    }

    if (changed) rng.setValues(values);
  });
}

function getActiveBlocks_() {
  const sh = GEAPA_CORE.coreGetSheetByKey(SETTINGS.interviewerKey);
  if (!sh) return [];

  const data = sh.getDataRange().getValues();
  if (!data.length) return [];

  const header = data.shift();

  const codeIdx = header.indexOf(SETTINGS.interviewerCodeHeader);
  const nameIdxs = SETTINGS.interviewerNameHeaders.map(h => header.indexOf(h));

  if (codeIdx < 0 || nameIdxs.some(i => i < 0)) return [];

  const actives = new Set();

  for (const row of data) {
    const code = String(row[codeIdx] || "").toUpperCase().trim();
    if (!code) continue;

    const names = nameIdxs.map(i => String(row[i] || "").trim()).filter(Boolean);
    if (names.length >= 2) actives.add(code);
  }

  return Array.from(actives);
}