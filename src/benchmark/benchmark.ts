import { MastermindZkApp } from '../Mastermind.js';
import { Field, Mina, PrivateKey, AccountUpdate, UInt8, Signature } from 'o1js';

import { StepProgram, StepProgramProof } from '../stepProgram.js';
import { performance } from 'perf_hooks';

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
  rounds: number
) {
  const deployerAccount = deployerKey.toPublicKey();

  const initTx = await Mina.transaction(deployerAccount, async () => {
    await zkapp.initGame(UInt8.from(rounds));
  });

  await initTx.prove();
  await initTx.sign([deployerKey]).send();
}

async function createGame(
  zkapp: MastermindZkApp,
  codeMasterKey: PrivateKey,
  codeMasterSalt: Field
) {
  const codeMasterPubKey = codeMasterKey.toPublicKey();
  const tx = await Mina.transaction(codeMasterPubKey, async () => {
    await zkapp.createGame(Field(1234), codeMasterSalt);
  });

  await tx.prove();
  await tx.sign([codeMasterKey]).send();
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
  const avgCreateGame = result.createGameSeconds;
  const avgMakeGuess = result.makeGuessSeconds.length
    ? result.makeGuessSeconds.reduce((a, b) => a + b, 0) /
      result.makeGuessSeconds.length
    : 0;

  console.table([
    { Metric: 'Step Length', Value: result.stepLength },
    { Metric: 'Total Seconds', Value: result.totalSeconds.toFixed(3) },
    { Metric: 'Create Game (Avg)', Value: avgCreateGame.toFixed(3) },
    { Metric: 'Make Guess (Avg)', Value: avgMakeGuess.toFixed(3) },
    {
      Metric: 'Submit Game Proof',
      Value: result.submitGameProofSeconds.toFixed(3),
    },
  ]);

  console.log('--------------------------------------');
}

interface BenchmarkResults {
  stepLength: number;
  totalSeconds: number;
  createGameSeconds: number;
  makeGuessSeconds: number[];
  giveClueSeconds: number[];
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

  for (let i = 0; i < 15; i += 2) {
    await solveBenchmark(steps.slice(i));
  }
}

async function solveBenchmark(steps: Field[]) {
  const Local = await Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);

  let codeMasterKey = Local.testAccounts[0].key;
  let codeMasterPubKey = codeMasterKey.toPublicKey();
  let codeMasterSalt = Field.random();

  let codeBreakerKey = Local.testAccounts[1].key;
  let codeBreakerPubKey = codeBreakerKey.toPublicKey();

  let zkappPrivateKey = PrivateKey.random();
  let zkappAddress = zkappPrivateKey.toPublicKey();
  let zkapp = new MastermindZkApp(zkappAddress);
  let unseparatedSecretCombination = Field.from(1234);
  let lastProof: StepProgramProof;

  let currentBenchmarkResults: BenchmarkResults = {
    stepLength: steps.length,
    totalSeconds: 0,
    createGameSeconds: 0,
    makeGuessSeconds: [],
    giveClueSeconds: [],
    submitGameProofSeconds: 0,
  };

  await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
  await initializeGame(zkapp, codeMasterKey, 15);
  await createGame(zkapp, codeMasterKey, codeMasterSalt);

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

  for (let step of steps) {
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

  currentBenchmarkResults.submitGameProofSeconds = (end - start) / 1000;

  currentBenchmarkResults.totalSeconds =
    currentBenchmarkResults.createGameSeconds +
    currentBenchmarkResults.makeGuessSeconds.reduce((a, b) => a + b, 0) +
    currentBenchmarkResults.giveClueSeconds.reduce((a, b) => a + b, 0) +
    currentBenchmarkResults.submitGameProofSeconds;

  benchmarkResults.push(currentBenchmarkResults);

  prettifyBenchmarks(currentBenchmarkResults);
}

await main();
process.exit(0);
