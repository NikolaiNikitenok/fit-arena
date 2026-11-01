// Крупный 3D-персонаж для сторис: та же сцена, что у рилсов от персонажа (promo/talk/scene.html), но кадр в полный рост,
// с жестом под формат сторис. Портреты из public/portraits всего 256 px и на весь экран выходят мутными.
// Если 3D не завёлся (нет three или WebGL) — вернём null, и сторис возьмёт старый портрет.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const MODULES = process.env.THREE_MODULES || join(ROOT, "node_modules");

// Модели и окраска как в игре (src/game/npcs.ts).
export const NPC_MODELS = {
  grom: { model: "Barbarian" },
  boris: { model: "Barbarian", tint: "mul:0.75,0.95,1.3" },
  marfa: { model: "Mage" },
  fedor: { model: "Mage", tint: "mul:0.8,0.7,1.25" },
  lisa: { model: "Rogue" },
  knyaz: { model: "Skeleton_Mage", tint: "mul:1.2,0.6,1.4" },
};
// Жест и момент клипа под смысл сторис: челлендж — радуется, совет — объясняет, лень — отмахивается…
const POSE = {
  challenge: ["Cheer", 0.9],
  poll: ["Interact", 0.7],
  quiz: ["Interact", 1.1],
  tip: ["Interact", 0.5],
  slider: ["Block", 0.6],
  question: ["Interact", 0.9],
  motivation: ["Idle_Combat", 0.4],
};
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".glb": "model/gltf-binary",
};

/** Рисует персонажей для сторис: [{npc, format}] → массив data:image/png (или null там, где не вышло). */
export async function renderHeroes(list, W = 900, H = 1250) {
  if (!list.length || !existsSync(join(MODULES, "three/build/three.module.js")))
    return list.map(() => null);
  const server = createServer((q, r) => {
    const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
    const f = u.startsWith("/node_modules/")
      ? join(MODULES, normalize(u.slice(14)))
      : join(ROOT, normalize(u));
    if (!existsSync(f)) {
      r.writeHead(404);
      return r.end();
    }
    r.writeHead(200, {
      "content-type": MIME[extname(f)] ?? "application/octet-stream",
    });
    r.end(readFileSync(f));
  }).listen(0);
  const b = await chromium.launch({
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  const out = [];
  try {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.goto(
      `http://127.0.0.1:${server.address().port}/promo/talk/scene.html?w=${W}&h=${H}`,
    );
    await p.waitForFunction(() => window.talkReady, null, { timeout: 30_000 });
    for (const { npc, format } of list) {
      try {
        const m = NPC_MODELS[npc] ?? NPC_MODELS.grom;
        const [anim, t] = POSE[format] ?? ["Idle", 0.5];
        await p.evaluate(
          async ([m, anim, t]) => {
            const { setup, frame, camera } = window.talk;
            await setup(m);
            // В полный рост чуть снизу — персонаж выглядит героем; голова у верхнего края кадра.
            camera.position.set(0.8, 1.2, 5.3);
            camera.lookAt(0, 1.18, 0);
            frame(t, 0, anim);
          },
          [m, anim, t],
        );
        const png = await p.screenshot({ omitBackground: true });
        out.push(`data:image/png;base64,${png.toString("base64")}`);
      } catch (e) {
        console.log(`3D-персонаж ${npc}: ${e.message}`);
        out.push(null);
      }
    }
  } catch (e) {
    console.log(`3D-персонажи не нарисовались: ${e.message}`);
    while (out.length < list.length) out.push(null);
  } finally {
    await b.close();
    server.close();
  }
  return out;
}
