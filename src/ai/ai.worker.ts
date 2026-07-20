/// <reference lib="webworker" />

import type { MoveAI, RequestAI, ResponseAI } from "../game/types";
import { findMoveAI } from "./search";

const worker: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

function res(response: ResponseAI): void {
  worker.postMessage(response);
}

worker.onmessage = ({ data }: MessageEvent<RequestAI>): void => {
  const { reqId }: RequestAI = data;

  try {
    const move: MoveAI = findMoveAI(data.board, data.remaining, data.curPiece, data.diff, {
      startCell: data.startCell,
      onProgress: (depth: number, nodes: number): void => {
        res({
          type: "progress",
          reqId,
          depth,
          nodes,
        });
      },
    });

    res({
      type: "result",
      reqId,
      move,
    });
  } catch (error: unknown) {
    res({
      type: "error",
      reqId,
      msg: error instanceof Error ? error.message : "Unknown AI error",
    });
  }
};
