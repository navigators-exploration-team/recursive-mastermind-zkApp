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

| Method                 | Rows |
| ---------------------- | ---- |
| getContractBalance     | 643  |
| assertFinalized        | 320  |
| initGame               | 392  |
| createGame             | 1819 |
| acceptGame             | 2096 |
| submitGameProof        | 553  |
| claimCodeBreakerReward | 1881 |
| claimCodeMasterReward  | 1881 |
| penalizeCodeBreaker    | 1449 |
| penalizeCodeMaster     | 1449 |
| makeGuess              | 843  |
| giveClue               | 985  |
| **Total**              | 1523 |

### Compilation Times

| Name          | NodeJS Compilation Time | Browser Compilation Time |
| ------------- | ----------------------- | ------------------------ |
| stepProgram   | 4.54s                   | 35.08s                   |
| MastermindApp | 3.23s                   | 25.84s                   |

## Step-wise Benchmark Results

### NodeJS Environment

| Step Length | Solved | Deploy Avg | Initialize Avg | Create Game Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ---------- | -------------- | --------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 0.174s     | 10.848s        | 10.433s         | 18.788s     | 9.419s         | 12.334s        | 13.211s           | 87.557s    |
| 1           | No     | 0.131s     | 9.629s         | 10.072s         | 18.554s     | 8.783s         | 11.916s        | 12.725s           | 83.684s    |
| 5           | Yes    | 0.131s     | 9.753s         | 10.215s         | 18.514s     | 8.902s         | 12.061s        | 12.993s           | 181.531s   |
| 5           | No     | 0.129s     | 9.978s         | 10.500s         | 18.841s     | 9.153s         | 12.238s        | 13.160s           | 185.164s   |
| 10          | Yes    | 0.129s     | 9.861s         | 10.814s         | 19.169s     | 9.117s         | 12.547s        | 13.360s           | 313.796s   |
| 10          | No     | 0.130s     | 10.436s        | 10.805s         | 19.408s     | 9.601s         | 12.564s        | 13.502s           | 315.940s   |
| 15          | Yes    | 0.129s     | 10.474s        | 10.800s         | 19.533s     | 9.360s         | 12.646s        | 13.484s           | 443.163s   |
| 15          | No     | 0.129s     | 10.379s        | 11.038s         | 19.543s     | 9.643s         | 12.633s        | 13.379s           | 443.924s   |

### Browser Environment

| Step Length | Solved | Deploy Avg | Initialize Avg | Create Game Avg | Accept Game | Base Proof Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | ---------- | -------------- | --------------- | ----------- | -------------- | -------------- | ----------------- | ---------- |

## Overall Scores

### NodeJS Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 33.0983s     | 33.1842s       |
| Avg Deploy Time               | 0.1407s      | 0.1297s        |
| Avg Initialize Game Time      | 10.2341s     | 10.1058s       |
| Avg Create Game Time          | 9.1996s      | 9.2949s        |
| Avg Accept Game Time          | 19.0009s     | 19.0864s       |
| Avg Time To Create Base Proof | 9.1996s      | 9.2949s        |
| Avg Make Guess Time           | 12.5099s     | 12.5236s       |
| Avg Give Clue Time            | 12.5364s     | 12.6074s       |
| Avg Submit Game Proof Time    | 13.2621s     | 13.1916s       |

### Browser Environment

| Metric | Solved Games | Unsolved Games |
| ------ | ------------ | -------------- |

#### Metric Explanations

- **Avg Time Each Game Step**: Total time taken to complete a game step on average.
- **Avg Time To Create Base Proof**: Average time taken to create a game proof. Single base proof created on every game.
- **Avg Make Guess Time**: Average time taken to make a guess in the game, based on measured from multiple games with different steps.
- **Avg Give Clue Time**: Average time taken to give a clue in the game, based on measured from multiple games with different steps.
- **Avg Submit Game Proof Time**: Average time taken to create transaction proof and submit it to the local network (Block creation time not included).

# Conclusion

Unlike the fully on-chain approach where the game state is stored and changed on-chain in every step, the recursive MastermindZkApp approach allows for both parties to interact with each other off-chain and only submit the final succint proof to the chain that includes all the game steps and the result. This approach significantly reduces the on-chain block time waiting and the cost of transactions.

Mina's block time is around 3 minutes, and that means without recursion it would take at least 6 minutes to complete a game step (making guess and giving clue). With the recursive approach, the time is reduced to around 27 seconds on average. This improvement is reach significant levels when the game steps increase.
