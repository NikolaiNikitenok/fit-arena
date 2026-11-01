// Меню игрока: пожаловаться, заблокировать и (для главы и заместителей) модерация чата.
// Открывается по нажатию на сообщение в чате, на участника клана или на друга.
import { type ReactNode, useState } from 'react';
import { REPORT_REASONS, type ReportReason, type ReportWhere } from '../../shared/moderation';
import { moderationApi } from './api';
import { Sheet } from '../Sheet';
import { t } from '../i18n';
import { openProfile } from '../social/bus';

export interface PlayerMenuTarget {
  id: string;
  name: string;
  where: ReportWhere;
  // Сообщение чата, на которое жалуются.
  msg?: { id: number; text: string };
}

export function PlayerMenu({ target, children, onBlocked, onClose }: { target: PlayerMenuTarget; children?: ReactNode; onBlocked?: (id: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<'menu' | 'report' | 'block'>('menu');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const run = (p: Promise<{ error?: string; note?: string }>, done?: () => void) => {
    setBusy(true);
    p.then((r) => {
      setNote(r.error ?? r.note ?? t('Готово'));
      if (!r.error) done?.();
    })
      .catch(() => setNote(t('Нет связи с сервером. Попробуй ещё раз')))
      .finally(() => setBusy(false));
  };
  const report = (reason: ReportReason) => run(moderationApi.report({ id: target.id, reason, where: target.where, msg: target.msg?.id }), () => setStep('menu'));
  const block = () =>
    run(moderationApi.block(target.id, target.name), () => {
      setStep('menu');
      onBlocked?.(target.id);
    });
  return (
    <Sheet onClose={onClose} bodyClassName="player-menu">
      <div className="level-title">{target.name}</div>
      {target.msg && <div className="player-menu-quote">{target.msg.text}</div>}
      {note && <div className="settings-note">{note}</div>}
      {step === 'menu' && (
        <>
          {/* Из клана и друзей — профиль игрока; из самого профиля (id = pid:…) кнопка не нужна. */}
          {!target.id.startsWith('pid:') && (
            <button
              className="secondary"
              onClick={() => {
                onClose();
                openProfile({ id: target.id });
              }}
            >
              {t('Профиль игрока')}
            </button>
          )}
          {children}
          <button className="secondary" disabled={busy} onClick={() => setStep('report')}>
            {t('Пожаловаться')}
          </button>
          <button className="secondary danger-text" disabled={busy} onClick={() => setStep('block')}>
            {t('Заблокировать')}
          </button>
        </>
      )}
      {step === 'report' && (
        <>
          <div className="muted">{t('Что не так? Жалобу увидит модератор, автор не узнает, кто пожаловался.')}</div>
          <div className="report-reasons">
            {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
              <button key={r} className="small-btn ghost" disabled={busy} onClick={() => report(r)}>
                {REPORT_REASONS[r]}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 'block' && (
        <>
          <div className="muted">{t('Его сообщения в чате пропадут для тебя, а позвать тебя в друзья или на дуэль он не сможет. Если вы друзья, дружба удалится. Снять блок можно в настройках, в «Чёрном списке».')}</div>
          <button className="small-btn danger" disabled={busy} onClick={block}>
            {t('Заблокировать {0}', { 0: target.name })}
          </button>
        </>
      )}
      {step !== 'menu' && (
        <button className="link" onClick={() => setStep('menu')}>
          {t('Назад')}
        </button>
      )}
    </Sheet>
  );
}
