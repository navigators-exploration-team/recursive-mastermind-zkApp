import { MastermindZkApp } from './Mastermind';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt8,
  Poseidon,
  Signature,
} from 'o1js';
import {
  compressCombinationDigits,
  separateCombinationDigits,
  serializeClue,
} from './utils';
import { StepProgram, StepProgramProof } from './stepProgram';

let proofsEnabled = true;

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

describe('Mastermind ZkApp Tests', () => {
  let codeMasterKey: PrivateKey,
    codeMasterPubKey: PublicKey,
    codeMasterSalt: Field,
    codeMasterId: Field,
    codeBreakerKey: PrivateKey,
    codeBreakerPubKey: PublicKey,
    codeBreakerId: Field,
    intruderKey: PrivateKey,
    intruderPubKey: PublicKey,
    zkappAddress: PublicKey,
    zkappPrivateKey: PrivateKey,
    zkapp: MastermindZkApp,
    unseparatedSecretCombination: Field,
    lastProof: StepProgramProof;

  beforeAll(async () => {
    await StepProgram.compile();
    if (proofsEnabled) {
      await MastermindZkApp.compile();
    }

    // Set up the Mina local blockchain
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);

    // Local.testAccounts is an array of 10 test accounts that have been pre-filled with Mina
    codeMasterKey = Local.testAccounts[0].key;
    codeMasterPubKey = codeMasterKey.toPublicKey();
    codeMasterId = Poseidon.hash(codeMasterPubKey.toFields());

    // Generate random field as salt for the codemaster
    codeMasterSalt = Field.random();

    codeBreakerKey = Local.testAccounts[1].key;
    codeBreakerPubKey = codeBreakerKey.toPublicKey();
    codeBreakerId = Poseidon.hash(codeBreakerPubKey.toFields());

    intruderKey = Local.testAccounts[2].key;
    intruderPubKey = intruderKey.toPublicKey();

    // Set up the zkapp account
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);

    unseparatedSecretCombination = Field.from(7163);
  });

  async function testInvalidsubmitGameProof(expectedErrorMessage?: string) {
    const submitGameProofTx = async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.submitGameProof(lastProof);
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();
    };

    await expect(submitGameProofTx()).rejects.toThrowError(
      expectedErrorMessage
    );
  }

  async function submitGameProof() {
    const submitGameProofTx = await Mina.transaction(
      codeBreakerKey.toPublicKey(),
      async () => {
        await zkapp.submitGameProof(lastProof);
      }
    );

    await submitGameProofTx.prove();
    await submitGameProofTx.sign([codeBreakerKey]).send();
  }

  describe('game proof creation with wrong secret', () => {
    it('should create a new game successfully', async () => {
      const stepProof = await StepProgram.createGame(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
          ]),
        },
        UInt8.from(5),
        unseparatedSecretCombination,
        codeMasterSalt
      );

      lastProof = stepProof.proof;
    });
    it('should solve the game in the first round', async () => {
      const firstGuess = [7, 1, 6, 3];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedGuess
      );

      lastProof = stepProof.proof;
    });

    it('should give clue and report that the secret is solved', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [7, 1, 6, 3].map(Field)
      );

      const stepProof = await StepProgram.giveClue(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedCombination,
        codeMasterSalt
      );

      lastProof = stepProof.proof;
    });
  });

  describe('Deploy and initialize Mastermind zkApp', () => {
    it('Deploy a `Mastermind` zkApp', async () => {
      await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
    });

    it('Should reject calling `createGame` method before `initGame`', async () => {
      const createGameTx = async () => {
        const tx = await Mina.transaction(codeMasterPubKey, async () => {
          await zkapp.createGame(Field(1234), codeMasterSalt);
        });

        await tx.prove();
        await tx.sign([codeMasterKey]).send();
      };

      const expectedErrorMessage = 'The game has not been initialized yet!';
      await expect(createGameTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Should reject calling `submitGameProof` method before `initGame`', async () => {
      const expectedErrorMessage = 'The game has not been initialized yet!';
      await testInvalidsubmitGameProof(expectedErrorMessage);
    });

    it('should reject calling `initGame` when maxAttempts exceeds 15', async () => {
      const initTx = async () => await initializeGame(zkapp, codeMasterKey, 20);

      const expectedErrorMessage =
        'The maximum number of attempts allowed is 15!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('should reject calling `initGame` when maxAttempts is below 5', async () => {
      const initTx = async () => await initializeGame(zkapp, codeMasterKey, 4);

      const expectedErrorMessage =
        'The minimum number of attempts allowed is 5!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Initialize game', async () => {
      const maxAttempts = 5;
      await initializeGame(zkapp, codeMasterKey, maxAttempts);

      // Initialized with `super.init()`
      const turnCount = zkapp.turnCount.get();
      expect(turnCount).toEqual(new UInt8(0));

      const codemasterId = zkapp.codemasterId.get();
      expect(codemasterId).toEqual(Field(0));

      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(Field(0));

      const solutionHash = zkapp.solutionHash.get();
      expect(solutionHash).toEqual(Field(0));

      const unseparatedGuess = zkapp.unseparatedGuess.get();
      expect(unseparatedGuess).toEqual(Field(0));

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(Field(0));

      // Initialized manually
      const rounds = zkapp.maxAttempts.get();
      expect(rounds).toEqual(UInt8.from(maxAttempts));

      const isSolved = zkapp.isSolved.get().toBoolean();
      expect(isSolved).toEqual(false);
    });
  });

  describe('Create a new game on-chain with `createGame` method, then try to submit a proof with wrong secret', () => {
    it('should create a new game and set codemaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(Field(1234), codeMasterSalt);
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();

      const codemasterId = zkapp.codemasterId.get();
      expect(codemasterId).toEqual(codeMasterId);

      const solutionHash = zkapp.solutionHash.get();
      expect(solutionHash).toEqual(
        Poseidon.hash([
          ...separateCombinationDigits(Field(1234)),
          codeMasterSalt,
        ])
      );
    });

    it('should reject submitting a proof with wrong secret', async () => {
      const expectedErrorMessage =
        'The solution hash is not same as the one stored on-chain!';
      await testInvalidsubmitGameProof(expectedErrorMessage);
    });
  });

  describe('intruder tries to submit proof with correct secret', () => {
    it('should create a new game successfully', async () => {
      unseparatedSecretCombination = Field.from(1234);

      const stepProof = await StepProgram.createGame(
        {
          authPubKey: intruderPubKey,
          authSignature: Signature.create(intruderKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
          ]),
        },
        UInt8.from(5),
        unseparatedSecretCombination,
        codeMasterSalt
      );

      lastProof = stepProof.proof;
    });
    it('should solve the game in the first round', async () => {
      const firstGuess = [1, 2, 3, 4];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedGuess
      );

      lastProof = stepProof.proof;
    });
    it('should give clue and report that the secret is solved', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      const stepProof = await StepProgram.giveClue(
        {
          authPubKey: intruderPubKey,
          authSignature: Signature.create(intruderKey, [
            unseparatedCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedCombination,
        codeMasterSalt
      );

      lastProof = stepProof.proof;
    });
    it('should reject submitting a proof with correct secret', async () => {
      const expectedErrorMessage =
        'The code master ID is not same as the one stored on-chain!';
      await testInvalidsubmitGameProof(expectedErrorMessage);
    });
  });

  describe('game proof creation with correct secret', () => {
    it('should create a new game successfully', async () => {
      unseparatedSecretCombination = Field.from(1234);

      const stepProof = await StepProgram.createGame(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
          ]),
        },
        UInt8.from(5),
        unseparatedSecretCombination,
        codeMasterSalt
      );

      lastProof = stepProof.proof;
    });
    it('should solve the game in the first round', async () => {
      const firstGuess = [1, 2, 3, 4];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedGuess
      );

      lastProof = stepProof.proof;
    });
    it('should give clue and report that the secret is solved', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      const stepProof = await StepProgram.giveClue(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedCombination,
        codeMasterSalt
      );

      lastProof = stepProof.proof;
    });
  });

  describe('Try to submit a proof with correct secret after solving the game', () => {
    it('should be able to submit with correct game proof', async () => {
      await submitGameProof();

      const isSolved = zkapp.isSolved.get().toBoolean();
      expect(isSolved).toEqual(true);

      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(codeBreakerId);

      const turnCount = zkapp.turnCount.get().toNumber();
      expect(turnCount).toEqual(3);

      const unseparatedGuess = zkapp.unseparatedGuess.get();
      expect(unseparatedGuess).toEqual(
        compressCombinationDigits([1, 2, 3, 4].map(Field))
      );

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(serializeClue([2, 2, 2, 2].map(Field)));
    });

    it('should reject submitting a same proof again', async () => {
      const expectedErrorMessage = 'The game secret has already been solved!';
      await testInvalidsubmitGameProof(expectedErrorMessage);
    });
  });
});
