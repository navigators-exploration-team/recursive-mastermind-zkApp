import { MastermindZkApp } from '../Mastermind';

import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  UInt64,
  fetchAccount,
  fetchLastBlock,
  Lightnet,
} from 'o1js';

import { GameState, Clue, Combination } from '../utils';

import { StepProgram, StepProgramProof } from '../stepProgram';

import {
  generateTestProofs,
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramMakeGuess,
} from './testUtils';
import { players } from './mock';
import { MAX_ATTEMPTS, PER_TURN_GAME_DURATION } from '../constants';

describe('Mastermind ZkApp Tests', () => {
  // Global variables
  const testEnvironment = process.env.TEST_ENV ?? 'local';
  const logsEnabled = process.env.LOGS_ENABLED === '1';
  const localTest = testEnvironment === 'local';
  let fee = localTest ? 0 : 1e9;
  let proofsEnabled = false;
  let REWARD_AMOUNT = 1e10;
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
  let expectedGuessHistory: Field;
  let expectedClueHistory: Field;

  // Proofs
  let partialProof: StepProgramProof;
  let completedProof: StepProgramProof;
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
   * @param secretCombinationNumbers The secret combination
   * @param salt The salt to use protecting from pre-image attacks
   * @param maxAttempt Number of max attempts allowed
   * @param refereeKey Key of the referee
   */
  async function initializeGame(
    zkapp: MastermindZkApp,
    deployerKey: PrivateKey,
    secretCombinationNumbers: number[],
    salt: Field,
    refereeKey: PrivateKey
  ) {
    const deployerAccount = deployerKey.toPublicKey();
    const refereeAccount = refereeKey.toPublicKey();
    const secretCombination = Combination.from(secretCombinationNumbers);

    const initTx = await Mina.transaction(
      { sender: deployerAccount, fee },
      async () => {
        await zkapp.initGame(
          secretCombination,
          salt,
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
    secretCombinationNumbers: number[],
    salt: Field,
    refereeKey: PrivateKey,
    expectedMsg?: string
  ) {
    const deployerAccount = deployerKey.toPublicKey();
    const refereeAccount = refereeKey.toPublicKey();
    const secretCombination = new Combination({
      digits: secretCombinationNumbers.map((n) => Field(n)),
    });

    try {
      const tx = await Mina.transaction(
        { sender: deployerAccount, fee },
        async () => {
          await zkapp.initGame(
            secretCombination,
            salt,
            refereeAccount,
            UInt64.from(REWARD_AMOUNT)
          );
        }
      );
      await waitTransactionAndFetchAccount(tx, [deployerKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
      return;
    }
    throw new Error('Game initialization should have failed');
  }

  /**
   * Deploy and initialize the game.
   * @param zkapp The MastermindZkApp instance
   * @param deployerKey Key of the account funding the deploy
   * @param zkappPrivateKey Key of the new zkApp
   * @param secretCombinationNumbers The secret combination
   * @param salt The salt to use protecting from pre-image attacks
   * @param refereeKey Key of the referee
   */
  async function deployAndInitializeGame(
    zkapp: MastermindZkApp,
    deployerKey: PrivateKey,
    zkappPrivateKey: PrivateKey,
    secretCombinationNumbers: number[],
    salt: Field,
    refereeKey: PrivateKey
  ) {
    const deployerAccount = deployerKey.toPublicKey();
    const refereeAccount = refereeKey.toPublicKey();
    const secretCombination = Combination.from(secretCombinationNumbers);

    const tx = await Mina.transaction(
      { sender: deployerAccount, fee },
      async () => {
        AccountUpdate.fundNewAccount(deployerAccount);
        await zkapp.deploy();
        await zkapp.initGame(
          secretCombination,
          salt,
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
      return;
    }
    throw new Error('Proof submission should have failed');
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
      return;
    }
    throw new Error('Claim reward should have failed');
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
      return;
    }
    throw new Error('Accept game should have failed');
  }

  /**
   * Helper function to make a guess.
   */
  async function makeGuess(
    player: PublicKey,
    playerKey: PrivateKey,
    guessCombination: Combination
  ) {
    await fetchAccounts([zkappAddress]);
    const guessTx = await Mina.transaction(
      { sender: player, fee },
      async () => {
        await zkapp.makeGuess(guessCombination);
      }
    );

    await waitTransactionAndFetchAccount(guessTx, [playerKey], [zkappAddress]);
  }

  /**
   * Helper function to expect make guess to fail.
   */
  async function expectMakeGuessToFail(
    player: PublicKey,
    playerKey: PrivateKey,
    guessCombination: Combination,
    expectedMsg?: string
  ) {
    try {
      const tx = await Mina.transaction({ sender: player, fee }, async () => {
        await zkapp.makeGuess(guessCombination);
      });
      await waitTransactionAndFetchAccount(tx, [playerKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
      return;
    }
    throw new Error('Make guess should have failed');
  }

  /**
   * Helper function to give a clue.
   */
  async function giveClue(
    player: PublicKey,
    playerKey: PrivateKey,
    secretCombination: Combination,
    salt: Field
  ) {
    await fetchAccounts([zkappAddress]);
    const clueTx = await Mina.transaction({ sender: player, fee }, async () => {
      await zkapp.giveClue(secretCombination, salt);
    });

    await waitTransactionAndFetchAccount(clueTx, [playerKey], [zkappAddress]);
  }

  /**
   * Helper function to expect give clue to fail.
   */
  async function expectGiveClueToFail(
    player: PublicKey,
    playerKey: PrivateKey,
    secretCombination: Combination,
    salt: Field,
    expectedMsg?: string
  ) {
    try {
      const tx = await Mina.transaction({ sender: player, fee }, async () => {
        await zkapp.giveClue(secretCombination, salt);
      });
      await waitTransactionAndFetchAccount(tx, [playerKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
      return;
    }
    throw new Error('Give clue should have failed');
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
   * Helper function to expect forfeitWin to fail.
   */
  async function expectForfeitWinToFail(
    playerPubKey: PublicKey,
    expectedMsg?: string,
    senderKey: PrivateKey = refereeKey
  ) {
    try {
      const tx = await Mina.transaction(
        { sender: senderKey.toPublicKey(), fee },
        async () => {
          await zkapp.forfeitWin(playerPubKey);
        }
      );
      await waitTransactionAndFetchAccount(tx, [senderKey]);
    } catch (error: any) {
      log(error);
      expect(error.message).toContain(expectedMsg);
      return;
    }
    throw new Error('Forfeit win should have failed');
  }

  /**
   * Helper function to fetch the latest block and return the global slot
   */
  async function getGlobalSlot() {
    const latestBlock = await fetchLastBlock(MINA_NODE_ENDPOINT);

    return latestBlock.globalSlotSinceGenesis.toBigint();
  }

  async function fetchSlotNumber() {
    if (localTest) {
      return Mina.getNetworkState().globalSlotSinceGenesis.toBigint();
    } else {
      const latestBlock = await fetchLastBlock(MINA_NODE_ENDPOINT);
      return latestBlock.globalSlotSinceGenesis.toBigint();
    }
  }

  /**
   * Helper function to wait for a specific slot length.
   */
  async function waitFor(slotLength: number) {
    if (localTest) {
      // Move the global slot forward
      const before = await fetchSlotNumber();
      Local.incrementGlobalSlot(slotLength);
      const after = await fetchSlotNumber();
      log(`Global slot moved from ${before} to ${after}`);
      return;
    } else {
      while (true) {
        let currentSlot = await getGlobalSlot();
        if (currentSlot >= BigInt(slotLength)) {
          break;
        }

        // Wait for 3 min
        await new Promise((resolve) => setTimeout(resolve, 3 * 60 * 1000));
        await fetchLastBlock(MINA_NODE_ENDPOINT);
      }
    }
  }

  /**
   * Helper function to wait for SLOT_DURATION.
   */
  async function waitForFinalize() {
    if (localTest) {
      // Move the global slot forward
      const { finalizeSlot } = GameState.unpack(zkapp.compressedState.get());
      Local.setGlobalSlot(finalizeSlot);
    } else {
      // Wait for the game duration
      await fetchAccount({ publicKey: zkappAddress });
      let { finalizeSlot } = GameState.unpack(zkapp.compressedState.get());
      while (true) {
        let currentSlot = await getGlobalSlot();
        if (currentSlot >= finalizeSlot.toBigint()) {
          break;
        }

        // Wait for 3 min
        await new Promise((resolve) => setTimeout(resolve, 3 * 60 * 1000));
        await fetchLastBlock(MINA_NODE_ENDPOINT);
      }
    }
  }

  async function correctProofGeneration() {
    secretCombination = [1, 2, 3, 4];
    // Build a "completedProof" that solves the game
    // This portion uses your StepProgram to create valid proofs off-chain.

    // 1. createGame
    partialProof = await StepProgramCreateGame(
      secretCombination,
      codeMasterSalt,
      codeMasterKey,
      zkappAddress
    );

    // 2. makeGuess
    partialProof = await StepProgramMakeGuess(
      partialProof,
      [2, 1, 3, 4],
      codeBreakerKey,
      zkappAddress
    );

    // 3. giveClue
    partialProof = await StepProgramGiveClue(
      partialProof,
      secretCombination,
      codeMasterSalt,
      codeMasterKey,
      zkappAddress
    );

    // 4. second guess
    completedProof = await StepProgramMakeGuess(
      partialProof,
      secretCombination,
      codeBreakerKey,
      zkappAddress
    );

    // 5. giveClue & final
    completedProof = await StepProgramGiveClue(
      completedProof,
      secretCombination,
      codeMasterSalt,
      codeMasterKey,
      zkappAddress
    );
  }

  async function wrongProofGeneration() {
    const secretCombination = [7, 1, 6, 3];
    // Base case: Create a new game
    wrongProof = await StepProgramCreateGame(
      secretCombination,
      codeMasterSalt,
      codeMasterKey,
      zkappAddress
    );

    // Make a guess with wrong answer
    wrongProof = await StepProgramMakeGuess(
      wrongProof,
      secretCombination,
      codeBreakerKey,
      zkappAddress
    );

    // Give clue with wrong answer
    wrongProof = await StepProgramGiveClue(
      wrongProof,
      secretCombination,
      codeMasterSalt,
      codeMasterKey,
      zkappAddress
    );
  }

  beforeAll(async () => {
    // Compile StepProgram and MastermindZkApp
    await StepProgram.compile({
      proofsEnabled,
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

    // Prepare brand-new MastermindZkApp for tests
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);
  });

  describe('Deploy & Initialize Flow', () => {
    beforeAll(async () => {
      await wrongProofGeneration();
      secretCombination = [1, 2, 3, 4];
    });
    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Deploy a Mastermind zkApp', async () => {
      await deployZkApp(zkapp, codeMasterKey, zkappPrivateKey);
    });

    describe('Reject other methods before initGame', () => {
      it('Reject calling acceptGame method call', async () => {
        const expectedMsg = 'The game has not been created yet!';
        await expectAcceptGameToFail(
          codeBreakerPubKey,
          codeBreakerKey,
          expectedMsg
        );
      });

      it('Reject calling submitGameProof method call', async () => {
        const expectedMsg =
          'The game has not been accepted by the codeBreaker yet!';
        await expectProofSubmissionToFail(
          wrongProof,
          codeMasterPubKey,
          expectedMsg
        );
      });

      it('Reject makeGuess method call', async () => {
        const expectedMsg =
          'The game has not been accepted by the codeBreaker yet!';
        await expectMakeGuessToFail(
          codeBreakerPubKey,
          codeBreakerKey,
          Combination.from([2, 1, 3, 4]),
          expectedMsg
        );
      });

      it('Reject giveClue method call', async () => {
        const expectedMsg =
          'The game has not been accepted by the codeBreaker yet!';
        await expectGiveClueToFail(
          codeMasterPubKey,
          codeMasterKey,
          Combination.from([2, 1, 3, 4]),
          codeMasterSalt,
          expectedMsg
        );
      });
    });

    describe('Reject invalid initGame calls', () => {
      it('Reject initGame if reward amount is less than 10 Mina: 0 Mina', async () => {
        const expectedMsg =
          'The reward amount must be greater than or equal to 10 MINA!';
        REWARD_AMOUNT = 0;
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          secretCombination,
          codeMasterSalt,
          refereeKey,
          expectedMsg
        );
      });

      it('Reject initGame if reward amount is less than 10 Mina: 9.999.. Mina', async () => {
        const expectedMsg =
          'The reward amount must be greater than or equal to 10 MINA!';
        REWARD_AMOUNT = 1e10 - 1;
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          secretCombination,
          codeMasterSalt,
          refereeKey,
          expectedMsg
        );
        REWARD_AMOUNT = 1e10;
      });

      it('Reject initGame with invalid secret: first digit is greater than 7', async () => {
        const expectedMsg = 'Combination digit 1 is not in range [0, 7]!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [8, 5, 2, 1],
          codeMasterSalt,
          refereeKey,
          expectedMsg
        );
      });

      it('Reject initGame with invalid secret: second digit is greater than 7', async () => {
        const expectedMsg = 'Combination digit 2 is not in range [0, 7]!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [2, 9, 1, 5],
          codeMasterSalt,
          refereeKey,
          expectedMsg
        );
      });

      it('Reject initGame with invalid secret: third digit is greater than 7', async () => {
        const expectedMsg = 'Combination digit 3 is not in range [0, 7]!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [2, 5, 9, 1],
          codeMasterSalt,
          refereeKey,
          expectedMsg
        );
      });

      it('Reject initGame with invalid secret: fourth digit is greater than 7', async () => {
        const expectedMsg = 'Combination digit 4 is not in range [0, 7]!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [2, 5, 1, 9],
          codeMasterSalt,
          refereeKey,
          expectedMsg
        );
      });

      it('Reject initGame with invalid secret: duplicate digits', async () => {
        const expectedMsg = 'Combination digit 2 is not unique!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [1, 1, 2, 3],
          codeMasterSalt,
          refereeKey,
          expectedMsg
        );
      });

      it('Should reject codeMaster with invalid secret combination: second digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [2, 2, 5, 3],
          codeMasterSalt,
          refereeKey,
          expectedErrorMessage
        );
      });

      it('Should reject codeMaster with invalid secret combination: third digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 3 is not unique!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [1, 4, 4, 6],
          codeMasterSalt,
          refereeKey,
          expectedErrorMessage
        );
      });

      it('Should reject codeMaster with invalid secret combination: fourth digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 4 is not unique!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [3, 1, 5, 5],
          codeMasterSalt,
          refereeKey,
          expectedErrorMessage
        );
      });

      it('Should reject codeMaster with invalid secret combination: all digits same and exceeding 7', async () => {
        const expectedErrorMessage =
          'Combination digit 1 is not in range [0, 7]!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [24, 24, 24, 24],
          codeMasterSalt,
          refereeKey,
          expectedErrorMessage
        );
      });

      it('Should reject codeMaster with invalid secret combination: all digits same', async () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        await expectInitializeGameToFail(
          zkapp,
          codeMasterKey,
          [0, 0, 0, 0],
          codeMasterSalt,
          refereeKey,
          expectedErrorMessage
        );
      });
    });

    it('Initializes the game successfully', async () => {
      await initializeGame(
        zkapp,
        codeMasterKey,
        secretCombination,
        codeMasterSalt,
        refereeKey
      );

      let { rewardAmount, finalizeSlot, turnCount, isSolved } =
        GameState.unpack(zkapp.compressedState.get());

      expect(rewardAmount.toBigInt()).toEqual(BigInt(REWARD_AMOUNT));
      expect(finalizeSlot.toBigint()).toEqual(0n);
      expect(turnCount.toBigInt()).toEqual(1n);
      expect(isSolved.toBoolean()).toEqual(false);
      expect(zkapp.codeMasterId.get()).toEqual(
        Poseidon.hash(codeMasterPubKey.toFields())
      );
      expect(zkapp.refereeId.get()).toEqual(
        Poseidon.hash(refereePubKey.toFields())
      );
      expect(zkapp.solutionHash.get()).toEqual(
        Poseidon.hash([
          ...Combination.from(secretCombination).digits,
          codeMasterSalt,
          ...zkappAddress.toFields(),
        ])
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

    it('Reject initializing the game again', async () => {
      const expectedMsg = 'The game has already been initialized!';
      await expectInitializeGameToFail(
        zkapp,
        codeMasterKey,
        secretCombination,
        codeMasterSalt,
        refereeKey,
        expectedMsg
      );
    });
  });

  describe('Accepting a Game and Solve', () => {
    beforeAll(async () => {
      await wrongProofGeneration();
      await correctProofGeneration();
    });
    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    describe('Reject dependent methods before acceptGame', () => {
      it('Reject submitGameProof before acceptGame', async () => {
        const expectedMsg =
          'The game has not been accepted by the codeBreaker yet!';
        await expectProofSubmissionToFail(
          wrongProof,
          codeMasterPubKey,
          expectedMsg
        );
      });

      it('Reject forfeitWin before acceptGame', async () => {
        const expectedMsg =
          'The game has not been accepted by the codeBreaker yet!';
        await expectForfeitWinToFail(codeMasterPubKey, expectedMsg);
      });

      it('Reject makeGuess before acceptGame', async () => {
        const expectedMsg =
          'The game has not been accepted by the codeBreaker yet!';
        await expectMakeGuessToFail(
          codeBreakerPubKey,
          codeBreakerKey,
          Combination.from([2, 1, 3, 4]),
          expectedMsg
        );
      });

      it('Reject giveClue before acceptGame', async () => {
        const expectedMsg =
          'The game has not been accepted by the codeBreaker yet!';
        await expectGiveClueToFail(
          codeMasterPubKey,
          codeMasterKey,
          Combination.from([2, 1, 3, 4]),
          codeMasterSalt,
          expectedMsg
        );
      });
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

    it('Submit with correct game proof and wrong winner pubkey', async () => {
      await submitGameProof(completedProof, codeMasterPubKey, false);

      const { turnCount, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );

      expect(turnCount.toBigInt()).toEqual(
        completedProof.publicOutput.turnCount.toBigInt()
      );
      expect(isSolved.toBoolean()).toEqual(true);
      expect(zkapp.codeBreakerId.get()).toEqual(
        Poseidon.hash(codeBreakerPubKey.toFields())
      );

      expectedGuessHistory = Combination.updateHistory(
        Combination.from(secretCombination),
        Combination.updateHistory(
          Combination.from([2, 1, 3, 4]),
          Field(0),
          Field(0)
        ),
        Field(1)
      );

      expectedClueHistory = Clue.updateHistory(
        new Clue({
          hits: Field(4),
          blows: Field(0),
        }),
        Clue.updateHistory(
          new Clue({
            hits: Field(2),
            blows: Field(2),
          }),
          Field(0),
          Field(0)
        ),
        Field(1)
      );

      expect(zkapp.packedGuessHistory.get().toBigInt()).toEqual(
        expectedGuessHistory.toBigInt()
      );
      expect(zkapp.packedClueHistory.get().toBigInt()).toEqual(
        expectedClueHistory.toBigInt()
      );
    });

    it('Reject submitting the same proof again', async () => {
      const expectedMsg = 'The game secret has already been solved!';
      await expectProofSubmissionToFail(
        completedProof,
        codeBreakerPubKey,
        expectedMsg
      );
    });

    it('Claim reward successfully', async () => {
      await claimReward(codeBreakerPubKey, codeBreakerKey);
    });

    it('Reject submitting after reward claim', async () => {
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
        refereeKey
      );
    });

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('codeMaster reimbursed reward succesfully', async () => {
      await claimReward(codeMasterPubKey, codeMasterKey, true);
    });

    it('Reject accepting the game after reimbursed', async () => {
      const expectedMsg = 'Code master reimbursement is already claimed!';
      await expectAcceptGameToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        expectedMsg
      );
    });
  });

  describe('Submitting Correct Game Proof and Claiming Reward', () => {
    beforeAll(async () => {
      await prepareNewGame();
      await correctProofGeneration();
    });

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Submit with partial game proof', async () => {
      console.log(partialProof.publicOutput.solutionHash.toBigInt());
      console.log(zkapp.solutionHash.get().toBigInt());
      console.log(
        Poseidon.hash([
          ...Combination.from(secretCombination).digits,
          codeMasterSalt,
          ...zkappAddress.toFields(),
        ]).toBigInt()
      );
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

    it('Reject forfeitWin method call after finalization', async () => {
      const expectedMsg =
        'There is no reward in the pool, the game is already finalized!';
      await expectForfeitWinToFail(codeMasterPubKey, expectedMsg);
    });
  });

  describe('Code Breaker punished for timeout', () => {
    beforeAll(async () => {
      await prepareNewGame();
    });

    it('Reject forfeitWin method call of intruder', async () => {
      const expectedMsg = 'You are not the referee of this game!';
      await expectForfeitWinToFail(codeBreakerPubKey, expectedMsg, intruderKey);
    });

    it('Reject forfeitWin method call of codeMaster', async () => {
      const expectedMsg = 'You are not the referee of this game!';
      await expectForfeitWinToFail(
        codeBreakerPubKey,
        expectedMsg,
        codeMasterKey
      );
    });

    it('Reject forfeitWin method call for random player', async () => {
      const expectedMsg =
        'The provided public key is not a player in this game!';
      await expectForfeitWinToFail(
        PrivateKey.random().toPublicKey(),
        expectedMsg
      );
    });

    it('Penalty for codeBreaker', async () => {
      log('Penalty for codeBreaker');
      await forfeitWinForPlayer(refereeKey, codeMasterPubKey);
    });

    it('Reject forfeitWin method call again', async () => {
      const expectedMsg =
        'There is no reward in the pool, the game is already finalized!';
      await expectForfeitWinToFail(codeBreakerPubKey, expectedMsg);
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

    it('Reject forfeitWin method call again', async () => {
      const expectedMsg =
        'There is no reward in the pool, the game is already finalized!';
      await expectForfeitWinToFail(codeMasterPubKey, expectedMsg);
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
      const guessCombination = Combination.from([2, 1, 3, 4]);
      const guessTx = async () => {
        await makeGuess(intruderPubKey, intruderKey, guessCombination);
      };

      const expectedMsg = 'You are not the codeBreaker of this game!';
      await expect(guessTx()).rejects.toThrowError(expectedMsg);
    });

    it('makeGuess method', async () => {
      const guessCombination = Combination.from([2, 1, 3, 4]);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expectedGuessHistory = Combination.updateHistory(
        Combination.from([2, 1, 3, 4]),
        Field(0),
        Field(0)
      );
      expect(zkapp.packedGuessHistory.get().toBigInt()).toEqual(
        expectedGuessHistory.toBigInt()
      );
    });

    it('Intruder tries to give clue', async () => {
      const secretCombination = Combination.from([1, 2, 3, 4]);
      const giveClueTx = async () => {
        await giveClue(
          intruderPubKey,
          intruderKey,
          secretCombination,
          codeMasterSalt
        );
      };

      const expectedMsg =
        'Only the codeMaster of this game is allowed to give clue!';
      await expect(giveClueTx()).rejects.toThrowError(expectedMsg);
    });

    it('giveClue method', async () => {
      const secretCombination = Combination.from([1, 2, 3, 4]);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        secretCombination,
        codeMasterSalt
      );

      expectedClueHistory = Clue.updateHistory(
        new Clue({
          hits: Field(2),
          blows: Field(2),
        }),
        Field(0),
        Field(0)
      );
      expect(zkapp.packedClueHistory.get().toBigInt()).toEqual(
        expectedClueHistory.toBigInt()
      );
    });

    it('Intruder tries to make guess again', async () => {
      const guessCombination = Combination.from([1, 2, 3, 4]);
      const guessTx = async () => {
        await makeGuess(intruderPubKey, intruderKey, guessCombination);
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
  describe('StepProgramProof settlements tests', () => {
    beforeAll(async () => {
      secretCombination = [1, 2, 3, 4];
    });

    beforeEach(async () => {
      await prepareNewGame();
    });

    describe('lower test cases', () => {
      it('1 round not solved', async () => {
        const proof = await generateTestProofs(
          'unsolved',
          1,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeBreakerPubKey, false);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(false);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(3n);

        await expectClaimRewardToFail(
          codeBreakerPubKey,
          codeBreakerKey,
          'You are not the winner of this game!'
        );
      });

      it('1 round solved claim on submit', async () => {
        const proof = await generateTestProofs(
          'codebreaker-victory',
          1,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeBreakerPubKey, true);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(true);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(3n);
      });

      it('1 round solved claim after', async () => {
        const proof = await generateTestProofs(
          'codebreaker-victory',
          1,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeMasterPubKey, false);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(true);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(3n);

        await expectClaimRewardToFail(
          codeMasterPubKey,
          codeMasterKey,
          'You are not the winner of this game!'
        );
      });
    });

    describe('middle test cases', () => {
      it('4 round not solved', async () => {
        const proof = await generateTestProofs(
          'unsolved',
          4,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeBreakerPubKey, false);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(false);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(9n);

        await expectClaimRewardToFail(
          codeBreakerPubKey,
          codeBreakerKey,
          'You are not the winner of this game!'
        );
      });

      it('5 round solved claim on submit', async () => {
        const proof = await generateTestProofs(
          'codebreaker-victory',
          5,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeBreakerPubKey, true);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(true);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(11n);
      });

      it('3 round solved claim after', async () => {
        const proof = await generateTestProofs(
          'codebreaker-victory',
          3,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeMasterPubKey, false);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(true);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(7n);

        await expectClaimRewardToFail(
          codeMasterPubKey,
          codeMasterKey,
          'You are not the winner of this game!'
        );
      });
    });

    describe('upper test cases', () => {
      it('MAX_ATTEMPTS round not solved claim on submit', async () => {
        const proof = await generateTestProofs(
          'codemaster-victory',
          MAX_ATTEMPTS,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeMasterPubKey, true);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(false);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(BigInt(2 * MAX_ATTEMPTS + 1));
      });

      it('MAX_ATTEMPTS round not solved claim after', async () => {
        const proof = await generateTestProofs(
          'codemaster-victory',
          MAX_ATTEMPTS,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeBreakerPubKey, false);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(false);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(BigInt(2 * MAX_ATTEMPTS + 1));

        await expectClaimRewardToFail(
          codeBreakerPubKey,
          codeBreakerKey,
          'You are not the winner of this game!'
        );

        await claimReward(codeMasterPubKey, codeMasterKey);
      });

      it('MAX_ATTEMPTS round solved claim on submit', async () => {
        const proof = await generateTestProofs(
          'codebreaker-victory',
          MAX_ATTEMPTS,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeBreakerPubKey, true);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(true);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(BigInt(2 * MAX_ATTEMPTS + 1));
      });

      it('MAX_ATTEMPTS round solved claim after', async () => {
        const proof = await generateTestProofs(
          'codebreaker-victory',
          MAX_ATTEMPTS,
          codeMasterSalt,
          secretCombination,
          codeBreakerKey,
          codeMasterKey,
          zkappAddress
        );

        await submitGameProof(proof, codeMasterPubKey, false);

        const { turnCount, isSolved } = GameState.unpack(
          zkapp.compressedState.get()
        );

        expect(proof.publicOutput.solutionHash).toEqual(
          zkapp.solutionHash.get()
        );
        expect(turnCount.toBigInt()).toEqual(
          proof.publicOutput.turnCount.toBigInt()
        );
        expect(isSolved.toBoolean()).toEqual(true);
        expect(zkapp.codeBreakerId.get()).toEqual(
          Poseidon.hash(codeBreakerPubKey.toFields())
        );

        expect(turnCount.toBigInt()).toEqual(BigInt(2 * MAX_ATTEMPTS + 1));

        await expectClaimRewardToFail(
          codeMasterPubKey,
          codeMasterKey,
          'You are not the winner of this game!'
        );

        await claimReward(codeBreakerPubKey, codeBreakerKey);
      });
    });
  });

  describe('Submitting Invalid Game Proofs', () => {
    beforeAll(async () => {
      await prepareNewGame();
    });

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Reject submitting a proof with intruder code breaker', async () => {
      const proof = await generateTestProofs(
        'codemaster-victory',
        1,
        codeMasterSalt,
        secretCombination,
        intruderKey,
        codeMasterKey,
        zkappAddress
      );

      const expectedMsg =
        'The code breaker ID is not same as the one stored on-chain!';
      await expectProofSubmissionToFail(proof, intruderPubKey, expectedMsg);
    });

    it('Reject submitting a proof with intruder code master', async () => {
      const proof = await generateTestProofs(
        'codebreaker-victory',
        1,
        codeMasterSalt,
        secretCombination,
        codeBreakerKey,
        intruderKey,
        zkappAddress
      );

      const expectedMsg =
        'The code master ID is not same as the one stored on-chain!';
      await expectProofSubmissionToFail(proof, intruderPubKey, expectedMsg);
    });

    it('Reject submitting a proof with wrong solution hash: wrong secret', async () => {
      const proof = await generateTestProofs(
        'codebreaker-victory',
        1,
        codeMasterSalt,
        [3, 6, 2, 7],
        codeBreakerKey,
        codeMasterKey,
        zkappAddress
      );

      const expectedMsg =
        'The solution hash is not same as the one stored on-chain!';
      await expectProofSubmissionToFail(proof, codeBreakerPubKey, expectedMsg);
    });

    it('Reject submitting a proof with wrong solution hash: wrong salt', async () => {
      const proof = await generateTestProofs(
        'codebreaker-victory',
        1,
        Field.random(),
        secretCombination,
        codeBreakerKey,
        codeMasterKey,
        zkappAddress
      );

      const expectedMsg =
        'The solution hash is not same as the one stored on-chain!';
      await expectProofSubmissionToFail(proof, codeBreakerPubKey, expectedMsg);
    });

    it('Submit a proof with 3rd round then try to submit another one with round 2', async () => {
      let proof = await generateTestProofs(
        'unsolved',
        3,
        codeMasterSalt,
        secretCombination,
        codeBreakerKey,
        codeMasterKey,
        zkappAddress
      );

      await submitGameProof(proof, codeBreakerPubKey, false);

      const expectedMsg = 'Cannot submit a proof for a previous turn!';
      proof = await generateTestProofs(
        'unsolved',
        2,
        codeMasterSalt,
        secretCombination,
        codeBreakerKey,
        codeMasterKey,
        zkappAddress
      );
      await expectProofSubmissionToFail(proof, codeBreakerPubKey, expectedMsg);
    });
  });

  describe('Recovery if offchain recursion is not available', () => {
    let slotNumber: bigint;
    beforeAll(async () => {
      if (testEnvironment === 'local') {
        Local.setGlobalSlot(0);
      }
      secretCombination = [3, 1, 5, 2];
      await prepareNewGame();
      slotNumber = await fetchSlotNumber();
    });

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Code breaker should be able to start game with makeGuess', async () => {
      const guessCombination = Combination.from([2, 1, 3, 4]);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);
      const { turnCount, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );
      expect(turnCount.toBigInt()).toEqual(2n);
      expect(isSolved.toBoolean()).toEqual(false);
      expect(zkapp.packedGuessHistory.get()).toEqual(
        Combination.updateHistory(
          Combination.from([2, 1, 3, 4]),
          Field(0),
          Field(0)
        )
      );
      expect(zkapp.codeBreakerId.get()).toEqual(
        Poseidon.hash(codeBreakerPubKey.toFields())
      );
      expect(zkapp.packedClueHistory.get()).toEqual(Field(0));
    });

    it('Code master should be able to continue game with stepProgramProof with 3rd round', async () => {
      const proof = await generateTestProofs(
        'unsolved',
        3,
        codeMasterSalt,
        secretCombination,
        codeBreakerKey,
        codeMasterKey,
        zkappAddress
      );
      await submitGameProof(proof, codeMasterPubKey, false);
      slotNumber = await fetchSlotNumber();
      const { turnCount, lastPlayedSlot, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );
      expect(turnCount.toBigInt()).toEqual(7n);
      expect(isSolved.toBoolean()).toEqual(false);
      expect(lastPlayedSlot.toBigint()).toEqual(slotNumber);
    });

    it('Code master wait more than PER_TURN_GAME_DURATION and rejected to make guess onchain', async () => {
      await waitFor(PER_TURN_GAME_DURATION + 1);
      const guessCombination = Combination.from([5, 1, 7, 2]);
      await expectMakeGuessToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        guessCombination,
        'You have passed the time limit to make a guess!'
      );
    });

    it('Settle stepProgramProof with unsolved game', async () => {
      const proof = await generateTestProofs(
        'unsolved',
        5,
        codeMasterSalt,
        secretCombination,
        codeBreakerKey,
        codeMasterKey,
        zkappAddress
      );
      await submitGameProof(proof, codeBreakerPubKey, false);
      slotNumber = await fetchSlotNumber();
      const { turnCount, lastPlayedSlot, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );
      expect(turnCount.toBigInt()).toEqual(11n);
      expect(isSolved.toBoolean()).toEqual(false);
      expect(lastPlayedSlot.toBigint()).toEqual(slotNumber);
    });

    it('Intruder tries to make guess and fails', async () => {
      const guessCombination = Combination.from([2, 1, 3, 4]);
      await expectMakeGuessToFail(
        intruderPubKey,
        intruderKey,
        guessCombination,
        'You are not the codeBreaker of this game!'
      );
    });

    it('Code breaker should be able to continue game with makeGuess', async () => {
      const currentGuessHistory = zkapp.packedGuessHistory.get();
      const guessCombination = Combination.from([2, 1, 3, 4]);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      const { turnCount, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );
      expect(zkapp.packedGuessHistory.get()).toEqual(
        Combination.updateHistory(
          Combination.from([2, 1, 3, 4]),
          currentGuessHistory,
          Field(5)
        )
      );

      expect(turnCount.toBigInt()).toEqual(12n);
      expect(isSolved.toBoolean()).toEqual(false);
    });

    it('Intruder tries to give clue and fails', async () => {
      const secretCombination = Combination.from([1, 2, 3, 4]);
      await expectGiveClueToFail(
        intruderPubKey,
        intruderKey,
        secretCombination,
        codeMasterSalt,
        'Only the codeMaster of this game is allowed to give clue!'
      );
    });

    it('Code master should be able to continue game with giveClue', async () => {
      const currentClueHistory = zkapp.packedClueHistory.get();
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      const { turnCount, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );
      expect(turnCount.toBigInt()).toEqual(13n);
      expect(isSolved.toBoolean()).toEqual(false);
      expect(zkapp.packedClueHistory.get()).toEqual(
        Clue.updateHistory(
          new Clue({
            hits: Field(1),
            blows: Field(2),
          }),
          currentClueHistory,
          Field(5)
        )
      );
    });

    it('Code breaker should be able to continue game with makeGuess', async () => {
      const currentGuessHistory = zkapp.packedGuessHistory.get();
      const guessCombination = Combination.from([7, 1, 3, 4]);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      const { turnCount, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );

      expect(zkapp.packedGuessHistory.get()).toEqual(
        Combination.updateHistory(
          Combination.from([7, 1, 3, 4]),
          currentGuessHistory,
          Field(6)
        )
      );
      expect(turnCount.toBigInt()).toEqual(14n);
      expect(isSolved.toBoolean()).toEqual(false);
      expect(zkapp.codeBreakerId.get()).toEqual(
        Poseidon.hash(codeBreakerPubKey.toFields())
      );
    });

    it('Code master should be able to continue game with giveClue and win', async () => {
      const currentClueHistory = zkapp.packedClueHistory.get();
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );
      const { turnCount, isSolved } = GameState.unpack(
        zkapp.compressedState.get()
      );
      expect(turnCount.toBigInt()).toEqual(15n);
      expect(isSolved.toBoolean()).toEqual(false);
      expect(zkapp.packedClueHistory.get()).toEqual(
        Clue.updateHistory(
          new Clue({
            hits: Field(1),
            blows: Field(1),
          }),
          currentClueHistory,
          Field(6)
        )
      );
    });

    it('Code breaker should not be able to continue game with makeGuess', async () => {
      const guessCombination = Combination.from([3, 1, 5, 2]);
      await expectMakeGuessToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        guessCombination,
        'You have reached the number limit of attempts to solve the secret combination!'
      );
    });

    it('Code master should be able to claim reward', async () => {
      await claimReward(codeMasterPubKey, codeMasterKey);
    });
  });

  describe('Play it totally onchain with maximum duration', () => {
    beforeAll(async () => {
      if (testEnvironment === 'local') {
        Local.setGlobalSlot(0);
      }
      secretCombination = [1, 2, 3, 4];
      await prepareNewGame();
    });

    beforeEach(() => {
      log(expect.getState().currentTestName);
    });

    it('Turn 1', async () => {
      const guessCombination = Combination.from([4, 1, 2, 3]);
      await waitFor(PER_TURN_GAME_DURATION);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(2n);

      await waitFor(PER_TURN_GAME_DURATION);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(3n);
    });

    it('Turn 2', async () => {
      const guessCombination = Combination.from([3, 1, 6, 4]);
      await waitFor(PER_TURN_GAME_DURATION);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(4n);

      await waitFor(PER_TURN_GAME_DURATION);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(5n);
    });

    it('Turn 3', async () => {
      const guessCombination = Combination.from([1, 5, 6, 2]);
      await waitFor(PER_TURN_GAME_DURATION);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(6n);

      await waitFor(PER_TURN_GAME_DURATION);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(7n);
    });

    it('Turn 4', async () => {
      const guessCombination = Combination.from([7, 1, 3, 4]);
      await waitFor(PER_TURN_GAME_DURATION);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(8n);

      await waitFor(PER_TURN_GAME_DURATION);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(9n);
    });

    it('Turn 5', async () => {
      const guessCombination = Combination.from([4, 2, 5, 1]);
      await waitFor(PER_TURN_GAME_DURATION);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(10n);

      await waitFor(PER_TURN_GAME_DURATION);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(11n);
    });

    it('Turn 6', async () => {
      const guessCombination = Combination.from([7, 5, 2, 4]);
      await waitFor(PER_TURN_GAME_DURATION);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(12n);

      await waitFor(PER_TURN_GAME_DURATION);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(13n);
    });

    it('Turn 7', async () => {
      const guessCombination = Combination.from([1, 2, 3, 4]);
      await waitFor(PER_TURN_GAME_DURATION);
      await makeGuess(codeBreakerPubKey, codeBreakerKey, guessCombination);

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(14n);

      await waitFor(PER_TURN_GAME_DURATION);
      await giveClue(
        codeMasterPubKey,
        codeMasterKey,
        Combination.from(secretCombination),
        codeMasterSalt
      );

      expect(
        GameState.unpack(zkapp.compressedState.get()).turnCount.toBigInt()
      ).toEqual(15n);
    });

    it('Code breaker should not be able to continue game with makeGuess', async () => {
      const guessCombination = Combination.from([3, 1, 5, 2]);
      await expectMakeGuessToFail(
        codeBreakerPubKey,
        codeBreakerKey,
        guessCombination,
        'The game secret has already been solved!'
      );
    });

    it('Code master should not be able to claim reward', async () => {
      await expectClaimRewardToFail(
        codeMasterPubKey,
        codeMasterKey,
        'You are not the winner of this game!'
      );
    });

    it('Claim reward', async () => {
      await claimReward(codeBreakerPubKey, codeBreakerKey);
    });
  });
});
