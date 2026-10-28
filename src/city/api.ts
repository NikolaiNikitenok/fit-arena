// Топ по городу (server/cities.ts): повторы за неделю, топ своего города и рейтинг городов.
import { post as cloudPost } from '../cloud';
import { userName } from '../telegram';

export interface CityRow {
  name: string;
  reps: number;
  level: number | null;
  pro?: boolean;
  me?: boolean;
}

export interface CityBoard {
  city: string | null;
  from: string;
  to: string;
  top: CityRow[];
  me: { place: number; reps: number; players: number } | null;
  // players — тренировались на этой неделе, members — выбрали город, best — самый высокий уровень героя.
  cities: { city: string; reps: number; players: number; members: number; best: number | null; mine?: boolean }[];
  suggest?: string;
}

/** Сервер не пустил: топ города только для вошедших. */
export class NotSignedIn extends Error {}

async function post(path: string, body: object = {}): Promise<CityBoard> {
  try {
    return await cloudPost(`/api/city${path}`, { name: userName(), ...body });
  } catch (e) {
    const err = e as { status?: number; body?: { error?: string } };
    if (err.status === 401) throw new NotSignedIn();
    throw new Error(err.body?.error ?? 'Нет связи с сервером');
  }
}

export const cityApi = {
  board: () => post(''),
  set: (city: string | null) => post('/set', { city }),
};
