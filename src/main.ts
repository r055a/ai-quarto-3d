import "./style.scss";
import { GameScene } from "./render/GameScene";
import { GameController } from "./ui/GameController";

function requiredElement<T extends Element>(id: string): T {
  const element: T | null = document.querySelector<T>(`#${id}`);
  if (element === null) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}

const canvas: HTMLCanvasElement = requiredElement<HTMLCanvasElement>("game-canvas");
const status: HTMLElement = requiredElement<HTMLElement>("status");
const detail: HTMLElement = requiredElement<HTMLElement>("detail");
const thinking: HTMLElement = requiredElement<HTMLElement>("thinking");

function showStartupError(error: unknown): void {
  thinking.hidden = true;
  canvas.hidden = true;

  status.textContent = "3D-rendering is unavailable.";
  detail.textContent = "Enable in the browser: WebGL and hardware acceleration.";

  const fallback: HTMLDivElement = document.createElement("div");
  const heading: HTMLElement = document.createElement("strong");
  const message: HTMLSpanElement = document.createElement("span");

  fallback.className = "webgl-error";
  heading.textContent = "WebGL could not start.";
  message.textContent = "The game requires WebGL enabled in the browser.";
  fallback.append(heading, message);
  canvas.parentElement?.append(fallback);

  console.error(error);
}

try {
  let controller!: GameController;
  const scene = new GameScene(canvas, {
    onCellClick: (cell: number): void => controller.handleCellClick(cell),
    onPieceClick: (piece: number): void => controller.handlePieceClick(piece),
    onPieceHover: (piece: number | null): void => controller.handlePieceHover(piece),
  });

  controller = new GameController(scene, {
    binCells: [...document.querySelectorAll<HTMLElement>("[data-binary-cell]")],
    binWinOverlay: requiredElement<SVGSVGElement>("bin-win-overlay"),
    detail,
    diffAI: requiredElement<HTMLSelectElement>("diff"),
    diffPlayerOneAI: requiredElement<HTMLSelectElement>("diff-p-one"),
    diffPlayerTwoAI: requiredElement<HTMLSelectElement>("diff-p-two"),
    gameMode: requiredElement<HTMLSelectElement>("game-mode"),
    newGame: requiredElement<HTMLButtonElement>("new-game"),
    pieceName: requiredElement<HTMLElement>("piece-name"),
    pieceStr: requiredElement<HTMLElement>("piece-str"),
    starter: requiredElement<HTMLSelectElement>("starter"),
    status,
    thinking,
    turnBadge: requiredElement<HTMLElement>("turn-badge"),
    wrapDiffAI: requiredElement<HTMLElement>("diff-wrap"),
    wrapDiffPlayerOneAI: requiredElement<HTMLElement>("diff-p-one-wrap"),
    wrapDiffPlayerTwoAI: requiredElement<HTMLElement>("diff-p-two-wrap"),
  });
  controller.start();
} catch (error: unknown) {
  showStartupError(error);
}
