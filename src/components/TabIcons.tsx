interface Props {
  size?: number;
}

/** Small glyphs for the Matches / Ranking / Predict tabs. Size is in px; colour comes from the text. */
export function ScheduleIcon({ size = 14 }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        d="M4 7h16M4 12h16M4 17h10"
      />
    </svg>
  );
}

export function RankingIcon({ size = 14 }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M4 13h4v7H4v-7Zm6-5h4v12h-4V8Zm6-4h4v16h-4V4Z"
      />
    </svg>
  );
}

export function PredictIcon({ size = 14 }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 17.5 9.5 12l3.5 3.5L20 8"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 8h5v5"
      />
    </svg>
  );
}
