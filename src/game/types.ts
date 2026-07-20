export const PIECE_IDS: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

export type PieceId = (typeof PIECE_IDS)[number];
export type Cell = PieceId | null;

export type Turn = "player1" | "player2";
export type Participant = "human" | "ai";
export type GameMode = "human-human" | "human-ai" | "ai-ai";
export type Difficulty = "easy" | "medium" | "hard";
export type Starter = Turn | "random";
export type Phase = "select" | "place" | "thinking" | "finished";
export type Strategy = "heuristic" | "search";

export type WinLine = readonly [number, number, number, number];

export interface MoveAI {
  cell: number;
  nxtPiece: PieceId | null;
  score: number;
  depth: number;
  nodes: number;
  strategy?: Strategy;
}

interface MsgAI {
  reqId: number;
}

export interface RequestAI extends MsgAI {
  type: "find-move";
  board: readonly Cell[];
  remaining: readonly PieceId[];
  curPiece: PieceId;
  diff: Difficulty;
  startCell?: number | undefined;
}

export type ResponseAI = MsgAI &
  (
    | {
        type: "progress";
        depth: number;
        nodes: number;
      }
    | {
        type: "result";
        move: MoveAI;
      }
    | {
        type: "error";
        msg: string;
      }
  );
