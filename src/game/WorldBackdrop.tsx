import type { World } from './lands';

// Фон за героем на главной: мир, в котором игрок сейчас сражается. Приглушённый, чтобы герой оставался главным:
// небо, дальний план силуэтами и тёмная виньетка внизу, где стоит постамент.

// Звёзды одни и те же при каждой отрисовке: без мерцания при обновлении главной.
const stars = (n: number, seed: number, maxY: number) =>
  Array.from({ length: n }, (_, i) => {
    const r = (k: number) => (((Math.sin(seed * 97.1 + i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;
    return <circle key={i} cx={r(1) * 400} cy={r(2) * maxY} r={0.5 + r(3) * 1.2} fill="#fff" opacity={0.25 + r(4) * 0.6} />;
  });

function Fantasy() {
  return (
    <>
      <defs>
        <linearGradient id="wb-f-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262b5c" />
          <stop offset=".55" stopColor="#7a4f86" />
          <stop offset="1" stopColor="#e8916a" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#wb-f-sky)" />
      {stars(26, 1, 110)}
      <circle cx="300" cy="190" r="34" fill="#ffd27a" opacity=".55" />
      <path d="M0 220 Q60 180 130 205 T260 196 T400 210 V300 H0Z" fill="#3b3560" opacity=".9" />
      {/* Замок на холме. */}
      <path d="M70 200 v-34 h8 v-8 h6 v8 h8 v-20 h6 v-10 l7 -10 l7 10 v10 h6 v20 h8 v-8 h6 v8 h8 v34z" fill="#2c2850" />
      <path d="M0 250 Q90 222 190 240 T400 236 V300 H0Z" fill="#231f40" />
      {[300, 322, 346, 368].map((x, i) => (
        <path key={x} d={`M${x} ${246 - (i % 2) * 6} l12 -34 l12 34z`} fill="#1b1833" />
      ))}
    </>
  );
}

function Space() {
  return (
    <>
      <defs>
        <radialGradient id="wb-s-neb" cx=".3" cy=".35" r=".6">
          <stop offset="0" stopColor="#7c4dff" stopOpacity=".55" />
          <stop offset="1" stopColor="#7c4dff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="wb-s-planet" cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#1e3a8a" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill="#0b0b22" />
      <rect width="400" height="300" fill="url(#wb-s-neb)" />
      <ellipse cx="320" cy="80" rx="120" ry="60" fill="#ff4fa3" opacity=".12" />
      {stars(70, 2, 300)}
      <circle cx="315" cy="95" r="34" fill="url(#wb-s-planet)" />
      <ellipse cx="315" cy="95" rx="58" ry="12" fill="none" stroke="#bfe9ff" strokeOpacity=".55" strokeWidth="3" transform="rotate(-18 315 95)" />
      <path d="M0 260 Q100 236 200 252 T400 248 V300 H0Z" fill="#1a1838" />
    </>
  );
}

function Zombie() {
  return (
    <>
      <defs>
        <linearGradient id="wb-z-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1a14" />
          <stop offset="1" stopColor="#2f4a26" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#wb-z-sky)" />
      {stars(16, 3, 90)}
      <circle cx="90" cy="70" r="26" fill="#d9f99d" opacity=".55" />
      {/* Город: дома разной высоты, у некоторых обломан край. */}
      <path d="M0 230 V170 h30 v-20 h26 v50 h18 v-60 l12 8 v52 h22 v-30 h30 v20 h20 v-70 h28 v40 l10 -6 v36 h26 v-44 h24 v30 h22 v-56 h30 v76 h20 v-20 h22 V230Z" fill="#162414" />
      <rect width="400" height="300" fill="#aeea00" opacity=".07" />
      <path d="M0 240 Q120 214 220 236 T400 228 V300 H0Z" fill="#9ccc65" opacity=".16" />
      <path d="M0 262 Q110 246 210 258 T400 254 V300 H0Z" fill="#0d160c" />
    </>
  );
}

function Castle() {
  return (
    <>
      <defs>
        <linearGradient id="wb-c-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a0f24" />
          <stop offset=".6" stopColor="#5a1a3a" />
          <stop offset="1" stopColor="#a8323e" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#wb-c-sky)" />
      {stars(18, 4, 100)}
      <path d="M262 20 l-14 40 h10 l-12 36 l26 -46 h-11 l12 -30z" fill="#ffd27a" opacity=".55" />
      {/* Замок Князя Дивана: высокие башни с флагами. */}
      <path d="M120 236 V150 l14 -22 l14 22 v20 h20 v-50 l18 -30 l18 30 v50 h20 v-20 l14 -22 l14 22 v86z" fill="#22101f" />
      <path d="M186 90 v-14 l14 5 l-14 5" fill="#ff6b81" opacity=".8" />
      <path d="M0 250 Q100 226 200 244 T400 238 V300 H0Z" fill="#170a16" />
    </>
  );
}

export function WorldBackdrop({ world }: { world: World }) {
  return (
    <svg className="world-backdrop" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {world === 'space' ? <Space /> : world === 'zombie' ? <Zombie /> : world === 'castle' ? <Castle /> : <Fantasy />}
    </svg>
  );
}
