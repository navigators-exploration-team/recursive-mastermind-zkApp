import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Poseidon,
  AccountUpdate,
  UInt64,
  PublicKey,
  UInt32,
  Permissions,
  Struct,
  Provable,
  Bool,
  UInt8,
} from 'o1js';

import { Combination, Clue, GameState } from './utils.js';
import { StepProgramProof } from './stepProgram.js';
import { MAX_ATTEMPTS, PER_ATTEMPT_GAME_DURATION } from './constants.js';

export {
  NewGameEvent,
  GameAcceptEvent,
  RewardClaimEvent,
  ForfeitGameEvent,
  ProofSubmissionEvent,
  MastermindZkApp,
};

class NewGameEvent extends Struct({
  rewardAmount: UInt64,
}) {}

class GameAcceptEvent extends Struct({
  codeBreakerPubKey: PublicKey,
  finalizeSlot: UInt32,
}) {}

class RewardClaimEvent extends Struct({
  claimer: PublicKey,
}) {}

class ForfeitGameEvent extends Struct({
  playerPubKey: PublicKey,
}) {}

class ProofSubmissionEvent extends Struct({
  turnCount: UInt8,
  isSolved: Bool,
  maxAttemptsExceeded: Bool,
}) {}

class MastermindZkApp extends SmartContract {
  /**
   * `compressedState` is the compressed state variable that stores the following game states:
   * - `rewardAmount`: The amount of tokens to be rewarded to the codeBreaker upon solving the game.
   * - `finalizeSlot`: The slot at which the game will be finalized.
   * - `maxAttempts`: The maximum number of total turns allowed for the game.
   * - `turnCount`: The current turn count of the game.
   * - `isSolved`: A boolean indicating whether the game has been solved or not.
   */
  @state(Field) compressedState = State<Field>();

  /**
   * `codeMasterId` is the ID of the codeMaster `Hash(PubKey)` who created the game.
   */
  @state(Field) codeMasterId = State<Field>();

  /**
   * `codeBreakerId` is the ID of the codeBreaker `Hash(PubKey)` who accepted the game.
   */
  @state(Field) codeBreakerId = State<Field>();

  /**
   * `refereeId` is the ID of the referee `Hash(PubKey)` who penalizes misbehaving players.
   */
  @state(Field) refereeId = State<Field>();

  /**
   * `solutionHash` is the hash of the secret combination and salt.
   */
  @state(Field) solutionHash = State<Field>();

  /**
   * `packedGuessHistory` is the compressed state variable that stores the history of guesses made by the codeBreaker.
   */
  @state(Field) packedGuessHistory = State<Field>();

  /**
   * `packedClueHistory` is the compressed state variable that stores the history of clues given by the codeMaster.
   */
  @state(Field) packedClueHistory = State<Field>();

  readonly events = {
    newGame: NewGameEvent,
    gameAccepted: GameAcceptEvent,
    rewardClaimed: RewardClaimEvent,
    gameForfeited: ForfeitGameEvent,
    proofSubmitted: ProofSubmissionEvent,
  };

  /**
   * Asserts that the game is still ongoing. For internal use only.
   */
  async assertNotFinalized() {
    const finalizeSlot = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    ).finalizeSlot;

    finalizeSlot
      .equals(UInt32.zero)
      .and(this.codeBreakerId.getAndRequireEquals().equals(Field.from(0)).not())
      .assertFalse(
        'The game has already been finalized and the reward has been claimed!'
      );

    finalizeSlot.assertGreaterThan(
      UInt32.zero,
      'The game has not been accepted by the codeBreaker yet!'
    );

    const currentSlot = this.network.globalSlotSinceGenesis.get();
    this.network.globalSlotSinceGenesis.requireBetween(
      currentSlot,
      finalizeSlot.sub(UInt32.from(1))
    );

    currentSlot.assertLessThan(
      finalizeSlot,
      'The game has already been finalized!'
    );

    return finalizeSlot;
  }

  async deploy() {
    await super.deploy();

    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible(),
      send: Permissions.proof(),
    });
  }

  /**
   * Initializes the game, sets the secret combination, maximum attempts, referee, and reward amount.
   * @param unseparatedSecretCombination The secret combination to be solved by the codeBreaker.
   * @param salt The salt to be used in the hash function to prevent pre-image attacks.
   * @param refereePubKey The public key of the referee who will penalize misbehaving players.
   * @param rewardAmount The amount of tokens to be rewarded to the codeBreaker upon solving the game.
   */
  @method async initGame(
    secretCombination: Combination,
    salt: Field,
    refereePubKey: PublicKey,
    rewardAmount: UInt64
  ) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertFalse('The game has already been initialized!');

    super.init();

    rewardAmount.assertGreaterThan(
      UInt64.zero,
      'The reward amount must be greater than zero!'
    );

    const refereeId = Poseidon.hash(refereePubKey.toFields());
    this.refereeId.set(refereeId);

    secretCombination.validate();

    const solutionHash = Poseidon.hash([...secretCombination.digits, salt]);
    this.solutionHash.set(solutionHash);

    const sender = this.sender.getUnconstrained();

    const codeMasterId = Poseidon.hash(sender.toFields());
    this.codeMasterId.set(codeMasterId);

    const codeMasterUpdate = AccountUpdate.createSigned(sender);
    codeMasterUpdate.send({ to: this.address, amount: rewardAmount });

    const gameState = new GameState({
      rewardAmount,
      finalizeSlot: UInt32.zero,
      turnCount: UInt8.from(1),
      isSolved: Bool(false),
    });

    this.compressedState.set(gameState.pack());

    this.emitEvent(
      'newGame',
      new NewGameEvent({
        rewardAmount,
      })
    );
  }

  /**
   * Codebreaker accepts the game and pays the reward to contract.
   * @throws If the game has not been initialized yet, or if the game has not been created yet.
   */
  @method async acceptGame() {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    this.codeBreakerId
      .getAndRequireEquals()
      .assertEquals(
        Field.from(0),
        'The game has already been accepted by the codeBreaker!'
      );

    const { rewardAmount, turnCount } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    turnCount.assertEquals(1, 'The game has not been created yet!');

    rewardAmount.assertGreaterThan(
      UInt64.zero,
      'Code master reimbursement is already claimed!'
    );

    const sender = this.sender.getUnconstrained();
    const codeBreakerUpdate = AccountUpdate.createSigned(sender);
    codeBreakerUpdate.send({ to: this.address, amount: rewardAmount });

    const codeBreakerId = Poseidon.hash(sender.toFields());
    this.codeBreakerId.set(codeBreakerId);

    const currentSlot = this.network.globalSlotSinceGenesis.get();
    this.network.globalSlotSinceGenesis.requireBetween(
      currentSlot,
      currentSlot.add(UInt32.from(5))
    );

    // Set the finalize slot to be maxAttempts * PER_ATTEMPT_GAME_DURATION slots after the current slot
    const finalizeSlot = currentSlot.add(
      UInt32.from(MAX_ATTEMPTS).mul(PER_ATTEMPT_GAME_DURATION)
    );

    const gameState = new GameState({
      rewardAmount: rewardAmount.add(rewardAmount),
      finalizeSlot,
      turnCount,
      isSolved: Bool(false),
    });

    this.compressedState.set(gameState.pack());

    this.emitEvent(
      'gameAccepted',
      new GameAcceptEvent({
        codeBreakerPubKey: sender,
        finalizeSlot,
      })
    );
  }

  /**
   * Submits a proof to on-chain that includes the all game steps and the final solution if the game is solved.
   * @param proof The proof generated by using `StepProgramProof` zkProgram.
   * @throws If the game has not been initialized or created yet, or if the game has already been solved.
   */
  @method async submitGameProof(
    proof: StepProgramProof,
    winnerPubKey: PublicKey
  ) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const codeMasterId = this.codeMasterId.getAndRequireEquals();
    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();
    codeBreakerId.assertNotEquals(
      Field.from(0),
      'The game has not been accepted by the codeBreaker yet!'
    );

    const finalizeSlot = await this.assertNotFinalized();

    let { rewardAmount, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    isSolved.assertFalse('The game secret has already been solved!');

    proof.verify();

    proof.publicOutput.codeBreakerId.assertEquals(
      codeBreakerId,
      'The code breaker ID is not same as the one stored on-chain!'
    );

    proof.publicOutput.codeMasterId.assertEquals(
      codeMasterId,
      'The code master ID is not same as the one stored on-chain!'
    );

    proof.publicOutput.solutionHash.assertEquals(
      this.solutionHash.getAndRequireEquals(),
      'The solution hash is not same as the one stored on-chain!'
    );

    proof.publicOutput.turnCount.assertGreaterThan(
      turnCount,
      'Cannot submit a proof for a previous turn!'
    );

    const maxAttemptsExceeded = proof.publicOutput.turnCount.greaterThanOrEqual(
      MAX_ATTEMPTS * 2
    );

    const clue = Clue.decompress(proof.publicOutput.lastcompressedClue);
    isSolved = clue.isSolved().and(maxAttemptsExceeded.not());

    this.packedGuessHistory.set(proof.publicOutput.packedGuessHistory);
    this.packedClueHistory.set(proof.publicOutput.packedClueHistory);

    const winnerId = Poseidon.hash(winnerPubKey.toFields());

    const isCodeMaster = codeMasterId.equals(winnerId);
    const isCodeBreaker = codeBreakerId.equals(winnerId);

    const codeMasterWinByMaxAttempts = isSolved
      .not()
      .and(proof.publicOutput.turnCount.greaterThanOrEqual(MAX_ATTEMPTS * 2));

    const codeBreakerWin = isSolved;

    const shouldSendReward = isCodeMaster
      .and(codeMasterWinByMaxAttempts)
      .or(isCodeBreaker.and(codeBreakerWin));

    const recipient = AccountUpdate.createIf(shouldSendReward, winnerPubKey);
    const amountToSend = Provable.if(
      shouldSendReward,
      rewardAmount,
      UInt64.zero
    );
    this.send({ to: recipient, amount: amountToSend });

    const gameState = new GameState({
      rewardAmount: Provable.if(shouldSendReward, UInt64.zero, rewardAmount),
      finalizeSlot: Provable.if(shouldSendReward, UInt32.zero, finalizeSlot),
      turnCount: proof.publicOutput.turnCount,
      isSolved,
    });

    this.compressedState.set(gameState.pack());

    this.emitEvent(
      'proofSubmitted',
      new ProofSubmissionEvent({
        turnCount: proof.publicOutput.turnCount,
        isSolved,
        maxAttemptsExceeded,
      })
    );
  }

  /**
   * Allows the winner to claim the reward.
   * @throws If the game has not been finalized yet, or if the caller is not the winner.
   */
  @method async claimReward() {
    let { rewardAmount, finalizeSlot, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    const currentSlot =
      this.network.globalSlotSinceGenesis.getAndRequireEquals();
    let isFinalized = currentSlot.greaterThanOrEqual(finalizeSlot);

    const claimer = this.sender.getAndRequireSignature();

    const codeMasterId = this.codeMasterId.getAndRequireEquals();
    const computedCodeMasterId = Poseidon.hash(claimer.toFields());

    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();
    const computedCodebreakerId = Poseidon.hash(claimer.toFields());

    const isCodeMaster = codeMasterId.equals(computedCodeMasterId);
    const isCodeBreaker = codeBreakerId.equals(computedCodebreakerId);

    // Code Master wins if the game is finalized and the codeBreaker has not solved the secret combination yet
    // Also if game is not accepted by the codeBreaker yet, the finalize slot is remains 0
    // So code master can use this method to reimburse the reward before the code breaker accepts the game
    const codeMasterWinByFinalize = isSolved.not().and(isFinalized);
    // Code Master wins if the codeBreaker has reached the maximum number of attempts without solving the secret combination
    const codeMasterWinByMaxAttempts = isSolved
      .not()
      .and(turnCount.greaterThanOrEqual(MAX_ATTEMPTS * 2));

    const codeBreakerWin = isSolved;

    isCodeMaster
      .or(isCodeBreaker)
      .assertTrue('You are not the codeMaster or codeBreaker of this game!');

    const isWinner = isCodeMaster
      .and(codeMasterWinByFinalize.or(codeMasterWinByMaxAttempts))
      .or(isCodeBreaker.and(codeBreakerWin));

    isWinner.assertTrue('You are not the winner of this game!');

    this.send({ to: claimer, amount: rewardAmount });

    const gameState = new GameState({
      rewardAmount: UInt64.zero,
      finalizeSlot: UInt32.zero,
      turnCount,
      isSolved,
    });

    this.compressedState.set(gameState.pack());

    this.emitEvent(
      'rewardClaimed',
      new RewardClaimEvent({
        claimer,
      })
    );
  }

  /**
   * Allows the referee to forfeit the game and reward the winner.
   * @param playerPubKey The public key of the player to be rewarded.
   * @throws If the game has not been finalized yet, if the caller is not the referee, or if the provided public key is not a player in the game.
   */
  @method async forfeitWin(playerPubKey: PublicKey) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const refereeId = this.refereeId.getAndRequireEquals();
    const computedRefereeId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    refereeId.assertEquals(
      computedRefereeId,
      'You are not the referee of this game!'
    );

    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();
    const codeMasterId = this.codeMasterId.getAndRequireEquals();

    codeBreakerId.assertNotEquals(
      Field.from(0),
      'The game has not been accepted by the codeBreaker yet!'
    );

    const playerID = Poseidon.hash(playerPubKey.toFields());
    const isCodeBreaker = codeBreakerId.equals(playerID);
    const isCodeMaster = codeMasterId.equals(playerID);

    isCodeBreaker
      .or(isCodeMaster)
      .assertTrue('The provided public key is not a player in this game!');

    let { rewardAmount, finalizeSlot, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    rewardAmount.assertGreaterThan(
      UInt64.zero,
      'There is no reward in the pool!'
    );

    this.send({ to: playerPubKey, amount: rewardAmount });

    const gameState = new GameState({
      rewardAmount: UInt64.zero,
      finalizeSlot,
      turnCount,
      isSolved,
    });
    this.compressedState.set(gameState.pack());

    this.emitEvent(
      'gameForfeited',
      new ForfeitGameEvent({
        playerPubKey,
      })
    );
  }

  /**
   * Allows the codeBreaker to make a guess outside `stepProof` and then gives it to the codeMaster to provide a clue.
   * @param unseparatedGuess The guess combination made by the codeBreaker.
   * @throws If the game has not been initialized yet, or if the game has already been finalized.
   */
  @method async makeGuess(guessCombination: Combination) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    await this.assertNotFinalized();

    let { rewardAmount, finalizeSlot, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    turnCount.assertGreaterThan(
      UInt8.from(0),
      'The game has not been accepted by the codeBreaker yet!'
    );

    isSolved.assertFalse('The game secret has already been solved!');

    turnCount.value
      .isEven()
      .not()
      .assertTrue('Please wait for the codeMaster to give you a clue!');

    turnCount.assertLessThan(
      MAX_ATTEMPTS * 2,
      'You have reached the number limit of attempts to solve the secret combination!'
    );

    const computedCodebreakerId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();

    computedCodebreakerId.assertEquals(
      codeBreakerId,
      'You are not the codeBreaker of this game!'
    );

    guessCombination.validate();

    const packedGuessHistory = Combination.updateHistory(
      guessCombination,
      this.packedGuessHistory.getAndRequireEquals(),
      turnCount.value.sub(1).div(2)
    );

    this.packedGuessHistory.set(packedGuessHistory);

    const gameState = new GameState({
      rewardAmount,
      finalizeSlot,
      turnCount: turnCount.add(1),
      isSolved,
    });
    this.compressedState.set(gameState.pack());
  }

  /**
   * Allows the codeMaster to give a clue to the codeBreaker outside `stepProof`.
   * @param unseparatedSecretCombination The secret combination to be solved by the codeBreaker.
   * @param salt The salt to be used in the hash function to prevent pre-image attacks.
   * @throws If the game has not been initialized yet, or if the game has already been finalized.
   */
  @method async giveClue(secretCombination: Combination, salt: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    await this.assertNotFinalized();

    let { rewardAmount, finalizeSlot, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    const computedCodemasterId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    this.codeMasterId
      .getAndRequireEquals()
      .assertEquals(
        computedCodemasterId,
        'Only the codeMaster of this game is allowed to give clue!'
      );

    turnCount.assertLessThanOrEqual(
      MAX_ATTEMPTS * 2,
      'The codeBreaker has finished the number of attempts without solving the secret combination!'
    );

    isSolved.assertFalse(
      'The codeBreaker has already solved the secret combination!'
    );

    turnCount.assertGreaterThan(
      UInt8.from(0),
      'Game has not been accepted by the codeBreaker yet!'
    );

    const isCodemasterTurn = turnCount.value.isEven();
    isCodemasterTurn.assertTrue(
      'Please wait for the codeBreaker to make a guess!'
    );

    const computedSolutionHash = Poseidon.hash([
      ...secretCombination.digits,
      salt,
    ]);
    this.solutionHash
      .getAndRequireEquals()
      .assertEquals(
        computedSolutionHash,
        'The secret combination is not compliant with the stored hash on-chain!'
      );

    const lastGuess = Combination.getElementFromHistory(
      this.packedGuessHistory.getAndRequireEquals(),
      turnCount.div(2).sub(1).value
    );

    const clue = Clue.giveClue(lastGuess.digits, secretCombination.digits);
    const packedClueHistory = Clue.updateHistory(
      clue,
      this.packedClueHistory.getAndRequireEquals(),
      turnCount.div(2).sub(1).value
    );

    this.packedClueHistory.set(packedClueHistory);

    isSolved = isSolved.or(clue.isSolved());
    const gameState = new GameState({
      rewardAmount,
      finalizeSlot,
      turnCount: turnCount.add(1),
      isSolved,
    });

    this.compressedState.set(gameState.pack());
  }
}
