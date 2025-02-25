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
    codeBreakerKey: PrivateKey,
    codeBreakerPubKey: PublicKey,
    refereeKey: PrivateKey,
    refereePubKey: PublicKey,
    intruderKey: PrivateKey,
    intruderPubKey: PublicKey,
    zkappAddress: PublicKey,
    zkappPrivateKey: PrivateKey,
    zkapp: MastermindZkApp,
    unseparatedSecretCombination: Field,
    intruderProof: StepProgramProof,
    completedProof: StepProgramProof,
    partialProof: StepProgramProof,
    wrongProof: StepProgramProof,
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

    // Generate random field as salt for the codeMaster
    codeMasterSalt = Field.random();

    codeBreakerKey = Local.testAccounts[1].key;
    codeBreakerPubKey = codeBreakerKey.toPublicKey();

    refereeKey = Local.testAccounts[3].key;
    refereePubKey = refereeKey.toPublicKey();

    intruderKey = Local.testAccounts[2].key;
    intruderPubKey = intruderKey.toPublicKey();

    // Set up the zkapp account
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);

    unseparatedSecretCombination = Field.from(7163);
  });

  async function testInvalidsubmitGameProof(
    proof: StepProgramProof,
    expectedErrorMessage?: string
  ) {
    const submitGameProofTx = async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.submitGameProof(proof);
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();
    };

    await expect(submitGameProofTx()).rejects.toThrowError(
      expectedErrorMessage
    );
  }

  async function submitGameProof(proof: StepProgramProof) {
    const submitGameProofTx = await Mina.transaction(
      codeBreakerKey.toPublicKey(),
      async () => {
        await zkapp.submitGameProof(proof);
      }
    );

    await submitGameProofTx.prove();
    await submitGameProofTx.sign([codeBreakerKey]).send();
  }

  async function claimReward(claimer: PublicKey, claimerKey: PrivateKey) {
    const claimerBalance = Mina.getBalance(claimer);
    const claimRewardTx = await Mina.transaction(claimer, async () => {
      await zkapp.claimReward();
    });

    await claimRewardTx.prove();
    await claimRewardTx.sign([claimerKey]).send();

    const contractBalance = Mina.getBalance(zkappAddress);
    expect(Number(contractBalance.toBigInt())).toEqual(0);

    const claimerNewBalance = Mina.getBalance(claimer);
    expect(
      Number(claimerNewBalance.toBigInt() - claimerBalance.toBigInt())
    ).toEqual(2 * REWARD_AMOUNT);
  }

  async function testInvalidClaimReward(
    claimer: PublicKey,
    claimerKey: PrivateKey,
    expectedErrorMessage?: string
  ) {
    const claimRewardTx = async () => {
      const tx = await Mina.transaction(claimer, async () => {
        await zkapp.claimReward();
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

  describe('Game Proof Creation - Wrong Secret', () => {
    it('Create a new game successfully', async () => {
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

      wrongProof = stepProof.proof;
    });

    it('Solve the game in the first round', async () => {
      const firstGuess = [7, 1, 6, 3];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              wrongProof ? wrongProof.publicOutput.turnCount.toBigInt() : 1
            ),
          ]),
        },
        wrongProof,
        unseparatedGuess
      );

      wrongProof = stepProof.proof;
    });

    it('Give clue and report that the secret is solved', async () => {
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
              wrongProof ? wrongProof.publicOutput.turnCount.toBigInt() : 1
            ),
          ]),
        },
        wrongProof,
        unseparatedCombination,
        codeMasterSalt
      );

      wrongProof = stepProof.proof;
    });
  });

  describe('Deploy and initialize Mastermind', () => {
    it('Deploy a `Mastermind` zkApp', async () => {
      await localDeploy(zkapp, codeMasterKey, zkappPrivateKey);
    });

    it('Reject sending  Mina to the zkApp without proof', async () => {
      const sendMinaTx = async () => {
        const tx = await Mina.transaction(codeMasterPubKey, async () => {
          const update = AccountUpdate.create(codeBreakerPubKey);
          update.send({ to: zkappAddress, amount: UInt64.from(100) });
        });

        await tx.prove();
        await tx.sign([codeMasterKey]).send();
      };

      await expect(sendMinaTx()).rejects.toThrow(
        /Update_not_permitted_balance/
      );
    });

    it('Reject calling `createGame` method before `initGame`', async () => {
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

    it('Reject calling `acceptGame` method before `initGame`', async () => {
      const expectedErrorMessage = 'The game has not been initialized yet!';
      await expect(zkapp.acceptGame()).rejects.toThrowError(
        expectedErrorMessage
      );
    });

    it('Reject calling `submitGameProof` method before `initGame`', async () => {
      const expectedErrorMessage = 'The game has not been initialized yet!';
      await testInvalidsubmitGameProof(wrongProof, expectedErrorMessage);
    });

    it('Reject calling `initGame` when maxAttempts exceeds 15', async () => {
      const initTx = async () =>
        await initializeGame(zkapp, codeMasterKey, refereeKey, 20);

      const expectedErrorMessage =
        'The maximum number of attempts allowed is 15!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Reject calling `initGame` when maxAttempts is below 5', async () => {
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

      const codeMasterId = zkapp.codeMasterId.get();
      expect(codeMasterId).toEqual(Field(0));

      const codeBreakerId = zkapp.codeBreakerId.get();
      expect(codeBreakerId).toEqual(Field(0));

      const solutionHash = zkapp.solutionHash.get();
      expect(solutionHash).toEqual(Field(0));

      const unseparatedGuess = zkapp.unseparatedGuess.get();
      expect(unseparatedGuess).toEqual(Field(0));

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(Field(0));
    });
  });

  describe('Create a new game on-chain with `createGame` method, then try to submit a proof with wrong secret', () => {
    it('Reject calling `acceptGame` method before `createGame`', async () => {
      const expectedErrorMessage = 'The game has not been created yet!';
      await expect(zkapp.acceptGame()).rejects.toThrowError(
        expectedErrorMessage
      );
    });

    it('Create a new game and set codeMaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(
          Field(1234),
          codeMasterSalt,
          UInt64.from(REWARD_AMOUNT)
        );
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();

      const codeMasterId = zkapp.codeMasterId.get();
      expect(codeMasterId).toEqual(codeMasterId);

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

    it('Reject submitting a proof before game being accepted', async () => {
      const expectedErrorMessage =
        'The game has not been accepted by the codeBreaker yet!';
      await testInvalidsubmitGameProof(wrongProof, expectedErrorMessage);
    });
  });

  describe('Code Breaker accepts game', () => {
    it('Accept the game successfully', async () => {
      const tx = await Mina.transaction(codeBreakerPubKey, async () => {
        await zkapp.acceptGame();
      });

      await tx.prove();
      await tx.sign([codeBreakerKey]).send();

      const codeBreakerId = zkapp.codeBreakerId.get();
      expect(codeBreakerId).toEqual(codeBreakerId);
    });

    it('Reject accepting the game again', async () => {
      const expectedErrorMessage =
        'The game has already been accepted by the codeBreaker!';
      await testInvalidAcceptGame(expectedErrorMessage);
    });

    it('Reject submitting a proof with wrong secret', async () => {
      const expectedErrorMessage =
        'The solution hash is not same as the one stored on-chain!';
      await testInvalidsubmitGameProof(wrongProof, expectedErrorMessage);
    });

    it('Reject claiming reward before finalizing', async () => {
      const expectedErrorMessage = 'The game has not been finalized yet!';
      await testInvalidClaimReward(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedErrorMessage
      );
    });
  });

  describe('Intruder tries to submit proof with correct secret', () => {
    it('Create a new game successfully', async () => {
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

      intruderProof = stepProof.proof;
    });

    it('Solve in first guess', async () => {
      const firstGuess = [1, 2, 3, 4];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              intruderProof
                ? intruderProof.publicOutput.turnCount.toBigInt()
                : 1
            ),
          ]),
        },
        intruderProof,
        unseparatedGuess
      );

      intruderProof = stepProof.proof;
    });

    it('Give clue & report solved', async () => {
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
              intruderProof
                ? intruderProof.publicOutput.turnCount.toBigInt()
                : 1
            ),
          ]),
        },
        intruderProof,
        unseparatedCombination,
        codeMasterSalt
      );

      intruderProof = stepProof.proof;
    });

    it('Reject submitting a proof with correct secret', async () => {
      const expectedErrorMessage =
        'The code master ID is not same as the one stored on-chain!';
      await testInvalidsubmitGameProof(intruderProof, expectedErrorMessage);
    });
  });

  describe('Game Proof Creation - Correct secret', () => {
    it('Create a new game successfully', async () => {
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

      partialProof = stepProof.proof;
    });

    it('First guess', async () => {
      const firstGuess = [2, 1, 3, 4];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              partialProof ? partialProof.publicOutput.turnCount.toBigInt() : 1
            ),
          ]),
        },
        partialProof,
        unseparatedGuess
      );

      partialProof = stepProof.proof;
    });

    it('First give clue', async () => {
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
              partialProof ? partialProof.publicOutput.turnCount.toBigInt() : 1
            ),
          ]),
        },
        partialProof,
        unseparatedCombination,
        codeMasterSalt
      );

      partialProof = stepProof.proof;
    });

    it('Second guess', async () => {
      const secondGuess = [1, 2, 3, 4];
      const unseparatedGuess = compressCombinationDigits(
        secondGuess.map(Field)
      );

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              partialProof ? partialProof.publicOutput.turnCount.toBigInt() : 1
            ),
          ]),
        },
        partialProof,
        unseparatedGuess
      );

      completedProof = stepProof.proof;
    });

    it('Give clue and report that the secret is solved', async () => {
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
              completedProof
                ? completedProof.publicOutput.turnCount.toBigInt()
                : 1
            ),
          ]),
        },
        completedProof,
        unseparatedCombination,
        codeMasterSalt
      );

      completedProof = stepProof.proof;
    });
  });

  describe('Try to submit a proof with correct secret after solving the game', () => {
    it('Submit with correct game proof', async () => {
      await submitGameProof(completedProof);

      const [turnCount, maxAttempts, isSolved] =
        separateTurnCountAndMaxAttemptSolved(
          zkapp.turnCountMaxAttemptsIsSolved.get()
        );

      expect(turnCount.toBigInt()).toEqual(5n);
      expect(maxAttempts.toBigInt()).toEqual(5n);
      expect(isSolved.toBigInt()).toEqual(1n);

      const codeBreakerId = zkapp.codeBreakerId.get();
      expect(codeBreakerId).toEqual(codeBreakerId);

      const unseparatedGuess = zkapp.unseparatedGuess.get();
      expect(unseparatedGuess).toEqual(
        compressCombinationDigits([1, 2, 3, 4].map(Field))
      );

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(serializeClue([2, 2, 2, 2].map(Field)));
    });

    it('Reject submitting a same proof again', async () => {
      const expectedErrorMessage = 'The game secret has already been solved!';
      await testInvalidsubmitGameProof(completedProof, expectedErrorMessage);
    });

    it('Reject claiming reward before game finalized', async () => {
      const expectedErrorMessage = 'The game has not been finalized yet!';
      await testInvalidClaimReward(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedErrorMessage
      );
    });

    it('Wait 10 slot for finalize', async () => {
      Local.incrementGlobalSlot(11);

      expect(Mina.getNetworkState().globalSlotSinceGenesis.toBigint()).toEqual(
        11n
      );
    });

    it('Reject claiming reward from intruder', async () => {
      const expectedErrorMessage =
        'You are not the codeMaster or codeBreaker of this game!';
      await testInvalidClaimReward(
        intruderPubKey,
        intruderKey,
        expectedErrorMessage
      );
    });

    it('Code Master claim rejected', async () => {
      const expectedErrorMessage = 'You are not the winner of this game!';
      await testInvalidClaimReward(
        codeMasterPubKey,
        codeMasterKey,
        expectedErrorMessage
      );
    });

    it('Intruder tries to claim reward', async () => {
      const expectedErrorMessage =
        'You are not the codeMaster or codeBreaker of this game!';
      await testInvalidClaimReward(
        intruderPubKey,
        intruderKey,
        expectedErrorMessage
      );
    });

    it('Claim reward', async () => {
      await claimReward(codeBreakerPubKey, codeBreakerKey);
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

    it('should create a new game and set codeMaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(
          Field(1234),
          codeMasterSalt,
          UInt64.from(REWARD_AMOUNT)
        );
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();

      const codeMasterId = zkapp.codeMasterId.get();
      expect(codeMasterId).toEqual(codeMasterId);

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
      const codeBreakerId = zkapp.codeBreakerId.get();
      expect(codeBreakerId).toEqual(codeBreakerId);
    });

    it('penalty for codeBreaker', async () => {
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

    it('should create a new game and set codeMaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(
          Field(1234),
          codeMasterSalt,
          UInt64.from(REWARD_AMOUNT)
        );
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();

      const codeMasterId = zkapp.codeMasterId.get();
      expect(codeMasterId).toEqual(codeMasterId);

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
      const codeBreakerId = zkapp.codeBreakerId.get();
      expect(codeBreakerId).toEqual(codeBreakerId);
    });

    it('penalty for codeMaster', async () => {
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

  describe('Code Master wins', () => {
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

    it('Create a new game and set codeMaster successfully', async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.createGame(
          Field(1234),
          codeMasterSalt,
          UInt64.from(REWARD_AMOUNT)
        );
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();

      const codeMasterId = zkapp.codeMasterId.get();
      expect(codeMasterId).toEqual(codeMasterId);

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

    it('Accept the game successfully', async () => {
      await acceptGame();
      const codeBreakerId = zkapp.codeBreakerId.get();
      expect(codeBreakerId).toEqual(codeBreakerId);
    });

    it('makeGuess method', async () => {
      const firstGuess = [2, 1, 3, 4];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const guessTx = await Mina.transaction(codeBreakerPubKey, async () => {
        await zkapp.makeGuess(unseparatedGuess);
      });

      await guessTx.prove();
      await guessTx.sign([codeBreakerKey]).send();

      const unseparatedGuessOnChain = zkapp.unseparatedGuess.get();
      expect(unseparatedGuessOnChain).toEqual(unseparatedGuess);
    });

    it('Intruder tries to give clue', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      const giveClueTx = async () => {
        const tx = await Mina.transaction(intruderPubKey, async () => {
          await zkapp.giveClue(unseparatedCombination, codeMasterSalt);
        });

        await tx.prove();
        await tx.sign([intruderKey]).send();
      };

      const expectedErrorMessage =
        'Only the codeMaster of this game is allowed to give clue!';
      await expect(giveClueTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('giveClue method', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      const clueTx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.giveClue(unseparatedCombination, codeMasterSalt);
      });

      await clueTx.prove();
      await clueTx.sign([codeMasterKey]).send();

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(serializeClue([1, 1, 2, 2].map(Field)));
    });

    it('Intruder tries to make guess', async () => {
      const unseparatedGuess = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      const guessTx = async () => {
        const tx = await Mina.transaction(intruderPubKey, async () => {
          await zkapp.makeGuess(unseparatedGuess);
        });

        await tx.prove();
        await tx.sign([intruderKey]).send();
      };

      const expectedErrorMessage = 'You are not the codeBreaker of this game!';
      await expect(guessTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Claim reward successfully', async () => {
      Local.incrementGlobalSlot(11);
      await claimReward(codeMasterPubKey, codeMasterKey);
    });
  });
});
