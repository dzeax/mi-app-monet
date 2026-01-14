import type { Metadata } from "next";
import CrmBudgetExecutionView from "@/components/crm/CrmBudgetExecutionView";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  params: { client: string; token: string };
  searchParams?: { year?: string };
};

const parseYear = (value?: string) => {
  const year = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(year) && year > 1900) return year;
  return new Date().getFullYear();
};

export default function ShareBudgetExecutionPage({ params, searchParams }: Props) {
  const year = parseYear(searchParams?.year);
  return (
    <section className="px-3 md:px-4 lg:px-6 py-2">
      <CrmBudgetExecutionView
        clientOverride={params.client}
        shareToken={params.token}
        shareMode
        initialYear={year}
      />
    </section>
  );
}
