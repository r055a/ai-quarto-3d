# AI-Quarto 3D

AI-Quarto in 3D using negamax with alpha-beta pruning and three.js UI. Play [here](https://ro55a.github.io/ai-quarto-3d/). Not affiliated with Gigamic.

A ported enhancement of past Uppsala University project: [uni-git-projects](https://github.com/Uni-Git-Projects)/uu-game (below); applying skills from more   
studies completed with distinction, including (full-stack, UI) web dev, software eng, HCI, CG, AI/ML, and data eng, etc.  
  
> Note: all relevant projects and courses are completed before ChatGPT and other GenAI models are publicly available.

To be more specific, it is the Python game engine component from the CLI UU-Game which is ported and enhanced to web UI.       
From recollection, it was the only, if not best game engine completed, or at least with all the group remaining, ever.  

UU-Game group:

* [Viktor Enzell](https://github.com/viktor-enzell)
* [Gustav From](https://github.com/GustavFrom)
* [Maxime Gaide](https://github.com/Sravoryk-fork)
* [Pelle Ingvast](https://github.com/Pallekan)
* [Laurin Kerle](https://github.com/LaurinKerle)
* [Adam Ross](https://github.com/r055a)

UU-Game PO:

Davide Vega D'Aurelio

# Install

```Bash
npm install
```

# Development

```Bash
npm run dev
```

# Build

```Bash
npm run build
```

```Bash
npm run preview
```

# Test

```Bash
npm test
```

### Example 

```Bash
stdout | tests/ai-diff.test.ts > 100-match AI vs AI > hard vs hard: 100 draws
┌─────────┬──────────────────────────────────┬─────────────────┬──────────────────┬──────────────────┬──────────────┬───────────────┬─────────────┐
│ (index) │ testName                         │ expectedOutcome │ numPlayerOneWins │ numPlayerTwoWins │ numGameDraws │ numTestPasses │ numTestRuns │
├─────────┼──────────────────────────────────┼─────────────────┼──────────────────┼──────────────────┼──────────────┼───────────────┼─────────────┤
│ 0       │ 'hard P1 vs hard P2 — P1 starts' │ 'draw'          │ 0                │ 0                │ 25           │ 25            │ 25          │
│ 1       │ 'hard P1 vs hard P2 — P2 starts' │ 'draw'          │ 0                │ 0                │ 25           │ 25            │ 25          │
│ 2       │ 'hard P2 vs hard P1 — P1 starts' │ 'draw'          │ 0                │ 0                │ 25           │ 25            │ 25          │
│ 3       │ 'hard P2 vs hard P1 — P2 starts' │ 'draw'          │ 0                │ 0                │ 25           │ 25            │ 25          │
└─────────┴──────────────────────────────────┴─────────────────┴──────────────────┴──────────────────┴──────────────┴───────────────┴─────────────┘

stdout | tests/ai-diff.test.ts > 100-match AI vs AI > hard vs medium: 100 hard wins
┌─────────┬────────────────────────────────────┬─────────────────┬──────────────────┬──────────────────┬──────────────┬───────────────┬─────────────┐
│ (index) │ testName                           │ expectedOutcome │ numPlayerOneWins │ numPlayerTwoWins │ numGameDraws │ numTestPasses │ numTestRuns │
├─────────┼────────────────────────────────────┼─────────────────┼──────────────────┼──────────────────┼──────────────┼───────────────┼─────────────┤
│ 0       │ 'hard P1 vs medium P2 — P1 starts' │ 'player1'       │ 25               │ 0                │ 0            │ 25            │ 25          │
│ 1       │ 'hard P1 vs medium P2 — P2 starts' │ 'player1'       │ 25               │ 0                │ 0            │ 25            │ 25          │
│ 2       │ 'medium P2 vs hard P1 — P1 starts' │ 'player2'       │ 0                │ 25               │ 0            │ 25            │ 25          │
│ 3       │ 'medium P2 vs hard P1 — P2 starts' │ 'player2'       │ 0                │ 25               │ 0            │ 25            │ 25          │
└─────────┴────────────────────────────────────┴─────────────────┴──────────────────┴──────────────────┴──────────────┴───────────────┴─────────────┘

stdout | tests/ai-diff.test.ts > 100-match AI vs AI > hard vs easy: 100 hard wins
┌─────────┬──────────────────────────────────┬─────────────────┬──────────────────┬──────────────────┬──────────────┬───────────────┬─────────────┐
│ (index) │ testName                         │ expectedOutcome │ numPlayerOneWins │ numPlayerTwoWins │ numGameDraws │ numTestPasses │ numTestRuns │
├─────────┼──────────────────────────────────┼─────────────────┼──────────────────┼──────────────────┼──────────────┼───────────────┼─────────────┤
│ 0       │ 'hard P1 vs easy P2 — P1 starts' │ 'player1'       │ 25               │ 0                │ 0            │ 25            │ 25          │
│ 1       │ 'hard P1 vs easy P2 — P2 starts' │ 'player1'       │ 25               │ 0                │ 0            │ 25            │ 25          │
│ 2       │ 'easy P2 vs hard P1 — P1 starts' │ 'player2'       │ 0                │ 25               │ 0            │ 25            │ 25          │
│ 3       │ 'easy P2 vs hard P1 — P2 starts' │ 'player2'       │ 0                │ 25               │ 0            │ 25            │ 25          │
└─────────┴──────────────────────────────────┴─────────────────┴──────────────────┴──────────────────┴──────────────┴───────────────┴─────────────┘

stdout | tests/ai-diff.test.ts > 100-match AI vs AI > medium vs easy: 100 medium wins
┌─────────┬────────────────────────────────────┬─────────────────┬──────────────────┬──────────────────┬──────────────┬───────────────┬─────────────┐
│ (index) │ testName                           │ expectedOutcome │ numPlayerOneWins │ numPlayerTwoWins │ numGameDraws │ numTestPasses │ numTestRuns │
├─────────┼────────────────────────────────────┼─────────────────┼──────────────────┼──────────────────┼──────────────┼───────────────┼─────────────┤
│ 0       │ 'medium P1 vs easy P2 — P1 starts' │ 'player1'       │ 25               │ 0                │ 0            │ 25            │ 25          │
│ 1       │ 'medium P1 vs easy P2 — P2 starts' │ 'player1'       │ 25               │ 0                │ 0            │ 25            │ 25          │
│ 2       │ 'easy P2 vs medium P1 — P1 starts' │ 'player2'       │ 0                │ 25               │ 0            │ 25            │ 25          │
│ 3       │ 'easy P2 vs medium P1 — P2 starts' │ 'player2'       │ 0                │ 25               │ 0            │ 25            │ 25          │
└─────────┴────────────────────────────────────┴─────────────────┴──────────────────┴──────────────────┴──────────────┴───────────────┴─────────────┘

 ✓ tests/ai-diff.test.ts (4 tests) 2092780ms
   ✓ 100-match AI vs AI (4)
     ✓ hard vs hard: 100 draws  708530ms
     ✓ hard vs medium: 100 hard wins  714410ms
     ✓ hard vs easy: 100 hard wins  587404ms
     ✓ medium vs easy: 100 medium wins  82431ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

# Contribute

Before making a Pull Request for an existing\created Issue, verify the branch passes:

```Bash
npm run verify:all:fix
```
