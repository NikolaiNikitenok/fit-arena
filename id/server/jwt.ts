// Подпись токенов ES256 и набор открытых ключей (JWKS). Закрытый ключ создаётся на сервере один раз
// и никуда не уходит; смена ключа — новый файл: старый ещё отдаётся в JWKS, пока не истекут его токены.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SigningKey {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function kidOf(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' });
  // RFC 7638: отпечаток ключа из обязательных полей в алфавитном порядке.
  return createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url').slice(0, 16);
}

export function newKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { kid: kidOf(publicKey), privateKey, publicKey };
}

/** Ключи из папки dir (файлы key-*.pem, новейший подписывает). Если ключей нет — создаёт первый. */
export function loadKeys(dir: string): SigningKey[] {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let files = readdirSync(dir).filter((f) => /^key-\d+\.pem$/.test(f)).sort();
  if (!files.length) {
    const k = newKey();
    const name = `key-${Date.now()}.pem`;
    writeFileSync(join(dir, name), k.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    files = [name];
  }
  return files.reverse().map((f) => {
    const privateKey = createPrivateKey(readFileSync(join(dir, f)));
    const publicKey = createPublicKey(privateKey);
    return { kid: kidOf(publicKey), privateKey, publicKey };
  });
}

export const keysExist = (dir: string) => existsSync(dir) && readdirSync(dir).some((f) => /^key-\d+\.pem$/.test(f));

export function jwks(keys: SigningKey[]): { keys: object[] } {
  return { keys: keys.map((k) => ({ ...k.publicKey.export({ format: 'jwk' }), kid: k.kid, use: 'sig', alg: 'ES256' })) };
}

export function signJwt(key: SigningKey, claims: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: key.kid }));
  const body = b64(JSON.stringify(claims));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: key.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64(sig)}`;
}

/** Проверка подписи и срока. Возвращает содержимое или null. */
export function verifyJwt(keys: { kid: string; publicKey: KeyObject }[], token: string, nowS: number): Record<string, unknown> | null {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { alg?: string; kid?: string };
    if (head.alg !== 'ES256') return null;
    const key = keys.find((k) => k.kid === head.kid);
    if (!key) return null;
    const ok = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
    if (!ok) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof claims.exp !== 'number' || claims.exp < nowS) return null;
    return claims;
  } catch {
    return null;
  }
}
