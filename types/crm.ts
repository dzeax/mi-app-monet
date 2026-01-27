export type NeedsEffortState = "open" | "dismissed" | "cleared";
export type NeedsEffortDismissReason =
  | "no_effort_needed"
  | "duplicate"
  | "out_of_scope";

export type NeedsEffortFlag = {
  state: NeedsEffortState;
  dismissReason: NeedsEffortDismissReason | null;
  dismissedAt?: string | null;
  dismissedBy?: string | null;
  clearedAt?: string | null;
  clearedBy?: string | null;
  lastDetectedAt?: string | null;
  lastDetectedStatus?: string | null;
};

export type DataQualityTicket = {
  id: string;
  clientSlug: string;
  status: string;
  assignedDate: string; // when the ticket is assigned to the agency owner
  dueDate: string | null;
  ticketId: string;
  title: string;
  priority: "P1" | "P2" | "P3";
  owner: string;
  jiraAssignee?: string | null;
  reporter: string | null;
  type: string | null;
  jiraUrl: string | null;
  workHours: number;
  prepHours: number | null;
  etaDate: string | null;
  comments: string | null;
  hasContributions?: boolean;
  contributions?: {
    owner: string;
    personId?: string | null;
    effortDate?: string | null;
    workHours: number;
    prepHours: number | null;
    workstream?: string | null;
    notes?: string | null;
  }[];
  needsEffort?: NeedsEffortFlag | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CrmOwnerRate = {
  id: string;
  clientSlug: string;
  owner: string;
  personId?: string | null;
  dailyRate: number;
  currency: string;
  year?: number;
};

export type CrmPersonEntity = {
  id: string;
  clientSlug: string;
  year: number;
  personId: string;
  entity: string;
};
