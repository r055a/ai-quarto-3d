import { describe, expect, it } from "vitest";
import { BOARD_SIZE, CELL_COUNT, getWinLine, isBoardFull } from "../src/game/rules";
import type { Cell, Difficulty, Turn } from "../src/game/types";
import { simTestMatch, type TestRunRes } from "./ai-match-sim";

const TEST_CASE_VARIATION_RUNS = 5;
const TEST_CASE_VARIATIONS = 4;
const TEST_CASE_RUNS: number = TEST_CASE_VARIATION_RUNS * TEST_CASE_VARIATIONS;

interface TestCase {
  testLabel: string;
  playerOne: Difficulty;
  playerTwo: Difficulty;
  startingPlayer: Turn;
  expectedWinner: Turn | "draw";
}

interface TestCaseRes {
  testName: string;
  expectedOutcome: Turn | "draw";
  numPlayerOneWins: number;
  numPlayerTwoWins: number;
  numGameDraws: number;
  numTestPasses: number;
  numTestRuns: number;
}

function buildTestCaseVariations(
  first: Difficulty,
  second: Difficulty,
  expectedDifficulty: Difficulty | "draw",
): TestCase[] {
  const expectedFirstTurn: Turn | "draw" = expectedDifficulty === "draw" ? "draw" : "player1";
  const expectedSecondTurn: Turn | "draw" = expectedDifficulty === "draw" ? "draw" : "player2";
  return [
    {
      testLabel: `${first} P1 vs ${second} P2 — P1 starts`,
      playerOne: first,
      playerTwo: second,
      startingPlayer: "player1",
      expectedWinner: expectedFirstTurn,
    },
    {
      testLabel: `${first} P1 vs ${second} P2 — P2 starts`,
      playerOne: first,
      playerTwo: second,
      startingPlayer: "player2",
      expectedWinner: expectedFirstTurn,
    },
    {
      testLabel: `${second} P2 vs ${first} P1 — P1 starts`,
      playerOne: second,
      playerTwo: first,
      startingPlayer: "player1",
      expectedWinner: expectedSecondTurn,
    },
    {
      testLabel: `${second} P2 vs ${first} P1 — P2 starts`,
      playerOne: second,
      playerTwo: first,
      startingPlayer: "player2",
      expectedWinner: expectedSecondTurn,
    },
  ];
}

function verifyTestRes(result: TestRunRes): void {
  const occupied: number = result.board.filter((cell: Cell): boolean => cell !== null).length;
  expect(result.numCellPlacements).toBeGreaterThanOrEqual(BOARD_SIZE);
  expect(result.numCellPlacements).toBeLessThanOrEqual(CELL_COUNT);
  expect(occupied).toBe(result.numCellPlacements);
  if (result.winner === "draw") {
    expect(isBoardFull(result.board)).toBe(true);
    expect(getWinLine(result.board)).toBeNull();
  } else {
    expect(getWinLine(result.board)).not.toBeNull();
  }
}

function runTestCase(
  first: Difficulty,
  second: Difficulty,
  expectedDifficulty: Difficulty | "draw",
): TestCaseRes[] {
  const testCaseResSummaries: TestCaseRes[] = buildTestCaseVariations(
    first,
    second,
    expectedDifficulty,
  ).map((testCase: TestCase): TestCaseRes => {
    const testCaseResSummary: TestCaseRes = {
      testName: testCase.testLabel,
      expectedOutcome: testCase.expectedWinner,
      numPlayerOneWins: 0,
      numPlayerTwoWins: 0,
      numGameDraws: 0,
      numTestPasses: 0,
      numTestRuns: TEST_CASE_VARIATION_RUNS,
    };

    for (
      let testCaseVariationRun: number = 0;
      testCaseVariationRun < TEST_CASE_VARIATION_RUNS;
      testCaseVariationRun += 1
    ) {
      const testRes: TestRunRes = simTestMatch(
        testCase.playerOne,
        testCase.playerTwo,
        testCase.startingPlayer,
      );

      verifyTestRes(testRes);

      if (testRes.winner === "player1") testCaseResSummary.numPlayerOneWins += 1;
      else if (testRes.winner === "player2") testCaseResSummary.numPlayerTwoWins += 1;
      else testCaseResSummary.numGameDraws += 1;
      if (testRes.winner === testCase.expectedWinner) {
        testCaseResSummary.numTestPasses += 1;
      }
    }
    return testCaseResSummary;
  });
  console.table(testCaseResSummaries);
  return testCaseResSummaries;
}

function expectAllRunsToPass(testResults: readonly TestCaseRes[]): void {
  expect(testResults).toHaveLength(TEST_CASE_VARIATIONS);
  expect(
    testResults.reduce(
      (total: number, testCaseResult: TestCaseRes): number => total + testCaseResult.numTestRuns,
      0,
    ),
  ).toBe(TEST_CASE_RUNS);
  for (const testResult of testResults) {
    expect(testResult.numTestPasses, testResult.testName).toBe(TEST_CASE_VARIATION_RUNS);
  }
}

describe(`${TEST_CASE_RUNS}-match AI vs AI`, (): void => {
  // it(`hard vs hard: ${TEST_CASE_RUNS} draws`, (): void => {
  //   expectAllRunsToPass(runTestCase("hard", "hard", "draw"));
  // });
  // it(`hard vs medium: ${TEST_CASE_RUNS} hard wins`, (): void => {
  //   expectAllRunsToPass(runTestCase("hard", "medium", "hard"));
  // });
  it(`hard vs easy: ${TEST_CASE_RUNS} hard wins`, (): void => {
    expectAllRunsToPass(runTestCase("hard", "easy", "hard"));
  });
  // it(`medium vs easy: ${TEST_CASE_RUNS} medium wins`, (): void => {
  //   expectAllRunsToPass(runTestCase("medium", "easy", "medium"));
  // });
});
