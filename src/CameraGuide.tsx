import type { Exercise } from './repCounter';

// Схема «как встать к камере»: вид сбоку, телефон, поле зрения и человечек, который повторяет упражнение.

type Pose = Record<'head' | 'shoulder' | 'hip' | 'knee' | 'ankle' | 'elbow' | 'hand', [number, number]>;

const FLOOR = 132;

const POSES: Record<Exercise, [Pose, Pose]> = {
  pushup: [
    { head: [192, 84], shoulder: [204, 94], hip: [252, 100], knee: [276, 110], ankle: [300, 124], elbow: [203, 111], hand: [203, 128] },
    { head: [186, 108], shoulder: [200, 114], hip: [250, 116], knee: [275, 120], ankle: [300, 126], elbow: [222, 118], hand: [203, 128] },
  ],
  squat: [
    { head: [222, 34], shoulder: [222, 50], hip: [222, 88], knee: [224, 109], ankle: [222, 128], elbow: [204, 54], hand: [186, 56] },
    { head: [210, 58], shoulder: [214, 72], hip: [240, 102], knee: [210, 106], ankle: [222, 128], elbow: [194, 74], hand: [176, 74] },
  ],
  situp: [
    { head: [292, 120], shoulder: [274, 124], hip: [228, 125], knee: [200, 104], ankle: [172, 127], elbow: [258, 122], hand: [244, 120] },
    { head: [252, 76], shoulder: [244, 92], hip: [228, 125], knee: [200, 104], ankle: [172, 127], elbow: [228, 98], hand: [210, 100] },
  ],
};

const TIPS: Record<Exercise, string[]> = {
  pushup: ['Телефон на полу сбоку, можно положить горизонтально', 'В кадре хотя бы до пояса', 'Опускайся, пока локти не согнутся под прямым углом'],
  squat: ['Телефон сбоку или вполоборота, на уровне пояса', 'В кадре всё тело, от головы до стоп', 'Садись, пока бёдра не станут параллельны полу'],
  situp: ['Ляг боком к камере, колени согнуты', 'Стопы и таз на полу, всё тело в кадре', 'Поднимай корпус до коленей и плавно опускайся'],
};

const DUR = '1.6s';
const pts = (p: Pose, keys: (keyof Pose)[]) => keys.map((k) => p[k].join(',')).join(' ');

function Limb({ a, b, keys, width = 7, color = '#fff' }: { a: Pose; b: Pose; keys: (keyof Pose)[]; width?: number; color?: string }) {
  const from = pts(a, keys);
  const to = pts(b, keys);
  return (
    <polyline points={from} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <animate attributeName="points" values={`${from};${to};${from}`} dur={DUR} repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" />
    </polyline>
  );
}

export function CameraGuide({ exercise, compact }: { exercise: Exercise; compact?: boolean }) {
  const [a, b] = POSES[exercise];
  const lying = exercise !== 'squat';
  // Телефон: лёжа на боку для отжиманий и пресса, стоя для приседаний.
  const phone = lying ? { x: 26, y: FLOOR - 16, w: 30, h: 16 } : { x: 34, y: FLOOR - 52, w: 16, h: 30 };
  const lens: [number, number] = lying ? [phone.x + phone.w - 5, phone.y + 8] : [phone.x + phone.w - 4, phone.y + 6];
  const top = exercise === 'squat' ? 22 : exercise === 'situp' ? 62 : 70;
  return (
    <div className={`guide ${compact ? 'compact' : ''}`}>
      <svg viewBox="0 0 330 152" role="img" aria-label="Как встать относительно камеры">
        <polygon points={`${lens.join(',')} 318,${top} 318,${FLOOR}`} fill="rgba(255,209,102,.13)" stroke="rgba(255,209,102,.45)" strokeDasharray="4 4" />
        <line x1="10" y1={FLOOR} x2="322" y2={FLOOR} stroke="rgba(255,255,255,.35)" strokeWidth="2" />
        <rect x={phone.x} y={phone.y} width={phone.w} height={phone.h} rx="3.5" fill="#2b3040" stroke="#ffd166" strokeWidth="2" />
        <circle cx={lens[0]} cy={lens[1]} r="2.6" fill="#ffd166" />
        <ellipse cx={(a.hip[0] + a.ankle[0]) / 2} cy={FLOOR + 1} rx={lying ? 70 : 26} ry="4" fill="rgba(0,0,0,.35)" />
        <Limb a={a} b={b} keys={['shoulder', 'hip']} width={11} />
        <Limb a={a} b={b} keys={['hip', 'knee', 'ankle']} width={8} />
        <Limb a={a} b={b} keys={['shoulder', 'elbow', 'hand']} width={6} color="#ffe0b2" />
        <circle r="9" fill="#ff7043" stroke="#fff" strokeWidth="2.5">
          <animate attributeName="cx" values={`${a.head[0]};${b.head[0]};${a.head[0]}`} dur={DUR} repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" />
          <animate attributeName="cy" values={`${a.head[1]};${b.head[1]};${a.head[1]}`} dur={DUR} repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" />
        </circle>
        <g stroke="rgba(255,255,255,.55)" strokeWidth="1.5">
          <line x1={lens[0] + 4} y1={FLOOR + 6} x2="170" y2={FLOOR + 6} />
          <line x1={lens[0] + 4} y1={FLOOR + 3} x2={lens[0] + 4} y2={FLOOR + 9} />
          <line x1="170" y1={FLOOR + 3} x2="170" y2={FLOOR + 9} />
        </g>
        <text x={(lens[0] + 174) / 2} y={FLOOR + 18} textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffd166">
          1,5–2 м
        </text>
      </svg>
      {!compact && (
        <ul className="guide-tips">
          {TIPS[exercise].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
