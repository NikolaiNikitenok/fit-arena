import type { ReactNode, RefObject } from 'react';
import { Arena3D } from './arena/Arena3D';
import { ZONES, type ZoneTheme } from './campaign';
import type { FighterView } from '../shared/protocol';

export const PLAYER_COLOR = '#ff5a36';

interface Props {
  me: FighterView;
  opponent: FighterView;
  seconds: number;
  camera: { videoRef: RefObject<HTMLVideoElement | null>; canvasRef: RefObject<HTMLCanvasElement | null>; active: boolean; angle?: number | null };
  overlay?: ReactNode;
  banner?: string | null;
  theme?: ZoneTheme;
  opponentColor?: string;
  opponentScale?: number;
  enraged?: boolean;
}

/** Ринг со шкалами здоровья, таймером и окошком камеры в углу. */
export function ArenaStage({ me, opponent, seconds, camera, overlay, banner, theme = ZONES[0], opponentColor = '#22c55e', opponentScale, enraged }: Props) {
  const over = me.hp === 0 || opponent.hp === 0;
  return (
    <div className="arena">
      <Arena3D
        theme={theme}
        player={{ color: PLAYER_COLOR, punchSeq: me.hits, hitSeq: opponent.hits, combo: me.combo, knockedOut: me.hp === 0, won: over && opponent.hp === 0 }}
        opponent={{
          color: opponentColor,
          punchSeq: opponent.hits,
          hitSeq: me.hits,
          combo: opponent.combo,
          knockedOut: opponent.hp === 0,
          won: over && me.hp === 0,
          scale: opponentScale,
          enraged,
        }}
      />
      <div className="hud">
        <HpBar label={me.name} hp={me.hp} maxHp={me.maxHp} color={PLAYER_COLOR} />
        <div className="timer">{seconds}</div>
        <HpBar label={opponent.name} hp={opponent.hp} maxHp={opponent.maxHp} color={opponentColor} right />
      </div>
      {me.combo && camera.active && (
        <div key={me.hits} className="combo">
          КОМБО!
        </div>
      )}
      {banner && (
        <div key={banner} className="combo banner">
          {banner}
        </div>
      )}
      {overlay && <div className="result">{overlay}</div>}
      <div className={`pip ${camera.active ? '' : 'hidden'}`}>
        <video ref={camera.videoRef} playsInline muted />
        <canvas ref={camera.canvasRef} />
        <div className="pip-count">{me.hits}</div>
        {camera.angle != null && <div className="pip-angle">{camera.angle}°</div>}
      </div>
    </div>
  );
}

function HpBar({ label, hp, maxHp, color, right }: { label: string; hp: number; maxHp: number; color: string; right?: boolean }) {
  return (
    <div className={`hp ${right ? 'right' : ''}`}>
      <div className="hp-label">{label}</div>
      <div className="hp-track">
        <div className="hp-fill" style={{ width: `${(hp / maxHp) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
