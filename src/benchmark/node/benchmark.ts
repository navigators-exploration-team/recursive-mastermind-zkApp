import { MastermindZkApp } from '../../Mastermind.js';
import {
  Field,
  Mina,
  PrivateKey,
  AccountUpdate,
  Signature,
  UInt64,
  PublicKey,
  Lightnet,
  fetchAccount,
} from 'o1js';

import { StepProgram, StepProgramProof } from '../../stepProgram.js';
import { performance } from 'perf_hooks';
import { Clue, Combination } from '../../utils.js';
import { players } from '../../test/mock.js';

const logsEnabled = process.env.LOGS_ENABLED === '1';
const testEnvironment = process.env.TEST_ENV ?? 'local';
const localTest = testEnvironment === 'local';
let fee = localTest ? 0 : 1e9;

function log(...args: any[]) {
  if (logsEnabled) {
    console.log(...args);
  }
}

async function waitTransactionAndFetchAccount(
  tx: Awaited<ReturnType<typeof Mina.transaction>>,
  keys: PrivateKey[],
  accountsToFetch?: PublicKey[]
) {
  try {
    log('proving and sending transaction');
    await tx.prove();
    const pendingTransaction = await tx.sign(keys).send();

    log('waiting for transaction to be included in a block');
    if (!localTest) {
      log('Hash: ', pendingTransaction.hash);
      const status = await pendingTransaction.safeWait();
      if (status.status === 'rejected') {
        log('Transaction rejected', JSON.stringify(status.errors));
        throw new Error(
          'Transaction was rejected: ' + JSON.stringify(status.errors)
        );
      }

      if (accountsToFetch) {
        await fetchAccounts(accountsToFetch);
      }
    }
  } catch (error) {
    log('error', error);
    throw error;
  }
}

async function fetchAccounts(accounts: PublicKey[]) {
  if (localTest) return;
  for (let account of accounts) {
    await fetchAccount({ publicKey: account });
  }
}

async function deployAndInitializeGame(
  zkapp: MastermindZkApp,
  zkappPrivateKey: PrivateKey,
  codeMasterKey: PrivateKey,
  codeMasterSalt: Field,
  secretCombination: Combination,
  refereeKey: PrivateKey
) {
  const deployerAccount = codeMasterKey.toPublicKey();
  const refereeAccount = refereeKey.toPublicKey();

  const initTx = await Mina.transaction(
    {
      sender: deployerAccount,
      fee,
    },
    async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkapp.deploy();
      await zkapp.initGame(
        secretCombination,
        codeMasterSalt,
        refereeAccount,
        UInt64.from(1e10)
      );
    }
  );

  await waitTransactionAndFetchAccount(
    initTx,
    [codeMasterKey, zkappPrivateKey],
    [zkapp.address, codeMasterKey.toPublicKey()]
  );
}

async function acceptGame(zkapp: MastermindZkApp, codeBreakerKey: PrivateKey) {
  const codeBreakerPubKey = codeBreakerKey.toPublicKey();
  const tx = await Mina.transaction(
    { sender: codeBreakerPubKey, fee },
    async () => {
      await zkapp.acceptGame();
    }
  );

  await waitTransactionAndFetchAccount(tx, [codeBreakerKey], [zkapp.address]);
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
  const avgMakeGuess = result.makeGuessSeconds.length
    ? result.makeGuessSeconds.reduce((a, b) => a + b, 0) /
      result.makeGuessSeconds.length
    : 0;

  const avgGiveClue = result.giveClueSeconds.length
    ? result.giveClueSeconds.reduce((a, b) => a + b, 0) /
      result.giveClueSeconds.length
    : 0;

  console.table([
    { Metric: 'Step Length', Value: result.stepLength },
    { Metric: 'Total Seconds', Value: result.totalSeconds.toFixed(3) },
    {
      Metric: 'Deploy & Initialize (Avg)',
      Value: result.deployAndInitializeSeconds.toFixed(3),
    },

    { Metric: 'Accept Game (Avg)', Value: result.acceptGameSeconds.toFixed(3) },
    {
      Metric: 'Base Game Proof Create',
      Value: result.baseGameSeconds.toFixed(3),
    },
    { Metric: 'Make Guess (Avg)', Value: avgMakeGuess.toFixed(3) },
    { Metric: 'Give Clue (Avg)', Value: avgGiveClue.toFixed(3) },
    {
      Metric: 'Make Guess Seconds',
      Value: result.makeGuessSeconds.map((x) => x.toFixed(3)),
    },
    {
      Metric: 'Give Clue Seconds',
      Value: result.giveClueSeconds.map((x) => x.toFixed(3)),
    },
    {
      Metric: 'Submit Game Proof (Avg)',
      Value: result.submitGameProofSeconds.toFixed(3),
    },
    { Metric: 'Solved', Value: result.isSolved },
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
      Metric: 'Avg Deploy & Initialize Time',
      Value: totalDeploy / totalBenchmarkResults,
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
  deployAndInitializeSeconds: number;
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
  await StepProgram.compile({ forceRecompile: true });
  let compileEnd = performance.now();
  console.log(
    `StepProgram compilation took ${(compileEnd - compileStart) / 1000} seconds`
  );

  compileStart = performance.now();
  await MastermindZkApp.compile({ forceRecompile: true });
  compileEnd = performance.now();
  console.log(
    `MastermindZkApp compilation took ${
      (compileEnd - compileStart) / 1000
    } seconds`
  );

  console.log('--------------------------------------');

  const steps = [
    Combination.from([6, 3, 2, 1]),
    Combination.from([3, 4, 5, 6]),
    Combination.from([7, 4, 1, 6]),
    Combination.from([2, 3, 4, 5]),
    Combination.from([6, 7, 1, 2]),
    Combination.from([5, 4, 3, 2]),
    Combination.from([1, 2, 3, 4]),
  ];

  // Step Length 1
  await solveBenchmark([1, 2, 3, 4], steps.slice(6));
  await solveBenchmark([4, 3, 2, 1], steps.slice(6));

  // Step Length 3
  await solveBenchmark([1, 2, 3, 4], steps.slice(4));
  await solveBenchmark([4, 3, 2, 1], steps.slice(4));

  // Step Length 5
  await solveBenchmark([1, 2, 3, 4], steps.slice(2));
  await solveBenchmark([4, 3, 2, 1], steps.slice(2));

  // Step Length 7
  await solveBenchmark([1, 2, 3, 4], steps);
  await solveBenchmark([4, 3, 2, 1], steps);

  console.log('Overall Benchmark Results for Solved Games');
  overallScores(benchmarkResults.filter((result) => result.isSolved));
  console.log('Overall Benchmark Results for Unsolved Games');
  overallScores(benchmarkResults.filter((result) => !result.isSolved));
}

async function solveBenchmark(secret: number[], steps: Combination[]) {
  let proofsEnabled = false;
  let MINA_NODE_ENDPOINT: string = '';
  let MINA_ARCHIVE_ENDPOINT: string = '';

  if (testEnvironment === 'devnet') {
    MINA_NODE_ENDPOINT = 'https://api.minascan.io/node/devnet/v1/graphql';
    MINA_ARCHIVE_ENDPOINT = 'https://api.minascan.io/archive/devnet/v1/graphql';
  } else if (testEnvironment === 'lightnet') {
    MINA_NODE_ENDPOINT = 'http://127.0.0.1:8080/graphql';
    MINA_ARCHIVE_ENDPOINT = 'http://127.0.0.1:8282';
  }
  // Keys
  let codeMasterKey: PrivateKey | null = null;
  let codeBreakerKey: PrivateKey | null = null;
  let refereeKey: PrivateKey | null = null;

  // Public keys
  let codeMasterPubKey: PublicKey | null = null;
  let codeBreakerPubKey: PublicKey | null = null;
  let refereePubKey: PublicKey | null = null;

  // ZkApp
  let zkappAddress: PublicKey | null = null;
  let zkappPrivateKey: PrivateKey | null = null;
  let zkapp: MastermindZkApp | null = null;

  // Variables
  let codeMasterSalt: Field | null = null;

  // Local Mina blockchain
  let Local: Awaited<ReturnType<typeof Mina.LocalBlockchain>>;
  let secretCombination = Combination.from(secret);
  let lastProof: StepProgramProof;

  zkappPrivateKey = PrivateKey.random();
  zkappAddress = zkappPrivateKey.toPublicKey();
  zkapp = new MastermindZkApp(zkappAddress);

  codeMasterSalt = Field.random();

  if (testEnvironment === 'local') {
    // Set up the Mina local blockchain
    Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);

    // Assign local test accounts
    codeMasterKey = Local.testAccounts[0].key;
    codeMasterPubKey = codeMasterKey.toPublicKey();

    codeBreakerKey = Local.testAccounts[1].key;
    codeBreakerPubKey = codeBreakerKey.toPublicKey();

    refereeKey = Local.testAccounts[2].key;
    refereePubKey = refereeKey.toPublicKey();
  } else if (testEnvironment === 'devnet') {
    // Set up the Mina devnet
    const Network = Mina.Network({
      mina: MINA_NODE_ENDPOINT,
      archive: MINA_ARCHIVE_ENDPOINT,
    });

    Mina.setActiveInstance(Network);

    // Assign devnet test accounts
    codeMasterKey = players[0][0];
    codeMasterPubKey = players[0][1];

    codeBreakerKey = players[1][0];
    codeBreakerPubKey = players[1][1];

    refereeKey = players[2][0];
    refereePubKey = players[2][1];
  } else if (testEnvironment === 'lightnet') {
    // Set up the Mina lightnet
    const Network = Mina.Network({
      mina: MINA_NODE_ENDPOINT,
      archive: MINA_ARCHIVE_ENDPOINT,
      lightnetAccountManager: 'http://127.0.0.1:8181',
    });

    Mina.setActiveInstance(Network);

    // Assign lightnet test accounts
    codeMasterKey = (await Lightnet.acquireKeyPair()).privateKey;
    codeMasterPubKey = codeMasterKey.toPublicKey();

    codeBreakerKey = (await Lightnet.acquireKeyPair()).privateKey;
    codeBreakerPubKey = codeBreakerKey.toPublicKey();

    refereeKey = (await Lightnet.acquireKeyPair()).privateKey;
    refereePubKey = refereeKey.toPublicKey();
  }

  if (
    !codeMasterKey ||
    !codeBreakerKey ||
    !refereeKey ||
    !zkappAddress ||
    !codeMasterSalt
  ) {
    throw new Error('Keys were not properly initialized.');
  }

  if (!codeMasterPubKey || !codeBreakerPubKey || !refereePubKey) {
    throw new Error('Public keys were not properly initialized.');
  }

  let currentBenchmarkResults: BenchmarkResults = {
    stepLength: steps.length,
    totalSeconds: 0,
    deployAndInitializeSeconds: 0,
    acceptGameSeconds: 0,
    baseGameSeconds: 0,
    makeGuessSeconds: [],
    giveClueSeconds: [],
    isSolved: false,
    submitGameProofSeconds: 0,
  };

  let start = performance.now();
  await deployAndInitializeGame(
    zkapp,
    zkappPrivateKey,
    codeMasterKey,
    codeMasterSalt,
    secretCombination,
    refereeKey
  );
  let end = performance.now();

  currentBenchmarkResults.deployAndInitializeSeconds = (end - start) / 1000;

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
          ...secretCombination.digits,
          codeMasterSalt,
        ]),
      },
      secretCombination,
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
            ...step.digits,
            lastProof.publicOutput.turnCount.value,
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
            ...secretCombination.digits,
            codeMasterSalt,
            lastProof.publicOutput.turnCount.value,
          ]),
        },
        lastProof,
        secretCombination,
        codeMasterSalt
      )
    ).proof;
    end = performance.now();
    currentBenchmarkResults.giveClueSeconds.push((end - start) / 1000);
  }

  log(
    lastProof.publicOutput.codeBreakerId.toString(),
    lastProof.publicOutput.codeMasterId.toString()
  );

  start = performance.now();
  const submitGameProofTx = await Mina.transaction(
    { sender: refereeKey.toPublicKey(), fee },
    async () => {
      await zkapp.submitGameProof(lastProof, codeBreakerPubKey);
    }
  );

  await waitTransactionAndFetchAccount(
    submitGameProofTx,
    [refereeKey],
    [zkappAddress]
  );
  end = performance.now();

  const isSolved = Clue.decompress(
    lastProof.publicOutput.lastcompressedClue
  ).isSolved();

  currentBenchmarkResults.isSolved = isSolved.toBoolean();

  currentBenchmarkResults.submitGameProofSeconds = (end - start) / 1000;

  currentBenchmarkResults.totalSeconds =
    currentBenchmarkResults.deployAndInitializeSeconds +
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
