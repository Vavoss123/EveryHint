export const DESTINATIONS = [
  {
    id: "home",
    label: "Home",
    glyph: "home",
    milestone: "P5",
    description: "Your current session and connections.",
  },
  {
    id: "assistant",
    label: "Assistant",
    glyph: "spark",
    milestone: "P4–P6",
    description: "Reviewed questions, selected context and local transcripts.",
  },
  {
    id: "meetings",
    label: "Meetings",
    glyph: "calendar",
    milestone: "P8",
    description:
      "Meeting notes, searchable history, summaries and follow-up tools.",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    glyph: "book",
    milestone: "P9",
    description:
      "Personal documents and grounded answers with source references.",
  },
  {
    id: "calendar",
    label: "Calendar",
    glyph: "calendar",
    milestone: "P10",
    description: "Connected calendars, upcoming meetings and preparation.",
  },
  {
    id: "people",
    label: "People",
    glyph: "people",
    milestone: "P10",
    description:
      "Permission-based research and context from past conversations.",
  },
  {
    id: "modes",
    label: "Modes",
    glyph: "modes",
    milestone: "P9",
    description: "Custom instructions, output language and note templates.",
  },
  {
    id: "settings",
    label: "Settings",
    glyph: "settings",
    milestone: "P5",
    description: "Appearance, capture preferences and local speech setup.",
  },
] as const;
export type Destination = (typeof DESTINATIONS)[number]["id"];
export const plannedDestination = (id: Destination): boolean =>
  !["home", "assistant", "settings"].includes(id);
