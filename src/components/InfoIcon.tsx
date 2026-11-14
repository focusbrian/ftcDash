interface Props {
  size?: number;
}

/** The circled "i" shared by the event info button and the ranking rows. */
export function InfoIcon({ size = 16 }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18.2a8.2 8.2 0 1 1 0-16.4 8.2 8.2 0 0 1 0 16.4ZM11 10.6h2v6.1h-2v-6.1Zm0-3.6h2v2.1h-2V7Z"
      />
    </svg>
  );
}
