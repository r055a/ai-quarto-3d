import { getRandVal, selectStartCell, selectStartPiece } from "../ai/search";
import { GAME_PIECES, pieceStr, TRAIT_MASK } from "../game/pieces";
import {
  CELL_COUNT,
  getTraitMask,
  getWinLine,
  getWinLines,
  isBoardEmpty,
  isBoardFull,
} from "../game/rules";
import { getRedoTarget, getUndoTarget, type HistEvent, type HistEventType } from "../game/state";
import type {
  Cell,
  Difficulty,
  GameMode,
  Participant,
  Phase,
  PieceId,
  RequestAI,
  ResponseAI,
  Starter,
  Turn,
  WinLine,
} from "../game/types";
import { diffLabel, onLangChange, translate, translateTraits } from "../i18n";
import type { GameScene } from "../render/GameScene";

type StepAI = "select-open" | HistEventType | null;

interface Elements {
  binCells: HTMLElement[];
  binWinOverlay: SVGSVGElement;
  detail: HTMLElement;
  diffAI: HTMLSelectElement;
  diffPlayerOneAI: HTMLSelectElement;
  diffPlayerTwoAI: HTMLSelectElement;
  gameMode: HTMLSelectElement;
  newGame: HTMLButtonElement;
  pauseToggleAI: HTMLButtonElement;
  pieceName: HTMLElement;
  pieceStr: HTMLElement;
  redo: HTMLButtonElement;
  starter: HTMLSelectElement;
  status: HTMLElement;
  thinking: HTMLElement;
  thinkingLabel: HTMLElement;
  turnBadge: HTMLElement;
  undo: HTMLButtonElement;
  wrapDiffAI: HTMLElement;
  wrapDiffPlayerOneAI: HTMLElement;
  wrapDiffPlayerTwoAI: HTMLElement;
}

interface TimerAI {
  callback: () => void;
  id: number | null;
  remainingMS: number;
  startedAt: number;
}

interface DeferMoveAI {
  cell: number;
  nxtPiece: PieceId | null;
  reqId: number;
}

interface GameState {
  activeTurn: Turn;
  nxtPieceAI: PieceId | null;
  stepAI: StepAI;
  board: Cell[];
  pendingPiece: PieceId | null;
  phase: Phase;
  remaining: PieceId[];
  turnId: number;
  winner: Turn | "draw" | null;
}

class GameController {
  private board: Cell[] = Array(CELL_COUNT).fill(null);
  private remaining: PieceId[] = [...GAME_PIECES];
  private pendingPiece: PieceId | null = null;
  private phase: Phase = "select";
  private activeTurn: Turn = "player1";
  private winner: Turn | "draw" | null = null;
  private requestId: number = 0;
  private random: () => number = getRandVal();
  private isPauseAI: boolean = false;
  private timerAI: TimerAI | null = null;
  private activeReqAI: RequestAI | null = null;
  private deferMoveAI: DeferMoveAI | null = null;
  private pendRecoverAI: boolean = false;
  private worker: Worker | null = null;
  private turnId: number = 0;
  private stepAI: StepAI = null;
  private nxtPieceAI: PieceId | null = null;
  private histEvents: HistEvent[] = [];
  private histStates: GameState[] = [];
  private histIdx: number = 0;
  private isReview: boolean = false;

  constructor(
    private readonly scene: GameScene,
    private readonly elements: Elements,
  ) {
    onLangChange((): void => {
      this.updateStartOptions();
      this.updateUI();
    });
    this.elements.pauseToggleAI.addEventListener("click", this.togglePauseAI);
    this.elements.newGame.addEventListener("click", this.newGame);
    this.elements.starter.addEventListener("change", this.newGame);
    this.elements.gameMode.addEventListener("change", (): void => {
      this.start();
    });
    this.elements.undo.addEventListener("click", this.undo);
    this.elements.redo.addEventListener("click", this.redo);

    for (const control of [
      this.elements.diffAI,
      this.elements.diffPlayerOneAI,
      this.elements.diffPlayerTwoAI,
    ]) {
      control.addEventListener("change", (): void => {
        this.updateStartOptions();
        this.updateUI();
      });
    }
  }

  start(): void {
    this.configModeControls();
    this.newGame();
  }

  handlePieceClick(piece: PieceId): void {
    if (
      this.isReview ||
      this.phase !== "select" ||
      !this.isTurnUser(this.activeTurn) ||
      !this.remaining.includes(piece)
    ) {
      return;
    }
    this.passPiece(piece);
  }

  handleCellClick(cell: number): void {
    if (
      this.isReview ||
      this.phase !== "place" ||
      !this.isTurnUser(this.activeTurn) ||
      this.pendingPiece === null ||
      !this.isValidCell(cell)
    ) {
      return;
    }

    const turnPlayer: Turn = this.activeTurn;
    const turnId: number = this.turnId;

    this.board[cell] = this.pendingPiece;
    this.pendingPiece = null;
    this.stepAI = null;
    this.nxtPieceAI = null;

    if (this.isGameFinn(turnPlayer)) {
      this.saveGameState(turnPlayer, turnId, "place");
      return;
    }
    this.phase = "select";
    this.updateUI();
    this.saveGameState(turnPlayer, turnId, "place");
  }

  handlePieceHover(piece: PieceId | null): void {
    if (piece === null || this.pendingPiece !== null) {
      this.renderPendingPiece();
      return;
    }
    this.elements.pieceName.textContent = translateTraits(piece);
    this.elements.pieceStr.textContent = pieceStr(piece);
  }

  private readonly newGame: () => void = (): void => {
    this.requestId += 1;
    this.timerClearAI(true);
    this.workerTerminate();
    this.activeReqAI = null;
    this.deferMoveAI = null;
    this.pendRecoverAI = false;
    this.isPauseAI = false;
    this.random = getRandVal();
    this.board = Array(CELL_COUNT).fill(null);
    this.remaining = [...GAME_PIECES];
    this.pendingPiece = null;
    this.winner = null;
    this.activeTurn = this.getRandomStarter(this.elements.starter.value as Starter);
    this.phase = "select";
    this.stepAI = null;
    this.nxtPieceAI = null;
    this.isReview = false;
    this.turnId = 0;
    this.histEvents = [];
    this.histStates = [];
    this.histIdx = 0;
    this.startTurn();
    this.histStates = [this.captureGameState()];
    this.updateHistControl();
  };

  private updateStartOptions(): void {
    for (const turn of ["player1", "player2"] as const) {
      const option: HTMLOptionElement | null =
        this.elements.starter.querySelector<HTMLOptionElement>(`option[value="${turn}"]`);
      if (option !== null) option.textContent = this.turnLabel(turn);
    }
  }

  private configModeControls(): void {
    const mode: GameMode = this.gameMode();
    const isUserVsAi: boolean = mode === "human-ai";
    const isAiVsAi: boolean = mode === "ai-ai";

    this.elements.diffAI.disabled = !isUserVsAi;
    this.elements.wrapDiffAI.hidden = !isUserVsAi;

    this.elements.diffPlayerOneAI.disabled = !isAiVsAi;
    this.elements.diffPlayerTwoAI.disabled = !isAiVsAi;
    this.elements.wrapDiffPlayerOneAI.hidden = !isAiVsAi;
    this.elements.wrapDiffPlayerTwoAI.hidden = !isAiVsAi;

    this.updateStartOptions();
  }

  private startTurn(): void {
    if (this.getTurnPlayer(this.activeTurn) === "ai") {
      this.phase = "thinking";
      this.stepAI = this.pendingPiece === null ? "select-open" : "place";
      this.nxtPieceAI = null;
      this.updateUI();
      this.turnScheduleAI(this.pendingPiece === null ? 400 : 650);
      return;
    }
    this.phase = this.pendingPiece === null ? "select" : "place";
    this.isPauseAI = false;
    this.stepAI = null;
    this.nxtPieceAI = null;
    this.updateUI();
  }

  private turnScheduleAI(delayMS: number): void {
    const turnID: number = this.requestId;
    this.timerSetAI(delayMS, (): void => {
      this.turnResumeAI(turnID);
    });
  }

  private turnSelectAI(piece: PieceId | null, turnID: number): void {
    if (!this.isCurTurnAI(turnID) || this.stepAI !== "select") return;
    const selectedPiece: PieceId | null =
      piece !== null && this.remaining.includes(piece) ? piece : (this.remaining[0] ?? null);
    if (selectedPiece === null) {
      this.gameFinn("draw");
      return;
    }
    this.passPiece(selectedPiece);
  }

  private turnResumeAI(turnID: number): void {
    if (!this.isCurTurnAI(turnID)) return;
    else if (this.stepAI === "select-open") {
      this.selectStartPieceAI(turnID);
      return;
    } else if (this.stepAI === "place") {
      this.requestMoveAI();
      return;
    } else if (this.stepAI === "select") {
      this.turnSelectAI(this.nxtPieceAI, turnID);
    }
  }

  private isCurTurnAI(turnID = this.requestId): boolean {
    return (
      !this.isReview &&
      turnID === this.requestId &&
      this.phase === "thinking" &&
      this.getTurnPlayer(this.activeTurn) === "ai"
    );
  }

  private selectStartPieceAI(turnID: number): void {
    if (!this.isCurTurnAI(turnID) || this.pendingPiece !== null || this.remaining.length === 0) {
      return;
    }
    this.passPiece(selectStartPiece(this.remaining, this.random));
  }

  private passPiece(piece: PieceId): void {
    const curPlayer: Turn = this.activeTurn;
    const turnId: number = this.turnId;

    this.remaining = this.remaining.filter((bitVal: number): boolean => bitVal !== piece);
    this.pendingPiece = piece;
    this.activeTurn = this.toggleTurn(this.activeTurn);
    this.turnId += 1;

    this.startTurn();
    this.saveGameState(curPlayer, turnId, "select");
  }

  private requestMoveAI(): void {
    if (this.pendingPiece === null) return;

    const diff: Difficulty = this.turnDiff(this.activeTurn);
    this.activeReqAI = {
      type: "find-move",
      reqId: ++this.requestId,
      board: [...this.board],
      remaining: [...this.remaining],
      curPiece: this.pendingPiece,
      diff,
      ...(isBoardEmpty(this.board)
        ? {
            startCell: selectStartCell(this.board, diff, this.random),
          }
        : {}),
    };
    this.postActiveReqAI();
  }

  private postActiveReqAI(): void {
    if (this.isReview || this.isPauseAI || this.activeReqAI === null) return;
    this.workerTerminate();
    this.worker = new Worker(new URL("../ai/ai.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.onWorkerMsg);
    this.worker.postMessage(this.activeReqAI);
  }

  private workerTerminate(): void {
    if (this.worker === null) return;
    this.worker.removeEventListener("message", this.onWorkerMsg);
    this.worker.terminate();
    this.worker = null;
  }

  private readonly togglePauseAI: () => void = (): void => {
    if (
      this.isReview ||
      this.phase !== "thinking" ||
      this.getTurnPlayer(this.activeTurn) !== "ai"
    ) {
      return;
    }

    this.isPauseAI = !this.isPauseAI;
    if (this.isPauseAI) {
      this.timerPauseAI();
      this.workerTerminate();
      this.updateUI();
      return;
    }

    this.updateUI();
    if (this.timerAI !== null) {
      this.timerResumeAI();
      return;
    }

    if (this.deferMoveAI !== null) {
      const move: DeferMoveAI = this.deferMoveAI;
      this.deferMoveAI = null;
      void this.applyMoveAI(move.cell, move.nxtPiece, move.reqId);
      return;
    }

    if (this.pendRecoverAI) {
      this.pendRecoverAI = false;
      this.recoverFB();
      return;
    }

    this.postActiveReqAI();
  };

  private readonly undo: () => void = (): void => {
    if (!this.isHistNav() || this.histIdx <= 0) return;
    const target: number = getUndoTarget(
      this.histEvents,
      this.histIdx,
      this.isReview,
      (action: HistEvent): boolean => this.getTurnPlayer(action.curPlayer) === "ai",
    );
    this.restoreHistory(target);
  };

  private readonly redo: () => void = (): void => {
    if (!this.isHistNav() || this.histIdx >= this.histEvents.length) return;
    const target: number = getRedoTarget(
      this.histEvents,
      this.histIdx,
      this.isReview,
      (action: HistEvent): boolean => this.getTurnPlayer(action.curPlayer) === "ai",
    );
    this.restoreHistory(target);
  };

  private readonly onWorkerMsg: (event: MessageEvent<ResponseAI>) => void = (
    event: MessageEvent<ResponseAI>,
  ): void => {
    const res: ResponseAI = event.data;
    if (
      res.reqId !== this.requestId ||
      res.reqId !== this.activeReqAI?.reqId ||
      res.type === "progress"
    ) {
      return;
    }

    this.workerTerminate();
    this.activeReqAI = null;

    if (res.type === "error") {
      if (this.isPauseAI) {
        this.pendRecoverAI = true;
        return;
      }
      this.recoverFB();
      return;
    }

    if (this.isPauseAI) {
      this.deferMoveAI = {
        cell: res.move.cell,
        nxtPiece: res.move.nxtPiece,
        reqId: res.reqId,
      };
      return;
    }
    void this.applyMoveAI(res.move.cell, res.move.nxtPiece, res.reqId);
  };

  private async applyMoveAI(
    cell: number,
    nxtPiece: PieceId | null,
    moveRequestId: number = this.requestId,
  ): Promise<void> {
    if (moveRequestId !== this.requestId || !this.isCurTurnAI() || this.pendingPiece === null) {
      return;
    }

    if (this.isPauseAI) {
      this.deferMoveAI = {
        cell,
        nxtPiece,
        reqId: moveRequestId,
      };
      return;
    }

    if (!this.isValidCell(cell)) {
      this.recoverFB();
      return;
    }

    const curPlayer: Turn = this.activeTurn;
    const turnId: number = this.turnId;
    const selectedPiece: PieceId | null =
      nxtPiece !== null && this.remaining.includes(nxtPiece)
        ? nxtPiece
        : (this.remaining[0] ?? null);

    this.board[cell] = this.pendingPiece;
    this.pendingPiece = null;

    this.stepAI = "select";
    this.nxtPieceAI = selectedPiece;

    if (this.isGameFinn(curPlayer)) {
      this.saveGameState(curPlayer, turnId, "place");
      return;
    }

    this.syncScene();
    this.saveGameState(curPlayer, turnId, "place");
    await this.delayAI(520);

    if (moveRequestId !== this.requestId) return;
    this.turnSelectAI(selectedPiece, moveRequestId);
  }

  private isValidCell(cell: number): boolean {
    return (
      Number.isInteger(cell) && cell >= 0 && cell < this.board.length && this.board[cell] === null
    );
  }

  private recoverFB(): void {
    if (this.pendingPiece === null) return;

    if (this.isPauseAI) {
      this.pendRecoverAI = true;
      return;
    }

    const cell: number = isBoardEmpty(this.board)
      ? selectStartCell(this.board, this.turnDiff(this.activeTurn), this.random)
      : this.board.indexOf(null);

    if (cell < 0) {
      this.gameFinn("draw");
      return;
    }
    void this.applyMoveAI(cell, this.remaining[0] ?? null, this.requestId);
  }

  private isGameFinn(curTurn: Turn): boolean {
    if (getWinLine(this.board) !== null) {
      this.gameFinn(curTurn);
      return true;
    }
    if (isBoardFull(this.board)) {
      this.gameFinn("draw");
      return true;
    }
    return false;
  }

  private gameFinn(curTurn: Turn | "draw"): void {
    this.requestId += 1;
    this.timerClearAI(true);
    this.workerTerminate();
    this.activeReqAI = null;
    this.deferMoveAI = null;
    this.pendRecoverAI = false;
    this.winner = curTurn;
    this.phase = "finished";
    this.pendingPiece = null;
    this.isPauseAI = false;
    this.stepAI = null;
    this.nxtPieceAI = null;
    this.isReview = true;
    this.updateUI();
  }

  private captureGameState(): GameState {
    return {
      activeTurn: this.activeTurn,
      nxtPieceAI: this.nxtPieceAI,
      stepAI: this.stepAI,
      board: [...this.board],
      pendingPiece: this.pendingPiece,
      phase: this.phase,
      remaining: [...this.remaining],
      turnId: this.turnId,
      winner: this.winner,
    };
  }

  private saveGameState(curPlayer: Turn, turnId: number, eventType: HistEventType): void {
    if (this.histIdx < this.histEvents.length) {
      this.histEvents.splice(this.histIdx);
      this.histStates.splice(this.histIdx + 1);
    }

    this.histEvents.push({ curPlayer, eventType, turnId });
    this.histStates.push(this.captureGameState());
    this.histIdx = this.histEvents.length;
    this.updateHistControl();
  }

  private restoreHistory(target: number): void {
    const snapshot: GameState | undefined = this.histStates[target];
    if (snapshot === undefined) return;

    this.requestId += 1;
    this.timerClearAI(true);
    this.workerTerminate();
    this.activeReqAI = null;
    this.deferMoveAI = null;
    this.pendRecoverAI = false;

    this.board = [...snapshot.board];
    this.remaining = [...snapshot.remaining];
    this.pendingPiece = snapshot.pendingPiece;
    this.phase = snapshot.phase;
    this.activeTurn = snapshot.activeTurn;
    this.winner = snapshot.winner;
    this.turnId = snapshot.turnId;
    this.stepAI = snapshot.stepAI;
    this.nxtPieceAI = snapshot.nxtPieceAI;
    this.histIdx = target;

    const isAIState: boolean =
      !this.isReview && this.phase === "thinking" && this.getTurnPlayer(this.activeTurn) === "ai";
    this.isPauseAI = isAIState;
    this.updateUI();

    if (isAIState) {
      const delayMS: number =
        this.stepAI === "select-open" ? 400 : this.stepAI === "select" ? 520 : 650;
      this.turnScheduleAI(delayMS);
    }
  }

  private isHistNav(): boolean {
    return (
      this.isReview ||
      this.phase !== "thinking" ||
      this.getTurnPlayer(this.activeTurn) !== "ai" ||
      this.isPauseAI
    );
  }

  private updateHistControl(): void {
    const canNavigate: boolean = this.isHistNav();
    this.elements.undo.disabled = !canNavigate || this.histIdx <= 0;
    this.elements.redo.disabled = !canNavigate || this.histIdx >= this.histEvents.length;

    const undoLbl: string = translate("controls.undo");
    this.elements.undo.setAttribute("aria-label", undoLbl);
    this.elements.undo.title = undoLbl;

    const redoLbl: string = translate("controls.redo");
    this.elements.redo.setAttribute("aria-label", redoLbl);
    this.elements.redo.title = redoLbl;
  }

  private updateUI(): void {
    this.syncScene();
    this.elements.thinking.hidden = this.isReview || this.phase !== "thinking";
    this.elements.thinking.classList.toggle("is-paused", this.isPauseAI);
    this.elements.thinkingLabel.textContent = translate(
      this.isPauseAI ? "status.thinkingAIPaused" : "status.thinkingAI",
    );

    const pauseControlLabel: string = translate(
      this.isPauseAI ? "controls.resumeAI" : "controls.pauseAI",
    );
    this.elements.pauseToggleAI.setAttribute("aria-label", pauseControlLabel);
    this.elements.pauseToggleAI.setAttribute("aria-pressed", String(this.isPauseAI));
    this.elements.pauseToggleAI.title = pauseControlLabel;
    this.updateHistControl();

    if (this.phase === "finished") {
      if (this.winner === "draw") {
        this.elements.turnBadge.textContent = translate("status.badgeDraw");
        this.elements.status.textContent = translate("status.statusDraw");
        this.elements.detail.textContent = translate("status.detailDraw");
      } else if (this.winner !== null) {
        const winnerName: string = this.turnLabel(this.winner);
        const gameMode: GameMode = this.gameMode();
        const isWonUser: boolean = gameMode === "human-ai" && this.winner === "player1";
        const isWonAI: boolean = gameMode === "human-ai" && this.winner === "player2";

        this.elements.turnBadge.textContent = isWonUser
          ? translate("status.badgeVictory")
          : isWonAI
            ? translate("status.badgeVictoryAI")
            : translate("status.badgeVictoryPlayer", { player: winnerName });
        this.elements.status.textContent = isWonUser
          ? translate("status.statusWinYou")
          : isWonAI
            ? translate("status.statusWinAI")
            : translate("status.statusWinPlayer", { player: winnerName });
        this.elements.detail.textContent = translate("status.detailWin");
      }
      this.renderPendingPiece();
      return;
    }

    const actor: string = this.turnLabel(this.activeTurn);
    const opponent: string = this.turnLabel(this.toggleTurn(this.activeTurn));
    const isUserTurn: boolean = this.gameMode() === "human-ai" && this.activeTurn === "player1";

    if (this.phase === "thinking") {
      this.elements.turnBadge.textContent = translate("status.badgeTurnAI", { player: actor });
      this.elements.status.textContent =
        this.pendingPiece === null
          ? translate("status.statusTurnOpponentStart", { player: actor })
          : translate("status.statusTurnOpponent", { player: actor });
      this.elements.detail.textContent =
        this.pendingPiece === null
          ? translate("status.detailTurnStartAI", { opponent })
          : translate("status.detailTurnAI", { player: actor, opponent });
      this.renderPendingPiece();
      return;
    }

    if (this.phase === "place") {
      this.elements.turnBadge.textContent = isUserTurn
        ? translate("status.badgeTurnPlaceYou")
        : translate("status.badgeTurnPlacePlayer", { player: actor });
      this.elements.status.textContent = isUserTurn
        ? translate("status.statusTurnPlayerPlaceVsAI", { opponent })
        : translate("status.statusTurnPlayerPlace", { player: actor });
      this.elements.detail.textContent = translate("status.detailTurnPlace");
      this.renderPendingPiece();
      return;
    }

    this.elements.turnBadge.textContent = isUserTurn
      ? translate("status.badgeTurnSelectYou")
      : translate("status.badgeTurnSelectPlayer", { player: actor });
    this.elements.status.textContent = isUserTurn
      ? translate("status.statusTurnPlayerSelect", { opponent })
      : translate("status.statusTurnPlayerSelectVsAI", { player: actor, opponent });
    this.elements.detail.textContent = translate("status.detailTurnSelect");
    this.renderPendingPiece();
  }

  private renderPendingPiece(): void {
    if (this.pendingPiece === null) {
      this.elements.pieceName.textContent = translate("piece.none");
      this.elements.pieceStr.textContent = "----";
      return;
    }
    this.elements.pieceName.textContent = translateTraits(this.pendingPiece);
    this.elements.pieceStr.textContent = pieceStr(this.pendingPiece);
  }

  private syncScene(): void {
    this.scene.setState({
      board: this.board,
      remaining: this.remaining,
      pendingPiece: this.pendingPiece,
      phase: this.phase,
    });
    this.renderBinBoard();
  }

  private renderWinBinBits(element: HTMLElement, piece: PieceId, winTraits = 0): void {
    const pieceBinStr: string = pieceStr(piece);

    const bits: HTMLSpanElement[] = [...pieceBinStr].map(
      (bit: string, index: number): HTMLSpanElement => {
        const span: HTMLSpanElement = document.createElement("span");
        span.textContent = bit;
        span.className = "bin-bit";

        const traitMask: 1 | 2 | 4 | 8 | undefined = TRAIT_MASK[index];
        if (traitMask !== undefined && (winTraits & traitMask) !== 0) {
          span.classList.add("win-bit");
        }
        return span;
      },
    );
    element.replaceChildren(...bits);
  }

  private renderBinBoard(): void {
    const winLines: WinLine[] = this.phase === "finished" ? getWinLines(this.board) : [];
    const showWinLine: boolean = winLines.length > 0;
    const winTraitsByCell = new Map<number, number>();
    for (const winLine of winLines) {
      const winTraits: number = getTraitMask(this.board, winLine);
      for (const cell of winLine) {
        winTraitsByCell.set(cell, (winTraitsByCell.get(cell) ?? 0) | winTraits);
      }
    }

    for (const [cell, element] of this.elements.binCells.entries()) {
      const piece: Cell | undefined = this.board[cell];
      const winTraits: number = winTraitsByCell.get(cell) ?? 0;
      const isWinCell: boolean = showWinLine && winTraitsByCell.has(cell);
      element.classList.toggle("win", isWinCell);

      if (piece === null || piece === undefined) {
        element.textContent = "----";
        element.classList.remove("occupied");
        element.setAttribute("aria-label", `Cell ${cell + 1}: empty`);
        continue;
      }

      const pieceBinStr: string = pieceStr(piece);
      this.renderWinBinBits(element, piece, winTraits);
      element.classList.add("occupied");
      element.setAttribute("aria-label", `Cell ${cell + 1}: ${pieceBinStr}`);
    }
    this.elements.binWinOverlay.toggleAttribute("hidden", !showWinLine);
  }

  private getTurnPlayer(turn: Turn): Participant {
    const mode: GameMode = this.gameMode();
    if (mode === "human-human") return "human";
    if (mode === "ai-ai") return "ai";
    return turn === "player1" ? "human" : "ai";
  }

  private isTurnUser(turn: Turn): boolean {
    return this.getTurnPlayer(turn) === "human";
  }

  private gameMode(): GameMode {
    return this.elements.gameMode.value as GameMode;
  }

  private turnDiff(turn: Turn): Difficulty {
    if (this.gameMode() !== "ai-ai") {
      return this.elements.diffAI.value as Difficulty;
    }
    return (
      turn === "player1" ? this.elements.diffPlayerOneAI.value : this.elements.diffPlayerTwoAI.value
    ) as Difficulty;
  }

  private turnLabel(turn: Turn): string {
    const mode: GameMode = this.gameMode();
    if (mode === "human-human") {
      return translate(turn === "player1" ? "player.playerOne" : "player.playerTwo");
    }
    if (mode === "human-ai") {
      return turn === "player1"
        ? translate("player.playerYou")
        : translate("player.playerAI", { difficulty: diffLabel(this.turnDiff(turn)) });
    }
    return translate("player.playerDiffAI", {
      number: turn === "player1" ? "1" : "2",
      difficulty: diffLabel(this.turnDiff(turn)),
    });
  }

  private getRandomStarter(starter: Starter): Turn {
    if (starter !== "random") return starter;
    return this.random() < 0.5 ? "player1" : "player2";
  }

  private toggleTurn(turn: Turn): Turn {
    return turn === "player1" ? "player2" : "player1";
  }

  private delayAI(ms: number): Promise<void> {
    return new Promise((resolve: () => void): void => {
      this.timerSetAI(ms, resolve);
    });
  }

  private timerSetAI(delayMS: number, callback: () => void): void {
    this.timerClearAI();
    this.timerAI = {
      callback,
      id: null,
      remainingMS: Math.max(0, delayMS),
      startedAt: 0,
    };
    this.timerResumeAI();
  }

  private timerResumeAI(): void {
    const timer: TimerAI | null = this.timerAI;
    if (timer === null || timer.id !== null || this.isPauseAI || this.isReview) return;
    timer.startedAt = performance.now();
    timer.id = window.setTimeout((): void => {
      if (this.timerAI !== timer) return;
      timer.id = null;
      this.timerAI = null;
      timer.callback();
    }, timer.remainingMS);
  }

  private timerPauseAI(): void {
    const timer: TimerAI | null = this.timerAI;
    if (timer === null || timer.id === null) return;
    window.clearTimeout(timer.id);
    timer.id = null;
    timer.remainingMS = Math.max(0, timer.remainingMS - (performance.now() - timer.startedAt));
  }

  private timerClearAI(runCallback = false): void {
    const timer: TimerAI | null = this.timerAI;
    if (timer === null) return;
    if (timer.id !== null) window.clearTimeout(timer.id);
    this.timerAI = null;
    if (runCallback) timer.callback();
  }
}

export default GameController;
