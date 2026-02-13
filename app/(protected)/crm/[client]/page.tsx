import { notFound, redirect } from 'next/navigation';

import { getUserAndAppUser } from '@/lib/auth/server';
import { getCrmClient, getCrmWorkspaceHref } from '@/lib/crm/clients';

type Props = {
  params: Promise<{
    client: string;
  }>;
};

export default async function CrmClientPage({ params }: Props) {
  const { client: clientSlug } = await params;
  const client = getCrmClient(clientSlug);

  if (!client) {
    notFound();
  }

  const { appUser } = await getUserAndAppUser();
  const role = appUser?.role === 'admin' ? 'admin' : 'editor';

  redirect(getCrmWorkspaceHref(client, role) ?? '/crm/operations');
}

