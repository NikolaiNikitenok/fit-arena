// Вход и копия прогресса на сервере (server/habit.ts на arena.nikitenok.ru). Два способа войти:
//  • Nikitenok ID (id.nikitenok.ru): уходим на /authorize с PKCE, возвращаемся на /?code=…&state=…,
//    сервер меняет код на человека. Если в этот момент уже вошли через Family — прогресс остаётся тем же.
//  • NikitenokFamily: Family открывает https://habit.nikitenok.ru/#sso=<токен>.
// Дальше держим одну копию прогресса для всех устройств: побеждает более свежая (savedAt).
import { S, replaceState, onSave } from './store.js';
import { ask, toast } from './util.js';

export const API = 'https://arena.nikitenok.ru/api/habit';
/** Страница Family, которая выдаёт ссылку для входа (там проверяется, кто ты). */
export const FAMILY_LOGIN = 'https://nikitenok.ru/habit/go';
export const NID = 'https://id.nikitenok.ru';
const NID_CLIENT = 'habit';
const NID_REDIRECT = 'https://habit.nikitenok.ru/';
const NID_FLOW = 'habit-nid-flow';
const KEY = 'habit-free-session';

let session = null;
try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
export const account = () => session;
export const status = { syncing: false, lastSync: 0, error: '' };
let listeners = [];
export const onAccount = (fn) => listeners.push(fn);
const changed = () => listeners.forEach((fn) => fn());

async function call(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session.session } : {}) },
    body: JSON.stringify(body || {}),
  });
  if (res.status === 401 && path !== '/login' && path !== '/nid') { logout(true); throw new Error('session'); }
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}

const hasData = (st) => !!st && Array.isArray(st.habits) && st.habits.length > 0;

/** Применить копию с сервера. */
function apply(state, savedAt) {
  replaceState({ ...state, onboarded: true, savedAt }, { silent: true });
  changed();
}

/** Вход по ссылке из Family. Возвращает true, если вошли. */
export async function loginFromHash() {
  const m = /[#&]sso=([^&]+)/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search + '#/');
  try {
    const r = await call('/login', { token: decodeURIComponent(m[1]) });
    await afterLogin(r, 'family');
    return true;
  } catch (e) {
    toast('Не получилось войти: ссылка устарела. Нажми кнопку в Family ещё раз.');
    return false;
  }
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rnd = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/** Уйти на вход в Nikitenok ID. Вернёмся на главную с ?code=…&state=…. */
export async function loginWithNid() {
  const state = rnd(16);
  const verifier = rnd(32);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(NID_FLOW, JSON.stringify({ state, verifier })); } catch {}
  const q = new URLSearchParams({ client_id: NID_CLIENT, redirect_uri: NID_REDIRECT, response_type: 'code', scope: 'openid profile', state, code_challenge: challenge, code_challenge_method: 'S256' });
  location.href = `${NID}/authorize?${q}`;
}

export const hasNidReturn = () => /[?&](code|error)=/.test(location.search);

/** Возврат из Nikitenok ID. Возвращает true, если вошли. */
export async function loginFromNid() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return false;
  history.replaceState(null, '', location.pathname + '#/');
  let flow = null;
  try { flow = JSON.parse(sessionStorage.getItem(NID_FLOW) || 'null'); sessionStorage.removeItem(NID_FLOW); } catch {}
  if (p.get('error') || !flow || flow.state !== p.get('state')) {
    if (p.get('error') !== 'access_denied') toast('Не получилось войти через Nikitenok ID. Попробуй ещё раз.');
    return false;
  }
  try {
    // Если уже вошли через Family, сессия уйдёт вместе с кодом: сервер свяжет ID с этим профилем.
    const r = await call('/nid', { code: p.get('code'), verifier: flow.verifier });
    await afterLogin(r, 'nid');
    return true;
  } catch (e) {
    toast('Не получилось войти через Nikitenok ID. Попробуй ещё раз.');
    return false;
  }
}

/** Общее после входа: запомнить сессию и решить, чей прогресс оставить. */
async function afterLogin(r, via) {
  {
    session = { session: r.session, name: r.name || (via === 'nid' ? 'Nikitenok ID' : 'Family'), via, family: via === 'family' || !!r.family };
    try { localStorage.setItem(KEY, JSON.stringify(session)); } catch {}
    const local = hasData(S) ? S : null;
    const remote = hasData(r.state) ? r.state : null;
    if (remote && local && !S.syncedPid) {
      // На устройстве свой прогресс, в профиле — свой: спросим, какой оставить.
      const takeRemote = await ask('Какой прогресс оставить?',
        `В профиле уже есть прогресс (${remote.habits.length} привыч.). На этом устройстве — ещё один (${local.habits.length} привыч.).`,
        'Из профиля', 'С этого устройства');
      if (takeRemote) apply(r.state, r.savedAt); else await push(true);
    } else if (remote && (!local || r.savedAt >= (S.savedAt || 0))) apply(r.state, r.savedAt);
    else await push(true);
    S.syncedPid = true;
    try { localStorage.setItem('habit-free-v1', JSON.stringify(S)); } catch {}
    toast(`Вход выполнен: ${session.name}. Прогресс сохранён 💚`);
    changed();
  }
}

/** Подтянуть более свежую копию с сервера (при старте и возвращении в приложение). */
export async function pull() {
  if (!session) return;
  try {
    const r = await call('/load');
    status.lastSync = Date.now();
    if (hasData(r.state) && r.savedAt > (S.savedAt || 0)) apply(r.state, r.savedAt);
    else if (!hasData(r.state) && hasData(S)) await push(true);
  } catch {}
}

let timer = null;
/** Отправить копию (с задержкой, чтобы не слать на каждый тик). */
export function push(now = false) {
  if (!session) return Promise.resolve();
  clearTimeout(timer);
  const run = async () => {
    status.syncing = true;
    try {
      const r = await call('/save', { state: S, savedAt: S.savedAt || Date.now() });
      status.lastSync = Date.now();
      status.error = '';
      if (r.newer) apply(r.newer, r.savedAt);
    } catch (e) {
      status.error = 'нет связи';
    } finally {
      status.syncing = false;
    }
  };
  if (now) return run();
  timer = setTimeout(run, 2500);
  return Promise.resolve();
}

export function logout(expired = false) {
  session = null;
  try { localStorage.removeItem(KEY); } catch {}
  if (expired) toast('Вход истёк — войди снова, прогресс на этом устройстве остался');
  changed();
}

onSave(() => push());
