'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { CatalogOverridesProvider } from '@/context/CatalogOverridesContext';
import { CampaignDataProvider } from '@/context/CampaignDataContext';
import { RoutingSettingsProvider } from '@/context/RoutingSettingsContext';

// Si tienes más providers (ThemeProvider, Toaster, etc.), mantenlos,
// pero asegúrate de que AuthProvider sea el más exterior.

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoutingSettingsProvider>
        <CatalogOverridesProvider>
          <CampaignDataProvider>
            {children}
          </CampaignDataProvider>
        </CatalogOverridesProvider>
      </RoutingSettingsProvider>
    </AuthProvider>
  );
}
