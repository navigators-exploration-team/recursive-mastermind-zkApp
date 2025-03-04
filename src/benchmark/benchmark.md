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
| giveClue   | 561  |
| makeGuess  | 453  |
| **Total**  | 1466 |

---

### Mastermind Contract Analysis

| Method          | Rows |
| --------------- | ---- |
| initGame        | 1816 |
| acceptGame      | 1679 |
| submitGameProof | 567  |
| claimReward     | 1079 |
| forfeitWin      | 1037 |
| makeGuess       | 857  |
| giveClue        | 999  |

### Compilation Times

| Name          | NodeJS Compilation Time | Browser Compilation Time |
| ------------- | ----------------------- | ------------------------ |
| stepProgram   | 13.46s                  | 52.35s                   |
| MastermindApp | 8.60s                   | 20.67s                   |

## Step-wise Benchmark Results

### NodeJS Environment

| Step Length | Solved | Deploy & Initialize Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ----------------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 11.402                  | 10.337      | 9.499          | 12.358         | 13.209            | 69.454     |
| 1           | No     | 10.370                  | 10.057      | 8.801          | 11.943         | 12.634            | 65.731     |
| 5           | Yes    | 10.340                  | 10.128      | 8.807          | 12.352         | 13.348            | 168.026    |
| 5           | No     | 11.108                  | 10.304      | 8.897          | 12.173         | 13.270            | 166.189    |
| 10          | Yes    | 10.519                  | 10.470      | 9.617          | 12.601         | 12.987            | 295.009    |
| 10          | No     | 10.586                  | 10.502      | 9.149          | 12.598         | 13.675            | 295.294    |
| 15          | Yes    | 10.811                  | 10.649      | 9.303          | 12.646         | 13.621            | 424.020    |
| 15          | No     | 10.861                  | 10.875      | 9.570          | 12.737         | 13.529            | 428.026    |

### Browser Environment

| Step Length | Solved | Deploy & Initialize Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ----------------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 16.305                  | 16.150      | 14.438         | 19.069         | 20.441            | 105.603    |
| 1           | No     | 15.127                  | 16.124      | 14.212         | 18.696         | 19.615            | 102.495    |
| 5           | Yes    | 15.392                  | 16.020      | 14.165         | 19.128         | 19.915            | 255.936    |
| 5           | No     | 15.498                  | 15.469      | 14.328         | 18.731         | 19.829            | 251.549    |
| 10          | Yes    | 16.176                  | 16.263      | 14.728         | 19.225         | 20.256            | 452.371    |
| 10          | No     | 16.576                  | 16.150      | 14.511         | 19.380         | 21.340            | 455.191    |
| 15          | Yes    | 16.126                  | 16.339      | 14.449         | 19.161         | 20.634            | 644.687    |
| 15          | No     | 15.644                  | 16.475      | 14.312         | 19.634         | 20.800            | 655.678    |

## Overall Scores

### NodeJS Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 30.8551s     | 30.8142s       |
| Avg Deploy & Initialize Time  | 10.7679s     | 10.7310s       |
| Avg Accept Game Time          | 10.3959s     | 10.4348s       |
| Avg Time To Create Base Proof | 9.3065s      | 9.1043s        |
| Avg Make Guess Time           | 12.5747s     | 12.5758s       |
| Avg Give Clue Time            | 12.6337s     | 12.6194s       |
| Avg Submit Game Proof Time    | 13.2914s     | 13.2770s       |

### Browser Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 47.0515s     | 47.2552s       |
| Avg Deploy & Initialize Time  | 15.9994s     | 15.7113s       |
| Avg Accept Game Time          | 16.1931s     | 16.0547s       |
| Avg Time To Create Base Proof | 14.4447s     | 14.3406s       |
| Avg Make Guess Time           | 19.1733s     | 19.3762s       |
| Avg Give Clue Time            | 19.2396s     | 19.2980s       |
| Avg Submit Game Proof Time    | 20.3118s     | 20.3959s       |

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

Mina's block time is around 3 minutes, and that means without recursion it would take at least 6 minutes to complete a game step (making guess and giving clue). With the recursive approach, the time is reduced to around 47 seconds on average. This improvement is reach significant levels when the game steps increase.
