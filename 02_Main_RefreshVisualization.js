/***************************************
 * 02_Main_RefreshVisualization.gs
 ***************************************/

function refreshVisualizationFromInterviewers(e) {
  return seletivo_runOperationalFlow_(
    SELETIVO_OPERATIONAL.flows.REFRESH_VISUALIZACAO,
    SELETIVO_OPERATIONAL.capabilities.SYNC,
    {
      executionType: seletivo_getExecutionTypeFromEvent_(e),
      source: 'refreshVisualizationFromInterviewers'
    },
    function(runtime) {
      const shPublic = GEAPA_CORE.coreGetSheetByKey(SETTINGS.publicScheduleKey);
      if (!shPublic) return;

      const activeBlocks = new Set(getActiveBlocks_());
      const lastRow = shPublic.getLastRow();
      if (lastRow < SETTINGS.firstSlotRow) return;

      SETTINGS.AGG_RULES.forEach(rule => {
        const colIndex = colLettersToIndex_(rule.dayColumnLetter);
        const numRows = lastRow - SETTINGS.firstSlotRow + 1;

        const rng = shPublic.getRange(SETTINGS.firstSlotRow, colIndex, numRows, 1);
        const values = rng.getValues();
        const displays = rng.getDisplayValues();
        let changed = false;

        for (let i = 0; i < numRows; i++) {
          const row = SETTINGS.firstSlotRow + i;
          const currentDisplay = String(displays[i][0] || '').trim();

          if (isAgendadoText_(currentDisplay)) continue;

          const code20 = `${rule.dayColumnLetter}${row}`;
          const aggCode = computeAggregateCode_(rule.dayColumnLetter, row, SETTINGS);
          if (!aggCode) continue;

          const isActive = activeBlocks.has(aggCode);
          const currentValue = String(values[i][0] ?? '').trim();

          if (isActive) {
            if (currentValue !== code20) {
              values[i][0] = code20;
              changed = true;
            }
          } else if (currentValue === code20) {
            values[i][0] = PLACEHOLDER_WHEN_BLOCK_INACTIVE;
            changed = true;
          }
        }

        if (changed) {
          seletivo_runEffect_(
            runtime,
            SELETIVO_OPERATIONAL.capabilities.SYNC,
            'refresh da visualizacao publica',
            function() {
              rng.setValues(values);
            }
          );
        }
      });
    }
  );
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
    const code = String(row[codeIdx] || '').toUpperCase().trim();
    if (!code) continue;

    const names = nameIdxs.map(i => String(row[i] || '').trim()).filter(Boolean);
    if (names.length >= 2) actives.add(code);
  }

  return Array.from(actives);
}
