'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';            // 🆕
import CreateCampaignModal from './create-campaign/CreateCampaignModal';
import ManageCatalogsModal from './catalogs/ManageCatalogsModal';
import ImportCsvModal from './import/ImportCsvModal';
import RoutingSettingsModal from '@/components/admin/RoutingSettingsModal';
import ManageUsersModal from '@/components/admin/ManageUsersModal'; // 🆕

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
  const { isAdmin, isEditor } = useAuth();                  // 🆕

  const [openCreate, setOpenCreate] = useState(false);
  const [openManage, setOpenManage] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [openUsers, setOpenUsers]   = useState(false);      // 🆕
  const [openRouting, setOpenRouting] = useState(false);

  const btnBase = (extra = '') =>
    collapsed
      ? `flex justify-center items-center rounded-xl border border-[--color-border] px-2 py-2 hover:bg-black/5 transition-colors ${extra}`
      : `w-full rounded-xl border border-[--color-border] px-3 py-2 text-left hover:bg-black/5 transition-colors ${extra}`;

  const BtnCreate = (
    <button
      onClick={() => isEditor && setOpenCreate(true)}
      disabled={!isEditor}
      aria-disabled={!isEditor}
      className={btnBase('disabled:opacity-50 disabled:pointer-events-none')}
      title={isEditor ? 'Create campaign' : 'Editors/Admins only'}
      aria-label="Create campaign"
    >
      <span className="text-lg leading-none">+</span>
      {!collapsed && <span className="ml-2">Create campaign{!isEditor ? ' (locked)' : ''}</span>}
    </button>
  );

  const BtnImport = (
    <button
      onClick={() => isAdmin && setOpenImport(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase('mt-2 disabled:opacity-50 disabled:pointer-events-none')}
      title={isAdmin ? 'Import from CSV' : 'Admins only'}
      aria-label="Import from CSV"
    >
      <span className="text-lg leading-none">I</span>
      {!collapsed && <span className="ml-2">Import from CSV{!isAdmin ? ' (admin)' : ''}</span>}
    </button>
  );

  const BtnManage = (
    <button
      onClick={() => isEditor && setOpenManage(true)}
      disabled={!isEditor}
      aria-disabled={!isEditor}
      className={btnBase('mt-2 disabled:opacity-50 disabled:pointer-events-none')}
      title={isEditor ? 'Manage catalogs' : 'Editors/Admins only'}
      aria-label="Manage catalogs"
    >
      <span className="text-lg leading-none">C</span>
      {!collapsed && <span className="ml-2">Manage catalogs{!isEditor ? ' (locked)' : ''}</span>}
    </button>
  );

  const BtnUsers = (
    <button
      onClick={() => isAdmin && setOpenUsers(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase('mt-2 disabled:opacity-50 disabled:pointer-events-none')}
      title={isAdmin ? 'Manage users' : 'Admins only'}
      aria-label="Manage users"
    >
      <span className="text-lg leading-none">U</span>
      {!collapsed && <span className="ml-2">Manage users{!isAdmin ? ' (admin)' : ''}</span>}
    </button>
  );

  const BtnRouting = (
    <button
      onClick={() => isAdmin && setOpenRouting(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase('mt-2 disabled:opacity-50 disabled:pointer-events-none')}
      title={isAdmin ? 'Routing settings' : 'Admins only'}
      aria-label="Routing settings"
    >
      <span className="text-lg leading-none">RC</span>
      {!collapsed && <span className="ml-2">Routing settings{!isAdmin ? ' (admin)' : ''}</span>}
    </button>
  );

  const BtnReports = (
    <button
      onClick={() => router.push('/reports')}
      className={btnBase()}
      title="Reports"
      aria-label="Reports"
    >
      <span className="text-lg leading-none">R</span>
      {!collapsed && <span className="ml-2">Reports</span>}
    </button>
  );

  return (
    <div className={collapsed ? 'shrink-0 self-start w-[56px]' : 'shrink-0 self-start w-full md:w-full'}>
      <div className="grid gap-3">
        <div className={collapsed ? 'card p-2' : 'card p-4'}>
          <div className={['flex items-center mb-2', collapsed ? 'justify-center' : 'justify-between'].join(' ')}>
            {!collapsed && (
              <div>
                <h2 className="text-base font-semibold">Actions</h2>
                <p className="muted text-xs">Quick tools</p>
              </div>
            )}
            {!hideCollapseToggle && (
              <button
                onClick={onToggleCollapse}
                className="rounded-lg border border-[--color-border] px-2 py-1 text-xs hover:bg-black/5 transition-colors"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? '<<' : '>>'}
              </button>
            )}
          </div>

          {!collapsed ? (
            <div className="space-y-3">
              {BtnCreate}
              {BtnImport}
              {BtnManage}
              {BtnUsers} {/* 🆕 */}
              {BtnRouting}
            </div>
          ) : (
            <>
              {BtnCreate}
              {BtnImport}
              {BtnManage}
              {BtnUsers} {/* 🆕 */}
              {BtnRouting}
            </>
          )}
        </div>

        <div className={collapsed ? 'card p-2' : 'card p-4'}>
          <div className={['flex items-center mb-2', collapsed ? 'justify-center' : 'justify-between'].join(' ')}>
            {!collapsed && (
              <div>
                <h2 className="text-base font-semibold">Analytics</h2>
                <p className="muted text-xs">Insights & reports</p>
              </div>
            )}
          </div>
          {!collapsed ? <div className="space-y-3">{BtnReports}</div> : <>{BtnReports}</>}
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
      {openImport && (
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
      {openUsers && (
        <ManageUsersModal
          onClose={() => {
            setOpenUsers(false);
            onActionDone?.();
          }}
        />
      )}
      {openRouting && (
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
