import { type ReactNode, type RefObject, useMemo } from 'react';
import { Arena3D, botLook, rivalLook } from './arena/Arena3D';
import { itemById } from './game/items';
import { heroHands } from './game/power';
import { loadProgress } from './game/progress';
import type { CharName } from './three/kit';
import type { FighterView } from '../shared/protocol';
import { t } from './i18n';

export const PLAYER_COLOR = '#ff5a36';

interface Props {
  me: FighterView;
  opponent: FighterView;
  seconds: number;
  camera: { videoRef: RefObject<HTMLVideoElement | null>; canvasRef: RefObject<HTMLCanvasElement | null>; active: boolean; angle?: number | null };
  overlay?: ReactNode;
  banner?: string | null;
  opponentColor?: string;
  opponentScale?: number;
  enraged?: boolean;
  // Уровень бота (0 — новичок): выбирает, кто выйдет на арену. Без него соперник — другой игрок.
  botLevel?: number;
  // Свой облик соперника вместо выбранного по уровню или имени.
  opponentLook?: { model: CharName; tint?: string; glow?: string };
  // Итог боя по времени: победитель радуется, проигравший садится без сил.
  result?: 'win' | 'lose' | 'draw' | null;
  // Поверх сцены, под итогом: например, реплика тренера перед боем.
  children?: ReactNode;
}

/** Арена со шкалами здоровья, таймером и окошком камеры в углу. */
export function ArenaStage({ me, opponent, seconds, camera, overlay, banner, opponentColor = '#22c55e', opponentScale, enraged, botLevel, opponentLook, result, children }: Props) {
  const over = me.hp === 0 || opponent.hp === 0;
  // Герой выглядит так же, как в приключении: костюм, оттенок, свечение и оружие.
  const hero = useMemo(() => {
    const progress = loadProgress();
    const item = itemById(progress.equipped);
    return { model: item.hero, tint: item.tint, glow: item.glow, hands: heroHands(progress) };
  }, []);
  const rival = opponentLook ?? (botLevel != null ? botLook(botLevel) : rivalLook(opponent.name, hero.model));
  const won = result === 'win' || (over && opponent.hp === 0);
  const lost = result === 'lose' || (over && me.hp === 0);
  return (
    <div className="arena">
      <Arena3D
        player={{ ...hero, punchSeq: me.hits, hitSeq: opponent.hits, combo: me.combo, knockedOut: me.hp === 0, won, lost: lost && me.hp > 0 }}
        opponent={{ ...rival, punchSeq: opponent.hits, hitSeq: me.hits, combo: opponent.combo, knockedOut: opponent.hp === 0, won: lost, lost: won && opponent.hp > 0, scale: opponentScale, enraged }}
      />
      <div className="hud">
        <HpBar label={me.name} hp={me.hp} maxHp={me.maxHp} color={PLAYER_COLOR} pro={me.pro} />
        <div className="timer">{seconds}</div>
        <HpBar label={opponent.name} hp={opponent.hp} maxHp={opponent.maxHp} color={opponentColor} right pro={opponent.pro} />
      </div>
      {me.combo && camera.active && (
        <div key={me.hits} className="combo">
          {t('КОМБО!')}
        </div>
      )}
      {banner && (
        <div key={banner} className="combo banner">
          {banner}
        </div>
      )}
      {overlay && <div className="result">{overlay}</div>}
      {children}
      <div className={`pip ${camera.active ? '' : 'hidden'}`}>
        <video ref={camera.videoRef} playsInline muted />
        <canvas ref={camera.canvasRef} />
        <div className="pip-count">{me.hits}</div>
        {camera.angle != null && <div className="pip-angle">{camera.angle}°</div>}
      </div>
    </div>
  );
}

function HpBar({ label, hp, maxHp, color, right, pro }: { label: string; hp: number; maxHp: number; color: string; right?: boolean; pro?: boolean }) {
  return (
    <div className={`hp ${right ? 'right' : ''}`}>
      <div className="hp-label">
        <span className={pro ? 'pro-name' : ''}>{label}</span>
      </div>
      <div className="hp-track">
        <div className="hp-fill" style={{ width: `${(hp / maxHp) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
