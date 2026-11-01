// «Позови троих — легендарный облик»: одна заметная награда за приглашение, и показываем её сразу после
// яркой победы (три звезды или босс), когда игрок доволен. Не чаще раза в день, пока облик не получен.
import { useState } from 'react';
import { friendsApi } from './api';
import { OutfitFace } from '../game/EventScreen';
import { itemById } from '../game/items';
import { REF_LEADER_AT, refCount } from '../game/referral';
import type { Progress } from '../game/progress';
import { isUnlocked } from '../game/unlocks';
import { friendInviteLink, platform, share } from '../telegram';
import { track } from '../telemetry';
import { t } from '../i18n';
import '../group/group.css';

const KEY = 'fit-arena-invite-offer';
const LEADER = 'ref-leader';

/** Показывать ли предложение после этой победы. */
export function inviteOfferDue(p: Progress, stars: number, boss: boolean, today: string): boolean {
  if (platform !== 'tg' || p.items.includes(LEADER) || refCount(p) >= REF_LEADER_AT) return false;
  // Друзья и дуэли открываются с 5-го уровня карты: раньше новичку не до приглашений.
  if (!isUnlocked(p, 'duel')) return false;
  if (stars < 3 && !boss) return false;
  try {
    return localStorage.getItem(KEY) !== today;
  } catch {
    return false;
  }
}

export function InviteOffer({ progress, today }: { progress: Progress; today: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'shared' | 'copied' | 'error'>('idle');
  // Отмечаем показ сразу: до завтра это предложение больше не всплывёт.
  useState(() => {
    try {
      localStorage.setItem(KEY, today);
    } catch {
      // Без хранилища покажем ещё раз — не страшно.
    }
    track('invite_card', 'show');
  });
  const count = Math.min(refCount(progress), REF_LEADER_AT);
  const invite = async () => {
    setState('busy');
    track('invite_card', 'tap');
    try {
      const r = await friendsApi.state();
      const how = await share(friendInviteLink(r.invite, r.bot), t('Давай тренироваться вместе в NikitenokArena: камера считает отжимания, а каждый повтор бьёт врага. Проведи первый бой — получишь облик «Побратим»!'));
      setState(how);
    } catch {
      setState('error');
    }
  };
  return (
    <div className="invite-offer">
      <OutfitFace id={LEADER} size={52} />
      <div className="invite-offer-text">
        <b>{t('Позови {0} друзей — облик «{1}»', { 0: REF_LEADER_AT, 1: itemById(LEADER).name })}</b>
        <small>{t('Легендарный, +25% монет. Друг засчитывается, когда проведёт первый бой. Уже {0} из {1}.', { 0: count, 1: REF_LEADER_AT })}</small>
        <button className="secondary" disabled={state === 'busy'} onClick={invite}>
          {state === 'copied' ? t('Ссылка скопирована') : state === 'error' ? t('Нет связи с сервером. Попробуй ещё раз') : t('Позвать друга')}
        </button>
      </div>
    </div>
  );
}
