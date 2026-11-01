// Топ по городу (server/cities.ts): повторы за неделю, топ своего города и рейтинг городов.
import { post as cloudPost } from '../cloud';
import { userName } from '../telegram';
import { t } from '../i18n';

export interface CityRow {
  name: string;
  reps: number;
  level: number | null;
  pro?: boolean;
  me?: boolean;
  // Публичный id профиля: тап по строке открывает профиль игрока.
  pid?: string;
}

export interface CityBoard {
  city: string | null;
  from: string;
  to: string;
  top: CityRow[];
  me: { place: number; reps: number; players: number } | null;
  // players — тренировались на этой неделе, members — выбрали город, best — самый высокий уровень героя.
  cities: CityStat[];
  // Страны по повторам за неделю; country — страна моего города.
  countries: CountryStat[];
  country: string | null;
  suggest?: string;
  suggestCountry?: string;
}

export interface CityStat {
  city: string;
  country: string | null;
  reps: number;
  players: number;
  members: number;
  best: number | null;
  mine?: boolean;
}

export interface CountryStat {
  country: string;
  reps: number;
  players: number;
  members: number;
  best: number | null;
  cities: number;
  mine?: boolean;
}

/** Сервер не пустил: топ города только для вошедших. */
export class NotSignedIn extends Error {}

async function post(path: string, body: object = {}): Promise<CityBoard> {
  try {
    return await cloudPost(`/api/city${path}`, { name: userName(), ...body });
  } catch (e) {
    const err = e as { status?: number; body?: { error?: string } };
    if (err.status === 401) throw new NotSignedIn();
    throw new Error(err.body?.error ?? t('Нет связи с сервером'));
  }
}

export const cityApi = {
  board: () => post(''),
  set: (city: string | null, country?: string) => post('/set', { city, country }),
};
