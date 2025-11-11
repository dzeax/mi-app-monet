"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import CreateCampaignModal from "./create-campaign/CreateCampaignModal";
import ManageCatalogsModal from "./catalogs/ManageCatalogsModal";
import ImportCsvModal from "./import/ImportCsvModal";
import RoutingSettingsModal from "@/components/admin/RoutingSettingsModal";
import ManageUsersModal from "@/components/admin/ManageUsersModal";

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

  const [openCreate, setOpenCreate] = useState(false);
  const [openManage, setOpenManage] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);
  const [openRouting, setOpenRouting] = useState(false);

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
      ? `sidebar-btn flex justify-center items-center gap-2 rounded-xl border ${padCollapsed} ${extra}`
      : `sidebar-btn w-full flex items-center gap-3 rounded-xl border ${padExpanded} text-left ${extra}`;

  const BtnCampaignPlanning = (
    <button
      onClick={() => router.push('/campaign-planning')}
      className={btnBase(pathname?.startsWith('/campaign-planning') ? 'sidebar-btn--active' : '')}
      title="Campaign Planning"
      aria-label="Campaign Planning"
    >
      <Image src="/icons/sidebar/planning.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
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
      <Image src="/icons/sidebar/dbs-routing.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
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
      <Image src="/icons/sidebar/create-campaign.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
      {!collapsed && <span>Create Campaign{!isEditor ? " (locked)" : ""}</span>}
    </button>
  );

  const BtnImport = (
    <button
      onClick={() => isAdmin && setOpenImport(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase("mt-2 disabled:opacity-50 disabled:pointer-events-none")}
      title={isAdmin ? "Imports" : "Admins only"}
      aria-label="Import from CSV"
    >
      <Image src="/icons/sidebar/import-csv.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
      {!collapsed && <span>Imports{!isAdmin ? " (admin)" : ""}</span>}
    </button>
  );

  const BtnManage = (
    <button
      onClick={() => isEditor && setOpenManage(true)}
      disabled={!isEditor}
      aria-disabled={!isEditor}
      className={btnBase("mt-2 disabled:opacity-50 disabled:pointer-events-none")}
      title={isEditor ? "Manage Catalogs" : "Editors/Admins only"}
      aria-label="Manage catalogs"
    >
      <Image src="/icons/sidebar/manage-catalogs.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
      {!collapsed && <span>Manage Catalogs{!isEditor ? " (locked)" : ""}</span>}
    </button>
  );

  const BtnUsers = (
    <button
      onClick={() => isAdmin && setOpenUsers(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase("mt-2 disabled:opacity-50 disabled:pointer-events-none")}
      title={isAdmin ? "Manage Users" : "Admins only"}
      aria-label="Manage users"
    >
      <Image src="/icons/sidebar/manage-users.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
      {!collapsed && <span>Manage Users{!isAdmin ? " (admin)" : ""}</span>}
    </button>
  );

  const BtnRouting = (
    <button
      onClick={() => isAdmin && setOpenRouting(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase("mt-2 disabled:opacity-50 disabled:pointer-events-none")}
      title={isAdmin ? "Routing Settings" : "Admins only"}
      aria-label="Routing settings"
    >
      <Image src="/icons/sidebar/routing-settings.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
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
      <Image src="/icons/sidebar/campaign-reporting.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
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
      <Image src="/icons/sidebar/reports.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
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
      <Image src="/icons/sidebar/dbsperf.svg" alt="" aria-hidden width={24} height={24} className="h-5 w-5" />
      {!collapsed && <span>DBs Performance</span>}
    </button>
  );

  return (
    <div className={collapsed ? "shrink-0 self-start w-[56px]" : "shrink-0 self-start w-full md:w-full"}>
      <div className="grid gap-3">
        <div className={collapsed ? "sidebar-card p-2" : "sidebar-card p-4"}>
          <div className={["flex items-center mb-2", collapsed ? "justify-center" : "justify-between"].join(" ")}>
            {!collapsed && (
              <div>
                <h2 className="text-base font-semibold">Global Activation</h2>
                <p className="muted text-xs">Production</p>
              </div>
            )}
            {!hideCollapseToggle && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleCollapse}
                  className="icon-btn"
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={collapsed ? 'Expand' : 'Collapse'}
                >
                  <Image
                    src={collapsed ? '/icons/ui/sidebar-expand.svg' : '/icons/ui/sidebar-collapse.svg'}
                    alt=""
                    aria-hidden
                    width={20}
                    height={20}
                  />
                </button>
                {!collapsed && (
                  <button
                    onClick={toggleDensity}
                    className="icon-btn"
                    aria-label="Toggle sidebar density"
                    aria-pressed={density === 'compact'}
                    title={`Density: ${density}`}
                  >
                    <Image
                      src={density === 'compact' ? '/icons/ui/density-compact.svg' : '/icons/ui/density-comfy.svg'}
                      alt=""
                      aria-hidden
                      width={20}
                      height={20}
                    />
                  </button>
                )}
              </div>
            )}
          </div>
          {!collapsed ? (
            <div className="space-y-3">
              {BtnCampaignPlanning}
              {BtnDatabaseRouting}
            </div>
          ) : (
            <>
              {BtnCampaignPlanning}
              {BtnDatabaseRouting}
            </>
          )}
        </div>

        <div className={collapsed ? "sidebar-card p-2" : "sidebar-card p-4"}>
          <div className={["flex items-center mb-2", collapsed ? "justify-center" : "justify-between"].join(" ")}>
            {!collapsed && (
              <div>
                <h2 className="text-base font-semibold">Actions</h2>
                <p className="muted text-xs">Quick tools</p>
              </div>
            )}
          </div>

          {!collapsed ? (
            <div className="space-y-3">
              {BtnCreate}
              {isAdmin && BtnImport}
              {BtnManage}
              {isAdmin && BtnUsers}
              {isAdmin && BtnRouting}
            </div>
          ) : (
            <>
              {BtnCreate}
              {isAdmin && BtnImport}
              {BtnManage}
              {isAdmin && BtnUsers}
              {isAdmin && BtnRouting}
            </>
          )}
        </div>

        <div className={collapsed ? "sidebar-card p-2" : "sidebar-card p-4"}>
          <div className={["flex items-center mb-2", collapsed ? "justify-center" : "justify-between"].join(" ")}>
            {!collapsed && (
              <div>
                <h2 className="text-base font-semibold">Analytics</h2>
                <p className="muted text-xs">Insights & reports</p>
              </div>
            )}
          </div>
          {!collapsed ? (
            <div className="space-y-3">
              {BtnCampaignReporting}
              {BtnReports}
              {BtnDbsPerformance}
            </div>
          ) : (
            <>
              {BtnCampaignReporting}
              {BtnReports}
              {BtnDbsPerformance}
            </>
          )}
        </div>
      </div>

      {openCreate && (
        <CreateCampaignModal
          onClose={() => {
            setOpenCreate(false);
            onActionDone?.();
          }}
        />
      )}
      {isAdmin && openImport && (
        <ImportCsvModal
          onClose={() => {
            setOpenImport(false);
            onActionDone?.();
          }}
        />
      )}
      {openManage && (
        <ManageCatalogsModal
          onClose={() => {
            setOpenManage(false);
            onActionDone?.();
          }}
        />
      )}
      {isAdmin && openUsers && (
        <ManageUsersModal
          onClose={() => {
            setOpenUsers(false);
            onActionDone?.();
          }}
        />
      )}
      {isAdmin && openRouting && (
        <RoutingSettingsModal
          onClose={() => {
            setOpenRouting(false);
            onActionDone?.();
          }}
        />
      )}
    </div>
  );
}

