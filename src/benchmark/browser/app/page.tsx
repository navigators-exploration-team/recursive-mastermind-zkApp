'use client';
import { useEffect } from 'react';
import { type PrivateKey, type Field } from 'o1js';
import { StepProgramProof } from '../../../../build/src/stepProgram';

interface BenchmarkResults {
  stepLength: number;
  totalSeconds: number;
  deploySeconds: number;
  initializeGameSeconds: number;
  createGameSeconds: number;
  acceptGameSeconds: number;
  baseGameSeconds: number;
  makeGuessSeconds: number[];
  giveClueSeconds: number[];
  isSolved: boolean;
  submitGameProofSeconds: number;
}

export default function Home() {
  useEffect(() => {
    (async () => {
      const { Mina, PrivateKey, AccountUpdate, Field, Signature, UInt64 } =
        await import('o1js');
      const { MastermindZkApp } = await import(
        '../../../../build/src/Mastermind'
      );
      const { StepProgram } = await import('../../../../build/src/stepProgram');
      const { checkIfSolved, deserializeClue } = await import(
        '../../../../build/src/utils'
      );

      const updateProgress = (msg: string): void => {
        let progressElem = document.getElementById('progress');
        if (!progressElem) {
          progressElem = document.createElement('p');
          progressElem.id = 'progress';
          const container = document.getElementById('logs');
          if (container) container.appendChild(progressElem);
        }

        const currentTime = new Date().toLocaleTimeString();
        progressElem.textContent = msg + ' - ' + currentTime;
      };

      const appendFinalLog = (msg: string): void => {
        const container = document.getElementById('logs');
        if (!container) return;
        const p = document.createElement('p');
        p.textContent = msg;
        container.appendChild(p);
      };

      const prettifyBenchmark = (result: BenchmarkResults) => {
        const avgCreateGame = result.baseGameSeconds;
        const avgMakeGuess = result.makeGuessSeconds.length
          ? result.makeGuessSeconds.reduce((a, b) => a + b, 0) /
            result.makeGuessSeconds.length
          : 0;

        appendFinalLog(`Step Length: ${result.stepLength}`);
        appendFinalLog(`Total Seconds: ${result.totalSeconds.toFixed(3)}`);
        appendFinalLog(`Deploy (Avg): ${result.deploySeconds.toFixed(3)}`);
        appendFinalLog(
          `Initialize Game (Avg): ${result.initializeGameSeconds.toFixed(3)}`
        );
        appendFinalLog(
          `Create Game (Avg): ${result.createGameSeconds.toFixed(3)}`
        );
        appendFinalLog(
          `Accept Game (Avg): ${result.acceptGameSeconds.toFixed(3)}`
        );
        appendFinalLog(
          `Base Game Proof Create  (Avg): ${avgCreateGame.toFixed(3)}`
        );
        appendFinalLog(`Make Guess (Avg): ${avgMakeGuess.toFixed(3)}`);
        appendFinalLog(`Solved: ${result.isSolved ? 'Yes' : 'No'}`);
        appendFinalLog(
          `Submit Game Proof: ${result.submitGameProofSeconds.toFixed(3)}`
        );
        appendFinalLog('--------------------------------------');
      };

      const overallScores = (benchmarkResults: BenchmarkResults[]) => {
        const totalBenchmarkResults = benchmarkResults.length;
        const totalStepLength = benchmarkResults.reduce(
          (sum, result) => sum + result.stepLength,
          0
        );
        const totalTime = benchmarkResults.reduce(
          (sum, result) => sum + result.totalSeconds,
          0
        );
        const totalDeploy = benchmarkResults.reduce(
          (sum, result) => sum + result.deploySeconds,
          0
        );
        const totalInitializeGame = benchmarkResults.reduce(
          (sum, result) => sum + result.initializeGameSeconds,
          0
        );
        const totalAcceptGame = benchmarkResults.reduce(
          (sum, result) => sum + result.acceptGameSeconds,
          0
        );
        const totalCreateGame = benchmarkResults.reduce(
          (sum, result) => sum + result.baseGameSeconds,
          0
        );
        const totalMakeGuess = benchmarkResults.reduce(
          (sum, result) =>
            sum + result.makeGuessSeconds.reduce((a, b) => a + b, 0),
          0
        );
        const totalGiveClue = benchmarkResults.reduce(
          (sum, result) =>
            sum + result.giveClueSeconds.reduce((a, b) => a + b, 0),
          0
        );
        const totalSubmitGameProof = benchmarkResults.reduce(
          (sum, result) => sum + result.submitGameProofSeconds,
          0
        );
        appendFinalLog(
          `Avg Time Each Game Step: ${totalTime / totalStepLength}`
        );
        appendFinalLog(
          `Avg Time To Deploy: ${totalDeploy / totalBenchmarkResults}`
        );
        appendFinalLog(
          `Avg Time To Initialize Game: ${
            totalInitializeGame / totalBenchmarkResults
          }`
        );
        appendFinalLog(
          `Avg Time To Accept Game: ${totalAcceptGame / totalBenchmarkResults}`
        );
        appendFinalLog(
          `Avg Time To Create Base Proof: ${
            totalCreateGame / totalBenchmarkResults
          }`
        );
        appendFinalLog(
          `Avg Make Guess Time: ${totalMakeGuess / totalStepLength}`
        );
        appendFinalLog(
          `Avg Give Clue Time: ${totalGiveClue / totalStepLength}`
        );
        appendFinalLog(
          `Avg Submit Game Proof Time: ${
            totalSubmitGameProof / totalBenchmarkResults
          }`
        );
        appendFinalLog('--------------------------------------');
      };

      updateProgress('Compiling zkApp and StepProgram...');
      let compileStart = performance.now();
      await StepProgram.compile();
      let compileEnd = performance.now();
      appendFinalLog('--------------------------------------');
      appendFinalLog(
        `StepProgram compilation took ${
          (compileEnd - compileStart) / 1000
        } seconds`
      );

      compileStart = performance.now();
      await MastermindZkApp.compile();
      compileEnd = performance.now();
      appendFinalLog(
        `MastermindZkApp compilation took ${
          (compileEnd - compileStart) / 1000
        } seconds`
      );
      appendFinalLog('--------------------------------------');

      async function localDeploy(
        zkapp: InstanceType<typeof MastermindZkApp>,
        deployerKey: PrivateKey,
        zkappPrivateKey: PrivateKey
      ): Promise<void> {
        const deployerAccount = deployerKey.toPublicKey();
        const tx = await Mina.transaction(deployerAccount, async () => {
          AccountUpdate.fundNewAccount(deployerAccount);
          zkapp.deploy();
        });
        await tx.prove();
        await tx.sign([deployerKey, zkappPrivateKey]).send();
      }

      async function initializeGame(
        zkapp: InstanceType<typeof MastermindZkApp>,
        deployerKey: PrivateKey,
        refereeKey: PrivateKey,
        rounds: number
      ): Promise<void> {
        const deployerAccount = deployerKey.toPublicKey();
        const refereeAccount = refereeKey.toPublicKey();
        const initTx = await Mina.transaction(deployerAccount, async () => {
          await zkapp.initGame(Field.from(rounds), refereeAccount);
        });
        await initTx.prove();
        await initTx.sign([deployerKey]).send();
      }

      async function createGame(
        zkapp: InstanceType<typeof MastermindZkApp>,
        codeMasterKey: PrivateKey,
        codeMasterSalt: Field,
        secret: number
      ): Promise<void> {
        const codeMasterPubKey = codeMasterKey.toPublicKey();
        const tx = await Mina.transaction(codeMasterPubKey, async () => {
          await zkapp.createGame(
            Field(secret),
            codeMasterSalt,
            UInt64.from(10000)
          );
        });
        await tx.prove();
        await tx.sign([codeMasterKey]).send();
      }

      async function acceptGame(
        zkapp: InstanceType<typeof MastermindZkApp>,
        codeBreakerKey: PrivateKey
      ) {
        const codeBreakerPubKey = codeBreakerKey.toPublicKey();
        const tx = await Mina.transaction(codeBreakerPubKey, async () => {
          await zkapp.acceptGame();
        });

        await tx.prove();
        await tx.sign([codeBreakerKey]).send();
      }

      async function solveBenchmark(
        secret: number,
        steps: Field[]
      ): Promise<BenchmarkResults> {
        const Local = await Mina.LocalBlockchain();
        Mina.setActiveInstance(Local);

        const codeMasterKey: PrivateKey = Local.testAccounts[0].key;
        const codeMasterPubKey = codeMasterKey.toPublicKey();
        const codeMasterSalt: Field = Field.random();

        const codeBreakerKey: PrivateKey = Local.testAccounts[1].key;
        const codeBreakerPubKey = codeBreakerKey.toPublicKey();

        const refereeKey = Local.testAccounts[2].key;

        const zkappPrivateKey: PrivateKey = PrivateKey.random();
        const zkappAddress = zkappPrivateKey.toPublicKey();
        const zkapp = new MastermindZkApp(zkappAddress);
        const unseparatedSecretCombination: Field = Field.from(secret);
        let lastProof: StepProgramProof;

        const currentBenchmarkResults: BenchmarkResults = {
          stepLength: steps.length,
          totalSeconds: 0,
          deploySeconds: 0,
          initializeGameSeconds: 0,
          createGameSeconds: 0,
          acceptGameSeconds: 0,
          baseGameSeconds: 0,
          makeGuessSeconds: [],
          giveClueSeconds: [],
          isSolved: false,
          submitGameProofSeconds: 0,
        };

        updateProgress('Deploying zkApp...');
        let start = performance.now();
        await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
        let end = performance.now();
        currentBenchmarkResults.deploySeconds = (end - start) / 1000;

        updateProgress('Initializing game...');
        start = performance.now();
        await initializeGame(zkapp, codeMasterKey, refereeKey, 15);
        end = performance.now();
        currentBenchmarkResults.initializeGameSeconds = (end - start) / 1000;

        updateProgress('Creating game...');
        start = performance.now();
        await createGame(zkapp, codeMasterKey, codeMasterSalt, secret);
        end = performance.now();
        currentBenchmarkResults.createGameSeconds = (end - start) / 1000;

        updateProgress('Accepting game...');
        start = performance.now();
        await acceptGame(zkapp, codeBreakerKey);
        end = performance.now();
        currentBenchmarkResults.acceptGameSeconds = (end - start) / 1000;

        updateProgress('Generating base proof (createGame)...');
        start = performance.now();
        lastProof = (
          await StepProgram.createGame(
            {
              authPubKey: codeMasterPubKey,
              authSignature: Signature.create(codeMasterKey, [
                unseparatedSecretCombination,
                codeMasterSalt,
              ]),
            },
            unseparatedSecretCombination,
            codeMasterSalt
          )
        ).proof;
        end = performance.now();

        currentBenchmarkResults.baseGameSeconds = (end - start) / 1000;

        for (const step of steps) {
          updateProgress(`Processing makeGuess for step ${step.toString()}...`);
          start = performance.now();
          lastProof = (
            await StepProgram.makeGuess(
              {
                authPubKey: codeBreakerPubKey,
                authSignature: Signature.create(codeBreakerKey, [
                  step,
                  lastProof.publicOutput.turnCount,
                ]),
              },
              lastProof,
              step
            )
          ).proof;
          end = performance.now();
          currentBenchmarkResults.makeGuessSeconds.push((end - start) / 1000);

          updateProgress(`Processing giveClue for step ${step.toString()}...`);
          start = performance.now();
          lastProof = (
            await StepProgram.giveClue(
              {
                authPubKey: codeMasterPubKey,
                authSignature: Signature.create(codeMasterKey, [
                  unseparatedSecretCombination,
                  codeMasterSalt,
                  lastProof.publicOutput.turnCount,
                ]),
              },
              lastProof,
              unseparatedSecretCombination,
              codeMasterSalt
            )
          ).proof;
          end = performance.now();
          currentBenchmarkResults.giveClueSeconds.push((end - start) / 1000);
        }

        updateProgress('Submitting game proof...');
        start = performance.now();
        const submitGameProofTx = await Mina.transaction(
          codeBreakerKey.toPublicKey(),
          async () => {
            await zkapp.submitGameProof(lastProof);
          }
        );

        await submitGameProofTx.prove();
        await submitGameProofTx.sign([codeBreakerKey]).send();
        end = performance.now();

        const deserializedClue = deserializeClue(
          lastProof.publicOutput.serializedClue
        );
        const isSolved = checkIfSolved(deserializedClue);

        currentBenchmarkResults.isSolved = isSolved.toBoolean();

        currentBenchmarkResults.submitGameProofSeconds = (end - start) / 1000;

        currentBenchmarkResults.totalSeconds =
          currentBenchmarkResults.deploySeconds +
          currentBenchmarkResults.initializeGameSeconds +
          currentBenchmarkResults.createGameSeconds +
          currentBenchmarkResults.acceptGameSeconds +
          currentBenchmarkResults.baseGameSeconds +
          currentBenchmarkResults.makeGuessSeconds.reduce((a, b) => a + b, 0) +
          currentBenchmarkResults.giveClueSeconds.reduce((a, b) => a + b, 0) +
          currentBenchmarkResults.submitGameProofSeconds;

        prettifyBenchmark(currentBenchmarkResults);

        return currentBenchmarkResults;
      }

      const steps: Field[] = [
        Field.from(9312),
        Field.from(3456),
        Field.from(7891),
        Field.from(2345),
        Field.from(6789),
        Field.from(5432),
        Field.from(9786),
        Field.from(8461),
        Field.from(6532),
        Field.from(5316),
        Field.from(7451),
        Field.from(9123),
        Field.from(4567),
        Field.from(8951),
        Field.from(1234),
      ];

      const benchmarkResults: BenchmarkResults[] = [];

      // Step length 1

      let result = await solveBenchmark(1234, steps.slice(14));
      benchmarkResults.push(result);
      result = await solveBenchmark(4321, steps.slice(14));
      benchmarkResults.push(result);

      // Step length 5

      result = await solveBenchmark(1234, steps.slice(10));
      benchmarkResults.push(result);
      result = await solveBenchmark(4321, steps.slice(10));
      benchmarkResults.push(result);

      // Step length 10
      result = await solveBenchmark(1234, steps.slice(5));
      benchmarkResults.push(result);
      result = await solveBenchmark(4321, steps.slice(5));
      benchmarkResults.push(result);

      // Step length 15
      result = await solveBenchmark(1234, steps);
      benchmarkResults.push(result);
      result = await solveBenchmark(4321, steps);
      benchmarkResults.push(result);

      const progressElem = document.getElementById('progress');
      if (progressElem && progressElem.parentNode) {
        progressElem.parentNode.removeChild(progressElem);
      }

      appendFinalLog('Overall Scores for Solved:');
      overallScores(benchmarkResults.filter((result) => result.isSolved));
      appendFinalLog('Overall Scores for Unsolved:');
      overallScores(benchmarkResults.filter((result) => !result.isSolved));
    })();
  }, []);

  return (
    <main>
      <h1>Mastermind Browser Benchmark</h1>
      <div
        id="logs"
        style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
      ></div>
    </main>
  );
}
