import type { Metadata } from "next";
import CrmDqTicketsAnalyticsView from "@/components/crm/CrmDqTicketsAnalyticsView";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  params: { client: string; token: string };
};

export default function ShareDqTicketsPage({ params }: Props) {
  return (
    <section className="px-3 md:px-4 lg:px-6 py-2">
      <CrmDqTicketsAnalyticsView
        clientOverride={params.client}
        shareToken={params.token}
        shareMode
      />
    </section>
  );
}
