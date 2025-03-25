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
| stepProgram   | 13.46s                  | 51.98s                   |
| MastermindApp | 8.60s                   | 21.02s                   |

## Step-wise Benchmark Results (Local Mina Network)

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

## Step-wise Benchmark Results (Devnet)

### NodeJS Environment

| Step Length | Solved | Deploy & Initialize Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ----------------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 342.637                 | 180.968     | 9.577          | 12.374         | 323.005           | 880.972    |
| 1           | No     | 364.115                 | 178.449     | 8.874          | 12.068         | 178.148           | 753.638    |
| 5           | Yes    | 154.773                 | 177.261     | 8.940          | 12.080         | 55.038            | 516.730    |
| 5           | No     | 366.333                 | 364.900     | 9.071          | 12.148         | 219.618           | 1081.353   |
| 10          | Yes    | 526.567                 | 197.162     | 9.121          | 12.382         | 261.844           | 1242.157   |
| 10          | No     | 381.566                 | 180.377     | 9.229          | 12.482         | 287.123           | 1108.184   |
| 15          | Yes    | 523.563                 | 176.011     | 9.432          | 12.650         | 138.251           | 1227.932   |
| 15          | No     | 1112.125                | 560.973     | 15.677         | 12.799         | 117.109           | 2188.373   |

### Browser Environment

| Step Length | Solved | Deploy & Initialize Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ----------------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 160.681                 | 200.512     | 14.859         | 19.062         | 309.264           | 723.680    |
| 1           | No     | 535.054                 | 161.901     | 17.218         | 22.129         | 126.104           | 882.741    |
| 5           | Yes    | 552.822                 | 182.921     | 14.965         | 19.509         | 313.621           | 1259.638   |
| 5           | No     | 204.592                 | 164.484     | 14.801         | 19.305         | 315.095           | 892.911    |
| 10          | Yes    | 183.039                 | 181.841     | 14.768         | 19.822         | 334.276           | 1108.860   |
| 10          | No     | 183.821                 | 323.537     | 14.502         | 18.867         | 350.222           | 1247.992   |
| 15          | Yes    | 198.983                 | 183.503     | 15.593         | 20.088         | 268.805           | 1269.193   |
| 15          | No     | 182.535                 | 345.857     | 14.756         | 19.693         | 125.274           | 1261.521   |

## Overall Scores

Based on the benchmark results, average taken from executed 62 steps ın both environments.

### NodeJS Environment

| Metric                        | Solved Games       | Unsolved Games     |
| ----------------------------- | ------------------ | ------------------ |
| Avg Time Each Game Step       | 124.76745554438703 | 165.53377469351577 |
| Avg Deploy & Initialize Time  | 386.88517117724984 | 556.03497421875    |
| Avg Accept Game Time          | 182.85072484375    | 321.17472629150006 |
| Avg Time To Create Base Proof | 9.267542146000022  | 10.71290122925007  |
| Avg Make Guess Time           | 12.462783076677416 | 12.567965045741737 |
| Avg Give Clue Time            | 12.4932853735806   | 12.524253874935301 |
| Avg Submit Game Proof Time    | 194.5348118125001  | 200.49945549999998 |

### Browser Environment

| Metric                        | Solved Games       | Unsolved Games     |
| ----------------------------- | ------------------ | ------------------ |
| Avg Time Each Game Step       | 84.61289699999888  | 84.10140433333316  |
| Avg Deploy & Initialize Time  | 198.98343999999761 | 182.53462000000476 |
| Avg Accept Game Time          | 183.50275499999523 | 345.85669500000773 |
| Avg Time To Create Base Proof | 15.593405000001193 | 14.756024999991059 |
| Avg Make Guess Time           | 20.088185666667417 | 19.693103666668136 |
| Avg Give Clue Time            | 20.065748999998966 | 19.84685266666412  |
| Avg Submit Game Proof Time    | 268.80483499999343 | 125.27438000001013 |

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
