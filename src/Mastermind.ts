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
} from 'o1js';

import {
  checkIfSolved,
  compressRewardAndFinalizeSlot,
  compressTurnCountMaxAttemptSolved,
  deserializeClue,
  deserializeCombinationHistory,
  getClueFromGuess,
  getElementAtIndex,
  separateCombinationDigits,
  separateRewardAndFinalizeSlot,
  separateTurnCountAndMaxAttemptSolved,
  serializeClue,
  serializeCombinationHistory,
  updateElementAtIndex,
  validateCombination,
} from './utils.js';
import { StepProgramProof } from './stepProgram.js';

export { GAME_DURATION, NewGameEvent, GameAcceptedEvent, MastermindZkApp };

const GAME_DURATION = 30; // 30 slots

class NewGameEvent extends Struct({
  rewardAmount: UInt64,
  maxAttempts: Field,
}) {}

class GameAcceptedEvent extends Struct({
  codeBreakerPubKey: PublicKey,
  finalizeSlot: UInt32,
}) {}

class MastermindZkApp extends SmartContract {
  /**
   * `turnCountMaxAttemptsIsSolved` is a compressed state variable that
   * stores the current turn count, maximum number of attempts allowed, and whether the game has been solved.
   * Uses `compressTurnCountMaxAttemptSolved` to compress the state variable.
   * The state variable is decompressed using `separateTurnCountAndMaxAttemptSolved`.
   */
  @state(Field) turnCountMaxAttemptsIsSolved = State<Field>();

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

  /**
   * `rewardFinalizeSlot` is a compressed state variable that stores the reward amount(`UInt64`) and the slot(`UInt32`) when the game is finalized.
   * Uses `compressRewardAndFinalizeSlot` to compress the state variable.
   * The state variable is decompressed using `separateRewardAndFinalizeSlot`.
   */
  @state(Field) rewardFinalizeSlot = State<Field>();

  readonly events = {
    newGame: NewGameEvent,
    gameAccepted: GameAcceptedEvent,
  };

  /**
   * Asserts that the game is still ongoing. For internal use only.
   */
  async assertNotFinalized() {
    const { finalizeSlot } = separateRewardAndFinalizeSlot(
      this.rewardFinalizeSlot.getAndRequireEquals()
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
   * @param maxAttempts The maximum number of total turns allowed for the game.
   * @param refereePubKey The public key of the referee who will penalize misbehaving players.
   * @param rewardAmount The amount of tokens to be rewarded to the codeBreaker upon solving the game.
   */
  @method async initGame(
    unseparatedSecretCombination: Field,
    salt: Field,
    maxAttempts: Field,
    refereePubKey: PublicKey,
    rewardAmount: UInt64
  ) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertFalse('The game has already been initialized!');

    // Sets your entire state to 0.
    super.init();

    maxAttempts.assertGreaterThanOrEqual(
      Field.from(5),
      'The minimum number of attempts allowed is 5!'
    );

    maxAttempts.assertLessThanOrEqual(
      Field.from(15),
      'The maximum number of attempts allowed is 15!'
    );

    this.turnCountMaxAttemptsIsSolved.set(
      compressTurnCountMaxAttemptSolved([
        Field.from(1), // Turn count starts from 1
        maxAttempts, // Maximum number of attempts
        Field.from(0), // Game is not solved yet
      ])
    );

    const refereeId = Poseidon.hash(refereePubKey.toFields());
    this.refereeId.set(refereeId);

    // Separate combination digits and validate
    const secretCombination = separateCombinationDigits(
      unseparatedSecretCombination
    );

    validateCombination(secretCombination);

    // Generate solution hash & store on-chain
    const solutionHash = Poseidon.hash([...secretCombination, salt]);
    this.solutionHash.set(solutionHash);

    const sender = this.sender.getUnconstrained();

    // Generate codeMaster ID & store on-chain
    const codeMasterId = Poseidon.hash(sender.toFields());
    this.codeMasterId.set(codeMasterId);

    // Get the reward amount from the codeMaster
    const codeMasterUpdate = AccountUpdate.createSigned(sender);
    codeMasterUpdate.send({ to: this.address, amount: rewardAmount });

    // Update the on-chain reward amount
    this.rewardFinalizeSlot.set(
      compressRewardAndFinalizeSlot(rewardAmount, UInt32.zero)
    );

    // Emit the newGame event to be listened to by the server
    this.emitEvent(
      'newGame',
      new NewGameEvent({
        rewardAmount,
        maxAttempts,
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

    const [turnCount, ,] = separateTurnCountAndMaxAttemptSolved(
      this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
    );

    turnCount.assertEquals(1, 'The game has not been created yet!');

    // Get the reward amount from the on-chain state
    const { rewardAmount } = separateRewardAndFinalizeSlot(
      this.rewardFinalizeSlot.getAndRequireEquals()
    );

    const sender = this.sender.getUnconstrained();

    // Transfer the reward amount to the contract from the codeBreaker
    const codeBreakerUpdate = AccountUpdate.createSigned(sender);
    codeBreakerUpdate.send({ to: this.address, amount: rewardAmount });

    // generate codeBreaker ID and store on-chain
    const codeBreakerId = Poseidon.hash(sender.toFields());
    this.codeBreakerId.set(codeBreakerId);

    const currentSlot = this.network.globalSlotSinceGenesis.get();
    this.network.globalSlotSinceGenesis.requireBetween(
      currentSlot,
      currentSlot.add(UInt32.from(5))
    );
    // Set the finalize slot to GAME_DURATION slots after the current slot (slot time is 3 minutes)
    const finalizeSlot = currentSlot.add(UInt32.from(GAME_DURATION));
    this.rewardFinalizeSlot.set(
      compressRewardAndFinalizeSlot(
        rewardAmount.add(rewardAmount),
        finalizeSlot
      )
    );

    // Emit the gameAccepted event to be listened to by the server
    this.emitEvent(
      'gameAccepted',
      new GameAcceptedEvent({
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
  @method async submitGameProof(proof: StepProgramProof) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();
    codeBreakerId.assertNotEquals(
      Field.from(0),
      'The game has not been accepted by the codeBreaker yet!'
    );

    await this.assertNotFinalized();

    // Check if the game has been solved
    let [turnCount, maxAttempts, isSolved] =
      separateTurnCountAndMaxAttemptSolved(
        this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
      );

    isSolved.assertEquals(0, 'The game secret has already been solved!');

    proof.verify();

    // Validate and prevent different code breaker, code master, solution hash, max attempts from on-chain state
    proof.publicOutput.codeBreakerId.assertEquals(
      codeBreakerId,
      'The code breaker ID is not same as the one stored on-chain!'
    );

    proof.publicOutput.codeMasterId.assertEquals(
      this.codeMasterId.getAndRequireEquals(),
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
      maxAttempts.mul(2)
    );

    const deserializedClue = deserializeClue(proof.publicOutput.serializedClue);
    isSolved = checkIfSolved(deserializedClue)
      .and(maxAttemptsExceeded.not())
      .toField();

    this.codeBreakerId.set(proof.publicOutput.codeBreakerId);
    this.packedGuessHistory.set(proof.publicOutput.packedGuessHistory);
    this.packedClueHistory.set(proof.publicOutput.packedClueHistory);

    const updatedTurnCountMaxAttemptsIsSolved =
      compressTurnCountMaxAttemptSolved([
        proof.publicOutput.turnCount,
        maxAttempts,
        isSolved,
      ]);

    this.turnCountMaxAttemptsIsSolved.set(updatedTurnCountMaxAttemptsIsSolved);
  }

  /**
   * Allows the winner to claim the reward.
   * @throws If the game has not been finalized yet, or if the caller is not the winner.
   */
  @method async claimReward() {
    let [turnCount, maxAttempts, isSolved] =
      separateTurnCountAndMaxAttemptSolved(
        this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
      );

    const { finalizeSlot } = separateRewardAndFinalizeSlot(
      this.rewardFinalizeSlot.getAndRequireEquals()
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
    const codeMasterWinByFinalize = isSolved.equals(0).and(isFinalized);
    // Code Master wins if the codeBreaker has reached the maximum number of attempts without solving the secret combination
    const codeMasterWinByMaxAttempts = isSolved
      .equals(0)
      .and(turnCount.greaterThanOrEqual(maxAttempts.mul(2)));

    // Code Breaker wins if the game is solved
    const codeBreakerWin = isSolved.equals(1);

    isCodeMaster
      .or(isCodeBreaker)
      .assertTrue('You are not the codeMaster or codeBreaker of this game!');

    const isWinner = isCodeMaster
      .and(codeMasterWinByFinalize.or(codeMasterWinByMaxAttempts))
      .or(isCodeBreaker.and(codeBreakerWin));

    isWinner.assertTrue('You are not the winner of this game!');

    const { rewardAmount } = separateRewardAndFinalizeSlot(
      this.rewardFinalizeSlot.getAndRequireEquals()
    );
    this.send({ to: claimer, amount: rewardAmount });

    // Set the reward amount to 0
    this.rewardFinalizeSlot.set(
      compressRewardAndFinalizeSlot(UInt64.zero, UInt32.zero)
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

    const { rewardAmount, finalizeSlot } = separateRewardAndFinalizeSlot(
      this.rewardFinalizeSlot.getAndRequireEquals()
    );

    rewardAmount.assertGreaterThan(
      UInt64.zero,
      'There is no reward in the pool!'
    );

    this.send({ to: playerPubKey, amount: rewardAmount });

    // Set the reward amount to 0 and finalize the game
    this.rewardFinalizeSlot.set(
      compressRewardAndFinalizeSlot(UInt64.zero, finalizeSlot)
    );
  }

  /**
   * Allows the codeBreaker to make a guess outside `stepProof` and then gives it to the codeMaster to provide a clue.
   * @param unseparatedGuess The guess combination made by the codeBreaker.
   * @throws If the game has not been initialized yet, or if the game has already been finalized.
   */
  @method async makeGuess(unseparatedGuess: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    await this.assertNotFinalized();

    const [turnCount, maxAttempts, isSolved] =
      separateTurnCountAndMaxAttemptSolved(
        this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
      );

    // Assert that the game has been accepted by the codeBreaker
    turnCount.assertGreaterThan(
      Field.from(0),
      'The game has not been accepted by the codeBreaker yet!'
    );

    // Assert that the secret combination is not solved yet
    isSolved.assertEquals(0, 'The game secret has already been solved!');

    // Only allow codeBreaker to call this method following the correct turn sequence
    const isCodebreakerTurn = turnCount.isEven().not();
    isCodebreakerTurn.assertTrue(
      'Please wait for the codeMaster to give you a clue!'
    );

    // Assert that the codeBreaker has not reached the limit number of attempts
    turnCount.assertLessThan(
      maxAttempts.mul(2),
      'You have reached the number limit of attempts to solve the secret combination!'
    );

    // Generate an ID for the caller
    const computedCodebreakerId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    // Get the codeBreaker ID from the on-chain state
    const codeBreakerId = this.codeBreakerId.getAndRequireEquals();

    // Restrict method access solely to the correct codeBreaker
    computedCodebreakerId.assertEquals(
      codeBreakerId,
      'You are not the codeBreaker of this game!'
    );

    // Separate and validate the guess combination
    const guessDigits = separateCombinationDigits(unseparatedGuess);
    validateCombination(guessDigits);

    const guessHistory = deserializeCombinationHistory(
      this.packedGuessHistory.getAndRequireEquals()
    );
    const updatedGuessHistory = updateElementAtIndex(
      unseparatedGuess,
      guessHistory,
      turnCount.sub(1).div(2)
    );

    const serializedUpdatedGuessHistory =
      serializeCombinationHistory(updatedGuessHistory);

    // Update the on-chain guess history
    this.packedGuessHistory.set(serializedUpdatedGuessHistory);

    // Increment turnCount and wait for the codeMaster to give a clue
    const updatedTurnCountMaxAttemptsIsSolved =
      compressTurnCountMaxAttemptSolved([
        turnCount.add(1),
        maxAttempts,
        isSolved,
      ]);

    this.turnCountMaxAttemptsIsSolved.set(updatedTurnCountMaxAttemptsIsSolved);
  }

  /**
   * Allows the codeMaster to give a clue to the codeBreaker outside `stepProof`.
   * @param unseparatedSecretCombination The secret combination to be solved by the codeBreaker.
   * @param salt The salt to be used in the hash function to prevent pre-image attacks.
   * @throws If the game has not been initialized yet, or if the game has already been finalized.
   */
  @method async giveClue(unseparatedSecretCombination: Field, salt: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    await this.assertNotFinalized();

    const [turnCount, maxAttempts, isSolved] =
      separateTurnCountAndMaxAttemptSolved(
        this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
      );

    // Generate codeMaster ID
    const computedCodemasterId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    // Restrict method access solely to the correct codeMaster
    this.codeMasterId
      .getAndRequireEquals()
      .assertEquals(
        computedCodemasterId,
        'Only the codeMaster of this game is allowed to give clue!'
      );

    // Assert that the codeBreaker has not reached the limit number of attempts
    turnCount.assertLessThanOrEqual(
      maxAttempts.mul(2),
      'The codeBreaker has finished the number of attempts without solving the secret combination!'
    );

    // Assert that the secret combination is not solved yet
    isSolved.assertEquals(
      0,
      'The codeBreaker has already solved the secret combination!'
    );

    // Assert that the game is accepted by the codeBreaker
    turnCount.assertNotEquals(
      Field.from(0),
      'Game has not been accepted by the codeBreaker yet!'
    );

    // Only allow codeMaster to call this method following the correct turn sequence
    const isCodemasterTurn = turnCount.isEven();
    isCodemasterTurn.assertTrue(
      'Please wait for the codeBreaker to make a guess!'
    );

    // Separate the secret combination digits
    const solution = separateCombinationDigits(unseparatedSecretCombination);

    // Compute solution hash and assert integrity to state on-chain
    const computedSolutionHash = Poseidon.hash([...solution, salt]);
    this.solutionHash
      .getAndRequireEquals()
      .assertEquals(
        computedSolutionHash,
        'The secret combination is not compliant with the stored hash on-chain!'
      );

    // Fetch & separate the on-chain guess
    const guessHistory = deserializeCombinationHistory(
      this.packedGuessHistory.getAndRequireEquals()
    );

    const guessIndex = turnCount.div(2).sub(1);
    const latestGuess = getElementAtIndex(guessHistory, guessIndex);

    const guessDigits = separateCombinationDigits(latestGuess);

    // Scan the guess through the solution and return clue result(hit or blow)
    let clue = getClueFromGuess(guessDigits, solution);

    // Serialize the clue and update the on-chain clue history
    const serializedClue = serializeClue(clue);
    const clueHistory = deserializeCombinationHistory(
      this.packedClueHistory.getAndRequireEquals()
    );
    const updatedClueHistory = updateElementAtIndex(
      serializedClue,
      clueHistory,
      guessIndex
    );

    const serializedUpdatedClueHistory =
      serializeCombinationHistory(updatedClueHistory);

    this.packedClueHistory.set(serializedUpdatedClueHistory);

    // Check if the guess is correct & update the on-chain state
    let isSolvedThisTurn = checkIfSolved(clue).toField();
    // Increment the on-chain turnCount and update the isSolved state
    const updatedTurnCountMaxAttemptsIsSolved =
      compressTurnCountMaxAttemptSolved([
        turnCount.add(1),
        maxAttempts,
        isSolvedThisTurn,
      ]);

    this.turnCountMaxAttemptsIsSolved.set(updatedTurnCountMaxAttemptsIsSolved);
  }
}
