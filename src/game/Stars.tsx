/** Звёзды за уровень: от одной до трёх. */
export const Stars = ({ n }: { n: number }) => (
  <span className="stars">
    {[1, 2, 3].map((i) => (
      <span key={i} className={i <= n ? 'on' : ''}>
        ★
      </span>
    ))}
  </span>
);
