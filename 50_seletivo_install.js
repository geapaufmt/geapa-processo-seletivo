/***************************************
 * 50_seletivo_install.gs
 * Instala/Remove triggers do módulo (versão atual).
 ***************************************/

// Handlers desta versão
const SELETIVO_TRIGGERS = Object.freeze([
  { fn: 'processInboxReplies', minutes: 5 },                 // processa inbox
  { fn: 'refreshVisualizationFromInterviewers', minutes: 10 } // atualiza grade (ajuste se quiser)
]);

function seletivo_installTriggers() {
  seletivo_uninstallTriggers(); // remove antes para evitar duplicar

  SELETIVO_TRIGGERS.forEach(t => {
    ScriptApp.newTrigger(t.fn)
      .timeBased()
      .everyMinutes(t.minutes)
      .create();
  });

  Logger.log('Triggers instalados: ' + SELETIVO_TRIGGERS.map(t => `${t.fn} (${t.minutes}m)`).join(', '));
}

function seletivo_uninstallTriggers() {
  const all = ScriptApp.getProjectTriggers();
  let removed = 0;

  all.forEach(tr => {
    const fn = tr.getHandlerFunction();
    if (SELETIVO_TRIGGERS.some(t => t.fn === fn)) {
      ScriptApp.deleteTrigger(tr);
      removed++;
    }
  });

  Logger.log('Triggers removidos: ' + removed);
}