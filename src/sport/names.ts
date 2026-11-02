// Названия подходов в стиле «Спорт»: вместо «Погони» и «Босса» — обычные спортивные слова.
import type { LevelDef } from '../game/levels';
import { t } from '../i18n';

export const SPORT_NAMES: Record<LevelDef['type'], string> = {
  trial: t('Тест силы'),
  build: t('Подход'),
  chase: t('Подход на темп'),
  climb: t('Подход'),
  defend: t('Подход'),
  rescue: t('Подход'),
  boss: t('Контрольный подход'),
};
