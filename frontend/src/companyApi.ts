import type { Company, Initiative, Touchpoint } from "./api";
import type { Department, Recency } from "./coverage";

export type RiskFact = {
  code:
    | "UNCONTACTED_DEPARTMENT"
    | "UNCONTACTED_DECISION_MAKER"
    | "SINGLE_ENGAGED_DECISION_MAKER"
    | "STALE_CONTACT_VERIFICATION"
    | "UNKNOWN_CONTACT_VERIFICATION";
  evidenceStatus: "NO_EVIDENCE" | "STALE" | "RECORDED";
  companyId: string;
  companyName: string;
  initiativeId: string;
  initiativeName: string;
  subjectId: string;
  subjectName: string;
  lastObservedAt: string | null;
};

export type DashboardFacts = {
  days: number;
  accessibleCompanyCount: number;
  registeredContactCount: number;
  activeInteractionCount: number;
  latestAsOf: string | null;
  riskCount: number;
  risks: RiskFact[];
  companies: CompanyFacts[];
  recentInteractions: (Pick<
    Touchpoint,
    "id" | "type" | "occurredAt" | "subject" | "team"
  > & { initiativeId: string; initiativeName: string })[];
};

export type CompanyFacts = {
  companyId: string;
  initiativeCount: number;
  contactCount: number;
  departmentCount: number;
  latestAsOf: string | null;
};

export type CompanyInsights = {
  latestAsOf: string | null;
  activeInteractionCount: number;
  riskCount: number;
  risks: RiskFact[];
};

export type ContactSummary = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: Department | null;
  roles: { code: string; label: string }[];
  influence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  decisionMaker: boolean;
  lastInteractionAt: string | null;
  interaction: Recency;
  responsibleManager: string | null;
};

export type CompanyProfile = Company & {
  departments: Department[];
  initiatives: Initiative[];
  contactCount: number;
  keyContacts: ContactSummary[];
  roles: { code: string; label: string }[];
};

export type CompanyContact = ContactSummary & {
  email: string | null;
  phone: string | null;
  assignments: {
    initiativeId: string;
    initiativeName: string;
    role: { label: string } | null;
  }[];
  connections: { id: string; contactId: string; name: string; label: string }[];
};

type HealthFactor = {
  total: number;
  recent: number;
  unknown: number;
  weight: number;
};
export type HealthFacts = {
  days: number;
  verificationDays: number;
  status: "READY" | "PARTIAL" | "INSUFFICIENT_DATA";
  score: number | null;
  decisionMakerTouches: HealthFactor;
  departmentTouches: HealthFactor;
  decisionMakerVerification: HealthFactor;
};

export function riskLabel(risk: RiskFact) {
  const name = risk.subjectName;
  switch (risk.code) {
    case "UNCONTACTED_DEPARTMENT":
      return `Нет недавних записей об общении с подразделением «${name}»`;
    case "UNCONTACTED_DECISION_MAKER":
      return `Нет недавних записей об общении с ЛПР · ${name}`;
    case "SINGLE_ENGAGED_DECISION_MAKER":
      return `В истории за период есть общение только с одним ЛПР · ${name}`;
    case "STALE_CONTACT_VERIFICATION":
      return `Давно не проверяли данные · ${name}`;
    case "UNKNOWN_CONTACT_VERIFICATION":
      return `В истории нет проверки данных · ${name}`;
  }
}
