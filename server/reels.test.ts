import { describe, expect, it } from "vitest";
import { REEL_COOLDOWN, Reels } from "./reels";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("рилсы", () => {
  it("запускает сборку с номером и темой, второй раз сразу не даёт", async () => {
    let now = 1_000_000;
    const runs: Record<string, string>[] = [];
    const reels = new Reels(null, {
      token: () => "gh",
      now: () => now,
      dispatch: async (_, i) => (runs.push(i), { ok: true }),
    });
    const out: string[] = [];
    expect(
      reels.command(42, "/reel дуэли с друзьями", (t) => out.push(t)),
    ).toBe(true);
    await flush();
    expect(runs).toEqual([
      { chat_id: "42", n: "1", topic: "дуэли с друзьями" },
    ]);
    expect(out.at(-1)).toMatch(/рилс №1 на тему «дуэли с друзьями»/);
    reels.command(42, "/reel", (t) => out.push(t));
    expect(out.at(-1)).toMatch(/уже собирается/);
    now += REEL_COOLDOWN;
    reels.command(42, "/reel", (t) => out.push(t));
    await flush();
    expect(runs.at(-1)).toEqual({ chat_id: "42", n: "2", topic: "" });
  });

  it("без токена объясняет, что нужно; при ошибке GitHub сообщает её и разрешает повтор", async () => {
    const out: string[] = [];
    expect(
      new Reels(null, { token: () => "" }).command(1, "/reel", (t) =>
        out.push(t),
      ),
    ).toBe(true);
    expect(out[0]).toMatch(/GH_ACTIONS_TOKEN/);
    const reels = new Reels(null, {
      token: () => "gh",
      dispatch: async () => ({ ok: false, error: "GitHub 401" }),
    });
    reels.command(1, "/reel", (t) => out.push(t));
    await flush();
    expect(out.at(-1)).toMatch(/GitHub 401/);
    let ran = false;
    const again = new Reels(null, {
      token: () => "gh",
      dispatch: async () => ((ran = true), { ok: true }),
    });
    again.command(1, "/reel", () => undefined);
    await flush();
    expect(ran).toBe(true);
  });

  it("чужие команды не трогает", () => {
    expect(
      new Reels(null, { token: () => "gh" }).command(
        1,
        "/channel",
        () => undefined,
      ),
    ).toBe(false);
    expect(
      new Reels(null, { token: () => "gh" }).command(
        1,
        "/reels_x",
        () => undefined,
      ),
    ).toBe(false);
  });
});

describe("карусели", () => {
  it("запускает carousel.yml, чередует советы и приложение, тип можно задать словом", async () => {
    let now = 5_000_000;
    const runs: [Record<string, string>, string][] = [];
    const r = new Reels(null, {
      token: () => "gh",
      now: () => now,
      dispatch: async (_, i, w) => (runs.push([i, w]), { ok: true }),
    });
    const out: string[] = [];
    expect(r.command(7, "/carousel", (t) => out.push(t))).toBe(true);
    await flush();
    expect(runs[0]).toEqual([
      { chat_id: "7", n: "1", topic: "", kind: "tips" },
      "carousel.yml",
    ]);
    expect(out.at(-1)).toMatch(/карусель №1 с советами/);
    // Рилс и карусель не мешают друг другу.
    r.command(7, "/reel", () => undefined);
    await flush();
    expect(runs[1][1]).toBe("reel.yml");
    r.command(7, "/carousel app", (t) => out.push(t));
    expect(out.at(-1)).toMatch(/Карусель уже собирается/);
    now += REEL_COOLDOWN;
    r.command(7, "/carousel", () => undefined);
    now += REEL_COOLDOWN;
    r.command(7, "/carousel советы как не бросить", () => undefined);
    await flush();
    expect(runs.slice(2).map(([i]) => [i.kind, i.topic])).toEqual([
      ["app", ""],
      ["tips", "как не бросить"],
    ]);
  });
});
