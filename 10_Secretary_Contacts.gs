/***************************************
 * 10_Secretary_Contacts.gs
 *
 * Busca contatos institucionais da diretoria vigente
 * via GEAPA-CORE.
 ***************************************/

function getSecretaryContactsHtml_() {
  try {
    const geral = GEAPA_CORE.coreGetCurrentBoardMemberByRole("Secretário(a) Geral");
    const executivo = GEAPA_CORE.coreGetCurrentBoardMemberByRole("Secretário(a) Executivo");

    const lines = [];

    if (geral) {
      lines.push(buildSecretaryLine_("Secretário(a) Geral", geral));
    }

    if (executivo) {
      lines.push(buildSecretaryLine_("Secretário(a) Executivo", executivo));
    }

    if (!lines.length) {
      return "<b>Secretaria:</b> contato indisponível no momento.";
    }

    return lines.join("<br>");
  } catch (e) {
    console.error("getSecretaryContactsHtml_ erro:", e);
    return "<b>Secretaria:</b> contato indisponível no momento.";
  }
}

function buildSecretaryLine_(label, member) {
  const name = escapeHtml_(member && member.name ? member.name : "");
  const phoneRaw = member && member.phone ? String(member.phone).trim() : "";

  if (!phoneRaw) {
    return `<b>${escapeHtml_(label)}:</b> ${name || "Contato indisponível"}`;
  }

  const phoneDigits = normalizePhoneDigits_(phoneRaw);
  const phonePretty = formatPhoneBR_(phoneDigits) || escapeHtml_(phoneRaw);

  if (phoneDigits) {
    return `<b>${escapeHtml_(label)}:</b> ${name} — <a href="https://wa.me/55${phoneDigits}">${escapeHtml_(phonePretty)}</a>`;
  }

  return `<b>${escapeHtml_(label)}:</b> ${name} — ${escapeHtml_(phoneRaw)}`;
}

function normalizePhoneDigits_(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function formatPhoneBR_(digits) {
  const d = String(digits || "");

  if (d.length === 13 && d.indexOf("55") === 0) {
    return formatPhoneBR_(d.slice(2));
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return d;
}

function escapeHtml_(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}