'use client';

import Image from 'next/image';
import { ReactNode, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { useBusinessUnit } from '@/context/BusinessUnitContext';
import ManageUsersModal from '@/components/admin/ManageUsersModal';

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  hideCollapseToggle?: boolean;
  onActionDone?: () => void;
};

type Section = {
  key: string;
  title: string;
  description: string;
  items: (ReactNode | null | false)[];
};

export default function CommandCenterSidebar({
  collapsed,
  onToggleCollapse,
  hideCollapseToggle = false,
  onActionDone,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { setUnit } = useBusinessUnit();
  const [openUsers, setOpenUsers] = useState(false);

  const btnBase = (extra = '') =>
    collapsed
      ? `sidebar-btn flex justify-center items-center gap-2 rounded-xl border text-sm font-medium px-2 py-2 ${extra}`
      : `sidebar-btn w-full flex items-center gap-2.5 rounded-xl border text-sm font-medium px-3 py-2 text-left ${extra}`;

  const BtnHome = (
    <button
      onClick={() => router.push('/')}
      className={btnBase(pathname === '/' ? 'sidebar-btn--active' : '')}
      title="Command Center"
      aria-label="Command Center"
    >
      <Image
        src="/icons/sidebar/secure-backup.svg"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="sidebar-icon"
      />
      {!collapsed && <span>Command Center</span>}
    </button>
  );

  const BtnCapacity = (
    <button
      onClick={() => router.push('/command-center/team-capacity')}
      className={btnBase(pathname?.startsWith('/command-center/team-capacity') ? 'sidebar-btn--active' : '')}
      title="Team Capacity"
      aria-label="Team Capacity"
    >
      <Image
        src="/icons/sidebar/reports.svg"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="sidebar-icon"
      />
      {!collapsed && <span>Team Capacity</span>}
    </button>
  );

  const BtnCrm = (
    <button
      onClick={() => {
        setUnit('crm');
        router.push('/crm/operations');
      }}
      className={btnBase(pathname?.startsWith('/crm') ? 'sidebar-btn--active' : '')}
      title="CRM Operations"
      aria-label="CRM Operations"
    >
      <Image
        src="/icons/sidebar/reports.svg"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="sidebar-icon"
      />
      {!collapsed && <span>CRM Operations</span>}
    </button>
  );

  const BtnMonet = (
    <button
      onClick={() => {
        setUnit('monetization');
        router.push('/campaign-planning');
      }}
      className={btnBase(pathname?.startsWith('/campaign-planning') ? 'sidebar-btn--active' : '')}
      title="Monetization"
      aria-label="Monetization"
    >
      <Image
        src="/icons/sidebar/planning.svg"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="sidebar-icon"
      />
      {!collapsed && <span>Monetization</span>}
    </button>
  );

  const BtnUsers = (
    <button
      onClick={() => isAdmin && setOpenUsers(true)}
      disabled={!isAdmin}
      aria-disabled={!isAdmin}
      className={btnBase('disabled:opacity-50 disabled:pointer-events-none')}
      title={isAdmin ? 'Manage Users' : 'Admins only'}
      aria-label="Manage users"
    >
      <Image
        src="/icons/sidebar/manage-users.svg"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="sidebar-icon"
      />
      {!collapsed && <span>Manage Users{!isAdmin ? ' (admin)' : ''}</span>}
    </button>
  );

  const sections: Section[] = [
    {
      key: 'overview',
      title: 'Overview',
      description: 'Command center',
      items: [BtnHome],
    },
    {
      key: 'team',
      title: 'Team',
      description: 'Capacity & workload',
      items: [BtnCapacity],
    },
    {
      key: 'admin',
      title: 'Admin',
      description: 'Access & users',
      items: [isAdmin ? BtnUsers : null],
    },
    {
      key: 'shortcuts',
      title: 'Shortcuts',
      description: 'Jump to hubs',
      items: [BtnCrm, BtnMonet],
    },
  ];

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
          ? 'sidebar-shell sidebar-shell--collapsed shrink-0 self-start w-[56px]'
          : 'sidebar-shell shrink-0 self-start w-full md:w-full'
      }
    >
      <div className="sidebar-head">
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
          </div>
        )}
      </div>

      <nav className="sidebar-sections" aria-label="Command center navigation">
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
                collapsed
                  ? 'sidebar-section__items sidebar-section__items--collapsed'
                  : 'sidebar-section__items'
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

      {isAdmin && openUsers && (
        <ManageUsersModal
          onClose={() => {
            setOpenUsers(false);
            onActionDone?.();
          }}
        />
      )}
    </aside>
  );
}
