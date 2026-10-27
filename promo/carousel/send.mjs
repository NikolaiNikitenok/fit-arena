// Отправка карусели админу: альбом фото (быстро сохранить в галерею), тот же альбом файлами без пережатия и подпись.
// Запуск: node send.mjs <chat_id> [ошибка]. С текстом ошибки шлёт только сообщение о сбое.
import { readFileSync, readdirSync } from "node:fs";

const [chat, fail] = process.argv.slice(2);
async function call(method, body) {
  const r = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
}
if (fail) {
  await call("sendMessage", {
    chat_id: chat,
    text: `🖼 Карусель не собралась: ${fail}. Нажми кнопку карусели ещё раз.`,
  });
} else {
  const c = JSON.parse(readFileSync("carousel.json", "utf8"));
  const files = readdirSync(".")
    .filter((f) => /^slide_\d+\.jpg$/.test(f))
    .sort();
  const name = (i) =>
    `NikitenokArena-carousel-${String(c.n).padStart(3, "0")}-${String(i + 1).padStart(2, "0")}.jpg`;
  const album = (type, caption) => {
    const fd = new FormData();
    fd.set("chat_id", chat);
    fd.set(
      "media",
      JSON.stringify(
        files.map((_, i) => ({
          type,
          media: `attach://f${i}`,
          ...(i === 0 ? { caption } : {}),
        })),
      ),
    );
    files.forEach((f, i) =>
      fd.set(
        `f${i}`,
        new Blob([readFileSync(f)], { type: "image/jpeg" }),
        name(i),
      ),
    );
    return call("sendMediaGroup", fd);
  };
  const what = c.kind === "app" ? "про приложение" : "с советами";
  await album(
    "photo",
    `🖼 Карусель №${c.n} ${what}: «${c.title}», ${files.length} слайдов.`,
  );
  await album(
    "document",
    `Те же слайды файлами 1080×1350 без сжатия — для лучшего качества в Instagram.`,
  );
  await call("sendMessage", {
    chat_id: chat,
    text: `${c.caption}\n\n${c.hashtags.join(" ")}`,
  });
}
