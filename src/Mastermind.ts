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
} from 'o1js';

import {
  checkIfSolved,
  compressTurnCountMaxAttemptSolved,
  deserializeClue,
  separateCombinationDigits,
  separateTurnCountAndMaxAttemptSolved,
  validateCombination,
} from './utils.js';
import { StepProgramProof } from './stepProgram.js';

export const GAME_DURATION = 10; // 10 slots

export class MastermindZkApp extends SmartContract {
  @state(Field) turnCountMaxAttemptsIsSolved = State<Field>();
  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();
  @state(Field) refereeId = State<Field>();
  @state(Field) solutionHash = State<Field>();
  @state(Field) unseparatedGuess = State<Field>();
  @state(Field) serializedClue = State<Field>();
  @state(UInt32) finalizeSlot = State<UInt32>();

  /**
   * @returns The balance of the contract.
   */
  @method.returns(UInt64) async getContractBalance() {
    const accountUpdate = AccountUpdate.create(this.address);
    const tokenBalance = accountUpdate.account.balance.get(); // getAndReqEq ??
    return tokenBalance;
  }

  /**
   * Initializes the game by setting the maximum number of attempts allowed. All other state variables are set to 0.
   * @param maxAttempts The maximum number of total turns allowed for the game.
   * @param refereePubKey The public key of the referee who will penalize misbehaving players.
   */
  @method async initGame(maxAttempts: Field, refereePubKey: PublicKey) {
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

    const turnCountMaxAttemptsIsSolved = compressTurnCountMaxAttemptSolved([
      Field.from(0),
      maxAttempts,
      Field.from(0),
    ]);

    this.turnCountMaxAttemptsIsSolved.set(turnCountMaxAttemptsIsSolved);

    const refereeId = Poseidon.hash(refereePubKey.toFields());
    this.refereeId.set(refereeId);
  }

  /**
   * Creates a new game by setting the secret combination and salt.
   * @param unseparatedSecretCombination The secret combination to be solved by the codebreaker.
   * @param salt The salt to be used in the hash function to prevent pre-image attacks.
   * @throws If the game has not been initialized yet, or if the game has already been created.
   */
  @method async createGame(
    unseparatedSecretCombination: Field,
    salt: Field,
    rewardAmount: UInt64
  ) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const [turnCount, maxAttempts, isSolved] =
      separateTurnCountAndMaxAttemptSolved(
        this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
      );

    //! Restrict this method to be only called once at the beginning of a game
    turnCount.assertEquals(0, 'A mastermind game is already created!');

    //! Separate combination digits and validate
    const secretCombination = separateCombinationDigits(
      unseparatedSecretCombination
    );

    validateCombination(secretCombination);

    // Generate solution hash & store on-chain
    const solutionHash = Poseidon.hash([...secretCombination, salt]);
    this.solutionHash.set(solutionHash);

    // Generate codemaster ID
    const codemasterId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    // Store codemaster ID on-chain
    this.codemasterId.set(codemasterId);

    // Increment on-chain turnCount
    const updatedTurnCountMaxAttemptsIsSolved =
      compressTurnCountMaxAttemptSolved([
        turnCount.add(1),
        maxAttempts,
        isSolved,
      ]);
    this.turnCountMaxAttemptsIsSolved.set(updatedTurnCountMaxAttemptsIsSolved);

    const codeMasterUpdate = AccountUpdate.createSigned(
      this.sender.getAndRequireSignature()
    );
    codeMasterUpdate.send({ to: this.address, amount: rewardAmount });
  }

  /**
   * Codebreaker accepts the game and pays the reward to contract.
   * @param rewardPayer The public key of the codebreaker who will pay the reward.
   * @throws If the game has not been initialized yet, or if the game has not been created yet.
   */
  @method async acceptGame() {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    this.codebreakerId
      .getAndRequireEquals()
      .assertEquals(
        Field.from(0),
        'The game has already been accepted by the codebreaker!'
      );

    const [turnCount, maxAttempts, isSolved] =
      separateTurnCountAndMaxAttemptSolved(
        this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
      );

    turnCount.assertEquals(1, 'The game has not been created yet!');

    const codeBreakerUpdate = AccountUpdate.createSigned(
      this.sender.getAndRequireSignature()
    );
    const rewardAmount = await this.getContractBalance();
    codeBreakerUpdate.send({ to: this.address, amount: rewardAmount });

    // generate codebreaker ID
    const codeBreakerId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    this.codebreakerId.set(codeBreakerId);

    const currentSlot =
      this.network.globalSlotSinceGenesis.getAndRequireEquals();
    // Set the finalize slot to GAME_DURATION slots after the current slot (slot time is 3 minutes)
    this.finalizeSlot.set(currentSlot.add(UInt32.from(GAME_DURATION)));
  }

  /**
   * Submits a proof to on-chain that includes the all game steps and the final solution if the game is solved.
   * @param proof The proof generated by using `StepProgramProof` zkProgram.
   * @throws If the game has not been initialized or created yet, or if the game has already been solved.
   */
  @method async submitGameProof(proof: StepProgramProof) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const codeBreakerId = this.codebreakerId.getAndRequireEquals();
    codeBreakerId.assertNotEquals(
      Field.from(0),
      'The game has not been accepted by the codebreaker yet!'
    );

    const currentSlot =
      this.network.globalSlotSinceGenesis.getAndRequireEquals();
    const finalizeSlot = this.finalizeSlot.getAndRequireEquals();
    currentSlot.assertLessThan(
      finalizeSlot,
      'The game has already been finalized!'
    );

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
      this.codemasterId.getAndRequireEquals(),
      'The code master ID is not same as the one stored on-chain!'
    );

    proof.publicOutput.solutionHash.assertEquals(
      this.solutionHash.getAndRequireEquals(),
      'The solution hash is not same as the one stored on-chain!'
    );

    const maxAttemptsExceeded = proof.publicOutput.turnCount.greaterThanOrEqual(
      maxAttempts.mul(2)
    );

    const deserializedClue = deserializeClue(proof.publicOutput.serializedClue);
    isSolved = checkIfSolved(deserializedClue)
      .and(maxAttemptsExceeded.not())
      .toField();

    this.codebreakerId.set(proof.publicOutput.codeBreakerId);
    this.unseparatedGuess.set(proof.publicOutput.lastGuess);
    this.serializedClue.set(proof.publicOutput.serializedClue);

    const updatedTurnCountMaxAttemptsIsSolved =
      compressTurnCountMaxAttemptSolved([
        proof.publicOutput.turnCount,
        maxAttempts,
        isSolved,
      ]);

    this.turnCountMaxAttemptsIsSolved.set(updatedTurnCountMaxAttemptsIsSolved);
  }

  /**
   * Allows the codebreaker to claim the reward if they have solved the game.
   * @throws If the game has not been solved yet, or if the caller is not the codebreaker.
   */
  @method async claimReward() {
    let [turnCount, maxAttempts, isSolved] =
      separateTurnCountAndMaxAttemptSolved(
        this.turnCountMaxAttemptsIsSolved.getAndRequireEquals()
      );

    isSolved.assertEquals(1, 'The game has not been solved yet!');

    const currentSlot =
      this.network.globalSlotSinceGenesis.getAndRequireEquals();
    const finalizeSlot = this.finalizeSlot.getAndRequireEquals();
    currentSlot.assertGreaterThanOrEqual(
      finalizeSlot,
      'The game has not been finalized yet!'
    );

    const claimer = this.sender.getAndRequireSignature();

    const codeBreakerId = this.codebreakerId.getAndRequireEquals();
    const computedCodebreakerId = Poseidon.hash(claimer.toFields());

    codeBreakerId.assertEquals(
      computedCodebreakerId,
      'You are not the codebreaker of this game!'
    );

    const rewardAmount = await this.getContractBalance();

    this.send({ to: claimer, amount: rewardAmount });
  }

  /**
   * Allows the referee to penalize the codebreaker if they have not make a guess within the time limit.
   * @throws If the the caller is not the referee.
   */
  @method async penalizeCodeBreaker(codeMasterPubKey: PublicKey) {
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

    const codeMasterId = Poseidon.hash(codeMasterPubKey.toFields());
    this.codemasterId
      .getAndRequireEquals()
      .assertEquals(
        codeMasterId,
        'The code master ID is not same as the one stored on-chain!'
      );

    const rewardAmount = await this.getContractBalance();
    this.send({ to: codeMasterPubKey, amount: rewardAmount });
  }

  /**
   * Allows the referee to penalize the codeMaster if they have not give clue within the time limit.
   * @throws If the the caller is not the referee.
   */
  @method async penalizeCodeMaster(codeBreakerPubKey: PublicKey) {
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

    const codeBreakerId = Poseidon.hash(codeBreakerPubKey.toFields());
    this.codebreakerId
      .getAndRequireEquals()
      .assertEquals(
        codeBreakerId,
        'The code breaker ID is not same as the one stored on-chain!'
      );

    const rewardAmount = await this.getContractBalance();
    this.send({ to: codeBreakerPubKey, amount: rewardAmount });
  }
}
