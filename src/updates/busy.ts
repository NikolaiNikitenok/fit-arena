// Игрок занят (бой, тренировка с камерой, комната дуэли): предложение обновиться ждёт, пока он не освободится.
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
