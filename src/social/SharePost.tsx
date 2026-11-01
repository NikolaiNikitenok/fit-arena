// «Поделиться постом»: свой или чужой пост — картинкой в сторис Telegram, в чат или файлом.
// На картинке — фото, автор, текст и призыв играть: так посты заодно рекламируют игру.
import { useEffect, useRef, useState } from 'react';
import type { PostView } from '../../shared/social';
import { post as cloudPost } from '../cloud';
import { canShareMessage, blobBase64, shareToChat } from '../shareChat';
import { Sheet } from '../Sheet';
import { t } from '../i18n';
import { platform, tg } from '../telegram';
import { track } from '../telemetry';
import { drawPostStory, postLink, storyJpeg } from './postStory';

export function SharePost({ post, onClose }: { post: PostView; onClose: () => void }) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const uploaded = useRef<string | null>(null);
  const link = postLink(post.id);
  const caption = post.mine ? t('Мой прогресс в NikitenokArena. Тренируйся со мной!') : t('{0} в NikitenokArena. Присоединяйся!', { 0: post.author.name });

  useEffect(() => {
    let url = '';
    drawPostStory(post)
      .then(storyJpeg)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
      })
      .catch(() => setNote(t('Не получилось нарисовать картинку')));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [post.id]);

  const upload = async (): Promise<string> => {
    if (uploaded.current) return uploaded.current;
    const r = (await cloudPost('/api/story-image', { image: await blobBase64(card!.blob) })) as { url: string };
    return (uploaded.current = r.url);
  };
  const run = async (what: string, fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      track('post_share', what);
    } catch {
      setNote(fail);
    } finally {
      setBusy(false);
    }
  };
  const toStory = () => run('story', async () => tg!.shareToStory!(await upload(), { text: caption.slice(0, 200), widget_link: { url: link, name: t('Играть') } }), t('Не получилось открыть сторис. Попробуй «Сохранить картинку».'));
  const toChat = () => run('chat', () => shareToChat(card!.blob, `${caption}\n${link}`), t('Не получилось отправить. Попробуй «Сохранить картинку».'));
  const toFile = () =>
    run(
      'file',
      async () => {
        const file = new File([card!.blob], `post-${post.id}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text: `${caption} ${link}` });
            return;
          } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
          }
        }
        if (tg?.downloadFile && tg.initData) {
          tg.downloadFile({ url: await upload(), file_name: file.name });
          return;
        }
        const a = document.createElement('a');
        a.href = card!.url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setNote(t('Картинка сохранена. Если не скачалась — зажми её и выбери «Сохранить».'));
      },
      t('Не получилось сохранить картинку'),
    );

  const story = platform === 'tg' && !!tg?.shareToStory;
  return (
    <Sheet onClose={onClose} bodyClassName="share-post">
      <div className="level-title">{t('Поделиться постом')}</div>
      <div className="share-post-preview">{card ? <img src={card.url} alt="" /> : <div className="muted">{t('Рисую картинку…')}</div>}</div>
      {note && <div className="settings-note">{note}</div>}
      {story && (
        <button className="primary" disabled={!card || busy} onClick={toStory}>
          {t('В сторис Telegram')}
        </button>
      )}
      {canShareMessage() && (
        <button className="secondary" disabled={!card || busy} onClick={toChat}>
          {t('Отправить в чат')}
        </button>
      )}
      <button className={story ? 'secondary' : 'primary'} disabled={!card || busy} onClick={toFile}>
        {t('Сохранить картинку')}
      </button>
      <div className="muted share-post-hint">{t('На картинке — ссылка на игру: кто откроет её, увидит этот пост.')}</div>
    </Sheet>
  );
}
