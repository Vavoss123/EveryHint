const paths = {
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z",
  close: "m6 6 12 12M6 18 18 6",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  spark: "m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z",
  screen: "M4 4h16v12H4V4Zm4 16h8m-4-4v4",
  back: "m14 5-7 7 7 7",
  compact: "M3 5h18v14H3V5Zm0 5h18",
  home: "m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z",
  dashboard: "M3 3h7v8H3V3Zm11 0h7v5h-7V3ZM3 15h7v6H3v-6Zm11-3h7v9h-7v-9Z",
  calendar: "M4 5h16v16H4V5Zm0 5h16M8 3v4m8-4v4",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 1-2-1H3V4Zm9 2v15",
  people:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m7-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 4a4 4 0 0 1 3 4v3M16 3a4 4 0 0 1 0 8",
  modes: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  lock: "M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2",
};
export type IconName = keyof typeof paths;
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
