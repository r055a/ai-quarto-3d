import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  type Object3DEventMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GAME_PIECES, getPieceTraits, type PieceTraits } from "../game/pieces";
import { BOARD_SIZE, CELL_COUNT, getWinLines } from "../game/rules";
import type { Cell, Phase, PieceId } from "../game/types";

const BOARD_SPACE: number = 1.16;
const BOARD_ROTATION: number = Math.PI / 4;
const BOARD_ROTATION_COS: number = Math.cos(BOARD_ROTATION);
const BOARD_ROTATION_SIN: number = Math.sin(BOARD_ROTATION);
const MOBILE_ASPECT: number = 0.92;
const BASE_Y: number = -0.11;
const CELL_TOP_Y: number = 0.02;
const ANIMATION_FACTOR: number = 0.14;
const RESERVE_SCALE: number = 0.78;
const HOVER_SCALE: number = 0.94;
const WIN_SCALE: number = 1.12;
const RESERVE_RADIUS: number = 4.65;
const RESERVE_LOWER_START: number = MathUtils.degToRad(-8);
const RESERVE_LOWER_END: number = MathUtils.degToRad(-82);
const RESERVE_UPPER_START: number = MathUtils.degToRad(82);
const RESERVE_UPPER_END: number = MathUtils.degToRad(8);

interface SceneState {
  board: readonly Cell[];
  remaining: readonly PieceId[];
  pendingPiece: PieceId | null;
  phase: Phase;
}

interface PieceView {
  group: Group;
  target: Vector3;
  baseScale: number;
  targetScale: number;
}

type InteractiveRef = { type: "cell"; id: number } | { type: "piece"; id: PieceId };

export interface SceneCallbacks {
  onCellClick: (cell: number) => void;
  onPieceClick: (piece: PieceId) => void;
  onPieceHover: (piece: PieceId | null) => void;
}

export class GameScene {
  private readonly scene: Scene<Object3DEventMap> = new Scene();
  private readonly camera: PerspectiveCamera = new PerspectiveCamera(37, 1, 0.1, 100);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster: Raycaster = new Raycaster();
  private readonly pointer: Vector2 = new Vector2();
  private readonly baseMesh: Mesh;
  private readonly boardRingBase: Mesh;
  private readonly boardRim: Mesh;
  private readonly boardCells: Mesh[] = [];
  private readonly pieces: Map<PieceId, PieceView> = new Map<PieceId, PieceView>();
  private readonly interactiveObj: Object3D[] = [];
  private readonly boardOffset: Vector3 = new Vector3();
  private readonly dirLight: DirectionalLight = new DirectionalLight(0xffddb1, 4.8);
  private readonly dirLightTarget: Object3D<Object3DEventMap> = new Object3D();

  private readonly cellGeometry: CylinderGeometry = new CylinderGeometry(0.53, 0.53, 0.12, 48);
  private readonly pieceGeometries = {
    smallRound: new CylinderGeometry(0.38, 0.43, 0.9, 32, 1),
    bigRound: new CylinderGeometry(0.38, 0.43, 1.45, 32, 1),
    smallSquare: new BoxGeometry(0.74, 0.9, 0.74, 2, 2, 2),
    bigSquare: new BoxGeometry(0.74, 1.45, 0.74, 2, 2, 2),
    roundCap: new CylinderGeometry(0.19, 0.19, 0.03, 24),
    squareCap: new BoxGeometry(0.34, 0.03, 0.34),
  } as const;
  private readonly pieceMaterials = {
    darkBody: new MeshPhysicalMaterial({
      color: 0x161619,
      roughness: 0.34,
      metalness: 0.12,
      clearcoat: 0.45,
      clearcoatRoughness: 0.34,
    }),
    redBody: new MeshPhysicalMaterial({
      color: 0x95121f,
      roughness: 0.48,
      metalness: 0.06,
      clearcoat: 0.45,
      clearcoatRoughness: 0.34,
    }),
    darkCap: new MeshStandardMaterial({ color: 0x49494f, roughness: 0.42 }),
    lightCap: new MeshStandardMaterial({ color: 0xd35d68, roughness: 0.42 }),
  } as const;

  private state: SceneState = {
    board: Array<Cell>(CELL_COUNT).fill(null),
    remaining: [],
    pendingPiece: null,
    phase: "select",
  };
  private hovered: InteractiveRef | null = null;
  private mobileLayout: boolean = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 18;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.25;

    const woodTexture: CanvasTexture = this.createWoodTexture();
    const tileTexture: CanvasTexture = woodTexture.clone();
    tileTexture.repeat.set(0.65, 0.65);
    tileTexture.needsUpdate = true;

    this.baseMesh = new Mesh(
      new CircleGeometry(12, 120),
      new MeshPhysicalMaterial({
        color: 0x77502d,
        map: woodTexture,
        roughness: 0.82,
        metalness: 0.01,
        clearcoat: 0.08,
        clearcoatRoughness: 0.95,
      }),
    );
    this.boardRingBase = new Mesh(
      new CylinderGeometry(3.42, 3.48, 0.18, 96),
      new MeshPhysicalMaterial({
        color: 0x65401f,
        map: woodTexture,
        roughness: 0.75,
        metalness: 0.02,
        clearcoat: 0.12,
        clearcoatRoughness: 0.86,
      }),
    );
    this.boardRim = new Mesh(
      new TorusGeometry(3.45, 0.12, 20, 132),
      new MeshPhysicalMaterial({
        color: 0x4c2f16,
        map: woodTexture,
        roughness: 0.66,
        metalness: 0.02,
        clearcoat: 0.18,
        clearcoatRoughness: 0.78,
      }),
    );

    this.createEnvironment();
    this.createBoard(tileTexture);
    this.createPieces();
    this.resize();

    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("click", this.onClick);
    window.addEventListener("resize", this.resize);

    this.renderer.setAnimationLoop(this.animate);
  }

  setState(state: SceneState): void {
    this.state = state;
    this.layoutObjects();
  }

  private createEnvironment(): void {
    this.scene.background = null;
    this.scene.fog = new Fog(0x11161e, 18, 28);

    this.dirLight.castShadow = true;
    this.dirLight.position.set(-10.5, 8.8, 10.2);
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.left = -12;
    this.dirLight.shadow.camera.right = 12;
    this.dirLight.shadow.camera.top = 12;
    this.dirLight.shadow.camera.bottom = -12;
    this.dirLight.shadow.bias = -0.00015;
    this.dirLight.target = this.dirLightTarget;

    this.scene.add(
      new HemisphereLight(0xfff0d8, 0x2a1e14, 0.7),
      this.dirLight,
      this.dirLightTarget,
    );
  }

  private createBoard(tileTexture: CanvasTexture): void {
    this.baseMesh.rotation.x = -Math.PI / 2;
    this.baseMesh.position.y = BASE_Y;
    this.baseMesh.receiveShadow = true;

    this.boardRingBase.castShadow = true;
    this.boardRingBase.receiveShadow = true;

    this.boardRim.rotation.x = Math.PI / 2;
    this.boardRim.castShadow = true;
    this.boardRim.receiveShadow = true;

    this.scene.add(this.baseMesh, this.boardRingBase, this.boardRim);

    for (let cell: number = 0; cell < CELL_COUNT; cell += 1) {
      const mesh = new Mesh(
        this.cellGeometry,
        new MeshPhysicalMaterial({
          color: cell % 2 === 0 ? 0x8d6036 : 0x6c431f,
          map: tileTexture,
          roughness: 0.84,
          metalness: 0.01,
          clearcoat: 0.08,
          clearcoatRoughness: 0.96,
          emissive: 0x000000,
        }),
      );

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.interactive = { type: "cell", id: cell } satisfies InteractiveRef;

      this.boardCells.push(mesh);
      this.interactiveObj.push(mesh);
      this.scene.add(mesh);
    }
  }

  private createPieces(): void {
    for (const piece of GAME_PIECES) {
      const group: Group = this.makePiece(piece);
      this.pieces.set(piece, {
        group,
        target: new Vector3(),
        baseScale: 1,
        targetScale: 1,
      });
      this.interactiveObj.push(group);
      this.scene.add(group);
    }
  }

  private makePiece(piece: PieceId): Group {
    const traits: PieceTraits = getPieceTraits(piece);
    const group = new Group();
    const interactive: { type: "piece"; id: number } = {
      type: "piece",
      id: piece,
    } satisfies InteractiveRef;
    const height: 0.9 | 1.45 = traits.isBig ? 1.45 : 0.9;
    group.userData.interactive = interactive;

    const body = new Mesh(
      this.getBodyGeometry(traits),
      traits.isDark ? this.pieceMaterials.darkBody : this.pieceMaterials.redBody,
    );
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.interactive = interactive;
    group.add(body);

    if (traits.isSolid) {
      const cap = new Mesh(
        traits.isRound ? this.pieceGeometries.roundCap : this.pieceGeometries.squareCap,
        traits.isDark ? this.pieceMaterials.darkCap : this.pieceMaterials.lightCap,
      );
      cap.position.y = height + 0.02;
      cap.userData.interactive = interactive;
      group.add(cap);
    }
    return group;
  }

  private getBodyGeometry(traits: PieceTraits): BoxGeometry | CylinderGeometry {
    if (traits.isRound) {
      return traits.isBig ? this.pieceGeometries.bigRound : this.pieceGeometries.smallRound;
    }
    return traits.isBig ? this.pieceGeometries.bigSquare : this.pieceGeometries.smallSquare;
  }

  private layoutObjects(): void {
    this.boardOffset.set(this.mobileLayout ? 0 : -1.35, 0, this.mobileLayout ? -1.1 : 0);
    this.baseMesh.position.set(this.boardOffset.x, BASE_Y, this.boardOffset.z);
    this.boardRingBase.position.copy(this.boardOffset).setY(BASE_Y + 0.01);
    this.boardRim.position.copy(this.boardOffset).setY(BASE_Y + 0.08);

    for (const [cell, mesh] of this.boardCells.entries()) {
      const row: number = Math.floor(cell / BOARD_SIZE);
      const col: number = cell % BOARD_SIZE;
      const x: number = (col - 1.5) * BOARD_SPACE;
      const z: number = (row - 1.5) * BOARD_SPACE;

      mesh.position.set(
        this.boardOffset.x + x * BOARD_ROTATION_COS - z * BOARD_ROTATION_SIN,
        BASE_Y + 0.07,
        this.boardOffset.z + x * BOARD_ROTATION_SIN + z * BOARD_ROTATION_COS,
      );
    }

    const winningCells = new Set<number>();
    for (const winLine of getWinLines(this.state.board)) {
      for (const cell of winLine) winningCells.add(cell);
    }
    const remaining = new Set(this.state.remaining);
    const pieceCells = new Map<PieceId, number>();
    for (const [cell, piece] of this.state.board.entries()) {
      if (piece !== null) pieceCells.set(piece, cell);
    }

    for (const piece of GAME_PIECES) {
      const view: PieceView | undefined = this.pieces.get(piece);
      if (!view) continue;

      const boardCell: number | undefined = pieceCells.get(piece);
      if (boardCell !== undefined) {
        const cellMesh = this.boardCells[boardCell];
        if (!cellMesh) continue;

        this.setPieceTarget(
          view,
          cellMesh.position.x,
          CELL_TOP_Y,
          cellMesh.position.z,
          winningCells.has(boardCell) ? WIN_SCALE : 1,
        );
      } else if (this.state.pendingPiece === piece) {
        this.setPieceTarget(
          view,
          this.mobileLayout ? 0 : 5.25,
          BASE_Y,
          this.mobileLayout ? 5.55 : 0,
          WIN_SCALE,
        );
      } else if (remaining.has(piece)) {
        this.layoutReservePiece(piece, view);
      } else {
        view.group.visible = false;
      }
    }
    this.updateHighlights(remaining);
  }

  private layoutReservePiece(piece: PieceId, view: PieceView): void {
    if (this.mobileLayout) {
      const row: number = Math.floor(piece / BOARD_SIZE);
      const col: number = piece % BOARD_SIZE;
      this.setPieceTarget(view, (col - 1.5) * 1.12, BASE_Y, 2.9 + row * 0.98, RESERVE_SCALE);
      return;
    }

    const upper: boolean = piece < 8;
    const sideIndex: number = upper ? piece : piece - 8;
    const progress: number = sideIndex / 7;
    const angle: number = upper
      ? MathUtils.lerp(RESERVE_UPPER_START, RESERVE_UPPER_END, progress)
      : MathUtils.lerp(RESERVE_LOWER_START, RESERVE_LOWER_END, progress);
    const radius: number = RESERVE_RADIUS + (upper ? 0.04 : -0.04);

    this.setPieceTarget(
      view,
      this.boardOffset.x + Math.cos(angle) * radius,
      BASE_Y,
      this.boardOffset.z + Math.sin(angle) * radius,
      RESERVE_SCALE,
    );
  }

  private setPieceTarget(view: PieceView, x: number, y: number, z: number, scale: number): void {
    view.target.set(x, y, z);
    view.baseScale = scale;
    view.targetScale = scale;
    view.group.visible = true;
  }

  private updateHighlights(remaining = new Set(this.state.remaining)): void {
    for (const [cell, mesh] of this.boardCells.entries()) {
      const material = mesh.material as MeshPhysicalMaterial;
      const interactive: boolean = this.state.phase === "place" && this.state.board[cell] === null;
      const hovered: boolean =
        interactive && this.hovered?.type === "cell" && this.hovered.id === cell;

      material.emissive.setHex(hovered ? 0x8a6322 : interactive ? 0x362311 : 0x000000);
      material.emissiveIntensity = hovered ? 1.5 : interactive ? 0.9 : 0;
    }

    for (const [piece, view] of this.pieces) {
      view.targetScale = view.baseScale;
      if (
        this.state.phase === "select" &&
        remaining.has(piece) &&
        this.hovered?.type === "piece" &&
        this.hovered.id === piece
      ) {
        view.targetScale = Math.max(view.baseScale, HOVER_SCALE);
      }
    }
  }

  private findInteractive(object: Object3D): InteractiveRef | null {
    for (let current: Object3D | null = object; current; current = current.parent) {
      const ref = current.userData.interactive as InteractiveRef | undefined;
      if (ref) return ref;
    }
    return null;
  }

  private isInteractive(ref: InteractiveRef): boolean {
    return ref.type === "cell"
      ? this.state.phase === "place" && this.state.board[ref.id] === null
      : this.state.phase === "select" && this.state.remaining.includes(ref.id);
  }

  private pick(event: MouseEvent): InteractiveRef | null {
    const rect: DOMRect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    for (const hit of this.raycaster.intersectObjects(this.interactiveObj, true)) {
      const ref: InteractiveRef | null = this.findInteractive(hit.object);
      if (ref && this.isInteractive(ref)) return ref;
    }
    return null;
  }

  private readonly onPointerMove: (event: PointerEvent) => void = (event: PointerEvent): void => {
    const next: InteractiveRef | null = this.pick(event);
    if (next?.type === this.hovered?.type && next?.id === this.hovered?.id) return;

    this.hovered = next;
    this.renderer.domElement.style.cursor = next ? "pointer" : "grab";
    this.callbacks.onPieceHover(next?.type === "piece" ? next.id : null);
    this.updateHighlights();
  };

  private readonly onPointerLeave: () => void = (): void => {
    this.hovered = null;
    this.callbacks.onPieceHover(null);
    this.renderer.domElement.style.cursor = "grab";
    this.updateHighlights();
  };

  private readonly onClick: (event: MouseEvent) => void = (event: MouseEvent): void => {
    const ref: InteractiveRef | null = this.pick(event);
    if (ref?.type === "cell") this.callbacks.onCellClick(ref.id);
    else if (ref?.type === "piece") this.callbacks.onPieceClick(ref.id);
  };

  private readonly resize: () => void = (): void => {
    const width: number = Math.max(1, this.renderer.domElement.clientWidth);
    const height: number = Math.max(1, this.renderer.domElement.clientHeight);

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.mobileLayout = this.camera.aspect < MOBILE_ASPECT;

    if (this.mobileLayout) {
      this.camera.position.set(0, 13.8, 13.9);
      this.controls.target.set(0, BASE_Y, 1.4);
    } else {
      this.camera.position.set(4.2, 10.4, 13.2);
      this.controls.target.set(0.95, BASE_Y + 0.1, 0);
    }

    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.layoutObjects();
  };

  private readonly animate: () => void = (): void => {
    this.controls.update();
    for (const view of this.pieces.values()) {
      if (!view.group.visible) continue;

      view.group.position.lerp(view.target, ANIMATION_FACTOR);
      view.group.scale.setScalar(
        MathUtils.lerp(view.group.scale.x, view.targetScale, ANIMATION_FACTOR),
      );
    }
    this.renderer.render(this.scene, this.camera);
  };

  private createWoodTexture(): CanvasTexture {
    const canvas: HTMLCanvasElement = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;

    const context = canvas.getContext("2d");
    if (!context) return texture;

    const gradient: CanvasGradient = context.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    gradient.addColorStop(0, "#6a4322");
    gradient.addColorStop(0.5, "#4f3118");
    gradient.addColorStop(1, "#86562e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.globalAlpha = 0.16;
    for (let y: number = 0; y < canvas.height; y += 4) {
      const wobble: number = 9 * Math.sin(y / 22) + 4 * Math.sin(y / 9);
      context.fillStyle = y % 8 === 0 ? "#362010" : "#7c4a24";
      context.fillRect(0, y + wobble * 0.05, canvas.width, 2);
    }

    context.globalAlpha = 0.09;
    for (let line: number = 0; line < 95; line += 1) {
      const y: number = Math.random() * canvas.height;
      const amplitude: number = 2 + Math.random() * 8;
      const frequency: number = 35 + Math.random() * 70;
      const phase: number = Math.random() * Math.PI * 2;

      context.beginPath();
      context.strokeStyle = line % 3 === 0 ? "#2c180c" : "#c09058";
      context.lineWidth = 0.5 + Math.random() * 1.4;

      for (let x: number = -20; x <= canvas.width + 20; x += 8) {
        const grainY: number = y + Math.sin(x / frequency + phase) * amplitude;
        if (x === -20) context.moveTo(x, grainY);
        else context.lineTo(x, grainY);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }
}
