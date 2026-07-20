import { getRandVal, selectStartCell, selectStartPiece } from "../ai/search";
import { describePiece, GAME_PIECES, pieceStr, TRAIT_MASK } from "../game/pieces";
import { CELL_COUNT, getTraitMask, getWinLine, isBoardEmpty, isBoardFull } from "../game/rules";
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
import type { GameScene } from "../render/GameScene";

interface Elements {
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
  turnBadge: HTMLElement;
  wrapDiffAI: HTMLElement;
  wrapDiffPlayerOneAI: HTMLElement;
  wrapDiffPlayerTwoAI: HTMLElement;
}

export class GameController {
  private board: Cell[] = Array(CELL_COUNT).fill(null);
  private remaining: PieceId[] = [...GAME_PIECES];
  private pendingPiece: PieceId | null = null;
  private phase: Phase = "select";
  private activeTurn: Turn = "player1";
  private winner: Turn | "draw" | null = null;
  private requestId: number = 0;
  private random: () => number = getRandVal();
  private readonly worker: Worker = new Worker(new URL("../ai/ai.worker.ts", import.meta.url), {
    type: "module",
  });

  constructor(
    private readonly scene: GameScene,
    private readonly elements: Elements,
  ) {
    this.worker.addEventListener("message", this.onWorkerMsg);
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
    this.elements.pieceName.textContent = describePiece(piece);
    this.elements.pieceStr.textContent = pieceStr(piece);
  }

  private readonly newGame: () => void = (): void => {
    this.requestId += 1;
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
    window.setTimeout((): void => {
      if (!this.isCurTurnAI(turnID)) return;
      if (this.pendingPiece === null) {
        this.selectStartPieceAI(turnID);
      } else {
        this.requestMoveAI();
      }
    }, delayMS);
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
    const request: RequestAI = {
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
    this.worker.postMessage(request);
  }

  private readonly onWorkerMsg: (event: MessageEvent<ResponseAI>) => void = (
    event: MessageEvent<ResponseAI>,
  ): void => {
    const response: ResponseAI = event.data;
    if (response.reqId !== this.requestId || response.type === "progress") {
      return;
    }
    if (response.type === "error") {
      this.recoverFB();
      return;
    }
    void this.applyMoveAI(response.move.cell, response.move.nxtPiece, response.reqId);
  };

  private async applyMoveAI(
    cell: number,
    nextPiece: PieceId | null,
    moveRequestId: number = this.requestId,
  ): Promise<void> {
    if (moveRequestId !== this.requestId || !this.isCurTurnAI() || this.pendingPiece === null) {
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

    await this.delay(520);

    if (moveRequestId !== this.requestId) return;
    if (this.isGameFinn(curTurn)) return;

    const selected: number | null =
      nextPiece !== null && this.remaining.includes(nextPiece)
        ? nextPiece
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
    this.winner = curTurn;
    this.phase = "finished";
    this.pendingPiece = null;
    this.updateUI();
  }

  private updateUI(): void {
    this.syncScene();
    this.elements.thinking.hidden = this.phase !== "thinking";

    if (this.phase === "finished") {
      if (this.winner === "draw") {
        this.elements.turnBadge.textContent = "Draw";
        this.elements.status.textContent = "The game is a draw.";
        this.elements.detail.textContent = "No moves remain to make a winning line.";
      } else if (this.winner !== null) {
        const winnerName: string = this.turnLabel(this.winner);
        const gameMode: string = this.gameMode();
        const isWonUser: boolean = gameMode === "human-ai" && this.winner === "player1";
        const isWonAI: boolean = gameMode === "human-ai" && this.winner === "player2";

        this.elements.turnBadge.textContent = isWonUser
          ? "Victory"
          : isWonAI
            ? "AI victory"
            : `${winnerName} victory`;
        this.elements.status.textContent = isWonUser
          ? "You win."
          : isWonAI
            ? "The AI player wins."
            : `${winnerName} wins.`;
        this.elements.detail.textContent = "The winning piece sequence is highlighted.";
      }
      this.renderPendingPiece();
      return;
    }

    const actor: string = this.turnLabel(this.activeTurn);
    const opponent: string = this.turnLabel(this.toggleTurn(this.activeTurn));

    if (this.phase === "thinking") {
      this.elements.turnBadge.textContent = `${actor}'s turn`;
      this.elements.status.textContent =
        this.pendingPiece === null ? `${actor} is choosing the opening piece.` : `${actor} play...`;
      this.elements.detail.textContent =
        this.pendingPiece === null
          ? `The selected piece will be passed to ${opponent}.`
          : `${actor} is placing a piece and then selecting a new piece for ${opponent}.`;
      this.renderPendingPiece();
      return;
    }

    if (this.phase === "place") {
      this.elements.turnBadge.textContent =
        actor === "You" ? "Your turn: place a piece" : `${actor}'s turn: place a piece`;
      this.elements.status.textContent =
        actor === "You"
          ? `Place the piece ${opponent} has selected.`
          : `${actor}: place the received piece.`;
      this.elements.detail.textContent = "Click any highlighted board circle.";
      this.renderPendingPiece();
      return;
    }

    this.elements.turnBadge.textContent =
      actor === "You" ? "Your turn: select a piece" : `${actor}'s turn: select a piece`;
    this.elements.status.textContent =
      actor === "You"
        ? `Select a piece for ${opponent} to place.`
        : `${actor}: select a piece for ${opponent} to place.`;
    this.elements.detail.textContent = "Select any available red or black piece.";
    this.renderPendingPiece();
  }

  private renderPendingPiece(): void {
    if (this.pendingPiece === null) {
      this.elements.pieceName.textContent = "None selected";
      this.elements.pieceStr.textContent = "----";
      return;
    }
    this.elements.pieceName.textContent = describePiece(this.pendingPiece);
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
    const winLine: WinLine | null = getWinLine(this.board);
    const showWinLine: boolean = this.phase === "finished" && winLine !== null;
    const winTraits: number =
      showWinLine && winLine !== null ? getTraitMask(this.board, winLine) : 0;

    for (const [cell, element] of this.elements.binCells.entries()) {
      const piece: Cell | undefined = this.board[cell];
      const isWinCell: boolean | undefined = showWinLine && winLine?.includes(cell);
      element.classList.toggle("win", isWinCell);

      if (piece === null || piece === undefined) {
        element.textContent = "----";
        element.classList.remove("occupied");
        element.setAttribute("aria-label", `Cell ${cell + 1}: empty`);
        continue;
      }

      const pieceBinStr: string = pieceStr(piece);
      this.renderWinBinBits(element, piece, isWinCell ? winTraits : 0);
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
    if (mode === "human-human") return turn === "player1" ? "Player 1" : "Player 2";
    if (mode === "human-ai") {
      return turn === "player1" ? "You" : `AI (${this.turnDiff(turn)})`;
    }
    return `AI-P${turn === "player1" ? "1" : "2"} (${this.turnDiff(turn)})`;
  }

  private getRandomStarter(starter: Starter): Turn {
    if (starter !== "random") return starter;
    return this.random() < 0.5 ? "player1" : "player2";
  }

  private toggleTurn(turn: Turn): Turn {
    return turn === "player1" ? "player2" : "player1";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve: (value: void | PromiseLike<void>) => void): number =>
      window.setTimeout(resolve, ms),
    );
  }
}
