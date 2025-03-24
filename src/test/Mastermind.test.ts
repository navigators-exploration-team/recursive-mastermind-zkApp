import { PER_ATTEMPT_GAME_DURATION, MastermindZkApp } from '../Mastermind';

import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  UInt64,
  UInt32,
  fetchAccount,
  fetchLastBlock,
  Lightnet,
} from 'o1js';

import {
  compressCombinationDigits,
  compressRewardAndFinalizeSlot,
  compressTurnCountMaxAttemptSolved,
  separateCombinationDigits,
  separateTurnCountAndMaxAttemptSolved,
  serializeClue,
  serializeClueHistory,
  serializeCombinationHistory,
} from '../utils';

import { StepProgram, StepProgramProof } from '../stepProgram';

import {
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramMakeGuess,
} from './testUtils';
import { players } from './mock';

describe('Mastermind ZkApp Tests', () => {
  // Global variables
  const testEnvironment = process.env.TEST_ENV ?? 'local';
  const logsEnabled = process.env.LOGS_ENABLED === '1';
  const localTest = testEnvironment === 'local';
  let fee = localTest ? 0 : 1e9;
  let proofsEnabled = false;
  let REWARD_AMOUNT = 100000;
  let MINA_NODE_ENDPOINT: string;
  let MINA_ARCHIVE_ENDPOINT: string;
  let MINA_EXPLORER: string;

  if (testEnvironment === 'devnet') {
    MINA_NODE_ENDPOINT = 'https://api.minascan.io/node/devnet/v1/graphql';
    MINA_ARCHIVE_ENDPOINT = 'https://api.minascan.io/archive/devnet/v1/graphql';
    MINA_EXPLORER = 'https://minascan.io/devnet/tx/';
  } else if (testEnvironment === 'lightnet') {
    MINA_NODE_ENDPOINT = 'http://127.0.0.1:8080/graphql';
    MINA_ARCHIVE_ENDPOINT = 'http://127.0.0.1:8282';
    MINA_EXPLORER =
      'file:///Users/kadircan/.cache/zkapp-cli/lightnet/explorer/v0.2.2/index.html?target=block&numberOrHash=';
  }

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
  function log(...args: any[]) {
    if (logsEnabled) {
      console.log(...args);
    }
  }

  /**
   * Wait for a transaction to be included in a block and fetch the account.
   * @param tx The transaction to wait for
   * @param keys The keys to sign the transaction
   * @param accountsToFetch The accounts to fetch after the transaction is included
   */
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
        log(`${MINA_EXPLORER}${pendingTransaction.hash}`);
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

  /**
   * Fetch given accounts from the Mina to local cache.
   * @param accounts List of account public keys to fetch
   */
  async function fetchAccounts(accounts: PublicKey[]) {
    if (localTest) return;
    for (let account of accounts) {
      await fetchAccount({ publicKey: account });
    }
  }

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
    const tx = await Mina.transaction(
      { sender: deployerAccount, fee },
      async () => {
        AccountUpdate.fundNewAccount(deployerAccount);
        await zkapp.deploy();
      }
    );

    await waitTransactionAndFetchAccount(
      tx,
      [deployerKey, zkappPrivateKey],
      [zkappAddress]
    );
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
    const initTx = await Mina.transaction(
      { sender: deployerAccount, fee },
      async () => {
        await zkapp.initGame(
          unseparatedCombination,
          salt,
          Field.from(maxAttempt),
          refereeAccount,
          UInt64.from(REWARD_AMOUNT)
        );
      }
    );

    await waitTransactionAndFetchAccount(initTx, [deployerKey], [zkappAddress]);
  }

  /**
   * Helper function to expect initializeGame to fail.
   */
  async function expectInitializeGameToFail(
    zkapp: MastermindZkApp,
    deployerKey: PrivateKey,
    secretCombination: number[],
    salt: Field,
    maxAttempt: number,
    refereeKey: PrivateKey,
    expectedMsg?: string
  ) {
    const deployerAccount = deployerKey.toPublicKey();
    const refereeAccount = refereeKey.toPublicKey();

    const unseparatedCombination = compressCombinationDigits(
      secretCombination.map(Field)
    );
    try {
      const tx = await Mina.transaction(
        { sender: deployerAccount, fee },
        async () => {
          await zkapp.initGame(
            unseparatedCombination,
            salt,
            Field.from(maxAttempt),
            refereeAccount,
            UInt64.from(REWARD_AMOUNT)
          );
        }
      );
      await waitTransactionAndFetchAccount(tx, [deployerKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
    }
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

    const tx = await Mina.transaction(
      { sender: deployerAccount, fee },
      async () => {
        AccountUpdate.fundNewAccount(deployerAccount);
        await zkapp.deploy();
        await zkapp.initGame(
          unseparatedCombination,
          salt,
          Field.from(maxAttempt),
          refereeAccount,
          UInt64.from(REWARD_AMOUNT)
        );
      }
    );

    await waitTransactionAndFetchAccount(
      tx,
      [deployerKey, zkappPrivateKey],
      [zkappAddress, deployerAccount]
    );
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

    await acceptGame(codeBreakerPubKey, codeBreakerKey);
  }

  /**
   * Helper function to expect a proof submission to fail.
   */
  async function expectProofSubmissionToFail(
    proof: StepProgramProof,
    winnerPubKey: PublicKey,
    expectedMsg?: string
  ) {
    try {
      const tx = await Mina.transaction(
        { sender: codeMasterPubKey, fee },
        async () => {
          await zkapp.submitGameProof(proof, winnerPubKey);
        }
      );

      await waitTransactionAndFetchAccount(tx, [codeMasterKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
    }
  }

  /**
   * Helper function to submit a game proof.
   */
  async function submitGameProof(
    proof: StepProgramProof,
    winnerPubKey: PublicKey,
    shouldClaim: boolean
  ) {
    await fetchAccounts([winnerPubKey, zkappAddress]);
    const winnerBalance = Mina.getBalance(winnerPubKey);
    const submitGameProofTx = await Mina.transaction(
      { sender: refereePubKey, fee },
      async () => {
        await zkapp.submitGameProof(proof, winnerPubKey ?? codeMasterPubKey);
      }
    );

    await waitTransactionAndFetchAccount(
      submitGameProofTx,
      [refereeKey],
      [zkappAddress]
    );

    const contractBalance = Mina.getBalance(zkappAddress);
    expect(Number(contractBalance.toBigInt())).toEqual(
      shouldClaim ? 0 : 2 * REWARD_AMOUNT
    );

    const winnerNewBalance = Mina.getBalance(winnerPubKey);
    expect(
      Number(winnerNewBalance.toBigInt() - winnerBalance.toBigInt())
    ).toEqual(shouldClaim ? 2 * REWARD_AMOUNT : 0);
  }

  /**
   * Helper function to claim reward from codeBreaker or codeMaster.
   */
  async function claimReward(
    claimer: PublicKey,
    claimerKey: PrivateKey,
    reimbursed = false
  ) {
    await fetchAccounts([claimer, zkappAddress]);
    const claimerBalance = Mina.getBalance(claimer);
    const claimRewardTx = await Mina.transaction(
      { sender: claimer, fee },
      async () => {
        await zkapp.claimReward();
      }
    );

    await waitTransactionAndFetchAccount(
      claimRewardTx,
      [claimerKey],
      [zkappAddress, claimer]
    );

    const contractBalance = Mina.getBalance(zkappAddress);
    expect(Number(contractBalance.toBigInt())).toEqual(0);

    const claimerNewBalance = Mina.getBalance(claimer);
    expect(
      Number(claimerNewBalance.toBigInt() - claimerBalance.toBigInt())
    ).toEqual(
      (reimbursed ? REWARD_AMOUNT : 2 * REWARD_AMOUNT) - (localTest ? 0 : fee)
    );
  }

  /**
   * Helper to expect claim reward to fail.
   */
  async function expectClaimRewardToFail(
    claimer: PublicKey,
    claimerKey: PrivateKey,
    expectedMsg?: string
  ) {
    try {
      await fetchAccounts([claimer, zkappAddress]);
      const tx = await Mina.transaction({ sender: claimer, fee }, async () => {
        await zkapp.claimReward();
      });

      await waitTransactionAndFetchAccount(tx, [claimerKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
    }
  }

  /**
   * Helper function to accept a game from player.
   */
  async function acceptGame(player: PublicKey, playerKey: PrivateKey) {
    const acceptGameTx = await Mina.transaction(
      { sender: player, fee },
      async () => {
        await zkapp.acceptGame();
      }
    );

    await waitTransactionAndFetchAccount(
      acceptGameTx,
      [playerKey],
      [zkappAddress, player]
    );
  }

  /**
   * Helper function to expect accept game to fail
   */
  async function expectAcceptGameToFail(
    player: PublicKey,
    playerKey: PrivateKey,
    expectedMsg?: string
  ) {
    try {
      const tx = await Mina.transaction({ sender: player, fee }, async () => {
        await zkapp.acceptGame();
      });
      await waitTransactionAndFetchAccount(tx, [playerKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
    }
  }

  /**
   * Helper function to make a guess.
   */
  async function makeGuess(
    player: PublicKey,
    playerKey: PrivateKey,
    unseparatedGuess: Field
  ) {
    await fetchAccounts([zkappAddress]);
    const guessTx = await Mina.transaction(
      { sender: player, fee },
      async () => {
        await zkapp.makeGuess(unseparatedGuess);
      }
    );

    await waitTransactionAndFetchAccount(guessTx, [playerKey], [zkappAddress]);
  }

  /**
   * Helper function to give a clue.
   */
  async function giveClue(
    player: PublicKey,
    playerKey: PrivateKey,
    unseparatedCombination: Field,
    salt: Field
  ) {
    await fetchAccounts([zkappAddress]);
    const clueTx = await Mina.transaction({ sender: player, fee }, async () => {
      await zkapp.giveClue(unseparatedCombination, salt);
    });

    await waitTransactionAndFetchAccount(clueTx, [playerKey], [zkappAddress]);
  }

  /**
   * Helper function to penalize a player.
   */
  async function forfeitWinForPlayer(
    refereeKey: PrivateKey,
    playerPubKey: PublicKey
  ) {
    const refereePubKey = refereeKey.toPublicKey();
    await fetchAccounts([playerPubKey, zkappAddress]);
    const playerPrevBalance = Mina.getBalance(playerPubKey);
    const penaltyTx = await Mina.transaction(
      { sender: refereePubKey, fee },
      async () => {
        await zkapp.forfeitWin(playerPubKey);
      }
    );

    await waitTransactionAndFetchAccount(
      penaltyTx,
      [refereeKey],
      [zkappAddress, playerPubKey]
    );

    const contractBalance = Mina.getBalance(zkappAddress);
    expect(Number(contractBalance.toBigInt())).toEqual(0);

    const playerNewBalance = Mina.getBalance(playerPubKey);
    expect(
      Number(playerNewBalance.toBigInt() - playerPrevBalance.toBigInt())
    ).toEqual(2 * REWARD_AMOUNT);
  }

  /**
   * Helper function to fetch the latest block and return the global slot
   */
  async function getGlobalSlot() {
    const latestBlock = await fetchLastBlock(MINA_NODE_ENDPOINT);

    return latestBlock.globalSlotSinceGenesis.toBigint();
  }

  /**
   * Helper function to wait for SLOT_DURATION.
   */
  async function waitForFinalize() {
    if (localTest) {
      // Move the global slot forward
      let [, maxAttempts] = separateTurnCountAndMaxAttemptSolved(
        zkapp.turnCountMaxAttemptsIsSolved.get()
      );
      Local.incrementGlobalSlot(
        Number(maxAttempts.toBigInt()) * PER_ATTEMPT_GAME_DURATION
      );
    } else {
      // Wait for the game duration
      await fetchAccount({ publicKey: zkappAddress });
      let finalizeSlot = zkapp.rewardFinalizeSlot.get();
      while (true) {
        let currentSlot = await getGlobalSlot();
        if (currentSlot >= finalizeSlot.toBigInt()) {
          break;
        }

        // Wait for 3 min
        await new Promise((resolve) => setTimeout(resolve, 3 * 60 * 1000));
        await fetchLastBlock(MINA_NODE_ENDPOINT);
      }
    }
  }

  beforeAll(async () => {
    // Compile StepProgram and MastermindZkApp
    await StepProgram.compile({
      // proofsEnabled,
    });
    if (testEnvironment !== 'local') {
      await MastermindZkApp.compile();
    }

    if (testEnvironment === 'local') {
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

      intruderKey = players[2][0];
      intruderPubKey = players[2][1];

      refereeKey = players[3][0];
      refereePubKey = players[3][1];
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

      intruderKey = (await Lightnet.acquireKeyPair()).privateKey;
      intruderPubKey = intruderKey.toPublicKey();

      refereeKey = (await Lightnet.acquireKeyPair()).privateKey;
      refereePubKey = refereeKey.toPublicKey();
    }

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
    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Deploy a Mastermind zkApp', async () => {
      await deployZkApp(zkapp, codeMasterKey, zkappPrivateKey);
    });

    it('Reject calling acceptGame method before initGame', async () => {
      const expectedMsg = 'The game has not been initialized yet!';
      await expectAcceptGameToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedMsg
      );
    });

    it('Reject calling submitGameProof method before initGame', async () => {
      const expectedMsg = 'The game has not been initialized yet!';
      await expectProofSubmissionToFail(
        wrongProof,
        codeMasterPubKey,
        expectedMsg
      );
    });

    it('Reject initGame if maxAttempts > 15', async () => {
      const expectedMsg = 'The maximum number of attempts allowed is 15!';
      await expectInitializeGameToFail(
        zkapp,
        codeMasterKey,
        secretCombination,
        codeMasterSalt,
        20,
        refereeKey,
        expectedMsg
      );
    });

    it('Reject initGame if maxAttempts < 5', async () => {
      const expectedMsg = 'The minimum number of attempts allowed is 5!';
      await expectInitializeGameToFail(
        zkapp,
        codeMasterKey,
        secretCombination,
        codeMasterSalt,
        4,
        refereeKey,
        expectedMsg
      );
    });

    it('Reject initGame if reward amount is 0', async () => {
      const expectedMsg = 'The reward amount must be greater than zero!';
      REWARD_AMOUNT = 0;
      await expectInitializeGameToFail(
        zkapp,
        codeMasterKey,
        secretCombination,
        codeMasterSalt,
        5,
        refereeKey,
        expectedMsg
      );
      REWARD_AMOUNT = 100000;
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
      expect(zkapp.packedGuessHistory.get()).toEqual(Field(0));
      expect(zkapp.codeBreakerId.get()).toEqual(Field(0));
      expect(zkapp.packedClueHistory.get()).toEqual(Field(0));

      // Contract should be funded with the reward amount
      expect(Number(Mina.getBalance(zkappAddress).toBigInt())).toEqual(
        REWARD_AMOUNT
      );
    });
  });

  describe('Accepting a Game and Solve', () => {
    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Reject submitGameProof before acceptGame', async () => {
      const expectedMsg =
        'The game has not been accepted by the codeBreaker yet!';
      await expectProofSubmissionToFail(
        wrongProof,
        codeMasterPubKey,
        expectedMsg
      );
    });

    it('Accept the game successfully', async () => {
      await acceptGame(codeBreakerPubKey, codeBreakerKey);

      const codeBreakerId = zkapp.codeBreakerId.get();
      expect(codeBreakerId.toBigInt()).toEqual(
        Poseidon.hash(codeBreakerPubKey.toFields()).toBigInt()
      );
    });

    it('Reject accepting the game again', async () => {
      const expectedMsg =
        'The game has already been accepted by the codeBreaker!';
      await expectAcceptGameToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedMsg
      );
    });

    it('Reject submitting a proof with wrong secret', async () => {
      const expectedMsg =
        'The solution hash is not same as the one stored on-chain!';
      await expectProofSubmissionToFail(
        wrongProof,
        codeBreakerPubKey,
        expectedMsg
      );
    });

    it('Reject claiming reward before solving', async () => {
      const expectedMsg = 'You are not the winner of this game!';
      await expectClaimRewardToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedMsg
      );
    });

    it('Reject reward claim from intruder', async () => {
      const expectedMsg =
        'You are not the codeMaster or codeBreaker of this game!';
      await expectClaimRewardToFail(intruderPubKey, intruderKey, expectedMsg);
    });

    it('Submit with correct game proof', async () => {
      await submitGameProof(completedProof, codeBreakerPubKey, true);

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

      const expectedGuessHistory = serializeCombinationHistory(
        [[2, 1, 3, 4], secretCombination].map((digits) =>
          compressCombinationDigits(digits.map(Field))
        )
      );

      expect(zkapp.packedGuessHistory.get().toBigInt()).toEqual(
        expectedGuessHistory.toBigInt()
      );

      const expectedClueHistory = serializeClueHistory(
        [
          [1, 1, 2, 2],
          [2, 2, 2, 2],
        ].map((digits) => serializeClue(digits.map(Field)))
      );
      expect(zkapp.packedClueHistory.get().toBigInt()).toEqual(
        expectedClueHistory.toBigInt()
      );
    });

    it('Reject submitting the same proof again', async () => {
      const expectedMsg =
        'The game has already been finalized and the reward has been claimed!';
      await expectProofSubmissionToFail(
        completedProof,
        codeBreakerPubKey,
        expectedMsg
      );
    });
  });

  describe('codeMaster reimbursed reward', () => {
    beforeAll(async () => {
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
    });

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('codeMaster reimbursed reward succesfully', async () => {
      await claimReward(codeMasterPubKey, codeMasterKey, true);
    });

    // TODO: Add test
  });

  describe('Submitting Correct Game Proof and Claiming Reward', () => {
    beforeAll(async () => {
      await prepareNewGame();
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

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Submit with partial game proof', async () => {
      await submitGameProof(partialProof, codeBreakerPubKey, false);
    });

    it('Reject submitting the same partial proof again', async () => {
      const expectedMsg = 'Cannot submit a proof for a previous turn!';
      await expectProofSubmissionToFail(
        partialProof,
        codeBreakerPubKey,
        expectedMsg
      );
    });

    it('Submit with correct game proof with wrong winner', async () => {
      await submitGameProof(completedProof, codeMasterPubKey, false);
    });

    it('Reject submitting the same proof again', async () => {
      const expectedMsg = 'The game secret has already been solved!';
      await expectProofSubmissionToFail(
        partialProof,
        codeBreakerPubKey,
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

    it('Penalty for codeBreaker', async () => {
      log('Penalty for codeBreaker');
      await forfeitWinForPlayer(refereeKey, codeMasterPubKey);
    });
  });

  describe('Code Master punished for timeout', () => {
    beforeAll(async () => {
      await prepareNewGame();
    });

    it('Penalty for codeMaster', async () => {
      log('Penalty for codeMaster');
      await forfeitWinForPlayer(refereeKey, codeBreakerPubKey);
    });
  });

  describe('Code Master wins', () => {
    beforeAll(async () => {
      await prepareNewGame();
    });

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Intruder tries to make guess before code creaker', async () => {
      const unseparatedGuess = compressCombinationDigits(
        [2, 1, 3, 4].map(Field)
      );

      const guessTx = async () => {
        await makeGuess(intruderPubKey, intruderKey, unseparatedGuess);
      };

      const expectedMsg = 'You are not the codeBreaker of this game!';
      await expect(guessTx()).rejects.toThrowError(expectedMsg);
    });

    it('makeGuess method', async () => {
      const unseparatedGuess = compressCombinationDigits(
        [2, 1, 3, 4].map(Field)
      );

      await makeGuess(codeBreakerPubKey, codeBreakerKey, unseparatedGuess);

      const expectedGuessHistory = serializeCombinationHistory(
        [[2, 1, 3, 4]].map((digits) =>
          compressCombinationDigits(digits.map(Field))
        )
      );
      expect(zkapp.packedGuessHistory.get().toBigInt()).toEqual(
        expectedGuessHistory.toBigInt()
      );
    });

    it('Intruder tries to give clue', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      const giveClueTx = async () => {
        await giveClue(
          intruderPubKey,
          intruderKey,
          unseparatedCombination,
          codeMasterSalt
        );
      };

      const expectedMsg =
        'Only the codeMaster of this game is allowed to give clue!';
      await expect(giveClueTx()).rejects.toThrowError(expectedMsg);
    });

    it('giveClue method', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        unseparatedCombination,
        codeMasterSalt
      );

      const expectedClueHistory = serializeClueHistory(
        [[1, 1, 2, 2]].map((digits) => serializeClue(digits.map(Field)))
      );
      expect(zkapp.packedClueHistory.get().toBigInt()).toEqual(
        expectedClueHistory.toBigInt()
      );
    });

    it('Intruder tries to make guess again', async () => {
      const unseparatedGuess = compressCombinationDigits(
        [1, 2, 3, 4].map(Field)
      );

      const guessTx = async () => {
        await makeGuess(intruderPubKey, intruderKey, unseparatedGuess);
      };

      const expectedMsg = 'You are not the codeBreaker of this game!';
      await expect(guessTx()).rejects.toThrowError(expectedMsg);
    });

    // Skip this test on devnet due to long wait time
    if (testEnvironment !== 'devnet') {
      it('Claim reward successfully', async () => {
        await waitForFinalize();
        await claimReward(codeMasterPubKey, codeMasterKey);
      });
    }
  });
});
