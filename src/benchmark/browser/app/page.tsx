'use client';
import { useEffect } from 'react';
import type { PrivateKey, Field } from 'o1js';
import { StepProgramProof } from '../../../../build/src/stepProgram';

interface BenchmarkResults {
  stepLength: number;
  totalSeconds: number;
  createGameSeconds: number;
  makeGuessSeconds: number[];
  giveClueSeconds: number[];
  isSolved: boolean;
  submitGameProofSeconds: number;
}

export default function Home() {
  useEffect(() => {
    (async () => {
      const { Mina, Field, PrivateKey, AccountUpdate, UInt8, Signature } =
        await import('o1js');
      const { MastermindZkApp } = await import(
        '../../../../build/src/Mastermind'
      );
      const { StepProgram } = await import('../../../../build/src/stepProgram');

      const updateProgress = (msg: string): void => {
        let progressElem = document.getElementById('progress');
        if (progressElem && progressElem.parentNode) {
          progressElem.parentNode.removeChild(progressElem);
        }
        progressElem = document.createElement('p');
        progressElem.id = 'progress';
        const container = document.getElementById('logs');
        if (container) container.appendChild(progressElem);

        progressElem.textContent = msg;
      };

      const appendFinalLog = (msg: string): void => {
        const container = document.getElementById('logs');
        if (!container) return;
        const p = document.createElement('p');
        p.textContent = msg;
        container.appendChild(p);
      };

      const prettifyBenchmark = (result: BenchmarkResults) => {
        const avgCreateGame = result.createGameSeconds;
        const avgMakeGuess = result.makeGuessSeconds.length
          ? result.makeGuessSeconds.reduce((a, b) => a + b, 0) /
            result.makeGuessSeconds.length
          : 0;

        appendFinalLog(`Step Length: ${result.stepLength}`);
        appendFinalLog(`Total Seconds: ${result.totalSeconds.toFixed(3)}`);
        appendFinalLog(`Create Game (Avg): ${avgCreateGame.toFixed(3)}`);
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
        const totalCreateGame = benchmarkResults.reduce(
          (sum, result) => sum + result.createGameSeconds,
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
        rounds: number
      ): Promise<void> {
        const deployerAccount = deployerKey.toPublicKey();
        const initTx = await Mina.transaction(deployerAccount, async () => {
          await zkapp.initGame(UInt8.from(rounds));
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
          await zkapp.createGame(Field(secret), codeMasterSalt);
        });
        await tx.prove();
        await tx.sign([codeMasterKey]).send();
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

        const zkappPrivateKey: PrivateKey = PrivateKey.random();
        const zkappAddress = zkappPrivateKey.toPublicKey();
        const zkapp = new MastermindZkApp(zkappAddress);
        const unseparatedSecretCombination: Field = Field.from(secret);
        let lastProof: StepProgramProof;

        const currentBenchmarkResults: BenchmarkResults = {
          stepLength: steps.length,
          totalSeconds: 0,
          createGameSeconds: 0,
          makeGuessSeconds: [],
          giveClueSeconds: [],
          isSolved: false,
          submitGameProofSeconds: 0,
        };

        updateProgress('Deploying zkApp...');
        await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
        updateProgress('Initializing game...');
        await initializeGame(zkapp, codeMasterKey, 15);
        updateProgress('Creating game...');
        await createGame(zkapp, codeMasterKey, codeMasterSalt, secret);

        updateProgress('Generating base proof (createGame)...');
        let start = performance.now();
        lastProof = (
          await StepProgram.createGame(
            {
              authPubKey: codeMasterPubKey,
              authSignature: Signature.create(codeMasterKey, [
                unseparatedSecretCombination,
                codeMasterSalt,
              ]),
            },
            UInt8.from(15),
            unseparatedSecretCombination,
            codeMasterSalt
          )
        ).proof;
        let end = performance.now();

        currentBenchmarkResults.createGameSeconds = (end - start) / 1000;

        for (const step of steps) {
          updateProgress(`Processing makeGuess for step ${step.toString()}...`);
          start = performance.now();
          lastProof = (
            await StepProgram.makeGuess(
              {
                authPubKey: codeBreakerPubKey,
                authSignature: Signature.create(codeBreakerKey, [
                  step,
                  Field.from(lastProof.publicOutput.turnCount.toNumber()),
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
                  Field.from(lastProof.publicOutput.turnCount.toNumber()),
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

        currentBenchmarkResults.isSolved =
          lastProof.publicOutput.isSolved.toBoolean();

        currentBenchmarkResults.submitGameProofSeconds = (end - start) / 1000;

        currentBenchmarkResults.totalSeconds =
          currentBenchmarkResults.createGameSeconds +
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
