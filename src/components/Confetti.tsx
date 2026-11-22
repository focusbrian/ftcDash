const PIECE_COUNT = 26;

const PALETTES: Record<string, string[]> = {
  red: ['#ff5d6c', '#ff6200', '#ffd166', '#ffffff', '#ffb3b9'],
  blue: ['#4da3ff', '#7ee0ff', '#ffd166', '#ffffff', '#b9d4f2'],
  solo: ['#ff6200', '#ffd166', '#ffffff', '#d7dde3'],
};

/** Deterministic pseudo-random in [0, 1) so pieces keep their place across re-renders. */
function noise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

interface Props {
  tone: string;
}

/** Falling confetti, rendered inside the card and clipped to it. */
export function Confetti({ tone }: Props) {
  const palette = PALETTES[tone] ?? PALETTES.solo!;

  return (
    <div className="alliance__confetti" aria-hidden="true">
      {Array.from({ length: PIECE_COUNT }, (_, index) => {
        const left = noise(index, 1) * 100;
        const delay = noise(index, 2) * 3;
        const duration = 2.8 + noise(index, 3) * 2.4;
        const drift = (noise(index, 4) - 0.5) * 110;
        const spin = 220 + noise(index, 5) * 700;
        const width = 4 + noise(index, 6) * 6;
        const color = palette[index % palette.length];

        return (
          <span
            key={index}
            className="confetti__piece"
            style={{
              left: `${left}%`,
              width: `${width}px`,
              height: `${width * 1.7}px`,
              background: color,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              ['--confetti-drift' as string]: `${drift}px`,
              ['--confetti-spin' as string]: `${spin}deg`,
            }}
          />
        );
      })}
    </div>
  );
}
