'use server';

import { soapCall } from '@/lib/doctorsender/soap';
import { languageIdToIso3 } from '@/lib/doctorsender/defaults';
import { loadDoctorSenderDefaults } from '@/lib/doctorsender/server';
import { resolveDoctorSenderAccount } from '@/lib/doctorsender/accounts';
import { composeEmailHtml } from '@/lib/doctorsender/composeHtml';
import { writeDoctorSenderDebugFile } from '@/lib/doctorsender/debug';
import type { PlanningItem } from '@/components/campaign-planning/types';

type SendPreviewOverrides = {
  listName?: string | null;
};

type SendPreviewOptions = {
  campaign: PlanningItem;
  overrides?: SendPreviewOverrides;
};

type CreateCampaignResult = {
  idCampaign: number;
};

type DoctorSenderPreflight = {
  fromEmailAllowed: boolean;
  allowedFromEmails: string[] | null;
  trackingDomainAllowed: boolean;
  allowedTrackingDomains: string[] | null;
};

type DoctorSenderCampaignSnapshot = {
  status: string | null;
  sendDate: string | null;
  listUnsubscribe: string | null;
  userList: string | null;
};

type DoctorSenderPreviewSendAttempt = {
  format: 'string_array' | 'struct_array';
  recipients: string[];
  resultKind: 'false' | 'null' | 'object' | 'string' | 'number' | 'boolean' | 'unknown';
  resultPreview: unknown;
};

export type DoctorSenderPreviewResult = {
  campaignId: number;
  status: string | null;
  sendDate: string | null;
  listUnsubscribe: string | null;
  preflight: DoctorSenderPreflight;
  templateId: number | null;
};

function ensureRecipients(emails: string[] | undefined): string[] {
  return (emails ?? []).map((email) => email.trim()).filter(Boolean);
}

function resolveCountry(languageId?: number | null): string {
  return languageIdToIso3(languageId) ?? 'ESP';
}

function buildCampaignName(baseName: string): string {
  const now = new Date();
  const suffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  return `${baseName}__${suffix}`;
}

function toNumericId(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectStrings(input: unknown, output: Set<string>, depth = 0) {
  if (depth > 4) return;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed) {
      output.add(trimmed);
    }
    return;
  }
  if (typeof input === 'number') {
    output.add(String(input));
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      collectStrings(item, output, depth + 1);
    }
    return;
  }
  if (input && typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      collectStrings(value, output, depth + 1);
    }
  }
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of values) {
    const normalized = entry.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(entry.trim());
  }
  return result;
}

function extractEmailsFromStrings(values: Iterable<string>): string[] {
  const out: string[] = [];
  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  for (const value of values) {
    const matches = value.match(regex);
    if (!matches?.length) continue;
    for (const match of matches) {
      out.push(match);
    }
  }
  return uniqueCaseInsensitive(out);
}

function extractDomainsFromStrings(values: Iterable<string>): string[] {
  const out: string[] = [];
  const regex = /\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi;
  for (const rawValue of values) {
    const value = rawValue.replace(/^https?:\/\//i, '');
    const matches = value.match(regex);
    if (!matches?.length) continue;
    for (const match of matches) {
      out.push(match.toLowerCase());
    }
  }
  return uniqueCaseInsensitive(out);
}

async function fetchAllowedFromEmails(account: { user: string; token: string }): Promise<string[] | null> {
  try {
    const response = await soapCall('dsSettingsGetAllFromEmail', [], account);
    const values = new Set<string>();
    collectStrings(response, values);
    const emails = extractEmailsFromStrings(values);
    if (!emails.length) {
      return null;
    }
    return emails;
  } catch (error) {
    console.warn('DoctorSender preflight: unable to retrieve authorised from emails', error);
    return null;
  }
}

async function fetchTrackingDomains(account: { user: string; token: string }): Promise<string[] | null> {
  try {
    const response = await soapCall('dsSettingsGetTracking', [], account);
    const values = new Set<string>();
    collectStrings(response, values);
    const domains = extractDomainsFromStrings(values);
    if (!domains.length) {
      return null;
    }
    return domains;
  } catch (error) {
    console.warn('DoctorSender preflight: unable to retrieve tracking domains', error);
    return null;
  }
}

async function runPreflight(
  account: { user: string; token: string },
  fromEmail: string,
  trackingDomain: string
): Promise<DoctorSenderPreflight> {
  const allowedFromEmails = await fetchAllowedFromEmails(account);
  const fromEmailAllowed =
    !allowedFromEmails || allowedFromEmails.some((entry) => entry.toLowerCase() === fromEmail.toLowerCase());

  if (allowedFromEmails && !fromEmailAllowed) {
    throw new Error(
      `DoctorSender preview blocked: sender "${fromEmail}" is not authorised. Authorised addresses: ${allowedFromEmails.join(
        ', '
      )}`
    );
  }

  const sanitizedTrackingDomain = trackingDomain.trim().toLowerCase();
  const allowedTrackingDomains = sanitizedTrackingDomain ? await fetchTrackingDomains(account) : null;
  const trackingDomainAllowed =
    !sanitizedTrackingDomain ||
    !allowedTrackingDomains ||
    allowedTrackingDomains.some((entry) => entry === sanitizedTrackingDomain);

  if (sanitizedTrackingDomain && allowedTrackingDomains && !trackingDomainAllowed) {
    throw new Error(
      `DoctorSender preview blocked: tracking domain "${sanitizedTrackingDomain}" is not configured. Allowed domains: ${
        allowedTrackingDomains.length ? allowedTrackingDomains.join(', ') : 'none'
      }`
    );
  }

  console.info('[DoctorSender] Preflight resolved', {
    fromEmail,
    trackingDomain: sanitizedTrackingDomain || null,
    allowedFromEmailsCount: allowedFromEmails?.length ?? null,
    allowedFromEmailsSample: allowedFromEmails?.slice(0, 5) ?? null,
    allowedTrackingDomainsCount: allowedTrackingDomains?.length ?? null,
    allowedTrackingDomainsSample: allowedTrackingDomains?.slice(0, 5) ?? null,
  });

  return {
    fromEmailAllowed,
    allowedFromEmails,
    trackingDomainAllowed,
    allowedTrackingDomains,
  };
}

async function fetchCampaignSnapshot(
  account: { user: string; token: string },
  campaignId: number
): Promise<DoctorSenderCampaignSnapshot> {
  try {
    const response = (await soapCall(
      'dsCampaignGet',
      [campaignId, ['status', 'list_unsubscribe', 'send_date', 'user_list']],
      account
    )) as
      | Record<string, unknown>
      | null
      | undefined;
    const status =
      response && typeof (response as Record<string, unknown>).status === 'string'
        ? ((response as Record<string, unknown>).status as string)
        : null;
    const listUnsubscribe =
      response && typeof (response as Record<string, unknown>).list_unsubscribe === 'string'
        ? ((response as Record<string, unknown>).list_unsubscribe as string)
        : null;
    const sendDate =
      response && typeof (response as Record<string, unknown>).send_date === 'string'
        ? ((response as Record<string, unknown>).send_date as string)
        : null;
    const userList =
      response && typeof (response as Record<string, unknown>).user_list === 'string'
        ? (((response as Record<string, unknown>).user_list as string).trim() || null)
        : null;
    return { status, listUnsubscribe, sendDate, userList };
  } catch (error) {
    console.warn('DoctorSender snapshot fetch failed', { campaignId, error });
    return { status: null, listUnsubscribe: null, sendDate: null, userList: null };
  }
}

async function fetchCampaignSnapshotRaw(
  account: { user: string; token: string },
  campaignId: number
): Promise<Record<string, unknown> | null> {
  try {
    const response = (await soapCall('dsCampaignGet', [campaignId], account)) as
      | Record<string, unknown>
      | null
      | undefined;
    if (!response || typeof response !== 'object') return null;
    return response;
  } catch (error) {
    console.warn('DoctorSender raw snapshot fetch failed', { campaignId, error });
    return null;
  }
}

function summarizeSoapResult(result: unknown): {
  resultKind: DoctorSenderPreviewSendAttempt['resultKind'];
  resultPreview: unknown;
} {
  if (result === false) return { resultKind: 'false', resultPreview: false };
  if (result == null) return { resultKind: 'null', resultPreview: null };
  if (typeof result === 'object') return { resultKind: 'object', resultPreview: result };
  if (typeof result === 'string') return { resultKind: 'string', resultPreview: result.slice(0, 300) };
  if (typeof result === 'number') return { resultKind: 'number', resultPreview: result };
  if (typeof result === 'boolean') return { resultKind: 'boolean', resultPreview: result };
  return { resultKind: 'unknown', resultPreview: String(result) };
}

function isNilLikeSoapResult(result: unknown): boolean {
  if (result == null) return true;
  if (!result || typeof result !== 'object') return false;
  const record = result as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, 'data')) return false;
  return record.data == null && Object.keys(record).length <= 1;
}

export async function sendDoctorSenderPreview({
  campaign,
  overrides,
}: SendPreviewOptions): Promise<DoctorSenderPreviewResult> {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const defaults = await loadDoctorSenderDefaults(campaign.database);
  const account =
    defaults.accountUser && defaults.accountToken
      ? {
          key: `custom-${campaign.database}`,
          label: `${campaign.database} (custom)`,
          user: defaults.accountUser,
          token: defaults.accountToken,
        }
      : resolveDoctorSenderAccount();

  const defaultFrom = campaign.fromEmail || defaults.fromEmail;
  const fromEmail = defaultFrom;
  const replyTo = campaign.replyTo || defaultFrom || defaults.replyTo;
  const previewRecipients = ensureRecipients(campaign.previewRecipients);

  if (!fromEmail) {
    throw new Error('From email is required for DoctorSender.');
  }

  if (!replyTo) {
    throw new Error('Reply-to email is required for DoctorSender.');
  }

  if (!previewRecipients.length) {
    throw new Error('Preview recipients are required.');
  }

  if (!campaign.subject) throw new Error('Subject is required for DoctorSender.');
  if (!campaign.html) throw new Error('HTML body is required for DoctorSender.');
  if (!campaign.unsubscribeUrl) throw new Error('Unsubscribe URL is required for DoctorSender.');

  const campaignName = buildCampaignName(campaign.name);
  const languageId = campaign.languageId ?? defaults.languageId ?? 1;
  const categoryId = campaign.categoryId ?? 1;
  const country = resolveCountry(languageId);
  const trackingDomain = campaign.trackingDomain || defaults.trackingDomain || '';
  const unsubscribeUrl = campaign.unsubscribeUrl || defaults.unsubscribeUrl || '';
  const langIso = languageIdToIso3(languageId) ?? '';
  const listOverride = overrides?.listName?.trim();
  const activeListName = listOverride || defaults.listName || defaults.lists?.[0] || '';
  const templateIdSource =
    (defaults.templateId && defaults.templateId.toString().trim()) ||
    (process.env.DOCTORSENDER_TEMPLATE_ID ?? '').trim();
  const parsedTemplateId = Number.parseInt(templateIdSource, 10);
  const templateId = Number.isFinite(parsedTemplateId) ? parsedTemplateId : null;
  const preflight = await runPreflight(account, fromEmail, trackingDomain);
  const retryStructOnNil = process.env.DOCTORSENDER_TEST_SEND_STRUCT_FALLBACK === '1';

  const { html: finalHtml, plainText: plainTextRaw } = composeEmailHtml({
    headerHtml: defaults.headerHtml,
    footerHtml: defaults.footerHtml,
    bodyHtml: campaign.html,
    replacements: {
      '{{UNSUBSCRIBE_URL}}': unsubscribeUrl,
      '{{TRACKING_DOMAIN}}': trackingDomain,
      '{{LIST_NAME}}': activeListName,
      '{{LANG_ISO3}}': langIso,
    },
    unsubscribeUrl,
  });
  const normalizedPlainText =
    plainTextRaw && plainTextRaw.trim().length > 0
      ? plainTextRaw
      : campaign.subject?.trim() || 'Email preview';

  console.info('[DoctorSender] Payload snapshot', {
    campaignId: campaign.id,
    database: campaign.database,
    htmlLength: finalHtml.length,
    plainTextLength: normalizedPlainText.length,
    unsubscribeUrl: unsubscribeUrl || null,
    trackingDomain: trackingDomain || null,
    hasLinkMacroHtml: finalHtml.includes('__LinkUnsubs__'), hasLinkMacroText: normalizedPlainText.includes('__LinkUnsubs__'),
    templateId: templateId ?? (templateIdSource || null),
    preflight,
    htmlPreview: finalHtml.slice(0, 320),
  });

  await Promise.all([
    writeDoctorSenderDebugFile(`campaign-${campaign.id}-html.html`, finalHtml),
    writeDoctorSenderDebugFile(`campaign-${campaign.id}-plain.txt`, normalizedPlainText),
  ]);

  const basePayload = [
    campaign.subject,
    campaign.fromName || campaign.partner,
    fromEmail,
    replyTo,
    categoryId,
    country,
    languageId,
    finalHtml,
    normalizedPlainText,
    unsubscribeUrl,
    '', // utmCampaign
    '', // utmTerm
    '', // utmContent
    false, // footerDs
    false, // mirrorDs
    templateId ?? 0, // idTemplate
    '', // agency
    false, // isSMTP
  ];

  const existingCampaignId = toNumericId(campaign.dsCampaignId);
  let currentCampaignId = existingCampaignId ?? null;

  if (currentCampaignId) {
    try {
      await soapCall('dsCampaignUpdate', [currentCampaignId, ...basePayload], account);
    } catch (error) {
      if (error instanceof Error && /inseparable/i.test(error.message)) {
        console.warn(
          '[DoctorSender] dsCampaignUpdate rejected (html/text). Recreating campaign...',
          { campaignId: campaign.id, currentCampaignId }
        );
        currentCampaignId = null;
      } else {
        throw error;
      }
    }
  }

  if (!currentCampaignId) {
    const createPayload = [campaignName, ...basePayload];
    const createResult = (await soapCall('dsCampaignNew', createPayload, account)) as
      | CreateCampaignResult
      | {
          idCampaign?: string | number | null;
          id_campaign?: string | number | null;
          msg?: string | number | null;
        }
      | number;

    const createdCampaignId =
      typeof createResult === 'number'
        ? createResult
        : toNumericId((createResult as CreateCampaignResult)?.idCampaign) ??
          toNumericId((createResult as { id_campaign?: string | number | null }).id_campaign) ??
          toNumericId((createResult as { msg?: string | number | null }).msg);

    if (!createdCampaignId) {
      throw new Error('DoctorSender did not provide a campaign identifier.');
    }

    currentCampaignId = createdCampaignId;
  }

  // Breve pausa para dar tiempo a DS a persistir la campaña antes del BAT
  await delay(2000);

  const sendAttempts: DoctorSenderPreviewSendAttempt[] = [];
  const attemptPreviewSend = async (
    format: DoctorSenderPreviewSendAttempt['format'],
    payloadRecipients: string[] | Array<{ email: string }>
  ) => {
    const rawResult = await soapCall('dsCampaignSendEmailsTest', [currentCampaignId, payloadRecipients], account);
    const summary = summarizeSoapResult(rawResult);
    sendAttempts.push({
      format,
      recipients: previewRecipients,
      resultKind: summary.resultKind,
      resultPreview: summary.resultPreview,
    });
    console.info('[DoctorSender] BAT preview send attempt', {
      campaignId: campaign.id,
      dsCampaignId: currentCampaignId,
      format,
      recipientCount: previewRecipients.length,
      recipients: previewRecipients,
      resultKind: summary.resultKind,
      resultPreview: summary.resultPreview,
    });
    return rawResult;
  };

  // dsCampaignSendEmailsTest attempt 1: plain string array
  let sendResult = await attemptPreviewSend('string_array', previewRecipients);
  if (sendResult === false) {
    await delay(1500);
    sendResult = await attemptPreviewSend('string_array', previewRecipients);
    if (sendResult === false && !retryStructOnNil) {
      throw new Error('DoctorSender rejected preview send (dsCampaignSendEmailsTest returned false after retry).');
    }
  }

  // Optional diagnostics fallback:
  // some DoctorSender accounts expect [{ email: "..." }] instead of ["..."] for test recipients.
  const shouldTryStructFallback = retryStructOnNil && (sendResult === false || isNilLikeSoapResult(sendResult));
  if (shouldTryStructFallback) {
    await delay(1200);
    const structRecipients = previewRecipients.map((email) => ({ email }));
    const structResult = await attemptPreviewSend('struct_array', structRecipients);
    if (structResult === false) {
      throw new Error(
        'DoctorSender rejected preview send using both recipient formats (string array and struct array).'
      );
    }
    sendResult = structResult;
  }

  const snapshot = await fetchCampaignSnapshot(account, currentCampaignId);
  const finalSendSummary = summarizeSoapResult(sendResult);
  const finalIsNilLike = isNilLikeSoapResult(sendResult);
  console.info('[DoctorSender] BAT preview final result', {
    campaignId: campaign.id,
    dsCampaignId: currentCampaignId,
    retryStructOnNil,
    sendAttempts: sendAttempts.map((entry) => ({
      format: entry.format,
      resultKind: entry.resultKind,
    })),
    finalResultKind: finalSendSummary.resultKind,
    finalResultPreview: finalSendSummary.resultPreview,
    finalIsNilLike,
    snapshot,
  });
  if (finalIsNilLike) {
    console.warn('[DoctorSender] BAT preview returned no explicit dispatch confirmation from SOAP API', {
      campaignId: campaign.id,
      dsCampaignId: currentCampaignId,
      retryStructOnNil,
    });
  }

  const rawSnapshot = await fetchCampaignSnapshotRaw(account, currentCampaignId);
  await writeDoctorSenderDebugFile(
    `campaign-${campaign.id}-send-preview-summary.json`,
    JSON.stringify(
      {
        campaignId: campaign.id,
        dsCampaignId: currentCampaignId,
        previewRecipients,
        retryStructOnNil,
        sendAttempts,
        finalSendSummary,
        finalIsNilLike,
        snapshot,
        rawSnapshot,
      },
      null,
      2
    )
  );

  return {
    campaignId: currentCampaignId,
    status: 'preview_sent',
    sendDate: snapshot.sendDate,
    listUnsubscribe: snapshot.listUnsubscribe,
    preflight,
    templateId: templateId ?? null,
  };
}
