import type { PlanningDraft } from '@/components/campaign-planning/types';

const DEFAULT_TEMPLATE_ID = (process.env.DOCTORSENDER_TEMPLATE_ID ?? '').trim() || 'CMINDS';

export type DoctorSenderDefaults = {
  fromEmail: string;
  fromEmails: string[];
  replyTo: string;
  trackingDomain: string;
  unsubscribeUrl: string;
  languageId: number | null;
  listName: string;
  lists: string[];
  headerHtml: string;
  footerHtml: string;
  country: string | null;
  accountUser: string | null;
  accountToken: string | null;
  templateId: string;
};

export type DoctorSenderDefaultsUpdate = Partial<Omit<DoctorSenderDefaults, 'country'>> & {
  country?: string | null;
};

type DatabaseDefaults = {
  database: string;
  defaults: DoctorSenderDefaultsUpdate;
};

type LanguageOption = {
  id: number;
  label: string;
  iso3: string;
};

type CategoryOption = {
  id: number;
  label: string;
};

const DEFAULT_FROM_EMAIL = 'info@letter.fundealok.com';

const BASE_DEFAULTS: DoctorSenderDefaults = {
  fromEmail: DEFAULT_FROM_EMAIL,
  fromEmails: [DEFAULT_FROM_EMAIL],
  replyTo: DEFAULT_FROM_EMAIL,
  trackingDomain: extractDomainFromEmail(DEFAULT_FROM_EMAIL) ?? '',
  unsubscribeUrl: '',
  languageId: null,
  listName: '',
  lists: [],
  headerHtml: '',
  footerHtml: '',
  country: null,
  accountUser: null,
  accountToken: null,
  templateId: DEFAULT_TEMPLATE_ID,
};

const STATIC_DATABASE_DEFAULTS: DatabaseDefaults[] = [
  {
    database: 'TuOpinion',
    defaults: {
      fromEmails: ['info@letter.fundealok.com'],
      listName: 'TUOPINION_SEP_2023',
      lists: ['TUOPINION_SEP_2023'],
      languageId: 1,
      country: 'ESP',
      trackingDomain: 'letter.fundealok.com',
    },
  },
  {
    database: 'The coupon party',
    defaults: {
      fromEmails: ['info@letter.fundealok.com'],
      listName: 'THE_COUPON_PARTY',
      lists: ['THE_COUPON_PARTY'],
      languageId: 4,
      country: 'FRA',
      trackingDomain: 'letter.fundealok.com',
    },
  },
];

const STATIC_DEFAULTS_MAP = new Map(
  STATIC_DATABASE_DEFAULTS.map((entry) => [normaliseDatabaseKey(entry.database), entry.defaults])
);

export const DOCTOR_SENDER_LANGUAGES: LanguageOption[] = [
  { id: 1, label: 'Spanish', iso3: 'ESP' },
  { id: 2, label: 'Portuguese', iso3: 'PRT' },
  { id: 3, label: 'English', iso3: 'GBR' },
  { id: 4, label: 'French', iso3: 'FRA' },
  { id: 5, label: 'Italian', iso3: 'ITA' },
];

export const DOCTOR_SENDER_CATEGORIES: CategoryOption[] = [
  { id: 147, label: 'Alimentation' },
  { id: 33, label: 'Art/Entertainment/Hobbies' },
  { id: 29, label: 'BabyProducts' },
  { id: 21, label: 'Betting/Gambling/Casino/Lottery' },
  { id: 23, label: 'Cars' },
  { id: 31, label: 'Cosmetics' },
  { id: 43, label: 'Credit Card' },
  { id: 15, label: 'Dating' },
  { id: 339, label: 'EmploymentOffers' },
  { id: 27, label: 'Erotic' },
  { id: 319, label: 'Family' },
  { id: 51, label: 'Fashion' },
  { id: 5, label: 'Finance' },
  { id: 333, label: 'Forex' },
  { id: 1, label: 'General' },
  { id: 331, label: 'Gifts/Jewelry' },
  { id: 19, label: 'Health/Beauty/Fitness' },
  { id: 53, label: 'History' },
  { id: 143, label: 'Home/Garden' },
  { id: 17, label: 'Insurance' },
  { id: 13, label: 'Internet Contracts' },
  { id: 335, label: 'Investment/Real Estate' },
  { id: 341, label: 'Kids' },
  { id: 145, label: 'Leisure' },
  { id: 25, label: 'Loans' },
  { id: 37, label: 'Magazines/Publishing' },
  { id: 45, label: 'Mobile' },
  { id: 317, label: 'Motors' },
  { id: 7, label: 'NGO' },
  { id: 131, label: 'Other' },
  { id: 47, label: 'Pets' },
  { id: 39, label: 'Phone Contracts' },
  { id: 49, label: 'Potential' },
  { id: 41, label: 'Social Shopping Deals' },
  { id: 321, label: 'Sports/Recreation' },
  { id: 3, label: 'Study/Education/Language Courses' },
  { id: 11, label: 'Survey/Opinions/Panels' },
  { id: 337, label: 'Sweepstakes' },
  { id: 149, label: 'Tarot' },
  { id: 35, label: 'Technology' },
  { id: 9, label: 'Travel' },
];

function sanitizeHtmlSnippet(html: unknown): string {
  if (html == null) return '';
  let value = String(html);
  if (!value.trim()) return '';
  // Remove script/style tags
  value = value.replace(/<script[\s\S]*?<\/script>/gi, '');
  value = value.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove inline event handlers
  value = value.replace(/\son[a-z]+\s*=\s*"(?:[^"]*)"/gi, '');
  value = value.replace(/\son[a-z]+\s*=\s*'(?:[^']*)'/gi, '');
  // Strip javascript: urls
  value = value.replace(/javascript:/gi, '');
  return value.trim();
}

function normalizeStringList(source: unknown): string[] {
  if (!source) return [];
  const entries = Array.isArray(source)
    ? source
    : typeof source === 'string'
    ? source.split(/[,;\n\r\s]+/)
    : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries as unknown[]) {
    const value = String(entry ?? '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function extractDomainFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at === -1) return null;
  const domain = trimmed.slice(at + 1);
  return domain || null;
}

export function normaliseDatabaseKey(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

export function resolveStaticDoctorSenderDefaults(database?: string | null): DoctorSenderDefaults {
  const key = normaliseDatabaseKey(database);
  const staticDefaults = STATIC_DEFAULTS_MAP.get(key) ?? {};
  return mergeDoctorSenderDefaults(BASE_DEFAULTS, staticDefaults);
}

export function mergeDoctorSenderDefaults(
  base: DoctorSenderDefaults,
  override?: Partial<DoctorSenderDefaultsUpdate> | null
): DoctorSenderDefaults {
  const cleaned = sanitizeDoctorSenderDefaultsInput(override);

  const result: DoctorSenderDefaults = {
    fromEmail: base.fromEmail,
    fromEmails: [...(base.fromEmails ?? (base.fromEmail ? [base.fromEmail] : []))],
    replyTo: base.replyTo,
  trackingDomain: base.trackingDomain,
  unsubscribeUrl: base.unsubscribeUrl,
  languageId: base.languageId,
  listName: base.listName,
  lists: [...(base.lists ?? (base.listName ? [base.listName] : []))],
  headerHtml: base.headerHtml,
    footerHtml: base.footerHtml,
    country: base.country,
    accountUser: base.accountUser,
    accountToken: base.accountToken,
    templateId: base.templateId,
  };

  if (cleaned.fromEmails !== undefined) {
    result.fromEmails = cleaned.fromEmails.slice();
  }
  if (cleaned.fromEmail !== undefined) {
    const value = cleaned.fromEmail;
    result.fromEmail = value;
    if (value) {
      result.fromEmails = [value, ...result.fromEmails.filter((entry) => entry.toLowerCase() !== value.toLowerCase())];
    } else if (!result.fromEmails.length) {
      result.fromEmails = [];
    }
  } else if (result.fromEmails.length) {
    result.fromEmail = result.fromEmails[0];
  }

  if (!result.fromEmails.length && result.fromEmail) {
    result.fromEmails = [result.fromEmail];
  }
  if (!result.fromEmail && result.fromEmails.length) {
    result.fromEmail = result.fromEmails[0];
  }

  if (cleaned.replyTo !== undefined) {
    result.replyTo = cleaned.replyTo || '';
  } else if (!result.replyTo) {
    result.replyTo = result.fromEmail;
  }

  if (cleaned.unsubscribeUrl !== undefined) {
    result.unsubscribeUrl = cleaned.unsubscribeUrl || '';
  }

  if (cleaned.languageId !== undefined) {
    result.languageId = cleaned.languageId;
  }

  if (cleaned.country !== undefined) {
    result.country = cleaned.country ?? null;
  }

  if (cleaned.lists !== undefined) {
    result.lists = cleaned.lists.slice();
  }
  if (cleaned.listName !== undefined) {
    result.listName = cleaned.listName || '';
    if (result.listName) {
      result.lists = [result.listName, ...result.lists.filter((entry) => entry.toLowerCase() !== result.listName.toLowerCase())];
    }
  } else if (!result.listName && result.lists.length) {
    result.listName = result.lists[0];
  }

  if (cleaned.accountUser !== undefined) {
    result.accountUser = cleaned.accountUser || null;
  }
  if (cleaned.accountToken !== undefined) {
    result.accountToken = cleaned.accountToken || null;
  }

  if (cleaned.trackingDomain !== undefined) {
    result.trackingDomain = cleaned.trackingDomain || extractDomainFromEmail(result.fromEmail) || '';
  } else {
    const derived = extractDomainFromEmail(result.fromEmail);
    if (derived) {
      result.trackingDomain = derived;
    }
  }

  if (cleaned.headerHtml !== undefined) {
    result.headerHtml = cleaned.headerHtml;
  }
  if (cleaned.footerHtml !== undefined) {
    result.footerHtml = cleaned.footerHtml;
  }

  if (cleaned.templateId !== undefined) {
    result.templateId = cleaned.templateId ?? '';
  }

  return result;
}

export function sanitizeDoctorSenderDefaultsInput(
  input: DoctorSenderDefaultsUpdate | null | undefined
): DoctorSenderDefaultsUpdate {
  if (!input) return {};
  const output: DoctorSenderDefaultsUpdate = {};
  const raw = input as Record<string, unknown>;

  const fromEmails = normalizeStringList(raw.fromEmails ?? raw.fromEmail);
  if (fromEmails.length) {
    output.fromEmails = fromEmails;
    output.fromEmail = fromEmails[0];
  } else if (input.fromEmail !== undefined) {
    const trimmed = input.fromEmail?.trim() ?? '';
    output.fromEmail = trimmed;
    if (trimmed) {
      output.fromEmails = [trimmed];
    }
  }

  if (input.replyTo !== undefined) {
    const value = input.replyTo?.trim() ?? '';
    output.replyTo = value;
  }

  if (input.unsubscribeUrl !== undefined) {
    output.unsubscribeUrl = input.unsubscribeUrl?.trim() ?? '';
  }

  if (input.trackingDomain !== undefined) {
    output.trackingDomain = input.trackingDomain?.trim() ?? '';
  }

  if (input.languageId !== undefined) {
    output.languageId = input.languageId ?? null;
  }

  if (input.country !== undefined) {
    const value = input.country ?? null;
    output.country = value ? String(value).trim() || null : null;
  }

  const lists = normalizeStringList(raw.lists ?? raw.listName);
  if (lists.length) {
    output.lists = lists;
    output.listName = lists[0];
  } else if (input.listName !== undefined) {
    const value = input.listName?.trim() ?? '';
    output.listName = value;
    if (value) {
      output.lists = [value];
    }
  }

  if (input.accountUser !== undefined) {
    const value = input.accountUser?.trim() ?? '';
    output.accountUser = value || null;
  }

  if (input.accountToken !== undefined) {
    const value = input.accountToken?.trim() ?? '';
    output.accountToken = value || null;
  }

  if (raw.headerHtml !== undefined) {
    output.headerHtml = sanitizeHtmlSnippet(raw.headerHtml);
  }

  if (raw.footerHtml !== undefined) {
    output.footerHtml = sanitizeHtmlSnippet(raw.footerHtml);
  }

  if (raw.templateId !== undefined) {
    const valueRaw = raw.templateId;
    if (typeof valueRaw === 'number') {
      output.templateId = Number.isFinite(valueRaw) ? String(Math.trunc(valueRaw)) : '';
    } else {
      const value = typeof valueRaw === 'string' ? valueRaw.trim() : '';
      output.templateId = value;
    }
  }

  return output;
}

export function buildDefaultsPayloadFromDraft(
  draft: PlanningDraft,
  options?: { country?: string | null }
): DoctorSenderDefaultsUpdate {
  return sanitizeDoctorSenderDefaultsInput({
    fromEmail: draft.fromEmail ?? '',
    fromEmails: draft.fromEmail ? [draft.fromEmail] : [],
    replyTo: draft.replyTo ?? '',
    trackingDomain: draft.trackingDomain ?? '',
    languageId: draft.languageId ?? null,
    unsubscribeUrl: draft.unsubscribeUrl ?? '',
    lists: [],
    country: options?.country ?? null,
  });
}

export function languageIdToIso3(languageId?: number | null): string | null {
  if (!languageId) return null;
  return DOCTOR_SENDER_LANGUAGES.find((option) => option.id === languageId)?.iso3 ?? null;
}

// Backwards compatibility helper (fallback to static defaults)
export function resolveDoctorSenderDefaults(database: string): DoctorSenderDefaults {
  return resolveStaticDoctorSenderDefaults(database);
}
