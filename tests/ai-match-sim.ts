import { findMoveAI, getRandVal, selectStartCell, selectStartPiece } from "../src/ai/search";
import { GAME_PIECES } from "../src/game/pieces";
import { CELL_COUNT, getWinLine, isBoardEmpty, isBoardFull } from "../src/game/rules";
import type { Cell, Difficulty, MoveAI, PieceId, Turn } from "../src/game/types";

export interface TestRunRes {
  winner: Turn | "draw";
  board: Cell[];
  numCellPlacements: number;
}

function toggleTurn(turn: Turn): Turn {
  return turn === "player1" ? "player2" : "player1";
}

function getTurnDiff(turn: Turn, playerOne: Difficulty, playerTwo: Difficulty): Difficulty {
  return turn === "player1" ? playerOne : playerTwo;
}

export function simTestMatch(
  playerOne: Difficulty,
  playerTwo: Difficulty,
  startingPlayer: Turn,
): TestRunRes {
  const random: () => number = getRandVal();
  const board: Cell[] = Array<Cell>(CELL_COUNT).fill(null);
  let remainingPieces: PieceId[] = [...GAME_PIECES];
  let curPlayerTurn: Turn = startingPlayer;
  let pendingPiece: PieceId | null = null;
  let numCellPlacements: number = 0;

  while (true) {
    if (pendingPiece === null) {
      const selectedPiece: number = selectStartPiece(remainingPieces, random);
      remainingPieces = remainingPieces.filter((piece: number): boolean => piece !== selectedPiece);
      pendingPiece = selectedPiece;
      curPlayerTurn = toggleTurn(curPlayerTurn);
      continue;
    }

    const difficulty: Difficulty = getTurnDiff(curPlayerTurn, playerOne, playerTwo);
    const startCell: number | undefined = isBoardEmpty(board)
      ? selectStartCell(board, difficulty, random)
      : undefined;

    const move: MoveAI = findMoveAI(board, remainingPieces, pendingPiece, difficulty, {
      startCell,
    });
    board[move.cell] = pendingPiece;
    pendingPiece = null;
    numCellPlacements += 1;

    if (getWinLine(board) !== null) {
      return {
        winner: curPlayerTurn,
        board,
        numCellPlacements,
      };
    } else if (isBoardFull(board)) {
      return {
        winner: "draw",
        board,
        numCellPlacements,
      };
    }

    const selectedPiece: number | undefined =
      move.nxtPiece !== null && remainingPieces.includes(move.nxtPiece)
        ? move.nxtPiece
        : remainingPieces[0];
    if (selectedPiece === undefined) {
      return {
        winner: "draw",
        board,
        numCellPlacements,
      };
    }

    remainingPieces = remainingPieces.filter((piece: number): boolean => piece !== selectedPiece);
    pendingPiece = selectedPiece;
    curPlayerTurn = toggleTurn(curPlayerTurn);
  }
}
