// Игрок занят (бой, тренировка с камерой, комната дуэли, сюжетный диалог вроде вылупления питомца):
// предложение обновиться и «что нового» ждут, пока он не освободится, — окна не встают друг на друга.
import { useEffect, useSyncExternalStore } from 'react';

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Пока on, игра считается занятой. Можно звать из нескольких экранов сразу. */
export function useBusy(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    count++;
    emit();
    return () => {
      count--;
      emit();
    };
  }, [on]);
}

export const isBusy = (): boolean => count > 0;

export function onBusy(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useIsBusy = (): boolean => useSyncExternalStore(onBusy, isBusy);
