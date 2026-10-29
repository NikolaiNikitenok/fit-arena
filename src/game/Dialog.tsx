import { useEffect, useState } from 'react';
import type { Line } from './levels';
import { portraitUrl } from './npcs';
import { t } from '../i18n';

export const Portrait = ({ line, size = 64 }: { line: Pick<Line, 'face' | 'color' | 'who'>; size?: number }) => (
  <div className="portrait" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 35%, ${line.color}, #1b1d26 75%)`, borderColor: line.color }}>
    <img src={portraitUrl(line.face)} alt={line.who} draggable={false} />
  </div>
);

/** Разговор с NPC: портрет, имя и текст, который печатается по буквам. Тап дописывает строку или листает дальше. */
export function Dialog({ lines, onDone }: { lines: Line[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(0);
  const line = lines[i];
  const full = shown >= line.text.length;

  useEffect(() => {
    setShown(0);
    const tm = setInterval(() => setShown((n) => (n >= lines[i].text.length ? (clearInterval(tm), n) : n + 2)), 30);
    return () => clearInterval(tm);
  }, [i, lines]);

  const next = () => {
    if (!full) return setShown(line.text.length);
    if (i + 1 < lines.length) setI(i + 1);
    else onDone();
  };

  return (
    <div className="dialog" onClick={next}>
      <Portrait line={line} />
      <div className="dialog-body">
        <div className="dialog-who" style={{ color: line.color }}>
          {line.who}
        </div>
        <div className="dialog-text">{line.text.slice(0, shown)}</div>
        <div className="dialog-next">
          {full ? (i + 1 < lines.length ? t('дальше ›') : t('понятно ›')) : ''}
          {lines.length > 1 && <span className="dialog-count">{i + 1}/{lines.length}</span>}
        </div>
      </div>
    </div>
  );
}

/** Одна реплика без листания — для экрана победы или поражения. */
export const Remark = ({ line }: { line: Line }) => (
  <div className="remark">
    <Portrait line={line} size={44} />
    <div>
      <div className="dialog-who" style={{ color: line.color }}>
        {line.who}
      </div>
      <div className="remark-text">{line.text}</div>
    </div>
  </div>
);
