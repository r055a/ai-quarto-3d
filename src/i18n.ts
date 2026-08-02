import { getPieceTraits, type PieceTraits } from "./game/pieces";
import type { Difficulty, PieceId } from "./game/types";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["en"] as const; // add ISO 639-1 codes for supported languages
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
const DEFAULT_LANG: Language = SUPPORTED_LANGUAGES[0];

type TranslationRecords = Record<string, string | number>;
interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const NOT_TRANS = {
  game: "Uni-Git-Projects/UU-Game",
};

const STORAGE_KEY: string = "quarto-lang";
const listeners: Set<() => void> = new Set<() => void>();

const resources: Record<Language, TranslationTree> = { en }; // add ISO 639-1 codes for supported languages
let languageGlobal: Language = DEFAULT_LANG;

function isSupportedLang(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang as Language);
}

function detectLang(): Language {
  const stored: string | null = localStorage.getItem(STORAGE_KEY);
  if (stored !== null && isSupportedLang(stored)) return stored;
  for (const candidate of navigator.languages) {
    const baseLanguage: string | undefined = candidate.toLowerCase().split("-")[0];
    if (baseLanguage !== undefined && isSupportedLang(baseLanguage)) return baseLanguage;
  }
  return DEFAULT_LANG;
}

function lookupTranslationTree(tree: TranslationTree, key: string): string | undefined {
  let lang: string | TranslationTree = tree;
  for (const segment of key.split(".")) {
    if (typeof lang === "string") return undefined;
    const next: string | TranslationTree | undefined = lang[segment];
    if (next === undefined) return undefined;
    lang = next;
  }
  return typeof lang === "string" ? lang : undefined;
}

function applyLang(): void {
  document.documentElement.lang = languageGlobal;
  document.documentElement.dir = "ltr";
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key: string | undefined = element.dataset.i18n;
    if (key !== undefined) element.textContent = translate(key, NOT_TRANS);
  }
}

export async function initI18n(): Promise<void> {
  languageGlobal = detectLang();
  applyLang();
}

export function translate(key: string, records: TranslationRecords = {}): string {
  const translation: string =
    lookupTranslationTree(resources[languageGlobal], key) ??
    lookupTranslationTree(resources.en, key) ??
    key;
  return translation.replace(/{{\s*([^}\s]+)\s*}}/g, (_: string, name: string): string =>
    String(records[name] ?? `{{${name}}}`),
  );
}

export function onLangChange(listener: () => void): void {
  listeners.add(listener);
}

export function diffLabel(diff: Difficulty): string {
  return translate(`${String(diff).replace(/^difficulty\./, "")}`);
}

export function translateTraits(piece: PieceId): string {
  const pieceTraits: PieceTraits = getPieceTraits(piece);
  return [
    translate(`piece.${pieceTraits.isDark ? "black" : "red"}`),
    translate(`piece.${pieceTraits.isBig ? "big" : "small"}`),
    translate(`piece.${pieceTraits.isRound ? "round" : "square"}`),
    translate(`piece.${pieceTraits.isSolid ? "solid" : "hollow"}`),
  ].join(", ");
}

export function changeLang(lang: string): void {
  if (!isSupportedLang(lang) || lang === languageGlobal) return;
  languageGlobal = lang;
  localStorage.setItem(STORAGE_KEY, languageGlobal);
  applyLang();
  for (const listener of listeners) listener();
}

export function curLang(): Language {
  return languageGlobal;
}
