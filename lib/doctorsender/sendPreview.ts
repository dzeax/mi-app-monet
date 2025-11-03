'use server';

import { soapCall } from '@/lib/doctorsender/soap';
import { languageIdToIso3 } from '@/lib/doctorsender/defaults';
import { loadDoctorSenderDefaults } from '@/lib/doctorsender/server';
import { resolveDoctorSenderAccount } from '@/lib/doctorsender/accounts';
import { composeEmailHtml } from '@/lib/doctorsender/composeHtml';
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

async function fetchAllowedFromEmails(account: { user: string; token: string }): Promise<string[] | null> {
  try {
    const response = await soapCall('dsSettingsGetAllFromEmail', [], account);
    const values = new Set<string>();
    collectStrings(response, values);
    const emails = Array.from(values)
      .map((entry) => entry.trim())
      .filter((entry) => entry && entry.includes('@'));
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
    const domains = Array.from(values)
      .map((entry) => entry.trim().replace(/^https?:\/\//i, '').toLowerCase())
      .filter((entry) => entry && entry.includes('.'));
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
    const response = (await soapCall('dsCampaignGet', [campaignId, ['status', 'list_unsubscribe', 'send_date']], account)) as
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
    return { status, listUnsubscribe, sendDate };
  } catch (error) {
    console.warn('DoctorSender snapshot fetch failed', { campaignId, error });
    return { status: null, listUnsubscribe: null, sendDate: null };
  }
}

export async function sendDoctorSenderPreview({
  campaign,
  overrides,
}: SendPreviewOptions): Promise<DoctorSenderPreviewResult> {
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
    true, // footerDs
    true, // mirrorDs
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

  if (trackingDomain) {
    try {
      await soapCall('dsSettingsSetTrackingCampaign', [
        currentCampaignId,
        trackingDomain,
      ], account);
    } catch (error) {
      // Tracking domain is optional; log but do not block
      console.error('DoctorSender tracking domain error:', error);
    }
  }

  const sendResult = await soapCall('dsCampaignSendEmailsTest', [currentCampaignId, previewRecipients], account);
  if (sendResult === false) {
    throw new Error('DoctorSender rejected preview send (dsCampaignSendEmailsTest returned false).');
  }

  const snapshot = await fetchCampaignSnapshot(account, currentCampaignId);

  return {
    campaignId: currentCampaignId,
    status: snapshot.status,
    sendDate: snapshot.sendDate,
    listUnsubscribe: snapshot.listUnsubscribe,
    preflight,
    templateId: templateId ?? null,
  };
}
