// Анонимный id игрока для статистики: хеш от его id, сам id (и тем более имя) не уходит.
// Сервер считает такой же хеш (server/telemetry.ts), чтобы стереть следы по просьбе игрока.

/** Строка, от которой берётся хеш. */
export const anonSource = (playerId: string) => `arena-anon:${playerId}`;

/** SHA-256 в браузере (и в Node 20+): первые 32 hex-символа. */
export async function anonId(playerId: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(anonSource(playerId)));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}
