import "./style.scss";
import { changeLang, curLang, initI18n, translate } from "./i18n";
import { GameScene } from "./render/GameScene";
import GameController from "./ui/GameController";

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

function showStartupErr(error: unknown): void {
  thinking.hidden = true;
  canvas.hidden = true;

  status.textContent = translate("error.renderingStatus");
  detail.textContent = translate("error.renderingMsg");

  const fallback: HTMLDivElement = document.createElement("div");
  const heading: HTMLElement = document.createElement("strong");
  const message: HTMLSpanElement = document.createElement("span");

  fallback.className = "webgl-error";
  heading.textContent = translate("error.webglHeading");
  message.textContent = translate("error.webglMsg");
  fallback.append(heading, message);
  canvas.parentElement?.append(fallback);

  console.error(error);
}

async function startApp(): Promise<void> {
  await initI18n();
  const language: HTMLSelectElement = requiredElement<HTMLSelectElement>("language");
  language.value = curLang();
  language.addEventListener("change", (): void => {
    changeLang(language.value);
  });

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
    pauseToggleAI: requiredElement<HTMLButtonElement>("ai-pause-toggle"),
    pieceName: requiredElement<HTMLElement>("piece-name"),
    pieceStr: requiredElement<HTMLElement>("piece-str"),
    redo: requiredElement<HTMLButtonElement>("redo"),
    starter: requiredElement<HTMLSelectElement>("starter"),
    status,
    thinking,
    thinkingLabel: requiredElement<HTMLElement>("thinking-label"),
    turnBadge: requiredElement<HTMLElement>("turn-badge"),
    undo: requiredElement<HTMLButtonElement>("undo"),
    wrapDiffAI: requiredElement<HTMLElement>("diff-wrap"),
    wrapDiffPlayerOneAI: requiredElement<HTMLElement>("diff-p-one-wrap"),
    wrapDiffPlayerTwoAI: requiredElement<HTMLElement>("diff-p-two-wrap"),
  });
  controller.start();
}
void startApp().catch(showStartupErr);
