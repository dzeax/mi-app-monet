const ACCOUNT_DEFINITIONS = [
  {
    key: 'tuopinion',
    label: 'TuOpinion',
    userEnv: 'DS_ACC_TUOPINION_USER',
    tokenEnv: 'DS_ACC_TUOPINION_TOKEN',
  },
  {
    key: 'default',
    label: 'Default',
    userEnv: 'DOCTORSENDER_SOAP_USER',
    tokenEnv: 'DOCTORSENDER_SOAP_TOKEN',
    fallback: true,
  },
] as const;

type AccountDefinition = (typeof ACCOUNT_DEFINITIONS)[number];

type RuntimeAccount = AccountDefinition & {
  userEnv: string;
  tokenEnv: string;
};

const availableAccounts = ACCOUNT_DEFINITIONS.filter((definition) => {
  const user = process.env[definition.userEnv];
  const token = process.env[definition.tokenEnv];
  return Boolean(user && token);
});

const accountsMap = new Map<string, RuntimeAccount>();
for (const definition of availableAccounts) {
  accountsMap.set(definition.key, {
    ...definition,
  });
}

export type DoctorSenderAccountOption = {
  key: string;
  label: string;
};

export type DoctorSenderAccountCredentials = {
  key: string;
  label: string;
  user: string;
  token: string;
};

export function listDoctorSenderAccounts(): DoctorSenderAccountOption[] {
  return availableAccounts.map(({ key, label }) => ({ key, label }));
}

export function isValidDoctorSenderAccountKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return accountsMap.has(key);
}

export function resolveDoctorSenderAccount(accountKey?: string | null): DoctorSenderAccountCredentials {
  let chosen: RuntimeAccount | undefined;

  if (accountKey) {
    chosen = accountsMap.get(accountKey);
  }

  if (!chosen) {
    chosen = accountsMap.get('default');
  }

  if (!chosen) {
    throw new Error('No DoctorSender account configured. Please configure DOCTORSENDER_SOAP_USER/DOCTORSENDER_SOAP_TOKEN.');
  }

  const user = process.env[chosen.userEnv];
  const token = process.env[chosen.tokenEnv];

  if (!user || !token) {
    throw new Error(`Missing credentials for DoctorSender account "${chosen.key}".`);
  }

  return {
    key: chosen.key,
    label: chosen.label,
    user,
    token,
  };
}
