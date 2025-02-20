import { MastermindZkApp } from '../../Mastermind.js';
import {
  Field,
  Mina,
  PrivateKey,
  AccountUpdate,
  Signature,
  UInt64,
} from 'o1js';

import { StepProgram, StepProgramProof } from '../../stepProgram.js';
import { performance } from 'perf_hooks';
import { checkIfSolved, deserializeClue } from '../../utils.js';

async function localDeploy(
  zkapp: MastermindZkApp,
  deployerKey: PrivateKey,
  zkappPrivateKey: PrivateKey
) {
  const deployerAccount = deployerKey.toPublicKey();
  const tx = await Mina.transaction(deployerAccount, async () => {
    AccountUpdate.fundNewAccount(deployerAccount);
    zkapp.deploy();
  });

  await tx.prove();
  await tx.sign([deployerKey, zkappPrivateKey]).send();
}

async function initializeGame(
  zkapp: MastermindZkApp,
  deployerKey: PrivateKey,
  refereeKey: PrivateKey,
  rounds: number
) {
  const deployerAccount = deployerKey.toPublicKey();
  const refereeAccount = refereeKey.toPublicKey();

  const initTx = await Mina.transaction(deployerAccount, async () => {
    await zkapp.initGame(Field.from(rounds), refereeAccount);
  });

  await initTx.prove();
  await initTx.sign([deployerKey]).send();
}

async function createGame(
  zkapp: MastermindZkApp,
  codeMasterKey: PrivateKey,
  codeMasterSalt: Field,
  secret: number
) {
  const codeMasterPubKey = codeMasterKey.toPublicKey();
  const tx = await Mina.transaction(codeMasterPubKey, async () => {
    await zkapp.createGame(Field(secret), codeMasterSalt, UInt64.from(10000));
  });

  await tx.prove();
  await tx.sign([codeMasterKey]).send();
}

async function acceptGame(zkapp: MastermindZkApp, codeBreakerKey: PrivateKey) {
  const codeBreakerPubKey = codeBreakerKey.toPublicKey();
  const tx = await Mina.transaction(codeBreakerPubKey, async () => {
    await zkapp.acceptGame();
  });

  await tx.prove();
  await tx.sign([codeBreakerKey]).send();
}

function prettifyAnalyzers(
  tableName: string,
  analyzers: Record<
    string,
    {
      rows: number;
    }
  >
) {
  console.log(`${tableName} Circuit Analysis`);
  const rowsTable = Object.entries(analyzers).map(([method, data]) => ({
    Method: method,
    Rows: data.rows,
  }));
  const totalRows = rowsTable.reduce((sum, row) => sum + row.Rows, 0);
  console.table(rowsTable);
  console.log(`Total Rows: ${totalRows}`);
  console.log('--------------------------------------');
}

function prettifyBenchmarks(result: BenchmarkResults) {
  const avgCreateGame = result.baseGameSeconds;
  const avgMakeGuess = result.makeGuessSeconds.length
    ? result.makeGuessSeconds.reduce((a, b) => a + b, 0) /
      result.makeGuessSeconds.length
    : 0;

  console.table([
    { Metric: 'Step Length', Value: result.stepLength },
    { Metric: 'Total Seconds', Value: result.totalSeconds.toFixed(3) },
    { Metric: 'Deploy (Avg)', Value: result.deploySeconds.toFixed(3) },
    {
      Metric: 'Initialize Game (Avg)',
      Value: result.initializeGameSeconds.toFixed(3),
    },
    { Metric: 'Create Game (Avg)', Value: result.createGameSeconds.toFixed(3) },
    { Metric: 'Accept Game (Avg)', Value: result.acceptGameSeconds.toFixed(3) },
    { Metric: 'Base Game Proof Create (Avg)', Value: avgCreateGame.toFixed(3) },
    { Metric: 'Make Guess (Avg)', Value: avgMakeGuess.toFixed(3) },
    { Metric: 'Solved', Value: result.isSolved },
    {
      Metric: 'Submit Game Proof',
      Value: result.submitGameProofSeconds.toFixed(3),
    },
  ]);

  console.log('--------------------------------------');
}

function overallScores(benchmarkResults: BenchmarkResults[]) {
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
    (sum, result) => sum + result.makeGuessSeconds.reduce((a, b) => a + b, 0),
    0
  );
  const totalGiveClue = benchmarkResults.reduce(
    (sum, result) => sum + result.giveClueSeconds.reduce((a, b) => a + b, 0),
    0
  );
  const totalSubmitGameProof = benchmarkResults.reduce(
    (sum, result) => sum + result.submitGameProofSeconds,
    0
  );

  console.log('Overall Scores in Seconds');
  console.table([
    {
      Metric: 'Avg Time Each Game Step',
      Value: totalTime / totalStepLength,
    },
    {
      Metric: 'Avg Deploy Time',
      Value: totalDeploy / totalBenchmarkResults,
    },
    {
      Metric: 'Avg Initialize Game Time',
      Value: totalInitializeGame / totalBenchmarkResults,
    },
    {
      Metric: 'Avg Create Game Time',
      Value: totalCreateGame / totalBenchmarkResults,
    },
    {
      Metric: 'Avg Accept Game Time',
      Value: totalAcceptGame / totalBenchmarkResults,
    },
    {
      Metric: 'Avg Time To Create Base Proof',
      Value: totalCreateGame / totalBenchmarkResults,
    },
    {
      Metric: 'Avg Make Guess Time',
      Value: totalMakeGuess / totalStepLength,
    },
    {
      Metric: 'Avg Give Clue Time',
      Value: totalGiveClue / totalStepLength,
    },
    {
      Metric: 'Avg Submit Game Proof Time',
      Value: totalSubmitGameProof / totalBenchmarkResults,
    },
  ]);
}

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

let benchmarkResults: BenchmarkResults[] = [];

async function main() {
  prettifyAnalyzers('zkProgram', await StepProgram.analyzeMethods());
  prettifyAnalyzers('zkApp', await MastermindZkApp.analyzeMethods());

  let compileStart = performance.now();
  await StepProgram.compile();
  let compileEnd = performance.now();
  console.log(
    `StepProgram compilation took ${(compileEnd - compileStart) / 1000} seconds`
  );

  compileStart = performance.now();
  await MastermindZkApp.compile();
  compileEnd = performance.now();
  console.log(
    `MastermindZkApp compilation took ${
      (compileEnd - compileStart) / 1000
    } seconds`
  );

  console.log('--------------------------------------');

  const steps = [
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

  // Step Length 1
  await solveBenchmark(1234, steps.slice(14));
  await solveBenchmark(4321, steps.slice(14));

  // Step Length 5
  await solveBenchmark(1234, steps.slice(10));
  await solveBenchmark(4321, steps.slice(10));

  // Step Length 10
  await solveBenchmark(1234, steps.slice(5));
  await solveBenchmark(4321, steps.slice(5));

  // Step Length 15
  await solveBenchmark(1234, steps);
  await solveBenchmark(4321, steps);

  console.log('Overall Benchmark Results for Solved Games');
  overallScores(benchmarkResults.filter((result) => result.isSolved));
  console.log('Overall Benchmark Results for Unsolved Games');
  overallScores(benchmarkResults.filter((result) => !result.isSolved));
}

async function solveBenchmark(secret: number, steps: Field[]) {
  const Local = await Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);

  let codeMasterKey = Local.testAccounts[0].key;
  let codeMasterPubKey = codeMasterKey.toPublicKey();
  let codeMasterSalt = Field.random();

  let codeBreakerKey = Local.testAccounts[1].key;
  let codeBreakerPubKey = codeBreakerKey.toPublicKey();

  let refereeKey = Local.testAccounts[2].key;

  let zkappPrivateKey = PrivateKey.random();
  let zkappAddress = zkappPrivateKey.toPublicKey();
  let zkapp = new MastermindZkApp(zkappAddress);
  let unseparatedSecretCombination = Field.from(secret);
  let lastProof: StepProgramProof;

  let currentBenchmarkResults: BenchmarkResults = {
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

  let start = performance.now();
  await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
  let end = performance.now();
  currentBenchmarkResults.deploySeconds = (end - start) / 1000;

  start = performance.now();
  await initializeGame(zkapp, codeMasterKey, refereeKey, 15);
  end = performance.now();
  currentBenchmarkResults.initializeGameSeconds = (end - start) / 1000;

  start = performance.now();
  await createGame(zkapp, codeMasterKey, codeMasterSalt, secret);
  end = performance.now();
  currentBenchmarkResults.createGameSeconds = (end - start) / 1000;

  start = performance.now();
  await acceptGame(zkapp, codeBreakerKey);
  end = performance.now();
  currentBenchmarkResults.acceptGameSeconds = (end - start) / 1000;

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

  for (let step of steps) {
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
  let isSolved = checkIfSolved(deserializedClue);

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

  benchmarkResults.push(currentBenchmarkResults);

  prettifyBenchmarks(currentBenchmarkResults);
}

await main();
process.exit(0);
