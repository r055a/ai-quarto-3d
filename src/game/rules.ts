import type { Cell, PieceId, WinLine } from "./types";

export const BOARD_SIZE: number = 4;
export const CELL_COUNT: number = BOARD_SIZE ** 2;
export const TRAIT_MASK: number = 0b1111;

export const BOARD_WIN_LINES: readonly WinLine[] = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];

const LINES_BY_CELL: readonly (readonly WinLine[])[] = Array.from(
  { length: CELL_COUNT },
  (_: unknown, cell: number): WinLine[] =>
    BOARD_WIN_LINES.filter((line: WinLine): boolean => line.includes(cell)),
);

function isPiece(bitVal: Cell | undefined): bitVal is PieceId {
  return bitVal !== null && bitVal !== undefined;
}

function bitCount(bitVal: number): number {
  let numBits: number = 0;
  while (bitVal !== 0) {
    bitVal &= bitVal - 1;
    numBits += 1;
  }
  return numBits;
}

function computeTraitMask(pieces: readonly PieceId[]): number {
  if (pieces.length !== BOARD_SIZE) return 0;

  let isWinOnes: number = TRAIT_MASK;
  let isWinZeros: number = TRAIT_MASK;

  for (const piece of pieces) {
    isWinOnes &= piece;
    isWinZeros &= ~piece;
  }
  return (isWinOnes | isWinZeros) & TRAIT_MASK;
}

export function getTraitMask(
  board: readonly Cell[],
  line: WinLine,
  placedCell = -1,
  placedPiece?: PieceId,
): number {
  const pieces: PieceId[] = [];
  for (const cell of line) {
    const piece: Cell | undefined = cell === placedCell ? placedPiece : board[cell];

    if (!isPiece(piece)) return 0;
    pieces.push(piece);
  }
  return computeTraitMask(pieces);
}

function isWinLine(
  board: readonly Cell[],
  line: WinLine,
  placedCell = -1,
  placedPiece?: PieceId,
): boolean {
  return getTraitMask(board, line, placedCell, placedPiece) !== 0;
}

export function getWinLine(board: readonly Cell[]): WinLine | null {
  for (const line of BOARD_WIN_LINES) {
    if (isWinLine(board, line)) return line;
  }
  return null;
}

export function getWinLines(board: readonly Cell[]): WinLine[] {
  return BOARD_WIN_LINES.filter((line: WinLine): boolean => isWinLine(board, line));
}

export function isWinCellPlacement(board: readonly Cell[], cell: number, piece: PieceId): boolean {
  if (cell < 0 || cell >= board.length || board[cell] !== null) {
    return false;
  }
  return (
    LINES_BY_CELL[cell]?.some((line: WinLine): boolean => isWinLine(board, line, cell, piece)) ??
    false
  );
}

export function getEmptyCells(board: readonly Cell[]): number[] {
  const cells: number[] = [];
  for (let cell: number = 0; cell < board.length; cell += 1) {
    if (board[cell] === null) cells.push(cell);
  }
  return cells;
}

export function isBoardEmpty(board: readonly Cell[]): boolean {
  return board.length === CELL_COUNT && board.every((cell: Cell): cell is null => cell === null);
}

export function isBoardFull(board: readonly Cell[]): boolean {
  return board.length === CELL_COUNT && board.every((cell: Cell): cell is number => cell !== null);
}

export function cellPlacementScore(board: readonly Cell[], cell: number, piece: PieceId): number {
  let score: number = 0;

  for (const line of LINES_BY_CELL[cell] ?? []) {
    let pieceCount: number = 1;
    let ones: number = piece;
    let zeroes: number = ~piece & TRAIT_MASK;

    for (const lineCell of line) {
      if (lineCell === cell) continue;

      const bitVal: Cell | undefined = board[lineCell];
      if (!isPiece(bitVal)) continue;

      pieceCount += 1;
      ones &= bitVal;
      zeroes &= ~bitVal;
    }
    if (pieceCount < 2) continue;
    const commonTraitCount: number = (ones | zeroes) & TRAIT_MASK;
    score += bitCount(commonTraitCount) * pieceCount ** 2;
  }
  return score;
}
