// «Подпишись на канал игры — облик «Вестник Арены»»: игрок открывает канал, подписывается и жмёт «Забрать».
// Подписку проверяет бот (он админ канала): POST /api/channel/claim → getChatMember. Только в Telegram.
// Показываем в ленте (пока награда не получена), в настройках и один раз после победы.
import { useState } from 'react';
import { applyProgress } from '../cloud';
import { OutfitFace } from '../game/EventScreen';
import { itemById } from '../game/items';
import { CHANNEL_REWARD, claimChannel, loadProgress } from '../game/progress';
import { openLink, platform } from '../telegram';
import { track } from '../telemetry';
import { t } from '../i18n';
import { socialApi } from './api';
import './social.css';

export const CHANNEL_URL = 'https://t.me/NikitenokArena';
const AFTER_WIN_KEY = 'fit-arena-channel-offer';

/** Предлагать ли: только в Telegram и пока облик не получен. */
export const channelOfferDue = (): boolean => platform === 'tg' && !loadProgress().channelReward;

/** После победы — один раз (и только начиная со второй победы, когда игрок уже понял игру). */
export function channelAfterWinDue(): boolean {
  if (!channelOfferDue() || Object.keys(loadProgress().stars ?? {}).length < 2) return false;
  try {
    return !localStorage.getItem(AFTER_WIN_KEY);
  } catch {
    return false;
  }
}

export function ChannelOffer({ place }: { place: 'feed' | 'settings' | 'win' }) {
  const [state, setState] = useState<'idle' | 'opened' | 'busy' | 'no' | 'error' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  useState(() => {
    track('channel_offer', `${place}:show`);
    if (place === 'win')
      try {
        localStorage.setItem(AFTER_WIN_KEY, '1');
      } catch {
        // Покажем ещё раз — не страшно.
      }
  });
  if (state !== 'done' && !channelOfferDue()) return null;
  const open = () => {
    track('channel_offer', `${place}:open`);
    openLink(CHANNEL_URL);
    setState('opened');
  };
  const claim = async () => {
    setState('busy');
    setError(null);
    try {
      const r = await socialApi.channelClaim();
      if (r.status === 'ok') {
        const next = claimChannel(loadProgress(), Date.now());
        if (next) applyProgress(next);
        track('channel_offer', `${place}:claim`);
        return setState('done');
      }
      if (r.status === 'no') return setState('no');
      setError(r.error ?? null);
      setState('error');
    } catch {
      setState('error');
    }
  };
  const name = itemById(CHANNEL_REWARD.outfit).name;
  if (state === 'done')
    return (
      <div className="channel-offer">
        <OutfitFace id={CHANNEL_REWARD.outfit} size={52} />
        <div className="channel-offer-text">
          <b>{t('Облик «{0}» твой!', { 0: name })}</b>
          <small>{t('И ещё +{0} монет. Спасибо, что с нами — в канале советы, новости игры и челленджи.', { 0: CHANNEL_REWARD.coins })}</small>
        </div>
      </div>
    );
  return (
    <div className="channel-offer">
      <OutfitFace id={CHANNEL_REWARD.outfit} size={52} />
      <div className="channel-offer-text">
        <b>{t('Подпишись на канал игры — облик «{0}»', { 0: name })}</b>
        <small>
          {state === 'no'
            ? t('Пока не видим подписку. Подпишись в канале и нажми «Забрать» ещё раз.')
            : state === 'error'
              ? (error ?? t('Нет связи с сервером. Попробуй ещё раз'))
              : t('Эпический облик и +{0} монет. В канале — советы, новости игры и челленджи.', { 0: CHANNEL_REWARD.coins })}
        </small>
        <div className="channel-offer-btns">
          <button className={state === 'idle' ? 'primary' : 'secondary'} onClick={open}>
            {t('Открыть канал')}
          </button>
          <button className={state === 'idle' ? 'secondary' : 'primary'} disabled={state === 'busy'} onClick={() => void claim()}>
            {state === 'busy' ? t('Проверяем…') : t('Забрать')}
          </button>
        </div>
      </div>
    </div>
  );
}
