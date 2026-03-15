/***************************************
 * 50_seletivo_install.gs
 * Instala/Remove triggers do módulo (versão atual).
 ***************************************/

// Handlers desta versão
const SELETIVO_TRIGGERS = Object.freeze([
  { fn: "seletivo_onEditVerificacao", type: "onEditSpreadsheet" },
  { fn: "processInboxReplies", type: "timeMinutes", minutes: 5 },
  { fn: "refreshVisualizationFromInterviewers", type: "timeMinutes", minutes: 10 },
  { fn: "seletivo_updateCurrentSemesterColumn", type: "timeMinutes", minutes: 10 }
]);

function seletivo_installTriggers() {
  seletivo_uninstallTriggers();

  const formsSheet = GEAPA_CORE.coreGetSheetByKey(SETTINGS.formsResponsesKey);
  if (!formsSheet) {
    throw new Error("Não foi possível localizar a aba SELETIVO_INSCRICAO.");
  }

  const spreadsheet = formsSheet.getParent();

  SELETIVO_TRIGGERS.forEach(t => {
    if (t.type === "onEditSpreadsheet") {
      ScriptApp.newTrigger(t.fn)
        .forSpreadsheet(spreadsheet)
        .onEdit()
        .create();
    }

    if (t.type === "timeMinutes") {
      ScriptApp.newTrigger(t.fn)
        .timeBased()
        .everyMinutes(t.minutes)
        .create();
    }
  });

  Logger.log("Triggers do seletivo instalados.");
}

function seletivo_uninstallTriggers() {
  const all = ScriptApp.getProjectTriggers();

  all.forEach(tr => {
    const fn = tr.getHandlerFunction();
    if (SELETIVO_TRIGGERS.some(t => t.fn === fn)) {
      ScriptApp.deleteTrigger(tr);
    }
  });

  Logger.log("Triggers do seletivo removidos.");
}