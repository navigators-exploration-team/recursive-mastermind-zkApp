import 'reflect-metadata';
import {
  Field,
  AccountUpdate,
  UInt64,
  PublicKey,
  Mina,
  PrivateKey,
  Signature,
  fetchAccount,
  Lightnet,
} from 'o1js';
import { StepProgram } from '../../../../../build/src/stepProgram';
import { MastermindZkApp } from '../../../../../build/src/Mastermind';

import {
  checkIfSolved,
  compressCombinationDigits,
  deserializeClue,
} from '../../../../../build/src/utils';
import { players } from './mock';

const state = {
  StepProgram: null as typeof StepProgram | null,
  MastermindContract: null as typeof MastermindZkApp | null,
  MastermindInstance: null as MastermindZkApp | null,
  codeMasterKey: null as PrivateKey | null,
  codeMasterPubKey: null as PublicKey | null,
  codeMasterSalt: null as Field | null,
  codeBreakerKey: null as PrivateKey | null,
  codeBreakerPubKey: null as PublicKey | null,
  refereeKey: null as PrivateKey | null,
  refereePubKey: null as PublicKey | null,
  zkappPrivateKey: null as PrivateKey | null,
  zkappAddress: null as PublicKey | null,
  zkapp: null as InstanceType<typeof MastermindZkApp> | null,
  secretCombination: null as number[] | null,
  unseparatedSecretCombination: null as Field | null,
  benchmarkResults: null as BenchmarkResults | null,
};
export type State = typeof state;

const logsEnabled = true;
const testEnvironment: 'devnet' | 'local' | 'lightnet' = 'devnet';
const localTest = false;
let fee = localTest ? 0 : 1e9;

function log(...args: any[]) {
  if (logsEnabled) {
    // log to console with current time
    console.log(new Date().toLocaleTimeString(), ...args);
  }
}

const functions = {
  setActiveInstance: async ({
    secretCombination,
  }: {
    secretCombination: number[];
  }) => {
    let proofsEnabled = false;
    let MINA_NODE_ENDPOINT: string = '';
    let MINA_ARCHIVE_ENDPOINT: string = '';
    let Local: Awaited<ReturnType<typeof Mina.LocalBlockchain>>;

    if (testEnvironment === 'devnet') {
      MINA_NODE_ENDPOINT = 'https://api.minascan.io/node/devnet/v1/graphql';
      MINA_ARCHIVE_ENDPOINT =
        'https://api.minascan.io/archive/devnet/v1/graphql';
    } else if (testEnvironment === 'lightnet') {
      MINA_NODE_ENDPOINT = 'http://127.0.0.1:8080/graphql';
      MINA_ARCHIVE_ENDPOINT = 'http://127.0.0.1:8282';
    }

    state.zkappPrivateKey = PrivateKey.random();
    state.zkappAddress = state.zkappPrivateKey.toPublicKey();
    state.zkapp = new MastermindZkApp(state.zkappAddress);
    state.codeMasterSalt = Field.random();
    state.secretCombination = secretCombination;
    state.unseparatedSecretCombination = compressCombinationDigits(
      state.secretCombination.map(Field)
    );

    // @ts-ignore
    if (testEnvironment === 'local') {
      // Set up the Mina local blockchain
      Local = await Mina.LocalBlockchain({ proofsEnabled });
      Mina.setActiveInstance(Local);
      console.log('Devnet network instance configured.');

      // Assign local test accounts
      state.codeMasterKey = Local.testAccounts[0].key;
      state.codeMasterPubKey = state.codeMasterKey.toPublicKey();

      state.codeBreakerKey = Local.testAccounts[1].key;
      state.codeBreakerPubKey = state.codeBreakerKey.toPublicKey();

      state.refereeKey = Local.testAccounts[2].key;
      state.refereePubKey = state.refereeKey.toPublicKey();
    } else if (testEnvironment === 'devnet') {
      // Set up the Mina devnet
      const Network = Mina.Network({
        mina: MINA_NODE_ENDPOINT,
        archive: MINA_ARCHIVE_ENDPOINT,
      });

      Mina.setActiveInstance(Network);
      console.log('Devnet network instance configured.');

      // Assign devnet test accounts
      state.codeMasterKey = players[0][0];
      state.codeMasterPubKey = players[0][1];

      state.codeBreakerKey = players[1][0];
      state.codeBreakerPubKey = players[1][1];

      state.refereeKey = players[2][0];
      state.refereePubKey = players[2][1];
    } else if (testEnvironment === 'lightnet') {
      // Set up the Mina lightnet
      const Network = Mina.Network({
        mina: MINA_NODE_ENDPOINT,
        archive: MINA_ARCHIVE_ENDPOINT,
        lightnetAccountManager: 'http://127.0.0.1:8181',
      });

      Mina.setActiveInstance(Network);
      console.log('Lightnet network instance configured.');

      // Assign lightnet test accounts
      state.codeMasterKey = (await Lightnet.acquireKeyPair()).privateKey;
      state.codeMasterPubKey = state.codeMasterKey.toPublicKey();

      state.codeBreakerKey = (await Lightnet.acquireKeyPair()).privateKey;
      state.codeBreakerPubKey = state.codeBreakerKey.toPublicKey();

      state.refereeKey = (await Lightnet.acquireKeyPair()).privateKey;
      state.refereePubKey = state.refereeKey.toPublicKey();
    }

    state.benchmarkResults = {
      stepLength: 0,
      totalSeconds: 0,
      deployAndInitializeSeconds: 0,
      acceptGameSeconds: 0,
      baseGameSeconds: 0,
      makeGuessSeconds: [],
      giveClueSeconds: [],
      isSolved: false,
      submitGameProofSeconds: 0,
    };

    if (!state.zkapp) {
      throw new Error('Zkapp not initialized');
    }
    if (!state.codeMasterKey) {
      throw new Error('Code Master Key not initialized');
    }
    if (!state.codeBreakerPubKey) {
      throw new Error('Code Breaker Pub Key not initialized');
    }
    if (!state.refereeKey) {
      throw new Error('Referee Key not initialized');
    }
    if (!state.unseparatedSecretCombination) {
      throw new Error('Secret Combination not initialized');
    }
    if (!state.codeMasterSalt) {
      throw new Error('Code Master Salt not initialized');
    }
    if (!state.zkappPrivateKey) {
      throw new Error('Zkapp Private Key not initialized');
    }
    if (!state.zkappAddress) {
      throw new Error('Zkapp Address not initialized');
    }
  },
  waitTransactionAndFetchAccount: async ({
    tx,
    keys,
    accountsToFetch,
  }: {
    tx: Awaited<ReturnType<typeof Mina.transaction>>;
    keys: PrivateKey[];
    accountsToFetch?: PublicKey[];
  }) => {
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
          await functions.fetchAccounts({
            accounts: accountsToFetch,
          });
        }
      }
    } catch (error) {
      log('error', error);
      throw error;
    }
  },

  fetchAccounts: async ({ accounts }: { accounts: PublicKey[] }) => {
    if (localTest) return;
    for (let account of accounts) {
      await fetchAccount({ publicKey: account });
    }
  },
  loadAndCompileContract: async () => {
    if (!state.MastermindContract) {
      const { MastermindZkApp } = await import(
        '../../../../../build/src/Mastermind.js'
      );
      if (!MastermindZkApp) {
        throw new Error(`Could not load contract GameToken from the module`);
      }
      state.MastermindContract = MastermindZkApp;
    }
    await state.MastermindContract.compile();
  },
  compileProgram: async () => {
    state.StepProgram = StepProgram;
    await state.StepProgram.compile();
  },

  deployAndInitializeContract: async () => {
    const deployerAccount = state.codeMasterPubKey!;
    const initTx = await Mina.transaction(
      { sender: deployerAccount, fee },
      async () => {
        AccountUpdate.fundNewAccount(deployerAccount);
        state.zkapp!.deploy();
        await state.zkapp!.initGame(
          state.unseparatedSecretCombination!,
          state.codeMasterSalt!,
          Field.from(10),
          state.refereeKey!.toPublicKey(),
          UInt64.from(10000)
        );
      }
    );

    await functions.waitTransactionAndFetchAccount({
      tx: initTx,
      keys: [state.codeMasterKey!, state.zkappPrivateKey!],
      accountsToFetch: [
        state.zkapp!.address,
        state.codeMasterKey!.toPublicKey(),
      ],
    });
  },

  acceptGame: async () => {
    const tx = await Mina.transaction(
      { sender: state.codeBreakerPubKey!, fee },
      async () => {
        await state.zkapp!.acceptGame();
      }
    );
    await functions.waitTransactionAndFetchAccount({
      tx,
      keys: [state.codeBreakerKey!],
      accountsToFetch: [state.zkapp!.address],
    });
  },

  solveBenchmark: async ({
    secretCombination,
    steps,
  }: {
    secretCombination: number[];
    steps: number[];
  }) => {
    console.log('Initiating Local Mina');
    await functions.setActiveInstance({ secretCombination });
    if (!state.benchmarkResults) {
      throw new Error('Benchmark results not initialized');
    }
    state.benchmarkResults.stepLength = steps.length;

    console.log('Deploying and Initializing Contract');
    let start = performance.now();
    await functions.deployAndInitializeContract();
    let end = performance.now();
    state.benchmarkResults.deployAndInitializeSeconds = (end - start) / 1000;

    console.log('Accepting Game');
    start = performance.now();
    await functions.acceptGame();
    end = performance.now();
    state.benchmarkResults.acceptGameSeconds = (end - start) / 1000;

    console.log('Base Game');
    start = performance.now();
    let { proof } = await StepProgram.createGame(
      {
        authPubKey: state.codeMasterPubKey!,
        authSignature: Signature.create(state.codeMasterKey!, [
          state.unseparatedSecretCombination!,
          state.codeMasterSalt!,
        ]),
      },
      state.unseparatedSecretCombination!,
      state.codeMasterSalt!
    );
    end = performance.now();
    state.benchmarkResults.baseGameSeconds = (end - start) / 1000;

    for (const step of steps) {
      console.log(`Processing step ${step.toString()}...`);
      start = performance.now();
      proof = (
        await StepProgram.makeGuess(
          {
            authPubKey: state.codeBreakerPubKey!,
            authSignature: Signature.create(state.codeBreakerKey!, [
              Field.from(step),
              proof.publicOutput.turnCount,
            ]),
          },
          proof,
          Field.from(step)
        )
      ).proof;
      end = performance.now();
      state.benchmarkResults.makeGuessSeconds.push((end - start) / 1000);

      console.log(`Giving clue for step ${step.toString()}...`);
      start = performance.now();
      proof = (
        await StepProgram.giveClue(
          {
            authPubKey: state.codeMasterPubKey!,
            authSignature: Signature.create(state.codeMasterKey!, [
              state.unseparatedSecretCombination!,
              state.codeMasterSalt!,
              proof.publicOutput.turnCount,
            ]),
          },
          proof,
          state.unseparatedSecretCombination!,
          state.codeMasterSalt!
        )
      ).proof;
      end = performance.now();
      state.benchmarkResults.giveClueSeconds.push((end - start) / 1000);
    }

    console.log('Submitting Game Proof');
    start = performance.now();
    const submitGameProofTx = await Mina.transaction(
      { sender: state.refereeKey!.toPublicKey(), fee },
      async () => {
        await state.zkapp!.submitGameProof(proof, state.codeBreakerPubKey!);
      }
    );

    await functions.waitTransactionAndFetchAccount({
      tx: submitGameProofTx,
      keys: [state.refereeKey!],
      accountsToFetch: [
        state.zkapp!.address,
        state.refereeKey!.toPublicKey(),
        state.codeBreakerPubKey!,
        state.codeMasterPubKey!,
      ],
    });
    end = performance.now();
    state.benchmarkResults.submitGameProofSeconds = (end - start) / 1000;

    const deserializedClue = deserializeClue(proof.publicOutput.serializedClue);
    const isSolved = checkIfSolved(deserializedClue);

    state.benchmarkResults.isSolved = isSolved.toBoolean();

    state.benchmarkResults.totalSeconds =
      state.benchmarkResults.deployAndInitializeSeconds +
      state.benchmarkResults.acceptGameSeconds +
      state.benchmarkResults.baseGameSeconds +
      state.benchmarkResults.makeGuessSeconds.reduce((a, b) => a + b, 0) +
      state.benchmarkResults.giveClueSeconds.reduce((a, b) => a + b, 0) +
      state.benchmarkResults.submitGameProofSeconds;

    return state.benchmarkResults;
  },
};
export type WorkerFunctions = keyof typeof functions;

export type ZkappWorkerRequest = {
  id: number;
  fn: WorkerFunctions;
  args: any;
};

export type ZkappWorkerReponse = {
  id: number;
  data: any;
};

if (typeof window !== 'undefined') {
  addEventListener(
    'message',
    async (event: MessageEvent<ZkappWorkerRequest>) => {
      const returnData = await functions[event.data.fn](event.data.args);

      const message: ZkappWorkerReponse = {
        id: event.data.id,
        data: returnData,
      };
      postMessage(message);
    }
  );
}

console.log('Web Worker Successfully Initialized.');
