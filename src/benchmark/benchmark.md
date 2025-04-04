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
| createGame | 452  |
| giveClue   | 1340 |
| makeGuess  | 1143 |
| **Total**  | 2935 |

---

### Mastermind Contract Analysis

| Method          | Rows  |
| --------------- | ----- |
| initGame        | 1283  |
| acceptGame      | 1513  |
| submitGameProof | 1617  |
| claimReward     | 1351  |
| forfeitWin      | 1399  |
| makeGuess       | 2229  |
| giveClue        | 2750  |
| **Total**       | 12142 |

### Compilation Times

| Name          | NodeJS (Localnet) | NodeJS (Devnet) | Browser |
| ------------- | ----------------- | --------------- | ------- |
| StepProgram   | 4.82s             | 36.14s          | 32.07s  |
| MastermindApp | 2.95s             | 12.60s          | 12.46s  |

## Step-wise Benchmark Results (Local Mina Network)

### NodeJS Environment

| Step Length | Solved | Total Time | Deploy & Init | Accept Game | Base Proof | Make Guess | Submit Proof |
| ----------- | ------ | ---------- | ------------- | ----------- | ---------- | ---------- | ------------ |
| 3           | Yes    | 87.45s     | 0.73s         | 0.25s       | 10.03s     | 12.70s     | 0.25s        |
| 3           | No     | 86.10s     | 0.30s         | 0.36s       | 9.12s      | 12.73s     | 0.27s        |
| 4           | Yes    | 111.82s    | 0.31s         | 0.23s       | 9.43s      | 12.75s     | 0.19s        |
| 4           | No     | 113.31s    | 0.29s         | 0.23s       | 9.35s      | 12.93s     | 0.15s        |
| 5           | Yes    | 140.99s    | 0.30s         | 0.24s       | 9.62s      | 13.09s     | 0.16s        |
| 5           | No     | 146.71s    | 0.31s         | 0.26s       | 9.64s      | 13.61s     | 0.14s        |

### Browser Environment

| Step Length | Solved | Total Time | Deploy & Init | Accept Game | Base Proof | Make Guess | Submit Proof |
| ----------- | ------ | ---------- | ------------- | ----------- | ---------- | ---------- | ------------ |
| 3           | Yes    | 113.53s    | 2.02s         | 0.30s       | 11.93s     | 14.96s     | 0.47s        |
| 3           | No     | 147.60s    | 0.34s         | 0.27s       | 16.07s     | 21.32s     | 0.50s        |
| 4           | Yes    | 184.72s    | 0.37s         | 0.28s       | 15.62s     | 20.89s     | 0.50s        |
| 4           | No     | 182.50s    | 0.34s         | 0.26s       | 16.51s     | 20.63s     | 0.20s        |
| 5           | Yes    | 246.10s    | 0.31s         | 0.26s       | 16.75s     | 22.75s     | 0.41s        |
| 5           | No     | 235.17s    | 0.32s         | 0.25s       | 16.35s     | 21.82s     | 0.40s        |

## Overall Scores

Based on the benchmark results, average taken from executed 62 steps ın both environments.

### NodeJS Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 28.35s       | 28.84s         |
| Avg Deploy & Initialize Time  | 0.45s        | 0.30s          |
| Avg Accept Game Time          | 0.24s        | 0.28s          |
| Avg Time To Create Base Proof | 9.69s        | 9.37s          |
| Avg Make Guess Time           | 12.88s       | 13.17s         |
| Avg Give Clue Time            | 12.83s       | 13.14s         |
| Avg Submit Game Proof Time    | 0.20s        | 0.19s          |

### Browser Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 45.36s       | 47.11s         |
| Avg Deploy & Initialize Time  | 0.90s        | 0.33s          |
| Avg Accept Game Time          | 0.28s        | 0.26s          |
| Avg Time To Create Base Proof | 14.76s       | 16.31s         |
| Avg Make Guess Time           | 20.18s       | 21.30s         |
| Avg Give Clue Time            | 21.08s       | 21.49s         |
| Avg Submit Game Proof Time    | 0.46s        | 0.37s          |

## Step-wise Benchmark Results (Devnet)

### NodeJS Environment

| Step Length | Solved | Total Time | Deploy & Init | Accept Game | Base Proof | Make Guess | Submit Proof |
| ----------- | ------ | ---------- | ------------- | ----------- | ---------- | ---------- | ------------ |
| 3           | Yes    | 695.16s    | 156.74s       | 359.60s     | 9.19s      | 12.32s     | 95.97s       |
| 3           | No     | 1065.11s   | 691.48s       | 194.27s     | 9.51s      | 12.40s     | 95.42s       |
| 4           | Yes    | 903.84s    | 197.48s       | 174.95s     | 9.24s      | 12.29s     | 423.54s      |
| 4           | No     | 1441.22s   | 176.11s       | 895.41s     | 9.48s      | 12.45s     | 260.44s      |
| 5           | Yes    | 727.94s    | 361.50s       | 175.35s     | 9.62s      | 12.62s     | 55.01s       |
| 5           | No     | 895.90s    | 155.83s       | 379.87s     | 9.84s      | 12.72s     | 222.81s      |

### Browser Environment

| Step Length | Solved | Total Time | Deploy & Init | Accept Game | Base Proof | Make Guess | Submit Proof |
| ----------- | ------ | ---------- | ------------- | ----------- | ---------- | ---------- | ------------ |
| 3           | Yes    | 762.43s    | 404.42s       | 174.49s     | 9.71s      | 12.94s     | 97.09s       |
| 3           | No     | 1062.20s   | 339.46s       | 194.63s     | 9.45s      | 12.62s     | 443.45s      |
| 4           | Yes    | 530.90s    | 195.99s       | 172.53s     | 9.18s      | 12.33s     | 53.94s       |
| 4           | No     | 741.59s    | 175.76s       | 192.84s     | 9.54s      | 12.47s     | 262.35s      |
| 5           | Yes    | 889.96s    | 527.13s       | 172.28s     | 9.48s      | 12.65s     | 54.49s       |
| 5           | No     | 1609.57s   | 177.46s       | 357.79s     | 9.61s      | 12.59s     | 938.89s      |

## Overall Scores

Based on the benchmark results, average taken from executed 62 steps ın both environments.

### NodeJS Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 193.91s      | 283.52s        |
| Avg Deploy & Initialize Time  | 238.57s      | 341.14s        |
| Avg Accept Game Time          | 236.63s      | 489.85s        |
| Avg Time To Create Base Proof | 9.35s        | 9.61s          |
| Avg Make Guess Time           | 12.43s       | 12.55s         |
| Avg Give Clue Time            | 12.46s       | 12.59s         |
| Avg Submit Game Proof Time    | 191.51s      | 192.89s        |

### Browser Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 181.94s      | 284.45s        |
| Avg Deploy & Initialize Time  | 375.85s      | 230.89s        |
| Avg Accept Game Time          | 173.10s      | 248.42s        |
| Avg Time To Create Base Proof | 9.46s        | 9.53s          |
| Avg Make Guess Time           | 12.61s       | 12.56s         |
| Avg Give Clue Time            | 12.60s       | 12.62s         |
| Avg Submit Game Proof Time    | 68.51s       | 548.23s        |

#### Metric Explanations

- **Avg Time Each Game Step**: Total time taken to complete a game step on average.
- **Avg Deploy & Initialize Time**: Time taken to deploy and initialize the contract.
- **Avg Accept Game Time**: Time taken to accept a game by code breaker.
- **Avg Time To Create Base Proof**: Time taken to create the base proof for recursion.
- **Avg Make Guess Time**: Time taken to make a guess by code breaker.
- **Avg Give Clue Time**: Time taken to give a clue by code master.
- **Avg Submit Game Proof Time**: Time taken to submit the recursive game proof to on-chain.

# Conclusion

Unlike the fully on-chain approach where the game state is stored and changed on-chain in every step, the recursive MastermindZkApp approach allows for both parties to interact with each other off-chain and only submit the final succint proof to the chain that includes all the game steps and the result. This approach significantly reduces the on-chain block time waiting and the cost of transactions.

Mina's block time is around 3 minutes, and that means without recursion it would take at least 6 minutes to complete a game step (making guess and giving clue). With the recursive approach, the time is reduced to around **32 seconds** on average. This improvement is reach significant levels when the game steps increase.
