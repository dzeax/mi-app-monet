// app/(protected)/layout.tsx
import { redirect } from 'next/navigation';
import { BusinessUnitProvider } from '@/context/BusinessUnitContext';
import { RoutingSettingsProvider } from '@/context/RoutingSettingsContext';
import { CatalogOverridesProvider } from '@/context/CatalogOverridesContext';
import { CampaignDataProvider } from '@/context/CampaignDataContext';
import { getSessionAndAppUser } from '@/lib/auth/server';
import AppHeader from '@/components/AppHeader';
import FooterBar from '@/components/ui/FooterBar';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { session, appUser } = await getSessionAndAppUser();

  if (!session) {
    redirect('/login?redirect=%2F');
  }
  if (appUser && appUser.is_active === false) {
    redirect('/login?reason=inactive');
  }

  return (
    <BusinessUnitProvider>
      <RoutingSettingsProvider>
        <CatalogOverridesProvider>
          <CampaignDataProvider>
            <AppHeader />

            <div className="with-app-footer">
              <div>{children}</div>
            </div>

            <FooterBar />
          </CampaignDataProvider>
        </CatalogOverridesProvider>
      </RoutingSettingsProvider>
    </BusinessUnitProvider>
  );
}
