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
| giveClue   | 1327 |
| makeGuess  | 1131 |
| **Total**  | 2910 |

---

### Mastermind Contract Analysis

| Method          | Rows |
| --------------- | ---- |
| initGame        | 1219 |
| acceptGame      | 1085 |
| submitGameProof | 582  |
| claimReward     | 1087 |
| forfeitWin      | 1038 |
| makeGuess       | 1537 |
| giveClue        | 2052 |
| **Total**       | 8600 |

### Compilation Times

| Name          | NodeJS Compilation Time | Browser Compilation Time |
| ------------- | ----------------------- | ------------------------ |
| stepProgram   | 13.46s                  | 34.01s                   |
| MastermindApp | 8.60s                   | 14.86s                   |

## Step-wise Benchmark Results

### NodeJS Environment

| Step Length | Solved | Deploy & Initialize Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ----------------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 10.782                  | 10.617      | 9.888          | 12.670         | 13.466            | 70.511     |
| 1           | No     | 9.780                   | 10.467      | 9.535          | 12.538         | 13.721            | 68.333     |
| 5           | Yes    | 9.488                   | 10.104      | 9.226          | 12.619         | 13.414            | 168.122    |
| 5           | No     | 9.787                   | 11.068      | 9.391          | 13.194         | 13.339            | 174.423    |
| 10          | Yes    | 9.917                   | 10.353      | 9.361          | 12.640         | 13.400            | 296.385    |
| 10          | No     | 9.978                   | 10.408      | 9.565          | 12.666         | 13.500            | 297.308    |
| 15          | Yes    | 9.984                   | 10.409      | 9.483          | 12.683         | 13.327            | 423.509    |
| 15          | No     | 9.953                   | 10.644      | 9.546          | 12.743         | 13.503            | 425.570    |

### Browser Environment

| Step Length | Solved | Deploy & Initialize Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ----------------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 11.346                  | 11.109      | 9.701          | 12.781         | 13.431            | 71.212     |
| 1           | No     | 10.242                  | 10.823      | 9.678          | 12.715         | 13.648            | 69.900     |
| 5           | Yes    | 10.292                  | 10.606      | 9.656          | 12.866         | 13.624            | 173.257    |
| 5           | No     | 10.865                  | 10.904      | 9.762          | 12.755         | 13.435            | 173.047    |
| 10          | Yes    | 10.265                  | 10.729      | 9.685          | 12.850         | 13.919            | 303.627    |
| 10          | No     | 10.563                  | 10.772      | 9.907          | 13.030         | 13.771            | 306.200    |
| 15          | Yes    | 10.707                  | 10.727      | 9.710          | 12.959         | 13.897            | 434.657    |
| 15          | No     | 10.825                  | 10.921      | 9.962          | 13.003         | 13.758            | 435.659    |

## Overall Scores

Based on the benchmark results, average taken from executed 62 steps ın both environments.

### NodeJS Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 30.920255    | 31.149479      |
| Avg Deploy & Initialize Time  | 10.042749    | 9.874681       |
| Avg Accept Game Time          | 10.370855    | 10.646546      |
| Avg Time To Create Base Proof | 9.489730     | 9.509336       |
| Avg Make Guess Time           | 12.658480    | 12.784153      |
| Avg Give Clue Time            | 12.674015    | 12.746416      |
| Avg Submit Game Proof Time    | 13.401803    | 13.515992      |

### Browser Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 31.701691    | 31.767922      |
| Avg Deploy & Initialize Time  | 10.652365    | 10.623866      |
| Avg Accept Game Time          | 10.792719    | 10.854858      |
| Avg Time To Create Base Proof | 9.688132     | 9.827198       |
| Avg Make Guess Time           | 12.903107    | 12.962602      |
| Avg Give Clue Time            | 13.011353    | 13.004183      |
| Avg Submit Game Proof Time    | 13.717821    | 13.652895      |

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
