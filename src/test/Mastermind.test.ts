import { MastermindZkApp } from '../Mastermind';

import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  Signature,
  UInt64,
} from 'o1js';

import {
  compressCombinationDigits,
  compressTurnCountMaxAttemptSolved,
  separateCombinationDigits,
  separateTurnCountAndMaxAttemptSolved,
  serializeClue,
} from '../utils';

import { StepProgram, StepProgramProof } from '../stepProgram';

let proofsEnabled = false;

let REWARD_AMOUNT = 100000;

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

describe('Mastermind ZkApp Tests', () => {
  let codeMasterKey: PrivateKey,
    codeMasterPubKey: PublicKey,
    codeMasterSalt: Field,
    codeMasterId: Field,
    codeBreakerKey: PrivateKey,
    codeBreakerPubKey: PublicKey,
    codeBreakerId: Field,
    refereeKey: PrivateKey,
    refereePubKey: PublicKey,
    refereeId: Field,
    intruderKey: PrivateKey,
    intruderPubKey: PublicKey,
    zkappAddress: PublicKey,
    zkappPrivateKey: PrivateKey,
    zkapp: MastermindZkApp,
    unseparatedSecretCombination: Field,
    lastProof: StepProgramProof,
    Local: Awaited<ReturnType<typeof Mina.LocalBlockchain>>;

  beforeAll(async () => {
    await StepProgram.compile();
    await MastermindZkApp.compile();

    // Set up the Mina local blockchain
    Local = await Mina.LocalBlockchain({ proofsEnabled });
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

    refereeKey = Local.testAccounts[3].key;
    refereePubKey = refereeKey.toPublicKey();
    refereeId = Poseidon.hash(refereePubKey.toFields());

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

  async function claimcodeBreakerReward() {
    const codeBreakerBalance = Mina.getBalance(codeBreakerPubKey);
    const claimRewardTx = await Mina.transaction(
      codeBreakerPubKey,
      async () => {
        await zkapp.claimCodeBreakerReward();
      }
    );

    await claimRewardTx.prove();
    await claimRewardTx.sign([codeBreakerKey]).send();

    const contractBalance = Mina.getBalance(zkappAddress);
    expect(Number(contractBalance.toBigInt())).toEqual(0);

    const codeBreakerNewBalance = Mina.getBalance(codeBreakerPubKey);
    expect(
      Number(codeBreakerBalance.toBigInt() - codeBreakerNewBalance.toBigInt())
    ).toEqual(REWARD_AMOUNT);
  }

  async function testInvalidcodeBreakerClaimReward(
    claimer: PublicKey,
    claimerKey: PrivateKey,
    expectedErrorMessage?: string
  ) {
    const claimRewardTx = async () => {
      const tx = await Mina.transaction(claimer, async () => {
        await zkapp.claimCodeBreakerReward();
      });

      await tx.prove();
      await tx.sign([claimerKey]).send();
    };

    await expect(claimRewardTx()).rejects.toThrowError(expectedErrorMessage);
  }

  async function claimCodeMasterReward() {
    const codeMasterBalance = Mina.getBalance(codeMasterPubKey);
    const claimRewardTx = await Mina.transaction(codeMasterPubKey, async () => {
      await zkapp.claimCodeMasterReward();
    });

    await claimRewardTx.prove();
    await claimRewardTx.sign([codeMasterKey]).send();

    const contractBalance = Mina.getBalance(zkappAddress);
    expect(Number(contractBalance.toBigInt())).toEqual(0);

    const codeMasterNewBalance = Mina.getBalance(codeMasterPubKey);
    expect(
      Number(codeMasterBalance.toBigInt() - codeMasterNewBalance.toBigInt())
    ).toEqual(REWARD_AMOUNT);
  }

  async function testInvalidcodeMasterClaimReward(
    claimer: PublicKey,
    claimerKey: PrivateKey,
    expectedErrorMessage?: string
  ) {
    const claimRewardTx = async () => {
      const tx = await Mina.transaction(claimer, async () => {
        await zkapp.claimCodeMasterReward();
      });

      await tx.prove();
      await tx.sign([claimerKey]).send();
    };

    await expect(claimRewardTx()).rejects.toThrowError(expectedErrorMessage);
  }

  async function acceptGame() {
    const acceptGameTx = await Mina.transaction(codeBreakerPubKey, async () => {
      await zkapp.acceptGame();
    });

    await acceptGameTx.prove();
    await acceptGameTx.sign([codeBreakerKey]).send();
  }

  async function testInvalidAcceptGame(expectedErrorMessage?: string) {
    const acceptGameTx = async () => {
      const tx = await Mina.transaction(codeBreakerPubKey, async () => {
        await zkapp.acceptGame();
      });

      await tx.prove();
      await tx.sign([codeBreakerKey]).send();
    };

    await expect(acceptGameTx()).rejects.toThrowError(expectedErrorMessage);
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
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1
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
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1
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
          await zkapp.createGame(
            Field(1234),
            codeMasterSalt,
            UInt64.from(REWARD_AMOUNT)
          );
        });

        await tx.prove();
        await tx.sign([codeMasterKey]).send();
      };

      const expectedErrorMessage = 'The game has not been initialized yet!';
      await expect(createGameTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Should reject calling `acceptGame` method before `initGame`', async () => {
      const expectedErrorMessage = 'The game has not been initialized yet!';
      await expect(zkapp.acceptGame()).rejects.toThrowError(
        expectedErrorMessage
      );
    });

    it('Should reject calling `submitGameProof` method before `initGame`', async () => {
      const expectedErrorMessage = 'The game has not been initialized yet!';
      await testInvalidsubmitGameProof(expectedErrorMessage);
    });

    it('should reject calling `initGame` when maxAttempts exceeds 15', async () => {
      const initTx = async () =>
        await initializeGame(zkapp, codeMasterKey, refereeKey, 20);

      const expectedErrorMessage =
        'The maximum number of attempts allowed is 15!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('should reject calling `initGame` when maxAttempts is below 5', async () => {
      const initTx = async () =>
        await initializeGame(zkapp, codeMasterKey, refereeKey, 4);

      const expectedErrorMessage =
        'The minimum number of attempts allowed is 5!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Initialize game', async () => {
      const maxAttempts = 5;
      await initializeGame(zkapp, codeMasterKey, refereeKey, maxAttempts);

      // Initialized with `super.init()`
      const turnCountMaxAttemptsIsSolved =
        zkapp.turnCountMaxAttemptsIsSolved.get();
      expect(turnCountMaxAttemptsIsSolved).toEqual(
        compressTurnCountMaxAttemptSolved([0, maxAttempts, 0].map(Field))
      );

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
    });
  });

  describe('Create a new game on-chain with `createGame` method, then try to submit a proof with wrong secret', () => {
    it('should reject calling `acceptGame` method before `createGame`', async () => {
      const expectedErrorMessage = 'The game has not been created yet!';
      await expect(zkapp.acceptGame()).rejects.toThrowError(
        expectedErrorMessage
      );
    });

    it('should create a new game and set codemaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(
          Field(1234),
          codeMasterSalt,
          UInt64.from(REWARD_AMOUNT)
        );
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

      const contractBalance = Mina.getBalance(zkappAddress);
      expect(Number(contractBalance.toBigInt())).toEqual(REWARD_AMOUNT);
    });

    it('should reject submitting a proof before game being accepted', async () => {
      const expectedErrorMessage =
        'The game has not been accepted by the codebreaker yet!';
      await testInvalidsubmitGameProof(expectedErrorMessage);
    });
  });

  describe('Code Breaker accepts game', () => {
    it('should accept the game successfully', async () => {
      const tx = await Mina.transaction(codeBreakerPubKey, async () => {
        await zkapp.acceptGame();
      });

      await tx.prove();
      await tx.sign([codeBreakerKey]).send();

      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(codeBreakerId);

      console.log(Mina.getNetworkState().globalSlotSinceGenesis.toBigint());
    });

    it('should reject accepting the game again', async () => {
      const expectedErrorMessage =
        'The game has already been accepted by the codebreaker!';
      await testInvalidAcceptGame(expectedErrorMessage);
    });

    it('should reject submitting a proof with wrong secret', async () => {
      const expectedErrorMessage =
        'The solution hash is not same as the one stored on-chain!';
      await testInvalidsubmitGameProof(expectedErrorMessage);
    });

    it('should reject claiming reward before solving the game', async () => {
      const expectedErrorMessage = 'The game has not been solved yet!';
      await testInvalidcodeBreakerClaimReward(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedErrorMessage
      );
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
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1
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
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1
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
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1
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
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1
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

      const [turnCount, maxAttempts, isSolved] =
        separateTurnCountAndMaxAttemptSolved(
          zkapp.turnCountMaxAttemptsIsSolved.get()
        );

      expect(turnCount.toBigInt()).toEqual(3n);
      expect(maxAttempts.toBigInt()).toEqual(5n);
      expect(isSolved.toBigInt()).toEqual(1n);

      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(codeBreakerId);

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

    it('should reject claiming reward before game finalized', async () => {
      const expectedErrorMessage = 'The game has not been finalized yet!';
      await testInvalidcodeBreakerClaimReward(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedErrorMessage
      );
    });

    it('should skip to slot 11', async () => {
      Local.incrementGlobalSlot(11);

      expect(Mina.getNetworkState().globalSlotSinceGenesis.toBigint()).toEqual(
        11n
      );
    });

    it('should reject claiming reward from intruder', async () => {
      const expectedErrorMessage = 'You are not the codebreaker of this game!';
      await testInvalidcodeBreakerClaimReward(
        intruderPubKey,
        intruderKey,
        expectedErrorMessage
      );
    });

    it('should be able to claim reward', async () => {
      await claimcodeBreakerReward();
    });
  });

  describe('Code Breaker punished for timeout', () => {
    beforeAll(async () => {
      zkappPrivateKey = PrivateKey.random();
      zkappAddress = zkappPrivateKey.toPublicKey();
      zkapp = new MastermindZkApp(zkappAddress);
    });

    it('Deploy a `Mastermind` zkApp', async () => {
      await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
    });

    it('Initialize game', async () => {
      const maxAttempts = 5;
      await initializeGame(zkapp, codeMasterKey, refereeKey, maxAttempts);
    });

    it('should create a new game and set codemaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(
          Field(1234),
          codeMasterSalt,
          UInt64.from(REWARD_AMOUNT)
        );
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

      const contractBalance = Mina.getBalance(zkappAddress);
      expect(Number(contractBalance.toBigInt())).toEqual(REWARD_AMOUNT);
    });

    it('should accept the game successfully', async () => {
      await acceptGame();
      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(codeBreakerId);
    });

    it('penalty for codebreaker', async () => {
      const codeMasterBalance = Mina.getBalance(codeMasterPubKey);
      const penaltyTx = await Mina.transaction(refereePubKey, async () => {
        await zkapp.penalizeCodeBreaker(codeMasterPubKey);
      });

      await penaltyTx.prove();
      await penaltyTx.sign([refereeKey]).send();

      const contractBalance = Mina.getBalance(zkappAddress);
      expect(Number(contractBalance.toBigInt())).toEqual(0);

      const codeMasterNewBalance = Mina.getBalance(codeMasterPubKey);
      expect(
        Number(codeMasterNewBalance.toBigInt() - codeMasterBalance.toBigInt())
      ).toEqual(2 * REWARD_AMOUNT);
    });
  });

  describe('Code Master punished for timeout', () => {
    beforeAll(async () => {
      zkappPrivateKey = PrivateKey.random();
      zkappAddress = zkappPrivateKey.toPublicKey();
      zkapp = new MastermindZkApp(zkappAddress);
    });

    it('Deploy a `Mastermind` zkApp', async () => {
      await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
    });

    it('Initialize game', async () => {
      const maxAttempts = 5;
      await initializeGame(zkapp, codeMasterKey, refereeKey, maxAttempts);
    });

    it('should create a new game and set codemaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(
          Field(1234),
          codeMasterSalt,
          UInt64.from(REWARD_AMOUNT)
        );
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

      const contractBalance = Mina.getBalance(zkappAddress);
      expect(Number(contractBalance.toBigInt())).toEqual(REWARD_AMOUNT);
    });

    it('should accept the game successfully', async () => {
      await acceptGame();
      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(codeBreakerId);
    });

    it('penalty for codemaster', async () => {
      const codeBreakerBalance = Mina.getBalance(codeBreakerPubKey);
      const penaltyTx = await Mina.transaction(refereePubKey, async () => {
        await zkapp.penalizeCodeMaster(codeBreakerPubKey);
      });

      await penaltyTx.prove();
      await penaltyTx.sign([refereeKey]).send();

      const contractBalance = Mina.getBalance(zkappAddress);
      expect(Number(contractBalance.toBigInt())).toEqual(0);

      const codeBreakerNewBalance = Mina.getBalance(codeBreakerPubKey);
      expect(
        Number(codeBreakerNewBalance.toBigInt() - codeBreakerBalance.toBigInt())
      ).toEqual(2 * REWARD_AMOUNT);
    });
  });
});
