// Как повёрнут телефон. Для отжиманий телефон часто кладут боком, а интерфейс остаётся вертикальным:
// тогда в кадре человек тоже повёрнут, и «низ» в картинке — это не пол. Узнаём это по акселерометру.
import { tg } from './telegram';

let gx = 0;
let gy = 0;
let listening = false;

interface TgAccelerometer {
  isStarted: boolean;
  x: number;
  y: number;
  start(params: { refresh_rate?: number }): void;
}

const tgAccel = (): TgAccelerometer | undefined => (tg as unknown as { Accelerometer?: TgAccelerometer } | undefined)?.Accelerometer;

/** Включить датчик. Вызывать прямо из нажатия кнопки: на iPhone браузер спрашивает разрешение. */
export function enableOrientation(): void {
  const accel = tgAccel();
  try {
    if (accel && !accel.isStarted) accel.start({ refresh_rate: 200 });
  } catch {
    // Старый Telegram без датчиков.
  }
  if (listening) return;
  listening = true;
  const listen = () =>
    window.addEventListener('devicemotion', (e) => {
      const g = e.accelerationIncludingGravity;
      if (g?.x != null && g?.y != null) {
        gx = g.x;
        gy = g.y;
      }
    });
  const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (DM?.requestPermission) DM.requestPermission().then((r) => r === 'granted' && listen()).catch(() => {});
  else listen();
}

/** Повороты кадра (в градусах), которые стоит проверить при распознавании позы. */
export function frameRotations(): number[] {
  // Интерфейс повернулся вместе с телефоном — кадр уже стоит прямо.
  const screenAngle = screen.orientation?.angle ?? 0;
  if (screenAngle % 180 !== 0) return [0];
  const accel = tgAccel();
  const x = accel?.isStarted && (accel.x || accel.y) ? accel.x : gx;
  const y = accel?.isStarted && (accel.x || accel.y) ? accel.y : gy;
  // Телефон лежит на боку. В какую сторону — у разных платформ знак разный, поэтому пробуем обе.
  if (Math.abs(x) > 4 && Math.abs(x) > Math.abs(y) * 1.3) return [90, 270];
  return [0];
}
