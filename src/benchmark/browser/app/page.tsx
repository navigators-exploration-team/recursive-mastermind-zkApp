'use client';
import { useEffect } from 'react';
import WorkerClient from './worker/workerClient';

export default function Home() {
  useEffect(() => {
    (async () => {
      const updateProgress = (msg: string): void => {
        let progressElem = document.getElementById('progress');
        if (!progressElem) {
          progressElem = document.createElement('p');
          progressElem.id = 'progress';
          const container = document.getElementById('logs');
          if (container) container.appendChild(progressElem);
        }
        const currentTime = new Date().toLocaleTimeString();
        progressElem.textContent = `${msg} - ${currentTime}`;
      };

      const appendFinalLog = (msg: string): void => {
        const container = document.getElementById('logs');
        if (!container) return;
        const p = document.createElement('p');
        p.textContent = msg;
        container.appendChild(p);
      };

      const prettifyBenchmark = (result: BenchmarkResults) => {
        const avgMakeGuess = result.makeGuessSeconds.length
          ? result.makeGuessSeconds.reduce((a, b) => a + b, 0) /
            result.makeGuessSeconds.length
          : 0;
        const avgGiveClue = result.giveClueSeconds.length
          ? result.giveClueSeconds.reduce((a, b) => a + b, 0) /
            result.giveClueSeconds.length
          : 0;
        appendFinalLog(`Step Length: ${result.stepLength}`);
        appendFinalLog(`Total Seconds: ${result.totalSeconds.toFixed(3)}`);
        appendFinalLog(
          `Deploy & Initialize: ${result.deployAndInitializeSeconds.toFixed(3)}`
        );
        appendFinalLog(`Accept Game: ${result.acceptGameSeconds.toFixed(3)}`);
        appendFinalLog(
          `Base Game Proof Create: ${result.baseGameSeconds.toFixed(3)}`
        );
        appendFinalLog(`Make Guess (Avg): ${avgMakeGuess.toFixed(3)}`);
        appendFinalLog(`Give Clue (Avg): ${avgGiveClue.toFixed(3)}`);
        appendFinalLog(
          `Make Guess: ${result.makeGuessSeconds
            .map((time) => time.toFixed(3))
            .join(', ')}`
        );
        appendFinalLog(
          `Give Clue: ${result.giveClueSeconds
            .map((time) => time.toFixed(3))
            .join(', ')}`
        );
        appendFinalLog(
          `Submit Game Proof: ${result.submitGameProofSeconds.toFixed(3)}`
        );
        appendFinalLog(`Solved: ${result.isSolved ? 'Yes' : 'No'}`);
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
          (sum, result) => sum + result.deployAndInitializeSeconds,
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

      updateProgress('Initializing Worker...');
      const workerClient = new WorkerClient();

      // wait for worker to be ready 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));

      updateProgress('Compiling program...');
      let start = performance.now();
      await workerClient.compileProgram();
      let end = performance.now();
      appendFinalLog(`Compiling program took ${(end - start) / 1000} seconds`);

      updateProgress('Loading and compiling contract...');
      start = performance.now();
      await workerClient.loadAndCompileContract();
      end = performance.now();
      appendFinalLog(
        `Loading and compiling contract took ${(end - start) / 1000} seconds`
      );

      const steps = [
        [6, 3, 2, 1],
        [3, 4, 5, 6],
        [7, 4, 1, 6],
        [2, 3, 4, 5],
        [6, 7, 1, 2],
        [5, 4, 3, 2],
        [1, 2, 3, 4],
      ];

      const benchmarkResults: BenchmarkResults[] = [];

      updateProgress('Running benchmark for step length 1...');
      console.log(steps.slice(6));
      let result = await workerClient.solveBenchmark({
        secretCombination: [1, 2, 3, 4],
        steps: steps.slice(6),
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);
      result = await workerClient.solveBenchmark({
        secretCombination: [4, 3, 2, 1],
        steps: steps.slice(6),
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);

      updateProgress('Running benchmark for step length 3...');
      result = await workerClient.solveBenchmark({
        secretCombination: [1, 2, 3, 4],
        steps: steps.slice(4),
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);
      result = await workerClient.solveBenchmark({
        secretCombination: [4, 3, 2, 1],
        steps: steps.slice(4),
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);

      updateProgress('Running benchmark for step length 5...');
      result = await workerClient.solveBenchmark({
        secretCombination: [1, 2, 3, 4],
        steps: steps.slice(2),
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);
      result = await workerClient.solveBenchmark({
        secretCombination: [4, 3, 2, 1],
        steps: steps.slice(2),
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);

      updateProgress('Running benchmark for step length 7...');
      result = await workerClient.solveBenchmark({
        secretCombination: [1, 2, 3, 4],
        steps,
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);
      result = await workerClient.solveBenchmark({
        secretCombination: [4, 3, 2, 1],
        steps,
      });
      benchmarkResults.push(result);
      prettifyBenchmark(result);

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
      <h1>Mastermind Browser Benchmark (Worker)</h1>
      <div
        id="logs"
        style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
      ></div>
    </main>
  );
}
