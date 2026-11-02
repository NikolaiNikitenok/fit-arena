// Что скрыто в стиле «Спорт» (решение владельца, 2026-11-02: «Спорт и соревнование»): остаются тренировки,
// программы, зал, статистика, рейтинг, дуэли, друзья, клан и лента; игровые разделы и облики убраны.
import type { Feature } from '../game/unlocks';

export const SPORT_HIDDEN: readonly Feature[] = ['shop', 'pass', 'events', 'collections', 'dungeon', 'village'];
