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
| createGame | 536  |
| giveClue   | 679  |
| makeGuess  | 820  |
| **Total**  | 2035 |

---

### Mastermind Contract Analysis

| Method          | Rows  |
| --------------- | ----- |
| initGame        | 1349  |
| acceptGame      | 1557  |
| submitGameProof | 1377  |
| claimReward     | 1463  |
| forfeitWin      | 1435  |
| makeGuess       | 1626  |
| giveClue        | 1665  |
| **Total**       | 10472 |

### Compilation Times

| Name          | NodeJS (Without cache) | Browser (Without cache) |
| ------------- | ---------------------- | ----------------------- |
| StepProgram   | 23.27s                 | 52.95s                  |
| MastermindApp | 12.26s                 | 17.96s                  |

## Step-wise Benchmark Results (Local Mina Network)

### NodeJS Environment

| Step Length | Solved | Total Time | Deploy & Init | Accept Game | Base Proof | Make Guess | Give Clue | Submit Proof |
| ----------- | ------ | ---------- | ------------- | ----------- | ---------- | ---------- | --------- | ------------ |
| 1           | true   | 40.115     | 0.761         | 0.311       | 10.783     | 13.942     | 14.123    | 0.196        |
| 1           | false  | 40.981     | 0.300         | 0.239       | 9.977      | 16.782     | 13.507    | 0.176        |
| 3           | true   | 87.739     | 0.291         | 0.233       | 9.502      | 12.786     | 13.052    | 0.199        |
| 3           | false  | 90.476     | 0.289         | 0.234       | 10.051     | 13.318     | 13.262    | 0.162        |
| 5           | true   | 138.562    | 0.302         | 0.301       | 9.779      | 13.097     | 12.486    | 0.269        |
| 5           | false  | 133.785    | 0.283         | 0.229       | 9.123      | 12.434     | 12.368    | 0.139        |
| 7           | true   | 185.265    | 0.284         | 0.234       | 9.217      | 12.606     | 12.449    | 0.143        |
| 7           | false  | 202.480    | 0.290         | 0.235       | 10.740     | 13.697     | 13.596    | 0.164        |

### Browser Environment

| Step Length | Solved | Total Time | Deploy & Init | Accept Game | Base Proof | Make Guess | Give Clue | Submit Proof |
| ----------- | ------ | ---------- | ------------- | ----------- | ---------- | ---------- | --------- | ------------ |
| 1           | true   | 60.898     | 1.801         | 0.282       | 16.132     | 21.140     | 21.306    | 0.238        |
| 1           | false  | 56.576     | 0.315         | 0.246       | 15.415     | 20.214     | 20.120    | 0.266        |
| 3           | true   | 131.157    | 0.315         | 0.247       | 14.174     | 19.356     | 19.378    | 0.219        |
| 3           | false  | 137.526    | 0.326         | 0.246       | 14.852     | 20.378     | 20.256    | 0.198        |
| 5           | true   | 211.546    | 0.310         | 0.244       | 16.110     | 19.465     | 19.466    | 0.230        |
| 5           | false  | 221.878    | 0.331         | 0.251       | 15.453     | 20.566     | 20.562    | 0.203        |
| 7           | true   | 290.133    | 0.316         | 0.242       | 15.165     | 19.586     | 19.577    | 0.269        |
| 7           | false  | 283.949    | 0.333         | 0.245       | 15.369     | 19.083     | 19.175    | 0.197        |

## Overall Scores

### NodeJS Environment

| Metric                        | Solved Games Avg | Unsolved Games Avg |
| ----------------------------- | ---------------- | ------------------ |
| Avg Time Each Game Step       | 28.2301 s        | 29.2326 s          |
| Avg Deploy & Initialize Time  | 0.4096 s         | 0.2903 s           |
| Avg Accept Game Time          | 0.2699 s         | 0.2343 s           |
| Avg Time To Create Base Proof | 9.8202 s         | 9.9726 s           |
| Avg Make Guess Time           | 12.8766 s        | 13.4242 s          |
| Avg Give Clue Time            | 12.6782 s        | 13.1440 s          |
| Avg Submit Game Proof Time    | 0.2016 s         | 0.1602 s           |

### Browser Environment

| Metric                        | Solved Games Avg | Unsolved Games Avg |
| ----------------------------- | ---------------- | ------------------ |
| Avg Time Each Game Step       | 43.3584 s        | 43.7455 s          |
| Avg Time To Deploy            | 0.6854 s         | 0.3264 s           |
| Avg Time To Accept Game       | 0.2537 s         | 0.2470 s           |
| Avg Time To Create Base Proof | 15.3955 s        | 15.2723 s          |
| Avg Make Guess Time           | 19.6022 s        | 19.8599 s          |
| Avg Give Clue Time            | 19.6128 s        | 19.8702 s          |
| Avg Submit Game Proof Time    | 0.2389 s         | 0.2158 s           |

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

Mina's block time is around 3 minutes, and that means without recursion it would take at least 6 minutes to complete a game step (making guess and giving clue). With the recursive approach, the time is reduced to around **28 seconds** on average. This improvement is reach significant levels when the game steps increase.
