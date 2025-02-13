# Benchmark Report

This report summarizes the circuit analysis, compilation times, and per-step benchmark results for the **MastermindZkApp** and **StepProgram** on a local Mina network that runs run NodeJS environment. The tests measure the time taken to create, prove, and verify game steps in a Mastermind-like application.

### Device Information

- **CPU**: Apple M2
- **RAM**: 16 GB

---

## Circuit Analysis & Compilation Times

### stepProgram zkProgram Analysis

| Method     | Rows |
| ---------- | ---- |
| createGame | 455  |
| giveClue   | 588  |
| makeGuess  | 447  |

- **Total Rows**: 1490
- **Compile Time**: 4.4685675 seconds

---

### Mastermind Contract Analysis

| Method          | Rows |
| --------------- | ---- |
| initGame        | 332  |
| createGame      | 771  |
| submitGameProof | 420  |

- **Total Rows**: 1523
- **Compile Time**: 1.7242058 seconds

## Step-wise Performance

| Step Length | Total Time (Seconds) | Create Game Avg (Seconds) | Make Guess Avg (Seconds) | Submit Game Proof (Seconds) |
| ----------- | -------------------- | ------------------------- | ------------------------ | --------------------------- |
| 15          | 379.576              | 9.379                     | 11.929                   | 12.257                      |
| 13          | 336.872              | 8.969                     | 12.087                   | 11.906                      |
| 11          | 293.837              | 9.222                     | 12.389                   | 12.349                      |
| 9           | 246.771              | 9.389                     | 12.504                   | 12.372                      |
| 7           | 198.168              | 9.438                     | 12.562                   | 12.318                      |
| 5           | 146.970              | 9.365                     | 12.475                   | 12.443                      |
| 3           | 97.082               | 9.447                     | 12.529                   | 12.199                      |
| 1           | 46.864               | 9.428                     | 12.435                   | 12.423                      |

## Overall Scores

| Metric                        | Value (Seconds) |
| ----------------------------- | --------------- |
| Avg Time Each Game Step       | 27.28           |
| Avg Time To Create Base Proof | 9.33            |
| Avg Make Guess Time           | 12.27           |
| Avg Give Clue Time            | 12.31           |
| Avg Submit Game Proof Time    | 12.28           |

#### Metric Explanations

- **Avg Time Each Game Step**: Total time taken to complete a game step on average.
- **Avg Time To Create Base Proof**: Average time taken to create a game proof. Single base proof created on every game.
- **Avg Make Guess Time**: Average time taken to make a guess in the game, based on measured from multiple games with different steps.
- **Avg Give Clue Time**: Average time taken to give a clue in the game, based on measured from multiple games with different steps.
- **Avg Submit Game Proof Time**: Average time taken to create transaction proof and submit it to the local network (Block creation time not included).
