"use client";

import Image from "next/image";
import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useBusinessUnit } from "@/context/BusinessUnitContext";
import { CRM_CLIENTS, getCrmClient } from "@/lib/crm/clients";
import CreateCampaignModal from "./create-campaign/CreateCampaignModal";
import ManageCatalogsModal from "./catalogs/ManageCatalogsModal";
import ImportCsvModal from "./import/ImportCsvModal";
import RoutingSettingsModal from "@/components/admin/RoutingSettingsModal";
import ManageUsersModal from "@/components/admin/ManageUsersModal";
import ManageRatesModal from "@/components/rates/ManageRatesModal";
import CrmImportModal from "@/components/crm/CrmImportModal";
import CrmCatalogsModal from "@/components/crm/CrmCatalogsModal";
import CrmEffortRulesModal from "@/components/crm/CrmEffortRulesModal";

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  hideCollapseToggle?: boolean;
  onActionDone?: () => void;
};

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  hideCollapseToggle = false,
  onActionDone,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin, isEditor } = useAuth();
  const { unit } = useBusinessUnit();
  const isCrm = unit === "crm";
  const pathSegments = pathname?.split("/").filter(Boolean) ?? [];
  const crmIdx = pathSegments.indexOf("crm");
  const clientSlugFromPath = crmIdx >= 0 ? pathSegments[crmIdx + 1] ?? null : null;
  const activeClient = isCrm
    ? getCrmClient(clientSlugFromPath) ?? CRM_CLIENTS[0] ?? null
    : null;

  const [openCreate, setOpenCreate] = useState(false);
  const [openManage, setOpenManage] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);
  const [openRouting, setOpenRouting] = useState(false);
  const [openRates, setOpenRates] = useState(false);
  const [openCrmImport, setOpenCrmImport] = useState(false);
  const [openCrmCatalogs, setOpenCrmCatalogs] = useState(false);
  const [openEffortRules, setOpenEffortRules] = useState(false);

  // Density (comfy|compact) persisted
  const [density, setDensity] = useState<"comfy" | "compact">("comfy");
  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("sidebarDensity") : null;
      if (stored === "compact" || stored === "comfy") setDensity(stored as "comfy" | "compact");
    } catch {}
  }, []);
  const toggleDensity = () => {
    setDensity((d) => {
      const next = d === "comfy" ? "compact" : "comfy";
      try {
        localStorage.setItem("sidebarDensity", next);
      } catch {}
      return next;
    });
  };

  const padExpanded = density === "compact" ? "px-2.5 py-1.5" : "px-3 py-2";
  const padCollapsed = density === "compact" ? "px-2 py-1.5" : "px-2 py-2";

  const btnBase = (extra = "") =>
    collapsed
      ? `sidebar-btn flex justify-center items-center gap-2 rounded-xl border text-sm font-medium ${padCollapsed} ${extra}`
      : `sidebar-btn w-full flex items-center gap-2.5 rounded-xl border text-sm font-medium ${padExpanded} text-left ${extra}`;

  const BtnCampaignPlanning = (
    <button
      onClick={() => router.push('/campaign-planning')}
      className={btnBase(pathname?.startsWith('/campaign-planning') ? 'sidebar-btn--active' : '')}
      title="Campaign Planning"
      aria-label="Campaign Planning"
    >
      <Image src="/icons/sidebar/planning.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Campaign Planning</span>}
    </button>
  );

  const BtnDatabaseRouting = (
    <button
      onClick={() => router.push('/dbs-routing')}
      className={btnBase(pathname?.startsWith('/dbs-routing') ? 'sidebar-btn--active' : '')}
      title="Database Routing"
      aria-label="Database Routing"
    >
      <Image src="/icons/sidebar/dbs-routing.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Database Routing</span>}
    </button>
  );

  const BtnCreate = (
    <button
      onClick={() => isEditor && setOpenCreate(true)}
      disabled={!isEditor}
      aria-disabled={!isEditor}
      className={btnBase("disabled:opacity-50 disabled:pointer-events-none")}
      title={isEditor ? "Create Campaign" : "Editors/Admins only"}
      aria-label="Create campaign"
    >
      <Image src="/icons/sidebar/create-campaign.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Create Campaign{!isEditor ? " (locked)" : ""}</span>}
    </button>
  );

  const BtnImport = (
    <button
      onClick={() => isAdmin && setOpenImport(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase("disabled:opacity-50 disabled:pointer-events-none")}
      title={isAdmin ? "Imports" : "Admins only"}
      aria-label="Import from CSV"
    >
      <Image src="/icons/sidebar/import-csv.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Imports{!isAdmin ? " (admin)" : ""}</span>}
    </button>
  );

  const BtnManage = (
    <button
      onClick={() => isEditor && setOpenManage(true)}
      disabled={!isEditor}
      aria-disabled={!isEditor}
      className={btnBase("disabled:opacity-50 disabled:pointer-events-none")}
      title={isEditor ? "Manage Catalogs" : "Editors/Admins only"}
      aria-label="Manage catalogs"
    >
      <Image src="/icons/sidebar/manage-catalogs.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Manage Catalogs{!isEditor ? " (locked)" : ""}</span>}
    </button>
  );

  const BtnUsers = (
    <button
      onClick={() => isAdmin && setOpenUsers(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase("disabled:opacity-50 disabled:pointer-events-none")}
      title={isAdmin ? "Manage Users" : "Admins only"}
      aria-label="Manage users"
    >
      <Image src="/icons/sidebar/manage-users.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Manage Users{!isAdmin ? " (admin)" : ""}</span>}
    </button>
  );

  const BtnRouting = (
    <button
      onClick={() => isAdmin && setOpenRouting(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase("disabled:opacity-50 disabled:pointer-events-none")}
      title={isAdmin ? "Routing Settings" : "Admins only"}
      aria-label="Routing settings"
    >
      <Image src="/icons/sidebar/routing-settings.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Routing Settings{!isAdmin ? " (admin)" : ""}</span>}
    </button>
  );

  const BtnCampaignReporting = (
    <button
      onClick={() => router.push("/analytics/campaign-reporting")}
      className={btnBase(pathname?.startsWith("/analytics/campaign-reporting") ? "sidebar-btn--active" : "")}
      title="Campaign Reporting"
      aria-label="Campaign Reporting"
    >
      <Image src="/icons/sidebar/campaign-reporting.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Campaign Reporting</span>}
    </button>
  );

  const BtnReports = (
    <button
      onClick={() => router.push("/analytics/reports")}
      className={btnBase(pathname?.startsWith("/analytics/reports") ? "sidebar-btn--active" : "")}
      title="Global Reports"
      aria-label="Global Reports"
    >
      <Image src="/icons/sidebar/reports.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>Global Reports</span>}
    </button>
  );

  const BtnDbsPerformance = (
    <button
      onClick={() => router.push("/analytics/dbs-performance")}
      className={btnBase(pathname?.startsWith("/analytics/dbs-performance") ? "sidebar-btn--active" : "")}
      title="DBs Performance"
      aria-label="DBs Performance"
    >
      <Image src="/icons/sidebar/dbsperf.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
      {!collapsed && <span>DBs Performance</span>}
    </button>
  );

  type Section = {
    key: string;
    title: string;
    description: string;
    items: (ReactNode | null | false)[];
  };

  const crmModuleButtons = (activeClient?.modules || []).map((module) => {
    const target = `/crm/${activeClient?.slug}/${module.slug}`;
    const isActive = pathname?.startsWith(target);
    const iconSrc =
      module.icon === "runbook"
        ? "/icons/sidebar/manage-catalogs.svg"
        : module.icon === "chart"
        ? "/icons/sidebar/reports.svg"
        : module.icon === "insight"
        ? "/icons/sidebar/reports.svg"
        : "/icons/sidebar/planning.svg";
    return (
      <button
        key={module.slug}
        onClick={() => !module.comingSoon && router.push(target)}
        className={btnBase(
          module.comingSoon
            ? "opacity-60"
            : isActive
            ? "sidebar-btn--active"
            : ""
        )}
        title={module.label}
        aria-label={module.label}
        disabled={module.comingSoon}
      >
        <Image src={iconSrc} alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
        {!collapsed && (
          <span>
            {module.label}
            {module.comingSoon ? " (soon)" : ""}
          </span>
        )}
      </button>
    );
  });

  const monetizationSections: Section[] = [
    {
      key: "campaigns",
      title: "Campaigns",
      description: "Plan & launch",
      items: [BtnCampaignPlanning, BtnCreate],
    },
    {
      key: "data",
      title: "Data",
      description: "Catalogs & sources",
      items: [BtnManage, isAdmin ? BtnImport : null],
    },
    {
      key: "routing",
      title: "Routing",
      description: "Traffic control",
      items: [BtnDatabaseRouting, isAdmin ? BtnRouting : null],
    },
    {
      key: "analytics",
      title: "Analytics",
      description: "Insights & reports",
      items: [BtnCampaignReporting, BtnReports, BtnDbsPerformance],
    },
    {
      key: "admin",
      title: "Admin",
      description: "Access & settings",
      items: [isAdmin ? BtnUsers : null],
    },
  ];

  const crmSections: Section[] = [
    {
      key: "client-ops",
      title: activeClient ? activeClient.name : "CRM",
      description: "Client modules",
      items: [
        ...crmModuleButtons,
        isEditor ? (
          <button
            key="crm-import"
            onClick={() => setOpenCrmImport(true)}
            className={btnBase(openCrmImport ? "sidebar-btn--active" : "")}
            title="Import CSV"
            aria-label="Import CSV"
          >
            <Image src="/icons/sidebar/import-csv.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
            {!collapsed && <span>Import CSV</span>}
          </button>
        ) : null,
        isEditor ? (
          <button
            key="crm-catalogs"
            onClick={() => setOpenCrmCatalogs(true)}
            className={btnBase(openCrmCatalogs ? "sidebar-btn--active" : "")}
            title="Manage catalogs"
            aria-label="Manage catalogs"
          >
            <Image src="/icons/sidebar/manage-catalogs.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
            {!collapsed && <span>Manage catalogs</span>}
          </button>
        ) : null,
        isEditor ? (
          <button
            key="crm-rates"
            onClick={() => setOpenRates(true)}
            className={btnBase(openRates ? "sidebar-btn--active" : "")}
            title="Manage rates"
            aria-label="Manage rates"
          >
            <Image src="/icons/sidebar/manage-catalogs.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
            {!collapsed && <span>Manage rates</span>}
          </button>
        ) : null,
        isAdmin ? (
          <button
            key="crm-effort-rules"
            onClick={() => setOpenEffortRules(true)}
            className={btnBase(openEffortRules ? "sidebar-btn--active" : "")}
            title="Effort rules"
            aria-label="Effort rules"
          >
            <Image src="/icons/sidebar/manage-catalogs.svg" alt="" aria-hidden width={24} height={24} className="sidebar-icon" />
            {!collapsed && <span>Effort Rules</span>}
          </button>
        ) : null,
      ],
    },
  ];

  const sections: Section[] = isCrm ? crmSections : monetizationSections;

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(Boolean) as ReactNode[],
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={
        collapsed
          ? "sidebar-shell sidebar-shell--collapsed shrink-0 self-start w-[56px]"
          : "sidebar-shell shrink-0 self-start w-full md:w-full"
      }
    >
      <div className="sidebar-head">
        {!hideCollapseToggle && (
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleCollapse}
              className="icon-btn"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand" : "Collapse"}
            >
              <Image
                src={collapsed ? "/icons/ui/sidebar-expand.svg" : "/icons/ui/sidebar-collapse.svg"}
                alt=""
                aria-hidden
                width={20}
                height={20}
              />
            </button>
          </div>
        )}
      </div>

      <nav className="sidebar-sections" aria-label="Primary navigation">
        {visibleSections.map((section) => (
          <div key={section.key} className="sidebar-section">
            {!collapsed && (
              <div className="sidebar-section__header">
                <p className="sidebar-section__title">{section.title}</p>
                <p className="sidebar-section__description">{section.description}</p>
              </div>
            )}
            <div
              className={
                collapsed ? "sidebar-section__items sidebar-section__items--collapsed" : "sidebar-section__items"
              }
            >
              {section.items.map((item, index) => (
                <div key={`${section.key}-${index}`} className="sidebar-section__item">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {!hideCollapseToggle && (
        <div className="sidebar-footer" aria-label="Sidebar preferences">
          <button
            onClick={toggleDensity}
            className="icon-btn"
            aria-label="Toggle sidebar density"
            aria-pressed={density === "compact"}
            title={`Density: ${density}`}
          >
            <Image
              src={density === "compact" ? "/icons/ui/density-compact.svg" : "/icons/ui/density-comfy.svg"}
              alt=""
              aria-hidden
              width={20}
              height={20}
            />
          </button>
        </div>
      )}

      {unit === "monetization" && openCreate && (
        <CreateCampaignModal
          onClose={() => {
            setOpenCreate(false);
            onActionDone?.();
          }}
        />
      )}
      {unit === "monetization" && isAdmin && openImport && (
        <ImportCsvModal
          onClose={() => {
            setOpenImport(false);
            onActionDone?.();
          }}
        />
      )}
      {unit === "crm" && isEditor && openCrmImport && activeClient && (
        <CrmImportModal
          clientSlug={activeClient.slug}
          onClose={() => {
            setOpenCrmImport(false);
            onActionDone?.();
          }}
        />
      )}
      {unit === "crm" && isEditor && openCrmCatalogs && (
        <CrmCatalogsModal onClose={() => setOpenCrmCatalogs(false)} clientSlug={activeClient?.slug || "emg"} />
      )}
      {unit === "crm" && openRates && activeClient && (
        <ManageRatesModal
          clientSlug={activeClient.slug}
          onClose={() => {
            setOpenRates(false);
            onActionDone?.();
          }}
        />
      )}
      {unit === "crm" && isAdmin && openEffortRules && activeClient && (
        <CrmEffortRulesModal
          clientSlug={activeClient.slug}
          onClose={() => {
            setOpenEffortRules(false);
            onActionDone?.();
          }}
        />
      )}
      {unit === "monetization" && openManage && (
        <ManageCatalogsModal
          onClose={() => {
            setOpenManage(false);
            onActionDone?.();
          }}
        />
      )}
      {unit === "monetization" && isAdmin && openUsers && (
        <ManageUsersModal
          onClose={() => {
            setOpenUsers(false);
            onActionDone?.();
          }}
        />
      )}
      {unit === "monetization" && isAdmin && openRouting && (
        <RoutingSettingsModal
          onClose={() => {
            setOpenRouting(false);
            onActionDone?.();
          }}
        />
      )}
    </aside>
  );
}
