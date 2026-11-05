// Рилсы и карусели для Instagram по кнопкам «🎬 Новый рилс» и «🖼 Карусель: …»: сервер запускает GitHub Actions
// (.github/workflows/reel.yml, carousel.yml), там Claude пишет сценарий, дальше озвучка и монтаж или отрисовка слайдов,
// готовые файлы бот присылает админу.
// Токен GitHub с правом Actions: Read and write — секрет GH_ACTIONS_TOKEN, автодеплой кладёт его в .gh-token.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const REEL_REPO = "NikolaiNikitenok/fit-arena";
type Job = "reel" | "carousel" | "story" | "talk" | "loop";
/** Сколько своих клипов помнить и сколько дней: для рилса-петли берётся один из них по кругу. */
export const LOOP_CLIPS_MAX = 6;
export const LOOP_CLIP_DAYS = 14;
/** Telegram отдаёт ботам файлы до 20 МБ. */
export const LOOP_CLIP_BYTES = 20 * 1024 * 1024;

/** Пауза между запусками, чтобы двойное нажатие не собрало два рилса. */
export const REEL_COOLDOWN = 3 * 60_000;

export interface ReelsDeps {
  token: () => string;
  dispatch?: (
    token: string,
    inputs: Record<string, string>,
    workflow: string,
  ) => Promise<{ ok: boolean; error?: string; queued?: string }>;
  now?: () => number;
}

/** Ссылка на бота с меткой публикации: src-reel-N, src-talk-N, src-car-N, src-story-N (server/statsPage.ts contentRows). */
export const contentLink = (job: Job, n: number) =>
  `https://t.me/ArenaNikitenokBot?start=src-${job === "carousel" ? "car" : job}-${n}`;

/** Запуск workflow через API GitHub. */
export async function dispatchReel(
  token: string,
  inputs: Record<string, string>,
  workflow = "reel.yml",
): Promise<{ ok: boolean; error?: string; queued?: string }> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${REEL_REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "arena-server",
        },
        body: JSON.stringify({ ref: "main", inputs }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    return r.ok
      ? { ok: true }
      : {
          ok: false,
          error: `GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`,
        };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Что запускает каждая команда; номер и пауза у каждого вида свои. */
const JOBS = {
  reel: {
    workflow: "reel.yml",
    n: "n",
    at: "lastAt",
    what: "рилс",
    busy: "Рилс уже собирается.",
  },
  carousel: {
    workflow: "carousel.yml",
    n: "cn",
    at: "clastAt",
    what: "карусель",
    busy: "Карусель уже собирается.",
  },
  story: {
    workflow: "carousel.yml",
    n: "sn",
    at: "slastAt",
    what: "сторис",
    busy: "Сторис уже собираются.",
  },
  talk: {
    workflow: "talk.yml",
    n: "tn",
    at: "tlastAt",
    what: "рилс от персонажа",
    busy: "Рилс от персонажа уже собирается.",
  },
  // Короткий закольцованный рилс 8–10 с (promo/reels/loop): тот же reel.yml с kind=loop.
  loop: {
    workflow: "reel.yml",
    n: "ln",
    at: "llastAt",
    what: "рилс-петля",
    busy: "Рилс-петля уже собирается.",
  },
} as const;

/** Ведущий и тон по номеру — так же по кругу, как в promo/talk/generate.mjs. */
export const TALK_HOSTS = [
  "Мастер Гром",
  "Князь Диван",
  "Борис Петрович",
  "Купец Фёдор",
];
export const TALK_TONES = ["смешной", "мотивирующий", "с советами"];

export class Reels {
  private state = {
    n: 0,
    lastAt: 0,
    cn: 0,
    clastAt: 0,
    sn: 0,
    slastAt: 0,
    tn: 0,
    tlastAt: 0,
    ln: 0,
    llastAt: 0,
    /** Видео, которые админ прислал боту (file_id Telegram), для рилса-петли. */
    clips: [] as { id: string; at: number }[],
  };
  constructor(
    private file: string | null,
    private d: ReelsDeps,
  ) {
    if (file)
      try {
        this.state = {
          ...this.state,
          ...JSON.parse(readFileSync(file, "utf8")),
        };
      } catch {
        /* первый запуск */
      }
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state));
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** Свежие свои клипы (не старше LOOP_CLIP_DAYS дней). */
  private freshClips(now: number) {
    return this.state.clips.filter((c) => now - c.at < LOOP_CLIP_DAYS * 86_400_000);
  }

  /** Админ прислал видео: запоминаем его для рилса-петли. Подпись /loop сразу запускает сборку. */
  addClip(
    chatId: number,
    video: { file_id: string; file_size?: number; duration?: number },
    caption: string,
    reply: (t: string) => void,
  ): void {
    const now = (this.d.now ?? Date.now)();
    if ((video.file_size ?? 0) > LOOP_CLIP_BYTES)
      return reply(
        "Видео больше 20 МБ, бот не сможет его скачать. Отправь его как обычное видео (не файлом): Telegram сам сожмёт.",
      );
    const clips = [...this.freshClips(now).filter((c) => c.id !== video.file_id), { id: video.file_id, at: now }].slice(-LOOP_CLIPS_MAX);
    this.state = { ...this.state, clips };
    this.save();
    if (/^\/loop\b/.test(caption.trim())) {
      this.command(chatId, caption, reply);
      return;
    }
    reply(
      `🎥 Клип сохранён, своих клипов сейчас ${clips.length}. Нажми «🔁 Рилс-петля»: свежий клип откроет и закроет ролик, между ними пойдут кадры игры.` +
        (video.duration && video.duration < 3 ? "\nКлип короче 3 секунд, лучше 4–8 секунд." : ""),
    );
  }

  /** /reel [тема], /carousel [tips|app] [тема], /story [тема], /talk [тема] или /loop [тема]. true — команда наша (ответ уже отправлен или будет). */
  command(chatId: number, text: string, reply: (t: string) => void): boolean {
    const m = /^\/(reel|carousel|story|talk|loop)(?:@\w+)?\b\s*([\s\S]*)$/.exec(
      text.trim(),
    );
    if (!m) return false;
    const job = m[1] as Job;
    const J = JOBS[job];
    const now = (this.d.now ?? Date.now)();
    const token = this.d.token();
    if (!token)
      return (
        reply(
          `Чтобы делать рилсы, карусели и сторис, нужен токен GitHub: секрет GH_ACTIONS_TOKEN (права Actions: Read and write), потом перевыкладка.`,
        ),
        true
      );
    const wait = this.state[J.at] + REEL_COOLDOWN - now;
    if (wait > 0)
      return (
        reply(
          `${J.busy} Следующую сборку можно запустить через ${Math.ceil(wait / 60_000)} мин.`,
        ),
        true
      );
    let rest = m[2].trim();
    let kind = "";
    if (job === "carousel") {
      const k =
        /^(tips|app|советы|совет|приложение|про приложение)(?=\s|$)\s*/i.exec(
          rest,
        );
      if (k)
        ((kind = /^(app|прил|про)/i.test(k[1]) ? "app" : "tips"),
          (rest = rest.slice(k[0].length)));
    }
    const topic = rest.slice(0, 300);
    const n = this.state[J.n] + 1;
    if (job === "carousel") kind ||= n % 2 ? "tips" : "app";
    if (job === "story") kind = "story";
    // Рилс-петля: свежий свой клип по кругу (первым — последний присланный), без клипов — только кадры игры.
    let clip = "";
    if (job === "loop") {
      kind = "loop";
      const fresh = this.freshClips(now);
      clip = fresh.length ? fresh[(fresh.length - 1 - ((n - 1) % fresh.length) + fresh.length) % fresh.length].id : "";
    }
    this.state = { ...this.state, [J.n]: n, [J.at]: now };
    this.save();
    const inputs: Record<string, string> = {
      chat_id: String(chatId),
      n: String(n),
      topic,
      ...(kind ? { kind } : {}),
      ...(clip ? { clip } : {}),
    };
    void (this.d.dispatch ?? dispatchReel)(token, inputs, J.workflow).then(
      (r) => {
        const about = topic ? ` на тему «${topic}»` : "";
        // Своя метка у каждого ролика и карусели: ссылку с ней ставь в стикер сторис, закреп или профиль —
        // статистика («Контент по цифрам») покажет, сколько пришло и вернулось именно с него.
        const tagLine = `\n🔗 Ссылка с меткой для этой публикации: ${contentLink(job, n)}`;
        if (r.ok && r.queued)
          return reply(`📝 Задание ${r.queued}: ${J.what} №${n}${about} в очереди Codex. Сценарий подготовится на компьютере, затем пришлю готовые файлы сюда. Если компьютер выключен, задание дождётся его включения. Статус: /content` + tagLine);
        if (r.ok)
          return reply(
            (            job === "carousel"
              ? `🖼 Делаю карусель №${n} ${kind === "app" ? "про приложение" : "с советами"}${about}. Пришлю картинки примерно через минуту.`
              : job === "story"
                ? `📱 Делаю сторис №${n}${about}: три картинки на выбор. Пришлю примерно через минуту.`
                : job === "talk"
                  ? `🎭 Делаю рилс от персонажа №${n}${about}: ведёт ${TALK_HOSTS[n % 4]}, тон ${TALK_TONES[n % 3]}. Пришлю файл минут через 10–12.`
                  : job === "loop"
                    ? `🔁 Делаю рилс-петлю №${n}${about}: 8–10 секунд, конец переходит в начало. ${clip ? "Открывает и закрывает твой клип." : "Только кадры игры: пришли боту видео, как ты отжимаешься, и следующая петля начнётся с тебя."} Пришлю файл минут через 3–5.`
                    : `🎬 Делаю рилс №${n}${about}. Пришлю файл минут через 5–7.`) + tagLine,
          );
        this.state[J.at] = 0;
        this.save();
        reply(`Не получилось запустить сборку (${J.what}): ${r.error}`);
      },
    );
    return true;
  }
}
