import {
  CELL_COUNT,
  cellPlacementScore,
  getEmptyCells,
  isBoardFull,
  isWinCellPlacement,
} from "../game/rules";
import type { Cell, Difficulty, MoveAI, PieceId } from "../game/types";

const MATE_SCORE: number = 100_000;
const STARTING_CELLS = {
  easy: [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15],
  medium: [0, 3, 12, 15],
  hard: [5, 6, 9, 10],
} as const satisfies Record<Difficulty, readonly number[]>;

class SearchLimitErr extends Error {
  override readonly name: "SearchLimitError" = "SearchLimitError";
}

interface SearchContext {
  readonly maxNodes: number;
  nodes: number;
  readonly transposition: Map<string, number>;
}

interface ScoredMove {
  readonly cell: number;
  readonly nxtPiece: PieceId | null;
  readonly score: number;
}

interface SearchProfile {
  readonly maxNodes: number;
  readonly maxDepth: number;
}

interface OrderedCell {
  readonly cell: number;
  readonly isWin: boolean;
  readonly score: number;
}

interface OrderedPiece {
  readonly piece: PieceId;
  readonly danger: number;
}

export interface SearchOptions {
  startCell?: number | undefined;
  onProgress?: (depth: number, nodes: number) => void;
}

export function getRandVal(seed: number = Date.now()): () => number {
  let state: number = seed >>> 0;

  return (): number => {
    state += 0x6d2b79f5;
    let value: number = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randSelectFrom<T>(arr: readonly T[], random: () => number): T {
  if (arr.length === 0) {
    throw new Error("List is empty - cannot randomly select from.");
  }

  const selectedT: T | undefined = arr[Math.floor(random() * arr.length)];
  if (selectedT === undefined) {
    throw new Error("Random selection failed.");
  }
  return selectedT;
}

export function selectStartPiece(
  remainingPieces: readonly PieceId[],
  random: () => number = Math.random,
): PieceId {
  return randSelectFrom(remainingPieces, random);
}

export function selectStartCell(
  board: readonly Cell[],
  difficulty: Difficulty,
  random: () => number = Math.random,
): number {
  const available = STARTING_CELLS[difficulty].filter((cell): boolean => board[cell] === null);
  return randSelectFrom(available, random);
}

function remainingPiecesMask(remainingPieces: readonly PieceId[]): number {
  let mask: number = 0;
  for (const piece of remainingPieces) {
    mask |= 1 << piece;
  }
  return mask;
}

function getStateKey(
  board: readonly Cell[],
  currentPiece: PieceId,
  remainingPieces: readonly PieceId[],
  depth: number,
): string {
  let boardKey: string = "";
  for (const cell of board) {
    boardKey += cell === null ? "_" : cell.toString(CELL_COUNT);
  }
  return `${boardKey}:${currentPiece.toString(CELL_COUNT)}:${remainingPiecesMask(remainingPieces).toString(CELL_COUNT)}:${depth}`;
}

function assertNode(context: SearchContext): void {
  context.nodes += 1;
  if (context.nodes > context.maxNodes) {
    throw new SearchLimitErr();
  }
}

function countWinCells(board: readonly Cell[], piece: PieceId): number {
  let count: number = 0;
  for (let cell: number = 0; cell < board.length; cell += 1) {
    if (board[cell] === null && isWinCellPlacement(board, cell, piece)) {
      count += 1;
    }
  }
  return count;
}

function orderCells(board: readonly Cell[], piece: PieceId): number[] {
  return getEmptyCells(board)
    .map((cell: number): OrderedCell => {
      const isWin: boolean = isWinCellPlacement(board, cell, piece);

      return {
        cell,
        isWin,
        score: isWin ? 0 : cellPlacementScore(board, cell, piece),
      };
    })
    .sort(
      (a: OrderedCell, b: OrderedCell): number =>
        Number(b.isWin) - Number(a.isWin) || b.score - a.score,
    )
    .map(({ cell }: OrderedCell): number => cell);
}

function orderPieces(board: readonly Cell[], remainingPieces: readonly PieceId[]): PieceId[] {
  return remainingPieces
    .map(
      (piece: number): OrderedPiece => ({
        piece,
        danger: countWinCells(board, piece),
      }),
    )
    .sort((a: OrderedPiece, b: OrderedPiece): number => a.danger - b.danger || a.piece - b.piece)
    .map(({ piece }: OrderedPiece): number => piece);
}

function removePiece(remainingPieces: readonly PieceId[], selected: PieceId): PieceId[] {
  return remainingPieces.filter((piece: number): boolean => piece !== selected);
}

function evalTurn(board: readonly Cell[], currentPiece: PieceId): number {
  const cells: number[] = getEmptyCells(board);
  let winCellPlacements: number = 0;

  for (const cell of cells) {
    if (isWinCellPlacement(board, cell, currentPiece)) {
      winCellPlacements += 1;
    }
  }

  if (winCellPlacements > 0) {
    return 5_000 + winCellPlacements * 200;
  }

  let bestScore: number = 0;
  let sumScore: number = 0;

  for (const cell of cells) {
    const score: number = cellPlacementScore(board, cell, currentPiece);
    bestScore = Math.max(bestScore, score);
    sumScore += score;
  }
  return bestScore * CELL_COUNT + sumScore;
}

function negamax(
  board: Cell[],
  currentPiece: PieceId,
  remainingPieces: readonly PieceId[],
  depth: number,
  initialAlpha: number,
  beta: number,
  ply: number,
  context: SearchContext,
): number {
  assertNode(context);

  if (depth <= 0) {
    return evalTurn(board, currentPiece);
  }

  const stateKey: string = getStateKey(board, currentPiece, remainingPieces, depth);
  const cached: number | undefined = context.transposition.get(stateKey);
  if (cached !== undefined) return cached;

  let alpha: number = initialAlpha;
  let best: number = -Infinity;
  let isCutoff: boolean = false;

  for (const cell of orderCells(board, currentPiece)) {
    const wins: boolean = isWinCellPlacement(board, cell, currentPiece);
    board[cell] = currentPiece;

    if (wins) {
      board[cell] = null;
      return MATE_SCORE - ply;
    }

    if (isBoardFull(board)) {
      best = Math.max(best, 0);
      board[cell] = null;
      continue;
    }

    for (const nxtPiece of orderPieces(board, remainingPieces)) {
      const score: number = -negamax(
        board,
        nxtPiece,
        removePiece(remainingPieces, nxtPiece),
        depth - 1,
        -beta,
        -alpha,
        ply + 1,
        context,
      );

      best = Math.max(best, score);
      alpha = Math.max(alpha, score);

      if (alpha >= beta) {
        isCutoff = true;
        break;
      }
    }

    board[cell] = null;
    if (isCutoff) break;
  }

  const res: number = Number.isFinite(best) ? best : 0;
  if (!isCutoff) {
    context.transposition.set(stateKey, res);
  }
  return res;
}

function isCellAvailable(board: readonly Cell[], startCell: number): boolean {
  if (startCell < 0 || startCell >= board.length || board[startCell] !== null) {
    throw new Error(`Starting cell ${startCell} is not available.`);
  }
  return true;
}

function rootCells(board: readonly Cell[], currentPiece: PieceId, startCell?: number): number[] {
  if (startCell === undefined) {
    return orderCells(board, currentPiece);
  }
  isCellAvailable(board, startCell);
  return [startCell];
}

function searchAtDepth(
  boardInput: readonly Cell[],
  remainingPieces: readonly PieceId[],
  currentPiece: PieceId,
  depth: number,
  context: SearchContext,
  startCell?: number,
): ScoredMove {
  const board: Cell[] = [...boardInput];
  let best: ScoredMove | null = null;
  let alpha: number = -Infinity;

  for (const cell of rootCells(board, currentPiece, startCell)) {
    board[cell] = currentPiece;

    if (isWinCellPlacement(board, cell, currentPiece)) {
      board[cell] = null;
      return {
        cell,
        nxtPiece: null,
        score: MATE_SCORE,
      };
    }

    if (isBoardFull(board)) {
      const candidate: ScoredMove = {
        cell,
        nxtPiece: null,
        score: 0,
      };

      if (best === null || candidate.score > best.score) {
        best = candidate;
      }
      board[cell] = null;
      continue;
    }

    for (const nxtPiece of orderPieces(board, remainingPieces)) {
      assertNode(context);

      const score: number = -negamax(
        board,
        nxtPiece,
        removePiece(remainingPieces, nxtPiece),
        depth - 1,
        -Infinity,
        -alpha,
        1,
        context,
      );

      if (best === null || score > best.score) {
        best = { cell, nxtPiece, score };
      }
      alpha = Math.max(alpha, score);
    }
    board[cell] = null;
  }

  if (best === null) {
    throw new Error("No valid (AI) move exists.");
  }
  return best;
}

function easyMove(
  board: readonly Cell[],
  remainingPieces: readonly PieceId[],
  currentPiece: PieceId,
  startCell?: number,
): MoveAI {
  const legal: number[] = getEmptyCells(board);
  const firstCell: number | undefined = legal[0];

  if (firstCell === undefined) {
    throw new Error("No valid (AI-easy) move exists.");
  }

  let cell: number;
  if (startCell !== undefined && isCellAvailable(board, startCell)) {
    cell = startCell;
  } else {
    const winningCell: number | undefined = legal.find((candidate: number): boolean =>
      isWinCellPlacement(board, candidate, currentPiece),
    );

    cell = winningCell ?? firstCell;
    if (winningCell === undefined) {
      let lowestScore: number = cellPlacementScore(board, cell, currentPiece);

      for (const candidate of legal.slice(1)) {
        const score: number = cellPlacementScore(board, candidate, currentPiece);

        if (score < lowestScore) {
          cell = candidate;
          lowestScore = score;
        }
      }
    }
  }

  const boardAfter: Cell[] = [...board];
  boardAfter[cell] = currentPiece;

  let nxtPiece: PieceId | null = null;

  if (!isBoardFull(boardAfter) && remainingPieces.length > 0) {
    let highestDanger: number = -1;

    for (const candidate of remainingPieces) {
      const danger: number = countWinCells(boardAfter, candidate);

      if (
        danger > highestDanger ||
        (danger === highestDanger && (nxtPiece === null || candidate < nxtPiece))
      ) {
        nxtPiece = candidate;
        highestDanger = danger;
      }
    }
  }

  return {
    cell,
    nxtPiece,
    score: 0,
    depth: 0,
    nodes: 0,
    strategy: "heuristic",
  };
}

function profile(difficulty: Difficulty, remainingPiecesCount: number): SearchProfile {
  if (difficulty === "easy") {
    return { maxNodes: 241, maxDepth: 1 };
  }

  if (difficulty === "medium") {
    return remainingPiecesCount > 6
      ? { maxNodes: 50_641, maxDepth: 2 }
      : { maxNodes: 100_000, maxDepth: 3 };
  }

  // hard difficulty
  let hardDiffMaxNodes: number = Number.POSITIVE_INFINITY;
  let hardDiffMaxDepth: number = CELL_COUNT - remainingPiecesCount + 1;

  if (remainingPiecesCount > 13) {
    hardDiffMaxNodes = 1_000_000;
    hardDiffMaxDepth = 2;
  } else if (remainingPiecesCount > 10) {
    hardDiffMaxNodes = 2_000_000;
    hardDiffMaxDepth = 3;
  } else if (remainingPiecesCount > 7) {
    hardDiffMaxNodes = 4_000_000;
    hardDiffMaxDepth = 4;
  }
  return {
    maxNodes: hardDiffMaxNodes,
    maxDepth: hardDiffMaxDepth,
  };
}

export function findMoveAI(
  board: readonly Cell[],
  remainingPieces: readonly PieceId[],
  currentPiece: PieceId,
  difficulty: Difficulty,
  options: SearchOptions = {},
): MoveAI {
  if (difficulty === "easy" && remainingPieces.length <= 8) {
    return easyMove(board, remainingPieces, currentPiece, options.startCell);
  }

  const { maxNodes, maxDepth } = profile(difficulty, remainingPieces.length);
  const context: SearchContext = {
    maxNodes,
    nodes: 0,
    transposition: new Map(),
  };

  let completed: ScoredMove | null = null;
  let completedDepth: number = 0;

  for (let depth: number = 1; depth <= maxDepth; depth += 1) {
    try {
      completed = searchAtDepth(
        board,
        remainingPieces,
        currentPiece,
        depth,
        context,
        options.startCell,
      );

      completedDepth = depth;
      options.onProgress?.(depth, context.nodes);

      if (completed.score >= MATE_SCORE - CELL_COUNT) {
        break;
      }
    } catch (error: unknown) {
      if (error instanceof SearchLimitErr) break;
      throw error;
    }
  }

  if (completed === null) {
    return {
      ...easyMove(board, remainingPieces, currentPiece, options.startCell),
      nodes: context.nodes,
    };
  }
  return {
    ...completed,
    depth: completedDepth,
    nodes: context.nodes,
    strategy: "search",
  };
}
