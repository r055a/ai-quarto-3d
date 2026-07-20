import type { PieceId } from "./types";
import { PIECE_IDS } from "./types";

export const TRAIT_MASK = [0b1000, 0b0010, 0b0001, 0b0100] as const;
const PIECE_TRAIT_MASK = {
  isRound: TRAIT_MASK[2],
  isBig: TRAIT_MASK[1],
  isSolid: TRAIT_MASK[3],
  isDark: TRAIT_MASK[0],
} as const;

export const GAME_PIECES: readonly PieceId[] = PIECE_IDS;

export interface PieceTraits {
  readonly isRound: boolean;
  readonly isBig: boolean;
  readonly isSolid: boolean;
  readonly isDark: boolean;
}

function hasTrait(piece: PieceId, mask: number): boolean {
  return (piece & mask) !== 0;
}

export function getPieceTraits(piece: PieceId): PieceTraits {
  return {
    isRound: hasTrait(piece, PIECE_TRAIT_MASK.isRound),
    isBig: hasTrait(piece, PIECE_TRAIT_MASK.isBig),
    isSolid: hasTrait(piece, PIECE_TRAIT_MASK.isSolid),
    isDark: hasTrait(piece, PIECE_TRAIT_MASK.isDark),
  };
}

function bit(value: boolean): "0" | "1" {
  return value ? "1" : "0";
}

export function pieceStr(piece: PieceId): string {
  const { isDark, isBig, isRound, isSolid } = getPieceTraits(piece);
  return `${bit(isDark)}${bit(isBig)}${bit(isRound)}${bit(!isSolid)}`;
}

export function describePiece(piece: PieceId): string {
  const { isDark, isBig, isRound, isSolid } = getPieceTraits(piece);

  return [
    isDark ? "black" : "red",
    isBig ? "big" : "small",
    isRound ? "round" : "square",
    isSolid ? "solid" : "hollow",
  ].join(", ");
}
