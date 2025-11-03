import { stripHtml } from '@/lib/doctorsender/utils';

type ComposeOptions = {
  headerHtml?: string | null;
  footerHtml?: string | null;
  bodyHtml: string;
  replacements?: Record<string, string | null | undefined>;
  unsubscribeUrl?: string | null;
};

type ComposeResult = {
  html: string;
  plainText: string;
};

function normaliseUnsubscribeHref(fragment: string, unsubscribeUrl?: string | null): string {
  if (!fragment) return fragment;
  let result = fragment;

  if (unsubscribeUrl && unsubscribeUrl.trim()) {
    const trimmed = unsubscribeUrl.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const directRegex = new RegExp(`href=["']${escaped}["']`, 'gi');
    result = result.replace(directRegex, 'href="__LinkUnsubs__"');

    const trimmedNoSlash = trimmed.replace(/\/+$/, '');
    if (trimmedNoSlash && trimmedNoSlash !== trimmed) {
      const escapedNoSlash = trimmedNoSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexNoSlash = new RegExp(`href=["']${escapedNoSlash}["']`, 'gi');
      result = result.replace(regexNoSlash, 'href="__LinkUnsubs__"');
    }
  }

  result = result.replace(/href=["']__linkunsubs__["']/gi, 'href="__LinkUnsubs__"');
  return result;
}

function applyReplacements(fragment: string, replacements?: Record<string, string | null | undefined>): string {
  if (!fragment || !replacements) return fragment;
  let result = fragment;
  for (const [token, value] of Object.entries(replacements)) {
    if (!token || value == null) continue;
    const safeValue = String(value);
    if (!safeValue) continue;
    result = result.split(token).join(safeValue);
  }
  return result;
}

function insertFragmentsIntoBody(html: string, header: string, footer: string): string {
  if (!html.trim()) {
    return `${header}${footer}`;
  }
  const bodyOpen = html.match(/<body[\s\S]*?>/i);
  const bodyClose = html.match(/<\/body>/i);
  if (bodyOpen && bodyClose && bodyOpen.index != null && bodyClose.index != null) {
    const start = bodyOpen.index + bodyOpen[0].length;
    const end = bodyClose.index;
    const before = html.slice(0, start);
    const middle = html.slice(start, end);
    const after = html.slice(end);
    return `${before}${header}${middle}${footer}${after}`;
  }
  return `${header}${html}${footer}`;
}

function ensureUnsubscribe(html: string, unsubscribeUrl?: string | null): string {
  const lower = html.toLowerCase();
  const hasMacro = lower.includes('__linkunsubs__');
  const hasToken = lower.includes('{{unsubscribe_url}}');
  const normalizedUrl = unsubscribeUrl?.trim() ?? '';
  const hasUrl = normalizedUrl ? lower.includes(normalizedUrl.toLowerCase()) : false;

  if (hasMacro || hasToken || hasUrl) {
    return html;
  }

  const href = '__LinkUnsubs__';
  const displayNote = normalizedUrl
    ? `<br /><span style="font-size:10px;color:#888;">If the unsubscribe link does not work copy this URL: ${normalizedUrl}</span>`
    : '';

  const block = `
<p style="margin:24px 0 0;text-align:center;font-size:12px;color:#666;font-family:Arial,sans-serif;">
  If you prefer not to receive these emails, you can <a href="${href}" style="color:#0073e6;text-decoration:none;">unsubscribe here</a>.
  ${displayNote}
</p>
`;

  const bodyClose = html.match(/<\/body>/i);
  if (bodyClose && bodyClose.index != null) {
    const end = bodyClose.index;
    return `${html.slice(0, end)}${block}${html.slice(end)}`;
  }
  return `${html}${block}`;
}

export function composeEmailHtml(options: ComposeOptions): ComposeResult {
  const headerRaw = options.headerHtml?.trim() ?? '';
  const footerRaw = options.footerHtml?.trim() ?? '';
  const bodyRaw = options.bodyHtml ?? '';

  const replacedHeader = normaliseUnsubscribeHref(applyReplacements(headerRaw, options.replacements), options.unsubscribeUrl);
  const replacedFooter = normaliseUnsubscribeHref(applyReplacements(footerRaw, options.replacements), options.unsubscribeUrl);
  const replacedBody = normaliseUnsubscribeHref(applyReplacements(bodyRaw, options.replacements), options.unsubscribeUrl);

  const merged = insertFragmentsIntoBody(
    replacedBody,
    replacedHeader ? `${replacedHeader}\n` : '',
    replacedFooter ? `\n${replacedFooter}` : ''
  );

  const htmlWithUnsubscribe = ensureUnsubscribe(merged, options.unsubscribeUrl);
  const normalizedHtml = normaliseUnsubscribeHref(htmlWithUnsubscribe, options.unsubscribeUrl);

  let plainText = stripHtml(normalizedHtml).slice(0, 8000);

  if (options.unsubscribeUrl && options.unsubscribeUrl.trim()) {
    const trimmed = options.unsubscribeUrl.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const urlRegex = new RegExp(escaped, 'gi');
    plainText = plainText.replace(urlRegex, '__LinkUnsubs__');

    const trimmedNoSlash = trimmed.replace(/\/+$/, '');
    if (trimmedNoSlash && trimmedNoSlash !== trimmed) {
      const escapedNoSlash = trimmedNoSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexNoSlash = new RegExp(escapedNoSlash, 'gi');
      plainText = plainText.replace(regexNoSlash, '__LinkUnsubs__');
    }
  }

  if (!plainText.toLowerCase().includes('__linkunsubs__')) {
    const extra =
      options.unsubscribeUrl && options.unsubscribeUrl.trim()
        ? '__LinkUnsubs__ (fallback: ' + options.unsubscribeUrl.trim() + ')'
        : '__LinkUnsubs__';
    plainText = `${plainText}\nTo unsubscribe: ${extra}`.slice(0, 8000);
  }

  return {
    html: normalizedHtml,
    plainText,
  };
}
