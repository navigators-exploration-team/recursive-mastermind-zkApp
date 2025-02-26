import { GAME_DURATION, MastermindZkApp } from '../Mastermind';

import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  UInt64,
  UInt32,
} from 'o1js';

import {
  compressCombinationDigits,
  compressRewardAndFinalizeSlot,
  compressTurnCountMaxAttemptSolved,
  separateCombinationDigits,
  separateTurnCountAndMaxAttemptSolved,
  serializeClue,
} from '../utils';

import { StepProgram, StepProgramProof } from '../stepProgram';

import {
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramMakeGuess,
} from './testUtils';

describe('Mastermind ZkApp Tests', () => {
  // Global variables
  let proofsEnabled = false;
  let REWARD_AMOUNT = 100000;

  // Keys
  let codeMasterKey: PrivateKey;
  let codeBreakerKey: PrivateKey;
  let refereeKey: PrivateKey;
  let intruderKey: PrivateKey;

  // Public keys
  let codeMasterPubKey: PublicKey;
  let codeBreakerPubKey: PublicKey;
  let refereePubKey: PublicKey;
  let intruderPubKey: PublicKey;

  // ZkApp
  let zkappAddress: PublicKey;
  let zkappPrivateKey: PrivateKey;
  let zkapp: MastermindZkApp;

  // Variables
  let codeMasterSalt: Field;
  let secretCombination: number[];

  // Proofs
  let partialProof: StepProgramProof;
  let completedProof: StepProgramProof;
  // let intruderProof: StepProgramProof;
  let wrongProof: StepProgramProof;

  // Local Mina blockchain
  let Local: Awaited<ReturnType<typeof Mina.LocalBlockchain>>;

  // Helper functions

  /**
   * Deploy a fresh Mastermind ZkApp contract.
   * @param zkapp The MastermindZkApp instance
   * @param deployerKey Key of the account funding the deploy
   * @param zkappKey Key of the new zkApp
   */
  async function deployZkApp(
    zkapp: MastermindZkApp,
    deployerKey: PrivateKey,
    zkappPrivateKey: PrivateKey
  ) {
    const deployerAccount = deployerKey.toPublicKey();
    const tx = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      await zkapp.deploy();
    });

    await tx.prove();
    await tx.sign([deployerKey, zkappPrivateKey]).send();
  }

  /**
   * Initialize the game on-chain (sets the secret combination, salt, max attempts, and referee), and funds the contract with the reward amount.
   * @param zkapp The MastermindZkApp instance
   * @param deployerKey Key of the account funding the deploy
   * @param secretCombination The secret combination
   * @param salt The salt to use protecting from pre-image attacks
   * @param maxAttempt Number of max attempts allowed
   * @param refereeKey Key of the referee
   */
  async function initializeGame(
    zkapp: MastermindZkApp,
    deployerKey: PrivateKey,
    secretCombination: number[],
    salt: Field,
    maxAttempt: number,
    refereeKey: PrivateKey
  ) {
    const deployerAccount = deployerKey.toPublicKey();
    const refereeAccount = refereeKey.toPublicKey();

    const unseparatedCombination = compressCombinationDigits(
      secretCombination.map(Field)
    );
    const initTx = await Mina.transaction(deployerAccount, async () => {
      await zkapp.initGame(
        unseparatedCombination,
        salt,
        Field.from(maxAttempt),
        refereeAccount,
        UInt64.from(REWARD_AMOUNT)
      );
    });

    await initTx.prove();
    await initTx.sign([deployerKey]).send();
  }

  /**
   * Deploy and initialize the game.
   * @param zkapp The MastermindZkApp instance
   * @param deployerKey Key of the account funding the deploy
   * @param zkappPrivateKey Key of the new zkApp
   * @param secretCombination The secret combination
   * @param salt The salt to use protecting from pre-image attacks
   * @param maxAttempt Number of max attempts allowed
   * @param refereeKey Key of the referee
   */
  async function deployAndInitializeGame(
    zkapp: MastermindZkApp,
    deployerKey: PrivateKey,
    zkappPrivateKey: PrivateKey,
    secretCombination: number[],
    salt: Field,
    maxAttempt: number,
    refereeKey: PrivateKey
  ) {
    const deployerAccount = deployerKey.toPublicKey();
    const refereeAccount = refereeKey.toPublicKey();

    const unseparatedCombination = compressCombinationDigits(
      secretCombination.map(Field)
    );

    const tx = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      await zkapp.deploy();
      await zkapp.initGame(
        unseparatedCombination,
        salt,
        Field.from(maxAttempt),
        refereeAccount,
        UInt64.from(REWARD_AMOUNT)
      );
    });

    await tx.prove();
    await tx.sign([deployerKey, zkappPrivateKey]).send();
  }

  /**
   * Prepare a new game.
   */
  async function prepareNewGame() {
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);

    await deployAndInitializeGame(
      zkapp,
      codeMasterKey,
      zkappPrivateKey,
      secretCombination,
      codeMasterSalt,
      5,
      refereeKey
    );

    await acceptGame();
  }

  /**
   * Helper function to expect a proof submission to fail.
   */
  async function expectProofSubmissionToFail(
    proof: StepProgramProof,
    expectedMsg?: string
  ) {
    const submitGameProofTx = async () => {
      const tx = await Mina.transaction(codeMasterPubKey, async () => {
        await zkapp.submitGameProof(proof);
      });

      await tx.prove();
      await tx.sign([codeMasterKey]).send();
    };

    await expect(submitGameProofTx()).rejects.toThrowError(expectedMsg);
  }

  /**
   * Helper function to submit a game proof.
   */
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

  /**
   * Helper function to claim reward from codeBreaker or codeMaster.
   */
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

  /**
   * Helper to expect claim reward to fail.
   */
  async function expectClaimRewardToFail(
    claimer: PublicKey,
    claimerKey: PrivateKey,
    expectedMsg?: string
  ) {
    const claimRewardTx = async () => {
      const tx = await Mina.transaction(claimer, async () => {
        await zkapp.claimReward();
      });

      await tx.prove();
      await tx.sign([claimerKey]).send();
    };

    await expect(claimRewardTx()).rejects.toThrowError(expectedMsg);
  }

  /**
   * Helper function to accept a game from the codeBreaker.
   */
  async function acceptGame() {
    const acceptGameTx = await Mina.transaction(codeBreakerPubKey, async () => {
      await zkapp.acceptGame();
    });

    await acceptGameTx.prove();
    await acceptGameTx.sign([codeBreakerKey]).send();
  }

  /**
   * Helper function to penalize a player.
   */
  async function forfeitWinForPlayer(
    refereeKey: PrivateKey,
    playerPubKey: PublicKey
  ) {
    const refereePubKey = refereeKey.toPublicKey();
    const playerPrevBalance = Mina.getBalance(playerPubKey);
    const penaltyTx = await Mina.transaction(refereePubKey, async () => {
      await zkapp.forfeitWin(playerPubKey);
    });

    await penaltyTx.prove();
    await penaltyTx.sign([refereeKey]).send();

    const contractBalance = Mina.getBalance(zkappAddress);
    expect(Number(contractBalance.toBigInt())).toEqual(0);

    const playerNewBalance = Mina.getBalance(playerPubKey);
    expect(
      Number(playerNewBalance.toBigInt() - playerPrevBalance.toBigInt())
    ).toEqual(2 * REWARD_AMOUNT);
  }

  beforeAll(async () => {
    // Compile StepProgram and MastermindZkApp
    await StepProgram.compile();
    await MastermindZkApp.compile();

    // Set up the Mina local blockchain
    Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);

    // Assign local test accounts
    codeMasterKey = Local.testAccounts[0].key;
    codeMasterPubKey = codeMasterKey.toPublicKey();

    codeBreakerKey = Local.testAccounts[1].key;
    codeBreakerPubKey = codeBreakerKey.toPublicKey();

    intruderKey = Local.testAccounts[2].key;
    intruderPubKey = intruderKey.toPublicKey();

    refereeKey = Local.testAccounts[3].key;
    refereePubKey = refereeKey.toPublicKey();

    // Initialize codeMasterSalt & secret combination
    codeMasterSalt = Field.random();
    secretCombination = [7, 1, 6, 3];

    // Prepare brand-new MastermindZkApp for tests
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);

    // Base case: Create a new game
    wrongProof = await StepProgramCreateGame(
      secretCombination,
      codeMasterSalt,
      codeMasterKey
    );

    // Make a guess with wrong answer
    wrongProof = await StepProgramMakeGuess(
      wrongProof,
      secretCombination,
      codeBreakerKey
    );

    // Give clue with wrong answer
    wrongProof = await StepProgramGiveClue(
      wrongProof,
      secretCombination,
      codeMasterSalt,
      codeMasterKey
    );

    secretCombination = [1, 2, 3, 4];
  });

  describe('Deploy & Initialize Flow', () => {
    it('Deploy a Mastermind zkApp', async () => {
      await deployZkApp(zkapp, codeMasterKey, zkappPrivateKey);
    });

    it('Reject calling acceptGame method before initGame', async () => {
      const expectedMsg = 'The game has not been initialized yet!';
      await expect(zkapp.acceptGame()).rejects.toThrowError(expectedMsg);
    });

    it('Reject calling submitGameProof method before initGame', async () => {
      const expectedMsg = 'The game has not been initialized yet!';
      await expectProofSubmissionToFail(wrongProof, expectedMsg);
    });

    it('Rejects initGame if maxAttempts > 15', async () => {
      const initTx = async () =>
        await initializeGame(
          zkapp,
          codeMasterKey,
          secretCombination,
          codeMasterSalt,
          20,
          refereeKey
        );

      const expectedMsg = 'The maximum number of attempts allowed is 15!';
      await expect(initTx()).rejects.toThrowError(expectedMsg);
    });

    it('Rejects initGame if maxAttempts < 5', async () => {
      const initTx = async () =>
        await initializeGame(
          zkapp,
          codeMasterKey,
          secretCombination,
          codeMasterSalt,
          4,
          refereeKey
        );

      const expectedMsg = 'The minimum number of attempts allowed is 5!';
      await expect(initTx()).rejects.toThrowError(expectedMsg);
    });

    it('Initializes the game successfully', async () => {
      const maxAttempts = 5;
      await initializeGame(
        zkapp,
        codeMasterKey,
        secretCombination,
        codeMasterSalt,
        maxAttempts,
        refereeKey
      );

      expect(zkapp.turnCountMaxAttemptsIsSolved.get()).toEqual(
        compressTurnCountMaxAttemptSolved([1, maxAttempts, 0].map(Field))
      );
      expect(zkapp.codeMasterId.get()).toEqual(
        Poseidon.hash(codeMasterPubKey.toFields())
      );
      expect(zkapp.refereeId.get()).toEqual(
        Poseidon.hash(refereePubKey.toFields())
      );
      expect(zkapp.solutionHash.get()).toEqual(
        Poseidon.hash([
          ...separateCombinationDigits(Field(1234)),
          codeMasterSalt,
        ])
      );
      expect(zkapp.rewardFinalizeSlot.get()).toEqual(
        compressRewardAndFinalizeSlot(
          UInt64.from(REWARD_AMOUNT),
          UInt32.from(0)
        )
      );

      // All other fields should be 0
      expect(zkapp.unseparatedGuess.get()).toEqual(Field(0));
      expect(zkapp.codeBreakerId.get()).toEqual(Field(0));
      expect(zkapp.serializedClue.get()).toEqual(Field(0));

      // Contract should be funded with the reward amount
      expect(Number(Mina.getBalance(zkappAddress).toBigInt())).toEqual(
        REWARD_AMOUNT
      );
    });
  });

  describe('Accepting a Game', () => {
    it('Rejects submitGameProof before acceptGame', async () => {
      const expectedMsg =
        'The game has not been accepted by the codeBreaker yet!';
      await expectProofSubmissionToFail(wrongProof, expectedMsg);
    });

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
      const expectedMsg =
        'The game has already been accepted by the codeBreaker!';
      const acceptGameTx = async () => {
        const tx = await Mina.transaction(codeBreakerPubKey, async () => {
          await zkapp.acceptGame();
        });

        await tx.prove();
        await tx.sign([codeBreakerKey]).send();
      };

      await expect(acceptGameTx()).rejects.toThrowError(expectedMsg);
    });

    it('Reject submitting a proof with wrong secret', async () => {
      const expectedMsg =
        'The solution hash is not same as the one stored on-chain!';
      await expectProofSubmissionToFail(wrongProof, expectedMsg);
    });

    it('Reject claiming reward before finalizing', async () => {
      const expectedMsg = 'The game has not been finalized yet!';
      await expectClaimRewardToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedMsg
      );
    });
  });

  describe('Submitting Correct Game Proof and Claiming Reward', () => {
    beforeAll(async () => {
      // Build a "completedProof" that solves the game
      // This portion uses your StepProgram to create valid proofs off-chain.

      // 1. createGame
      partialProof = await StepProgramCreateGame(
        secretCombination,
        codeMasterSalt,
        codeMasterKey
      );

      // 2. makeGuess
      partialProof = await StepProgramMakeGuess(
        partialProof,
        [2, 1, 3, 4],
        codeBreakerKey
      );

      // 3. giveClue
      partialProof = await StepProgramGiveClue(
        partialProof,
        secretCombination,
        codeMasterSalt,
        codeMasterKey
      );

      // 4. second guess
      completedProof = await StepProgramMakeGuess(
        partialProof,
        secretCombination,
        codeBreakerKey
      );

      // 5. giveClue & final
      completedProof = await StepProgramGiveClue(
        completedProof,
        secretCombination,
        codeMasterSalt,
        codeMasterKey
      );
    });

    it('Submit with correct game proof', async () => {
      await submitGameProof(completedProof);

      const [turnCount, , isSolved] = separateTurnCountAndMaxAttemptSolved(
        zkapp.turnCountMaxAttemptsIsSolved.get()
      );

      expect(turnCount.toBigInt()).toEqual(
        completedProof.publicOutput.turnCount.toBigInt()
      );
      expect(isSolved.toBigInt()).toEqual(1n);

      expect(zkapp.codeBreakerId.get()).toEqual(
        Poseidon.hash(codeBreakerPubKey.toFields())
      );

      expect(zkapp.unseparatedGuess.get()).toEqual(
        compressCombinationDigits(secretCombination.map(Field))
      );

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(serializeClue([2, 2, 2, 2].map(Field)));
    });

    it('Reject submitting a same proof again', async () => {
      const expectedMsg = 'The game secret has already been solved!';
      await expectProofSubmissionToFail(completedProof, expectedMsg);
    });

    it('Reject claiming reward before game finalized', async () => {
      const expectedMsg = 'The game has not been finalized yet!';
      await expectClaimRewardToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedMsg
      );

      // Move the global slot forward
      Local.incrementGlobalSlot(GAME_DURATION);
    });

    it('Rejects reward claim from intruder', async () => {
      const expectedMsg =
        'You are not the codeMaster or codeBreaker of this game!';
      await expectClaimRewardToFail(intruderPubKey, intruderKey, expectedMsg);
    });

    it('Rejects codeMaster claim if they lost', async () => {
      const expectedMsg = 'You are not the winner of this game!';
      await expectClaimRewardToFail(
        codeMasterPubKey,
        codeMasterKey,
        expectedMsg
      );
    });

    it('Claim reward', async () => {
      await claimReward(codeBreakerPubKey, codeBreakerKey);
    });
  });

  describe('Code Breaker punished for timeout', () => {
    beforeAll(async () => {
      await prepareNewGame();
    });

    it('penalty for codeBreaker', async () => {
      await forfeitWinForPlayer(refereeKey, codeMasterPubKey);
    });
  });

  describe('Code Master punished for timeout', () => {
    beforeAll(async () => {
      await prepareNewGame();
    });

    it('penalty for codeMaster', async () => {
      await forfeitWinForPlayer(refereeKey, codeBreakerPubKey);
    });
  });

  describe('Code Master wins', () => {
    beforeAll(async () => {
      await prepareNewGame();
    });

    it('makeGuess method', async () => {
      const unseparatedGuess = compressCombinationDigits(
        [2, 1, 3, 4].map(Field)
      );

      const guessTx = await Mina.transaction(codeBreakerPubKey, async () => {
        await zkapp.makeGuess(unseparatedGuess);
      });

      await guessTx.prove();
      await guessTx.sign([codeBreakerKey]).send();

      expect(zkapp.unseparatedGuess.get()).toEqual(unseparatedGuess);
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

      const expectedMsg =
        'Only the codeMaster of this game is allowed to give clue!';
      await expect(giveClueTx()).rejects.toThrowError(expectedMsg);
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

      const expectedMsg = 'You are not the codeBreaker of this game!';
      await expect(guessTx()).rejects.toThrowError(expectedMsg);
    });

    it('Claim reward successfully', async () => {
      Local.incrementGlobalSlot(GAME_DURATION);
      await claimReward(codeMasterPubKey, codeMasterKey);
    });
  });
});
