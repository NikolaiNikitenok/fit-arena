// Кружок игрока: первая буква имени на цветном фоне (цвет — от имени, всегда один и тот же), у Pro — золотое кольцо.
const HUES = [18, 42, 160, 195, 222, 262, 300, 340];

export function Avatar({ name, pro, size = 40 }: { name: string; pro?: boolean; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  const hue = HUES[h % HUES.length];
  const letter = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span
      className={`avatar ${pro ? 'pro' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.44, ['--av' as string]: `hsl(${hue} 70% 62%)`, ['--av2' as string]: `hsl(${(hue + 28) % 360} 65% 45%)` }}
      aria-hidden
    >
      {letter}
    </span>
  );
}
