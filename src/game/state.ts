import type { Turn } from "./types";

export type HistEventType = "place" | "select";

export interface HistEvent {
  curPlayer: Turn;
  eventType: HistEventType;
  turnId: number;
}

function isTurnEvent(left: HistEvent, right: HistEvent): boolean {
  return left.curPlayer === right.curPlayer && left.turnId === right.turnId;
}

export function getUndoTarget(
  histEvents: readonly HistEvent[],
  idx: number,
  isAtomic: boolean,
  isEntireTurn: (action: HistEvent) => boolean,
): number {
  if (idx <= 0) return 0;
  let target: number = idx - 1;
  const action: HistEvent | undefined = histEvents[target];
  if (isAtomic || action === undefined || !isEntireTurn(action)) return target;

  while (target > 0) {
    const previous: HistEvent | undefined = histEvents[target - 1];
    if (previous === undefined || !isTurnEvent(previous, action)) break;
    target -= 1;
  }
  return target;
}

export function getRedoTarget(
  histEvents: readonly HistEvent[],
  idx: number,
  isAtomic: boolean,
  isEntireTurn: (action: HistEvent) => boolean,
): number {
  if (idx >= histEvents.length) return histEvents.length;
  let target: number = idx + 1;
  const action: HistEvent | undefined = histEvents[idx];
  if (isAtomic || action === undefined || !isEntireTurn(action)) return target;

  while (target < histEvents.length) {
    const next: HistEvent | undefined = histEvents[target];
    if (next === undefined || !isTurnEvent(next, action)) break;
    target += 1;
  }
  return target;
}
