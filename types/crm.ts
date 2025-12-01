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
    workHours: number;
    prepHours: number | null;
    notes?: string | null;
  }[];
  createdAt?: string;
  updatedAt?: string;
};

export type CrmOwnerRate = {
  id: string;
  clientSlug: string;
  owner: string;
  dailyRate: number;
  currency: string;
};
