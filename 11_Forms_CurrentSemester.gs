/***************************************
 * 11_Forms_CurrentSemester.gs
 *
 * Preenche a coluna "Semestre atual" da planilha de respostas
 * com base no RGA do candidato.
 ***************************************/

/**
 * Atualiza a coluna "Semestre atual" da planilha de inscrição
 * usando o RGA de cada candidato.
 *
 * Requisitos:
 * - a aba deve ter as colunas:
 *   - RGA
 *   - Semestre atual
 *
 * A função procura os cabeçalhos por nome, então a posição da coluna
 * pode mudar sem quebrar o código.
 */

 function seletivo_updateCurrentSemesterColumn() {
  seletivo_updateCurrentSemesterColumn_();
}

function seletivo_updateCurrentSemesterColumn_() {
  const sh = GEAPA_CORE.coreGetSheetByKey(SETTINGS.formsResponsesKey);
  if (!sh) return;

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return;

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());

  const rgaIdx = headers.findIndex(h => String(h).toLowerCase() === "rga");
  const semesterIdx = headers.findIndex(h => String(h).toLowerCase() === "semestre atual");

  if (rgaIdx === -1) {
    throw new Error('seletivo_updateCurrentSemesterColumn_: cabeçalho "RGA" não encontrado.');
  }
  if (semesterIdx === -1) {
    throw new Error('seletivo_updateCurrentSemesterColumn_: cabeçalho "Semestre atual" não encontrado.');
  }

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const rga = String(values[i][rgaIdx] || "").trim();
    if (!rga) continue;

    const semester = GEAPA_CORE.coreGetStudentCurrentSemesterFromRga(rga);
    if (semester == null) continue;

    const display = `${semester}º semestre`;

    if (String(values[i][semesterIdx] || "").trim() !== display) {
      values[i][semesterIdx] = display;
      changed = true;
    }
  }

  if (changed) {
    sh.getRange(2, 1, lastRow - 1, lastCol).setValues(values);
  }
}