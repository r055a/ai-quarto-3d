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

interface Elements {
  pauseToggleAI: HTMLButtonElement;
  binCells: HTMLElement[];
  binWinOverlay: SVGSVGElement;
  detail: HTMLElement;
  diffAI: HTMLSelectElement;
  diffPlayerOneAI: HTMLSelectElement;
  diffPlayerTwoAI: HTMLSelectElement;
  gameMode: HTMLSelectElement;
  newGame: HTMLButtonElement;
  pieceName: HTMLElement;
  pieceStr: HTMLElement;
  starter: HTMLSelectElement;
  status: HTMLElement;
  thinking: HTMLElement;
  thinkingLabel: HTMLElement;
  turnBadge: HTMLElement;
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
      this.phase !== "place" ||
      !this.isTurnUser(this.activeTurn) ||
      this.pendingPiece === null ||
      !this.isValidCell(cell)
    ) {
      return;
    }

    this.board[cell] = this.pendingPiece;
    this.pendingPiece = null;

    if (this.isGameFinn(this.activeTurn)) return;
    this.phase = "select";
    this.updateUI();
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
    this.startTurn();
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
      this.updateUI();
      this.scheduleTurnAI(this.pendingPiece === null ? 400 : 650);
      return;
    }
    this.phase = this.pendingPiece === null ? "select" : "place";
    this.updateUI();
  }

  private scheduleTurnAI(delayMS: number): void {
    const turnID: number = this.requestId;
    this.timerSetAI(delayMS, (): void => {
      if (!this.isCurTurnAI(turnID)) return;
      if (this.pendingPiece === null) {
        this.selectStartPieceAI(turnID);
      } else {
        this.requestMoveAI();
      }
    });
  }

  private isCurTurnAI(turnID = this.requestId): boolean {
    return (
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
    this.remaining = this.remaining.filter((bitVal: number): boolean => bitVal !== piece);
    this.pendingPiece = piece;
    this.activeTurn = this.toggleTurn(this.activeTurn);
    this.startTurn();
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
    if (this.isPauseAI || this.activeReqAI === null) return;
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
    if (this.phase !== "thinking" || this.getTurnPlayer(this.activeTurn) !== "ai") return;

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

    const curTurn: Turn = this.activeTurn;
    this.board[cell] = this.pendingPiece;
    this.pendingPiece = null;
    this.syncScene();

    await this.delayAI(520);

    if (moveRequestId !== this.requestId) return;
    if (this.isGameFinn(curTurn)) return;

    const selected: number | null =
      nxtPiece !== null && this.remaining.includes(nxtPiece)
        ? nxtPiece
        : (this.remaining[0] ?? null);
    if (selected === null) {
      this.gameFinn("draw");
      return;
    }

    this.remaining = this.remaining.filter((piece: number): boolean => piece !== selected);
    this.pendingPiece = selected;
    this.activeTurn = this.toggleTurn(curTurn);
    this.startTurn();
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
    this.updateUI();
  }

  private updateUI(): void {
    this.syncScene();
    this.elements.thinking.hidden = this.phase !== "thinking";
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
    if (timer === null || timer.id !== null || this.isPauseAI) return;
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
