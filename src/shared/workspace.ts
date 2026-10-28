import { exactKeys, record } from "./validation";
import { ids, localId, text } from "./modes";
import type { Result } from "./contracts";

export type GoogleService = "calendar" | "contacts";
export interface GoogleConnection {
  service: GoogleService;
  state: "disconnected" | "connecting" | "connected" | "error";
  subject: string | null;
  email: string | null;
  message: string;
  configured: boolean;
}
export interface CalendarInfo {
  id: string;
  name: string;
  timeZone: string;
  primary: boolean;
}
export interface CalendarEvent {
  id: string;
  googleId: string;
  calendarId: string;
  subject: string;
  title: string;
  description: string;
  startAt: number;
  endAt: number;
  startDate: string | null;
  endDate: string | null;
  timeZone: string;
  allDay: boolean;
  location: string;
  url: string | null;
  platform: string | null;
  attendees: { email: string; name: string; response: string }[];
  recurringId: string | null;
  originalStart: string | null;
  updated: string;
  fetchedAt: number;
  status: "confirmed" | "tentative";
}
export interface PersonFacts {
  name: string;
  email: string;
  emailVerified: boolean;
  organisation: string;
  jobTitle: string;
}
export interface ImportedContact extends PersonFacts {
  resourceName: string;
  subject: string;
  retrievedAt: number;
  updated: string;
}
export interface Person {
  id: string;
  manual: PersonFacts;
  imported: ImportedContact | null;
  notes: string;
  meetingIds: string[];
  updatedAt: number;
}
export function personName(person: Person): string {
  return (
    person.manual.name ||
    person.imported?.name ||
    person.manual.email ||
    person.imported?.email ||
    "Unnamed local contact"
  );
}
export function personEmail(person: Person): string {
  return person.manual.email || person.imported?.email || "";
}
export function verifiedPersonEmail(person: Person): string | null {
  return person.manual.email
    ? person.manual.emailVerified
      ? person.manual.email.toLowerCase()
      : null
    : person.imported?.emailVerified
      ? person.imported.email.toLowerCase()
      : null;
}
export const EMPTY_FACTS: PersonFacts = {
  name: "",
  email: "",
  emailVerified: false,
  organisation: "",
  jobTitle: "",
};
export function parsePerson(value: unknown): Person {
  const input = record(value);
  exactKeys(input, ["id", "manual", "notes", "meetingIds", "updatedAt"]);
  const facts = record(input.manual);
  exactKeys(facts, Object.keys(EMPTY_FACTS));
  const email = text(facts.email, 254, "Email");
  if (
    (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) ||
    typeof facts.emailVerified !== "boolean"
  )
    throw new Error("Enter an email and explicit verification choice.");
  const meetingIds = ids(input.meetingIds);
  if (meetingIds.length > 25)
    throw new Error("Associate at most 25 saved meetings with one person.");
  return {
    id: localId(input.id),
    manual: {
      name: text(facts.name, 160, "Name"),
      email,
      emailVerified: facts.emailVerified,
      organisation: text(facts.organisation, 200, "Organisation"),
      jobTitle: text(facts.jobTitle, 160, "Job title"),
    },
    imported: null,
    notes: text(input.notes, 4000, "Contact notes"),
    meetingIds,
    updatedAt: Date.now(),
  };
}
export type MemoryType =
  | "decision"
  | "commitment"
  | "action"
  | "topic"
  | "project"
  | "follow-up"
  | "note";
export interface MemoryRecord {
  id: string;
  type: MemoryType;
  description: string;
  quote: string;
  ref: string;
  source: {
    kind: "meeting" | "document" | "user";
    id: string;
    revision: number;
    sectionId?: string;
    title: string;
  };
  createdAt: number;
  updatedAt: number;
  lastVerifiedAt: number;
  personIds: string[];
  topics: string[];
  status: "open" | "done";
  review: "pending" | "approved";
  authorship: "extracted" | "user";
}
export interface MeetingAssociation {
  id: string;
  eventId: string;
  recurringId: string | null;
  meetingId: string;
  subject: string;
  createdAt: number;
}
export interface WorkspaceConfig {
  version: 1;
  calendarClientId: string;
  contactsClientId: string;
  selectedCalendarIds: string[];
  reminderMinutes: 0 | 5 | 10 | 15 | 30;
  notificationTitles: boolean;
  autoSync: boolean;
  restoreOnStartup: boolean;
  memoryEnabled: boolean;
  memoryRetentionDays: 30 | 90 | 365 | null;
  excludedMeetingIds: string[];
  excludedPersonIds: string[];
  briefPersistence: boolean;
  briefRetentionDays: 7 | 30 | 90;
}
export function defaultWorkspaceConfig(): WorkspaceConfig {
  return {
    version: 1,
    calendarClientId: "",
    contactsClientId: "",
    selectedCalendarIds: [],
    reminderMinutes: 0,
    notificationTitles: false,
    autoSync: false,
    restoreOnStartup: false,
    memoryEnabled: false,
    memoryRetentionDays: 90,
    excludedMeetingIds: [],
    excludedPersonIds: [],
    briefPersistence: false,
    briefRetentionDays: 7,
  };
}
export function parseWorkspaceConfig(value: unknown): WorkspaceConfig {
  const input = record(value);
  exactKeys(input, Object.keys(defaultWorkspaceConfig()));
  if (
    input.version !== 1 ||
    ![0, 5, 10, 15, 30].includes(input.reminderMinutes as number) ||
    ![30, 90, 365, null].includes(input.memoryRetentionDays as number | null) ||
    ![7, 30, 90].includes(input.briefRetentionDays as number)
  )
    throw new Error("Choose valid reminder and retention settings.");
  for (const field of [
    "notificationTitles",
    "autoSync",
    "restoreOnStartup",
    "memoryEnabled",
    "briefPersistence",
  ])
    if (typeof input[field] !== "boolean")
      throw new Error("Choose each privacy preference explicitly.");
  for (const field of ["calendarClientId", "contactsClientId"])
    if (
      typeof input[field] !== "string" ||
      ((input[field] as string) &&
        !/^[A-Za-z0-9_-]{5,180}\.apps\.googleusercontent\.com$/.test(
          input[field] as string,
        ))
    )
      throw new Error(
        "Configure an actual Google Desktop OAuth client ID, or leave it empty.",
      );
  if (
    !Array.isArray(input.selectedCalendarIds) ||
    input.selectedCalendarIds.length > 5 ||
    input.selectedCalendarIds.some(
      (id) =>
        typeof id !== "string" || !id || id.length > 256 || id.includes("\0"),
    )
  )
    throw new Error("Select at most five authorised calendars.");
  return {
    ...input,
    selectedCalendarIds: [...new Set(input.selectedCalendarIds as string[])],
    excludedMeetingIds: ids(input.excludedMeetingIds),
    excludedPersonIds: ids(input.excludedPersonIds),
  } as unknown as WorkspaceConfig;
}
export interface WorkspaceSelection {
  purpose: "answer" | "brief" | "live";
  eventId: string | null;
  description: boolean;
  personIds: string[];
  memoryIds: string[];
  meetingIds: string[];
}
export function parseWorkspaceSelection(value: unknown): WorkspaceSelection {
  const input = record(value);
  exactKeys(input, [
    "purpose",
    "eventId",
    "description",
    "personIds",
    "memoryIds",
    "meetingIds",
  ]);
  if (
    !["answer", "brief", "live"].includes(input.purpose as string) ||
    typeof input.description !== "boolean"
  )
    throw new Error("Choose bounded workspace context categories.");
  const personIds = ids(input.personIds),
    memoryIds = ids(input.memoryIds),
    meetingIds = ids(input.meetingIds);
  if (personIds.length > 5 || memoryIds.length > 8 || meetingIds.length > 3)
    throw new Error(
      "Select at most 5 people, 8 memories and 3 saved meetings.",
    );
  return {
    purpose: input.purpose as WorkspaceSelection["purpose"],
    eventId: input.eventId === null ? null : localId(input.eventId),
    description: input.description,
    personIds,
    memoryIds,
    meetingIds,
  };
}
export interface WorkspaceExcerpt {
  ref: string;
  kind: "event" | "person" | "memory" | "meeting";
  id: string;
  title: string;
  text: string;
  sourceRef: string | null;
  updatedAt: number;
}
export interface WorkspaceAIContext {
  purpose: WorkspaceSelection["purpose"];
  entries: WorkspaceExcerpt[];
  notices: string[];
}
export interface SavedBrief {
  id: string;
  eventId: string;
  text: string;
  context: WorkspaceAIContext;
  knowledge?: import("./knowledge").KnowledgeExcerpt[];
  model: string | null;
  modeName: string;
  createdAt: number;
}
export interface WorkspaceState {
  revision: number;
  scopeId: string;
  unlocked: boolean;
  busy: boolean;
  status: string;
  error: string | null;
  config: WorkspaceConfig;
  google: Record<GoogleService, GoogleConnection>;
  calendars: CalendarInfo[];
  eventCount: number;
  peopleCount: number;
  memoryCount: number;
  preparedEventIds: string[];
  lastSyncAt: number | null;
  nextSyncAt: number | null;
  lastSyncRequests: number;
  contactsAllSync: boolean;
  suggestion: { eventId: string; title: string; startAt: number } | null;
}
export type WorkspaceKind =
  | "settings"
  | "calendar"
  | "event"
  | "person"
  | "memory"
  | "association"
  | "brief"
  | "receipt"
  | "sync";
export const WORKSPACE_KINDS: WorkspaceKind[] = [
  "settings",
  "calendar",
  "event",
  "person",
  "memory",
  "association",
  "brief",
  "receipt",
  "sync",
];
export interface WorkspaceRow {
  kind: WorkspaceKind;
  id: string;
  updatedAt: number;
  expiresAt: number | null;
  value: unknown;
}
export interface WorkspaceQuery {
  kind: "event" | "person" | "memory" | "brief";
  query: string;
  offset: number;
  personId?: string;
  meetingId?: string;
  fromDate?: string;
  toDate?: string;
  timeZone?: string;
  calendarId?: string;
}
export interface WorkspaceBridge {
  get(): Promise<Result<WorkspaceState>>;
  onState(listener: (state: WorkspaceState) => void): () => void;
  command(input: {
    scopeId: string;
    command: string;
    value?: unknown;
  }): Promise<Result<unknown>>;
  query(input: {
    scopeId: string;
    query: WorkspaceQuery;
  }): Promise<
    Result<{ items: unknown[]; nextOffset: number | null; scanned: number }>
  >;
  onNavigate(listener: (eventId: string) => void): () => void;
}
