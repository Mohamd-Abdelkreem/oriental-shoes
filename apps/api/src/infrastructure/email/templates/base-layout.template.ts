import { escapeHtml } from "./html-escape.js";

export const baseLayoutTemplate = (input: {
  title: string;
  previewText: string;
  name: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  logoUrl: string;
  helpText: string;
}): string => `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body dir="rtl" style="margin:0;background:#f4f7fa;color:#10233f;font-family:Cairo,Tahoma,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fa;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" dir="rtl" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #dbe4ee;border-radius:16px;background:#ffffff;">
          <tr><td align="right" style="padding:22px 24px;border-bottom:1px solid #e8eef5;">
            <table role="presentation" dir="rtl" cellspacing="0" cellpadding="0">
              <tr>
                <td valign="middle" style="padding-left:14px;">
                  <img src="${escapeHtml(input.logoUrl)}" width="44" height="53" alt="شعار الحذاء الشرقي" style="display:block;border:0;">
                </td>
                <td valign="middle" style="font-size:17px;font-weight:bold;line-height:1.6;">مصنع الحذاء الشرقي</td>
              </tr>
            </table>
          </td></tr>
          <tr><td dir="rtl" align="right" style="padding:26px 24px;">
            <h1 style="margin:0 0 14px;font-size:23px;line-height:1.5;">${escapeHtml(input.title)}</h1>
            <p style="margin:0 0 8px;font-size:15px;line-height:1.8;">أهلًا <bdi dir="auto">${escapeHtml(input.name)}</bdi>،</p>
            <p style="margin:0 0 22px;color:#40546e;font-size:15px;line-height:1.8;">${escapeHtml(input.description)}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
              <tr><td bgcolor="#007b74" style="border-radius:8px;">
                <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;line-height:1.5;">${escapeHtml(input.actionLabel)}</a>
              </td></tr>
            </table>
            <p style="margin:0;color:#52657c;font-size:13px;line-height:1.8;">${escapeHtml(input.helpText)}</p>
          </td></tr>
          <tr><td align="right" style="padding:17px 24px;border-top:1px solid #e8eef5;color:#52657c;font-size:12px;line-height:1.8;">رسالة تلقائية من نظام إدارة طلبات التصنيع بمصنع الحذاء الشرقي.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
