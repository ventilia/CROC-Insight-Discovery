export type Recency = "RECENT" | "STALE" | "UNKNOWN";
export type ContactFilter = "all" | "stale" | "unknown" | "verification";
export type Department = { id: string; name: string };

export type ContactCoverage = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: Department | null;
  decisionMaker: boolean;
  lastTouchAt: string | null;
  touchStatus: Recency;
  lastVerifiedAt: string | null;
  verificationStatus: Recency;
};

export type Coverage = {
  initiativeId: string;
  asOf: string;
  days: number;
  verificationDays: number;
  contacts: ContactCoverage[];
  departments: (Department & {
    participantCount: number;
    recentCount: number;
    lastTouchAt: string | null;
    touchStatus: Recency;
  })[];
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" });

export function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

function needsVerification(contact: ContactCoverage) {
  return contact.decisionMaker && contact.verificationStatus !== "RECENT";
}

export function summarizeCoverage(contacts: ContactCoverage[]) {
  const recent = contacts.filter((person) => person.touchStatus === "RECENT").length;
  return {
    recent,
    stale: contacts.filter((person) => person.touchStatus === "STALE").length,
    unknown: contacts.filter((person) => person.touchStatus === "UNKNOWN").length,
    verification: contacts.filter(needsVerification).length,
    percent: contacts.length ? Math.round(recent * 100 / contacts.length) : null,
  };
}

export function selectContacts(contacts: ContactCoverage[], filter: ContactFilter, departmentId: string | null) {
  return contacts.filter((person) => {
    if (departmentId && person.department?.id !== departmentId) return false;
    switch (filter) {
      case "stale": return person.touchStatus === "STALE";
      case "unknown": return person.touchStatus === "UNKNOWN";
      case "verification": return needsVerification(person);
      default: return true;
    }
  });
}

export function meetingBrief(initiative: string, asOf: string, days: number, contacts: ContactCoverage[]) {
  const lines = contacts.map((person) => {
    const facts = [];
    if (person.touchStatus === "STALE") facts.push("давно не общались, последний контакт " + formatDate(person.lastTouchAt));
    if (person.touchStatus === "UNKNOWN") facts.push("нет записей");
    if (needsVerification(person)) facts.push("данные ЛПР требуют проверки");
    return person.name + " — " + (facts.join(", ") || "последний контакт " + formatDate(person.lastTouchAt));
  });
  return [initiative, "Данные на " + formatDate(asOf) + " · период " + days + " дн.", "", ...lines].join("\n");
}
