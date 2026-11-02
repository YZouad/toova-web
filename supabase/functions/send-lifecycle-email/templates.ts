/**
 * Lifecycle letters. One table layout, inline styles, so the same note
 * holds up in Gmail, Apple Mail, and Outlook. Colors match the web app
 * paper / ink / accent tokens.
 */

const PAPER = "#EFE8DC";
const CARD = "#FBF7F0";
const INK = "#241F19";
const BODY = "#3F382F";
const MUTED = "#6B6357";
const RULE = "#E4D9C5";
const ACCENT = "#B05A3C";
const CREAM = "#FBF7F0";
const LOGO = "https://toova.net/toova-logo-cropped.png";

const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export type RenderedLifecycleEmail = {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
};

type Letter = {
  subject: string;
  headline: string;
  body: string;
  cta: string;
  href: string;
};

export function renderLifecycleEmail(input: {
  template: string;
  payload: Record<string, unknown>;
  siteUrl: string;
  unsubscribeUrl: string;
}): RenderedLifecycleEmail {
  const site = input.siteUrl.replace(/\/$/, "");
  const letter = letterFor(input.template, input.payload ?? {}, site);
  const unsubscribeUrl = input.unsubscribeUrl.trim();

  return {
    subject: letter.subject,
    text: plainText(letter, unsubscribeUrl),
    html: htmlLetter(letter, unsubscribeUrl),
    headers: unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : {},
  };
}

/** RFC 8058 one-click. Mail clients POST this instead of opening the link. */
export function isOneClickUnsubscribe(body: string, header: string | null): boolean {
  if (header?.trim().toLowerCase() === "one-click") return true;
  return /(?:^|&)List-Unsubscribe=One-Click(?:&|$)/.test(body);
}

function letterFor(
  template: string,
  payload: Record<string, unknown>,
  site: string,
): Letter {
  const room = field(payload, "room_name") || "Your room";
  const label = field(payload, "label");

  switch (template) {
    case "finish_room":
      return {
        subject: "Finish your room",
        headline: "Your room is still open",
        body: "A few more pieces and it starts to feel like a place.",
        cta: "Continue designing",
        href: `${site}/`,
      };
    case "model_ready":
      return {
        subject: "Your model is ready",
        headline: label ? `${label} is ready` : "Your model is ready",
        body: "It finished generating. Save it into your catalog whenever you like.",
        cta: "Open Toova",
        href: `${site}/`,
      };
    case "room_liked":
      return {
        subject: "Someone liked your room",
        headline: `${room} got a like`,
        body: "It’s waiting with the rest of your gallery notifications.",
        cta: "See your gallery",
        href: `${site}/gallery`,
      };
    case "room_copied":
      return {
        subject: "Someone copied your room",
        headline: `${room} was copied`,
        body: "Someone started a new room from your layout.",
        cta: "See your gallery",
        href: `${site}/gallery`,
      };
    case "credits_refreshed":
      return {
        subject: "Your credits are back",
        headline: "This month’s credits are ready",
        body: "Import a photo and place something new.",
        cta: "Open Toova",
        href: `${site}/`,
      };
    case "move_in_countdown":
      return {
        subject: "Your list is waiting",
        headline: "A few things are still on your list",
        body: "Open your shopping list before move-in.",
        cta: "Open your list",
        href: `${site}/`,
      };
    default:
      return {
        subject: "A note from Toova",
        headline: "Something is waiting in Toova",
        body: "Open the app when you have a minute.",
        cta: "Open Toova",
        href: `${site}/`,
      };
  }
}

function htmlLetter(letter: Letter, unsubscribeUrl: string): string {
  const headline = escapeHtml(letter.headline);
  const body = escapeHtml(letter.body);
  const cta = escapeHtml(letter.cta);
  const href = escapeHtml(letter.href);
  const unsub = unsubscribeUrl
    ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">
         <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(letter.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${PAPER};">${body}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="max-width:480px;background:${CARD};border:1px solid ${RULE};">
          <tr>
            <td style="padding:36px 36px 0;">
              <img src="${LOGO}" width="124" height="35" alt="Toova" style="display:block;border:0;outline:none;text-decoration:none;width:124px;height:auto;">
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="28" height="2" bgcolor="${ACCENT}" style="width:28px;height:2px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px 0;font-family:${SERIF};font-size:28px;line-height:1.25;color:${INK};">
              ${headline}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 36px 0;font-family:${SANS};font-size:16px;line-height:1.55;color:${BODY};">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${INK}" style="background:${INK};">
                    <a href="${href}" style="display:inline-block;padding:12px 18px;font-family:${SANS};font-size:15px;line-height:1;color:${CREAM};text-decoration:none;">${cta}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 32px;">
              <div style="border-top:1px solid ${RULE};padding-top:16px;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">
                Toova
                ${unsub}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function plainText(letter: Letter, unsubscribeUrl: string): string {
  const lines = [
    letter.headline,
    "",
    letter.body,
    "",
    letter.cta,
    letter.href,
    "",
    "Toova",
  ];
  if (unsubscribeUrl) {
    lines.push("", `Unsubscribe: ${unsubscribeUrl}`);
  }
  return lines.join("\n");
}

function field(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
