// Бот Атлетии: отвечает на /start кнопкой, которая открывает мини-приложение.
// Приглашения ведут сюда (t.me/<бот>?start=clan-КОД): после «Старт» игрок входит в приложение
// уже под своим аккаунтом Telegram, а код клана передаётся в адресе приложения.

export interface StartReply {
  text: string;
  button: string;
  url: string;
  // Картинка над текстом: приветствие показывает игру.
  photo?: string;
}

export const WELCOME_TEXT = `Привет! Это Атлетия, игра, в которой тренировка становится приключением.

📷 Камера телефона сама считает отжимания, приседания и пресс. Видео никуда не уходит.
⚔️ Каждый повтор бьёт врага: 300 уровней в трёх мирах, боссы и коварный Князь Диван.
🥊 Дуэли с живыми соперниками, лиги и сезоны.
🛡 Клан с друзьями и рейд-босс по выходным.
🔥 Серия дней, задания от жителей и напоминания, чтобы не бросить.

Нажми «Играть», и Мастер Гром проведёт тебя через первое испытание. Поставь телефон сбоку, чтобы камера видела тебя целиком.`;

// «Что умеет этот бот?» до нажатия «Старт» и короткое описание в профиле бота.
export const BOT_DESCRIPTION = 'Атлетия: отжимания, приседания и пресс под камеру телефона. Каждый повтор бьёт врага: приключение на 300 уровней, дуэли, кланы и рейд-боссы. Нажми «Старт», чтобы начать.';
export const BOT_SHORT_DESCRIPTION = 'Тренировка-приключение: камера считает повторы, а каждый повтор бьёт врага.';

/** Ответ на «/start [параметр]»: clan-КОД — клан, иначе код дуэли или просто вход. */
export function startReply(text: string, appUrl: string, clanByCode: (code: string) => { name: string; tag: string; members: number } | undefined): StartReply | null {
  const m = /^\/(?:start|help)(?:@\w+)?(?:\s+(\S+))?/.exec(text.trim());
  if (!m) return null;
  const param = (m[1] ?? '').replace(/[^\w-]/g, '').slice(0, 40);
  const base = appUrl.replace(/\/$/, '');
  if (param.startsWith('clan-')) {
    const code = param.slice(5).toUpperCase();
    const clan = clanByCode(code);
    if (clan)
      return {
        text: `Тебя зовут в клан «${clan.name}» [${clan.tag}] — в нём уже ${clan.members}. По выходным клан бьёт огромного рейд-босса, а каждый твой повтор — удар по нему.\n\nНажми кнопку, и ты сразу окажешься в клане.`,
        button: 'Вступить в клан',
        url: `${base}/?clan=${code}`,
      };
    return { text: 'Это приглашение устарело или клан распущен. Открой Атлетию и найди клан по названию.', button: 'Открыть Атлетию', url: `${base}/` };
  }
  if (/^[A-Z0-9]{4,8}$/i.test(param)) return { text: 'Тебя вызвали на дуэль! Нажми кнопку, чтобы войти в комнату боя.', button: 'Принять вызов', url: `${base}/?room=${param.toUpperCase()}` };
  return { text: WELCOME_TEXT, button: 'Играть', url: `${base}/`, photo: `${base}/bot/welcome.jpg` };
}

interface Update {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string };
}

export const botApi = (token: string) => (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ ok: boolean; result?: unknown; description?: string; error_code?: number }>);

// Состояние бота для /api/health: видно без доступа к логам сервера (без токена).
export const botStatus: { polling: boolean; lastOkAt: number | null; lastError: string | null; handled: number } = { polling: false, lastOkAt: null, lastError: null, handled: 0 };

/** Долгий опрос Telegram. Вебхук снимаем: этому боту нужен только /start. */
export function runBot(token: string, appUrl: string, clanByCode: Parameters<typeof startReply>[2]): void {
  const api = botApi(token);
  let offset = 0;
  const loop = async () => {
    await api('deleteWebhook', {}).catch(() => null);
    await api('setMyDescription', { description: BOT_DESCRIPTION }).catch(() => null);
    await api('setMyShortDescription', { short_description: BOT_SHORT_DESCRIPTION }).catch(() => null);
    await api('setMyCommands', { commands: [{ command: 'start', description: 'Начать игру' }] }).catch(() => null);
    await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: `${appUrl.replace(/\/$/, '')}/` } } }).catch(() => null);
    for (;;) {
      try {
        const r = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
        if (!r.ok) throw new Error(`${r.error_code ?? ''} ${r.description ?? ''}`.trim());
        botStatus.polling = true;
        botStatus.lastOkAt = Date.now();
        botStatus.lastError = null;
        for (const u of (r.result as Update[]) ?? []) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (!msg?.text || msg.chat.type !== 'private') continue;
          const reply = startReply(msg.text, appUrl, clanByCode);
          if (!reply) continue;
          const reply_markup = { inline_keyboard: [[{ text: reply.button, web_app: { url: reply.url } }]] };
          const sent = reply.photo ? await api('sendPhoto', { chat_id: msg.chat.id, photo: reply.photo, caption: reply.text, reply_markup }) : null;
          // Картинка не загрузилась (например, сайт недоступен Telegram) — шлём просто текст.
          botStatus.handled++;
          if (!sent?.ok) await api('sendMessage', { chat_id: msg.chat.id, text: reply.text, reply_markup });
        }
      } catch (e) {
        botStatus.polling = false;
        botStatus.lastError = (e instanceof Error ? e.message : String(e)).replace(token, '***').slice(0, 200);
        console.error('bot:', botStatus.lastError);
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
  };
  void loop();
}
