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
| **Total**  | 1490 |

---

### Mastermind Contract Analysis

| Method          | Rows |
| --------------- | ---- |
| initGame        | 332  |
| createGame      | 771  |
| submitGameProof | 420  |
| **Total**       | 1523 |

### Compilation Times

| Name          | NodeJS Compilation Time | Browser Compilation Time |
| ------------- | ----------------------- | ------------------------ |
| stepProgram   | 4.69s                   | 33.36s                   |
| MastermindApp | 1.89s                   | 7.71s                    |

## Step-wise Benchmark Results

### NodeJS Environment

| Step Length | Solved | Create Game Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | --------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 9.435s          | 12.347s        | 12.353s           | 46.534s    |
| 1           | No     | 8.844s          | 11.909s        | 11.734s           | 44.482s    |
| 5           | Yes    | 8.785s          | 11.968s        | 11.759s           | 140.665s   |
| 5           | No     | 8.703s          | 12.331s        | 12.127s           | 143.176s   |
| 10          | Yes    | 8.876s          | 12.379s        | 12.265s           | 268.280s   |
| 10          | No     | 9.070s          | 12.495s        | 12.316s           | 271.691s   |
| 15          | Yes    | 9.367s          | 12.633s        | 12.249s           | 400.791s   |
| 15          | No     | 9.516s          | 12.621s        | 12.484s           | 400.518s   |

### Browser Environment

| Step Length | Solved | Create Game Avg | Make Guess Avg | Submit Game Proof | Total Time |
| ----------- | ------ | --------------- | -------------- | ----------------- | ---------- |
| 1           | Yes    | 9.970s          | 13.116s        | 12.917s           | 49.282s    |
| 1           | No     | 9.926s          | 13.084s        | 12.518s           | 48.933s    |
| 5           | Yes    | 9.703s          | 12.995s        | 12.736s           | 151.845s   |
| 5           | No     | 9.443s          | 13.150s        | 12.586s           | 153.513s   |
| 10          | Yes    | 9.798s          | 13.122s        | 12.671s           | 284.908s   |
| 10          | No     | 9.390s          | 13.037s        | 12.686s           | 282.309s   |
| 15          | Yes    | 9.804s          | 13.010s        | 12.599s           | 413.089s   |
| 15          | No     | 9.780s          | 12.934s        | 12.812s           | 410.674s   |

## Overall Scores

### NodeJS Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 27.6216s     | 27.7377s       |
| Avg Time To Create Base Proof | 9.1156s      | 9.0332s        |
| Avg Make Guess Time           | 12.4346s     | 12.5108s       |
| Avg Give Clue Time            | 12.4422s     | 12.4916s       |
| Avg Submit Game Proof Time    | 12.1566s     | 12.1653s       |

### Browser Environment

| Metric                        | Solved Games | Unsolved Games |
| ----------------------------- | ------------ | -------------- |
| Avg Time Each Game Step       | 29.004s      | 28.885s        |
| Avg Time To Create Base Proof | 9.8188s      | 9.6350s        |
| Avg Make Guess Time           | 13.0470s     | 13.0067s       |
| Avg Give Clue Time            | 13.0474s     | 13.0026s       |
| Avg Submit Game Proof Time    | 12.7308s     | 12.6505s       |

#### Metric Explanations

- **Avg Time Each Game Step**: Total time taken to complete a game step on average.
- **Avg Time To Create Base Proof**: Average time taken to create a game proof. Single base proof created on every game.
- **Avg Make Guess Time**: Average time taken to make a guess in the game, based on measured from multiple games with different steps.
- **Avg Give Clue Time**: Average time taken to give a clue in the game, based on measured from multiple games with different steps.
- **Avg Submit Game Proof Time**: Average time taken to create transaction proof and submit it to the local network (Block creation time not included).

# Conclusion

Unlike the fully on-chain approach where the game state is stored and changed on-chain in every step, the recursive MastermindZkApp approach allows for both parties to interact with each other off-chain and only submit the final succint proof to the chain that includes all the game steps and the result. This approach significantly reduces the on-chain block time waiting and the cost of transactions.

Mina's block time is around 3 minutes, and that means without recursion it would take at least 6 minutes to complete a game step (making guess and giving clue). With the recursive approach, the time is reduced to around 27 seconds on average. This improvement is reach significant levels when the game steps increase.
