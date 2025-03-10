import 'reflect-metadata';
import {
  Field,
  AccountUpdate,
  UInt64,
  PublicKey,
  Mina,
  PrivateKey,
  Signature,
} from 'o1js';
import { StepProgram } from '../../../../../build/src/stepProgram';
import { MastermindZkApp } from '../../../../../build/src/Mastermind';
import {
  checkIfSolved,
  compressCombinationDigits,
  deserializeClue,
} from '../../../../../build/src/utils';

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
  zkappPrivateKey: null as PrivateKey | null,
  zkappAddress: null as PublicKey | null,
  zkapp: null as InstanceType<typeof MastermindZkApp> | null,
  secretCombination: null as number[] | null,
  unseparatedSecretCombination: null as Field | null,
  benchmarkResults: null as BenchmarkResults | null,
};
export type State = typeof state;

const functions = {
  setActiveInstanceToLocal: async ({
    secretCombination,
  }: {
    secretCombination: number[];
  }) => {
    const Local = await Mina.LocalBlockchain();
    console.log('Devnet network instance configured.');
    Mina.setActiveInstance(Local);

    state.codeMasterKey = Local.testAccounts[0].key;
    state.codeMasterPubKey = state.codeMasterKey.toPublicKey();
    state.codeMasterSalt = Field.random();
    state.codeBreakerKey = Local.testAccounts[1].key;
    state.codeBreakerPubKey = state.codeBreakerKey.toPublicKey();
    state.refereeKey = Local.testAccounts[2].key;
    state.zkappPrivateKey = PrivateKey.random();
    state.zkappAddress = state.zkappPrivateKey.toPublicKey();
    state.zkapp = new MastermindZkApp(state.zkappAddress);
    state.secretCombination = secretCombination;
    state.unseparatedSecretCombination = compressCombinationDigits(
      state.secretCombination.map(Field)
    );
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
    const tx = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      state.zkapp!.deploy();
      await state.zkapp!.initGame(
        state.unseparatedSecretCombination!,
        state.codeMasterSalt!,
        Field.from(10),
        state.refereeKey!.toPublicKey(),
        UInt64.from(10000)
      );
    });
    await tx.prove();
    await tx.sign([state.codeMasterKey!, state.zkappPrivateKey!]).send();
  },

  acceptGame: async () => {
    const tx = await Mina.transaction(state.codeBreakerPubKey!, async () => {
      await state.zkapp!.acceptGame();
    });
    await tx.prove();
    await tx.sign([state.codeBreakerKey!]).send();
  },

  solveBenchmark: async ({
    secretCombination,
    steps,
  }: {
    secretCombination: number[];
    steps: number[];
  }) => {
    console.log('Initiating Local Mina');
    await functions.setActiveInstanceToLocal({ secretCombination });
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
      state.codeBreakerKey!.toPublicKey(),
      async () => {
        await state.zkapp!.submitGameProof(proof);
      }
    );

    await submitGameProofTx.prove();
    await submitGameProofTx.sign([state.codeBreakerKey!]).send();
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
