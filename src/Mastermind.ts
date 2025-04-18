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
  codemasterPubKey: PublicKey,
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
   * `packedGuessHistory` is the compressed state variable that stores the history of guesses made by the code breaker.
   */
  @state(Field) packedGuessHistory = State<Field>();

  /**
   * `packedClueHistory` is the compressed state variable that stores the history of clues given by the code master.
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
  async assertNotFinalized(finalizeSlot: UInt32, isSolved: Bool) {
    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();
    // When reward claimed, finalizeSlot is set to 0, but codeBreakerId is not
    finalizeSlot
      .equals(UInt32.zero)
      .and(codeBreakerId.equals(Field.from(0)).not())
      .assertFalse(
        'The game has already been finalized and the reward has been claimed!'
      );

    finalizeSlot
      .equals(UInt32.zero)
      .or(codeBreakerId.equals(Field.from(0)))
      .assertFalse('The game has not been accepted by the codeBreaker yet!');

    const currentSlot = this.network.globalSlotSinceGenesis.get();
    // extend network precondition in case of skipped slots
    this.network.globalSlotSinceGenesis.requireBetween(
      currentSlot,
      finalizeSlot.sub(UInt32.from(1))
    );

    currentSlot.assertLessThan(
      finalizeSlot,
      'The game has already been finalized!'
    );

    isSolved.assertFalse('The game secret has already been solved!');

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
   * @param secretCombination The secret combination to be solved by the codeBreaker.
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

    secretCombination.validate();
    rewardAmount.assertGreaterThanOrEqual(
      UInt64.from(1e10),
      'The reward amount must be greater than or equal to 10 MINA!'
    );

    const codemasterPubKey = this.sender.getUnconstrained();

    const codeMasterUpdate = AccountUpdate.createSigned(codemasterPubKey);
    codeMasterUpdate.send({ to: this.address, amount: rewardAmount });

    const gameState = new GameState({
      rewardAmount,
      finalizeSlot: UInt32.from(0),
      turnCount: UInt8.from(1),
      lastPlayedSlot: UInt32.from(0),
      isSolved: Bool(false),
    });

    this.solutionHash.set(Poseidon.hash([...secretCombination.digits, salt]));
    this.codeMasterId.set(Poseidon.hash(codemasterPubKey.toFields()));
    this.refereeId.set(Poseidon.hash(refereePubKey.toFields()));
    this.compressedState.set(gameState.pack());

    this.emitEvent(
      'newGame',
      new NewGameEvent({
        codemasterPubKey,
        rewardAmount,
      })
    );
  }

  /**
   * Code breaker accepts the game and pays the reward to contract.
   *
   * @throws If the game has not been created yet, or if the game has already been accepted by the code breaker.
   */
  @method async acceptGame() {
    const { rewardAmount, turnCount } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );
    turnCount.assertEquals(1, 'The game has not been created yet!');

    this.codeBreakerId
      .getAndRequireEquals()
      .assertEquals(
        Field.from(0),
        'The game has already been accepted by the codeBreaker!'
      );

    rewardAmount.assertGreaterThanOrEqual(
      UInt64.from(1e10),
      'Code master reimbursement is already claimed!'
    );

    const sender = this.sender.getUnconstrained();

    const codeBreakerUpdate = AccountUpdate.createSigned(sender);
    codeBreakerUpdate.send({ to: this.address, amount: rewardAmount });

    const currentSlot = this.network.globalSlotSinceGenesis.get();
    this.network.globalSlotSinceGenesis.requireBetween(
      currentSlot,
      currentSlot.add(UInt32.from(1))
    );

    const finalizeSlot = currentSlot.add(
      UInt32.from(MAX_ATTEMPTS).mul(PER_ATTEMPT_GAME_DURATION)
    );

    const gameState = new GameState({
      rewardAmount: rewardAmount.add(rewardAmount),
      finalizeSlot,
      lastPlayedSlot: UInt32.from(0),
      turnCount,
      isSolved: Bool(false),
    });

    this.codeBreakerId.set(Poseidon.hash(sender.toFields()));
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
   *
   * @param proof The proof generated by using `StepProgramProof` zkProgram.
   * @param winnerPubKey The public key of the winner.
   *
   * @throws If the game has not been accepted yet, or if the game has already been finalized.
   */
  @method async submitGameProof(
    proof: StepProgramProof,
    winnerPubKey: PublicKey
  ) {
    proof.verify();

    const codeMasterId = this.codeMasterId.getAndRequireEquals();
    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();
    let { finalizeSlot, rewardAmount, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    await this.assertNotFinalized(finalizeSlot, isSolved);

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
      lastPlayedSlot: UInt32.from(0),
      isSolved,
    });

    this.compressedState.set(gameState.pack());
    this.packedGuessHistory.set(proof.publicOutput.packedGuessHistory);
    this.packedClueHistory.set(proof.publicOutput.packedClueHistory);

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
      lastPlayedSlot: UInt32.from(0),
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
   * Allows the referee to forfeit the game and send the reward to the player.
   * @param playerPubKey The public key of the player to be rewarded.
   * @throws If the game has been finalized, if the caller is not the referee, or if the provided public key is not a player in the game.
   */
  @method async forfeitWin(playerPubKey: PublicKey) {
    const refereeId = this.refereeId.getAndRequireEquals();
    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();
    const codeMasterId = this.codeMasterId.getAndRequireEquals();
    let { rewardAmount, finalizeSlot, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    refereeId.assertEquals(
      Poseidon.hash(this.sender.getAndRequireSignature().toFields()),
      'You are not the referee of this game!'
    );

    codeBreakerId.assertNotEquals(
      Field.from(0),
      'The game has not been accepted by the codeBreaker yet!'
    );

    rewardAmount
      .equals(UInt64.zero)
      .assertFalse(
        'There is no reward in the pool, the game is already finalized!'
      );

    const playerID = Poseidon.hash(playerPubKey.toFields());
    const isCodeBreaker = codeBreakerId.equals(playerID);
    const isCodeMaster = codeMasterId.equals(playerID);

    isCodeBreaker
      .or(isCodeMaster)
      .assertTrue('The provided public key is not a player in this game!');

    this.send({ to: playerPubKey, amount: rewardAmount });

    const gameState = new GameState({
      rewardAmount: UInt64.zero,
      finalizeSlot,
      lastPlayedSlot: UInt32.from(0),
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
   * @param guessCombination The guess combination made by the codeBreaker.
   * @throws If the game has not been accepted yet, or if the game has already been finalized.
   * @throws If the game has already been solved, or if the guess is not valid.
   */
  @method async makeGuess(guessCombination: Combination) {
    let { rewardAmount, finalizeSlot, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    await this.assertNotFinalized(finalizeSlot, isSolved);

    turnCount.value
      .isEven()
      .not()
      .assertTrue('Please wait for the codeMaster to give you a clue!');

    turnCount.assertLessThan(
      MAX_ATTEMPTS * 2,
      'You have reached the number limit of attempts to solve the secret combination!'
    );

    this.codeBreakerId
      .getAndRequireEquals()
      .assertEquals(
        Poseidon.hash(this.sender.getAndRequireSignature().toFields()),
        'You are not the codeBreaker of this game!'
      );

    guessCombination.validate();

    const packedGuessHistory = Combination.updateHistory(
      guessCombination,
      this.packedGuessHistory.getAndRequireEquals(),
      turnCount.value.sub(1).div(2)
    );

    this.packedGuessHistory.set(packedGuessHistory);

    // Todo

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
   * @param secretCombination The secret combination to be solved by the codeBreaker.
   * @param salt The salt to be used in the hash function to prevent pre-image attacks.
   * @throws If the game has not been accepted yet, or if the game has already been finalized.
   * @throws If the game has already been solved, or given secret combination and salt are not valid.
   */
  @method async giveClue(secretCombination: Combination, salt: Field) {
    let { rewardAmount, finalizeSlot, turnCount, isSolved } = GameState.unpack(
      this.compressedState.getAndRequireEquals()
    );

    await this.assertNotFinalized(finalizeSlot, isSolved);

    this.codeMasterId
      .getAndRequireEquals()
      .assertEquals(
        Poseidon.hash(this.sender.getAndRequireSignature().toFields()),
        'Only the codeMaster of this game is allowed to give clue!'
      );

    turnCount.assertLessThanOrEqual(
      MAX_ATTEMPTS * 2,
      'The codeBreaker has finished the number of attempts without solving the secret combination!'
    );

    turnCount.value
      .isEven()
      .assertTrue('Please wait for the codeBreaker to make a guess!');

    this.solutionHash
      .getAndRequireEquals()
      .assertEquals(
        Poseidon.hash([...secretCombination.digits, salt]),
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
