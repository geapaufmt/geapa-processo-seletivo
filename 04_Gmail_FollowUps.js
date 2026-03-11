/***************************************
 * 04_Gmail_FollowUps.gs
 * (Script C - parte 1) — INTEGRADO c/ GEAPA-CORE
 *
 * O que muda:
 * - Labels: garante e pega via Core
 * - (resto igual) lógica de refile e search mantém GmailApp.search (precisa)
 ***************************************/
function requeueFollowUps_() {
  // garante labels via Core
  GEAPA_CORE.coreEnsureLabel(SETTINGS.inboxLabel);
  GEAPA_CORE.coreEnsureLabel(SETTINGS.processedLabel);
  GEAPA_CORE.coreEnsureLabel(SETTINGS.errorLabel);

  const labelInbox     = GEAPA_CORE.coreGetLabel(SETTINGS.inboxLabel);
  const labelProcessed = GEAPA_CORE.coreGetLabel(SETTINGS.processedLabel);
  const labelError     = GEAPA_CORE.coreGetLabel(SETTINGS.errorLabel);

  const myEmails = [Session.getActiveUser().getEmail(), ...GmailApp.getAliases()]
    .map(e => String(e || "").toLowerCase());

  function isFromMe_(from) {
    const f = String(from || "").toLowerCase();
    return myEmails.some(me => me && f.includes(me));
  }

  const buckets = [];
  if (labelProcessed) buckets.push('label:"' + SETTINGS.processedLabel + '" newer_than:30d');
  if (labelError)     buckets.push('label:"' + SETTINGS.errorLabel     + '" newer_than:30d');

  let moved = 0;
  buckets.forEach(q => {
    const threads = GmailApp.search(q, 0, 100);
    threads.forEach(t => {
      const msgs = t.getMessages();
      if (!msgs.length) return;

      const last = msgs[msgs.length - 1];
      const from = last.getFrom();
      const body = (last.getPlainBody() || "") + "\n" + (last.getBody() || "");
      const m = body.toUpperCase().match(SETTINGS.codeRegex);
      const hasCode = !!(m && m[1]);

      // Refile somente se a última mensagem NÃO é sua e contém um código
      if (!isFromMe_(from) && hasCode) {
        if (labelInbox) t.addLabel(labelInbox);
        if (labelProcessed) t.removeLabel(labelProcessed);
        if (labelError)     t.removeLabel(labelError);
        t.markUnread();
        moved++;
      }
    });
  });

  console.log("requeueFollowUps_: threads refiled =", moved);
}