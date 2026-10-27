// Рилсы и карусели для Instagram по кнопкам «🎬 Новый рилс» и «🖼 Карусель: …»: сервер запускает GitHub Actions
// (.github/workflows/reel.yml, carousel.yml), там Claude пишет сценарий, дальше озвучка и монтаж или отрисовка слайдов,
// готовые файлы бот присылает админу.
// Токен GitHub с правом Actions: Read and write — секрет GH_ACTIONS_TOKEN, автодеплой кладёт его в .gh-token.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const REEL_REPO = "NikolaiNikitenok/fit-arena";
/** Пауза между запусками, чтобы двойное нажатие не собрало два рилса. */
export const REEL_COOLDOWN = 3 * 60_000;

export interface ReelsDeps {
  token: () => string;
  dispatch?: (
    token: string,
    inputs: Record<string, string>,
    workflow: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  now?: () => number;
}

/** Запуск workflow через API GitHub. */
export async function dispatchReel(
  token: string,
  inputs: Record<string, string>,
  workflow = "reel.yml",
): Promise<{ ok: boolean; error?: string }> {
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

export class Reels {
  private state = { n: 0, lastAt: 0, cn: 0, clastAt: 0 };
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

  /** /reel [тема] или /carousel [tips|app] [тема]. true — команда наша (ответ уже отправлен или будет). */
  command(chatId: number, text: string, reply: (t: string) => void): boolean {
    const m = /^\/(reel|carousel)(?:@\w+)?\b\s*([\s\S]*)$/.exec(text.trim());
    if (!m) return false;
    const now = (this.d.now ?? Date.now)();
    const token = this.d.token();
    const carousel = m[1] === "carousel";
    const what = carousel ? "Карусель" : "Рилс";
    if (!token)
      return (
        reply(
          `Чтобы делать рилсы и карусели, нужен токен GitHub: секрет GH_ACTIONS_TOKEN (права Actions: Read and write), потом перевыкладка.`,
        ),
        true
      );
    const wait =
      (carousel ? this.state.clastAt : this.state.lastAt) + REEL_COOLDOWN - now;
    if (wait > 0)
      return (
        reply(
          `${what} уже собирается. ${carousel ? "Следующую" : "Следующий"} можно запустить через ${Math.ceil(wait / 60_000)} мин.`,
        ),
        true
      );
    let rest = m[2].trim();
    let kind = "";
    if (carousel) {
      const k =
        /^(tips|app|советы|совет|приложение|про приложение)(?=\s|$)\s*/i.exec(
          rest,
        );
      if (k)
        ((kind = /^(app|прил|про)/i.test(k[1]) ? "app" : "tips"),
          (rest = rest.slice(k[0].length)));
    }
    const topic = rest.slice(0, 300);
    const n = (carousel ? this.state.cn : this.state.n) + 1;
    if (carousel) {
      kind ||= n % 2 ? "tips" : "app";
      this.state = { ...this.state, cn: n, clastAt: now };
    } else this.state = { ...this.state, n, lastAt: now };
    this.save();
    const inputs: Record<string, string> = {
      chat_id: String(chatId),
      n: String(n),
      topic,
      ...(carousel ? { kind } : {}),
    };
    void (this.d.dispatch ?? dispatchReel)(
      token,
      inputs,
      carousel ? "carousel.yml" : "reel.yml",
    ).then((r) => {
      if (r.ok)
        return reply(
          carousel
            ? `🖼 Делаю карусель №${n} ${kind === "app" ? "про приложение" : "с советами"}${topic ? ` на тему «${topic}»` : ""}. Пришлю картинки минуты через 3–4.`
            : `🎬 Делаю рилс №${n}${topic ? ` на тему «${topic}»` : ""}. Пришлю файл минут через 5–7.`,
        );
      if (carousel) this.state.clastAt = 0;
      else this.state.lastAt = 0;
      this.save();
      reply(
        `Не получилось запустить сборку ${carousel ? "карусели" : "рилса"}: ${r.error}`,
      );
    });
    return true;
  }
}
