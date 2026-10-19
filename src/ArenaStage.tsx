import type { ReactNode, RefObject } from 'react';
import { Arena3D } from './arena/Arena3D';
import { MAX_HP } from '../shared/battle';
import type { FighterView } from '../shared/protocol';

interface Props {
  me: FighterView;
  opponent: FighterView;
  seconds: number;
  camera: { videoRef: RefObject<HTMLVideoElement | null>; canvasRef: RefObject<HTMLCanvasElement | null>; active: boolean };
  overlay?: ReactNode;
}

/** Ринг со шкалами здоровья, таймером и окошком камеры в углу. */
export function ArenaStage({ me, opponent, seconds, camera, overlay }: Props) {
  return (
    <div className="arena">
      <Arena3D
        playerPunch={me.hits}
        botPunch={opponent.hits}
        playerCombo={me.combo}
        botCombo={opponent.combo}
        playerKO={me.hp === 0}
        botKO={opponent.hp === 0}
      />
      <div className="hud">
        <HpBar label={me.name} hp={me.hp} color="#ff5a36" />
        <div className="timer">{seconds}</div>
        <HpBar label={opponent.name} hp={opponent.hp} color="#22c55e" right />
      </div>
      {me.combo && camera.active && (
        <div key={me.hits} className="combo">
          КОМБО!
        </div>
      )}
      {overlay && <div className="result">{overlay}</div>}
      <div className={`pip ${camera.active ? '' : 'hidden'}`}>
        <video ref={camera.videoRef} playsInline muted />
        <canvas ref={camera.canvasRef} />
        <div className="pip-count">{me.hits}</div>
      </div>
    </div>
  );
}

function HpBar({ label, hp, color, right }: { label: string; hp: number; color: string; right?: boolean }) {
  return (
    <div className={`hp ${right ? 'right' : ''}`}>
      <div className="hp-label">{label}</div>
      <div className="hp-track">
        <div className="hp-fill" style={{ width: `${(hp / MAX_HP) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
