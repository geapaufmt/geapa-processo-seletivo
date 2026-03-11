/***************************************
 * 03_Gmail_Core.gs
 ***************************************/
function reply_(thread, subject, htmlBody) {
  thread.reply("", { subject, htmlBody, noReply: true });
}

function replyEmail_(to, subject, htmlBody) {
  GmailApp.sendEmail(to, subject, "", { htmlBody });
}

function mark_(thread, labelIn, labelOut) {
  if (labelIn) thread.removeLabel(labelIn);
  if (labelOut) thread.addLabel(labelOut);
  thread.markRead();
}

function extractEmail_(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim();
}

function extractName_(from) {
  const m = String(from).match(/^"?([^"<]+)"?\s*</);
  const raw = (m ? m[1] : String(from)).trim();
  if (raw.includes("@")) return "";
  return raw;
}

