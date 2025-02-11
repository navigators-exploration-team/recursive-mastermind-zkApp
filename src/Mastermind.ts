import {
  Field,
  SmartContract,
  state,
  State,
  method,
  UInt8,
  Poseidon,
  Bool,
} from 'o1js';

import { separateCombinationDigits, validateCombination } from './utils.js';
import { StepProgramProof } from './stepProgram.js';

export class MastermindZkApp extends SmartContract {
  @state(UInt8) maxAttempts = State<UInt8>();
  @state(UInt8) turnCount = State<UInt8>();
  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();
  @state(Field) solutionHash = State<Field>();
  @state(Field) unseparatedGuess = State<Field>();
  @state(Field) serializedClue = State<Field>();
  @state(Bool) isSolved = State<Bool>();

  @method async initGame(maxAttempts: UInt8) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertFalse('The game has already been initialized!');

    // Sets your entire state to 0.
    super.init();

    maxAttempts.assertGreaterThanOrEqual(
      UInt8.from(5),
      'The minimum number of attempts allowed is 5!'
    );

    maxAttempts.assertLessThanOrEqual(
      UInt8.from(15),
      'The maximum number of attempts allowed is 15!'
    );

    this.maxAttempts.set(maxAttempts);
  }

  @method async createGame(unseparatedSecretCombination: Field, salt: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const turnCount = this.turnCount.getAndRequireEquals();

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
    this.turnCount.set(turnCount.add(1));
  }

  @method async submitGameProof(proof: StepProgramProof) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const isSolved = this.isSolved.getAndRequireEquals();
    isSolved.assertFalse('The game secret has already been solved!');

    proof.verify();

    proof.publicOutput.codeMasterId.assertEquals(
      this.codemasterId.getAndRequireEquals(),
      'The code master ID is not same as the one stored on-chain!'
    );

    proof.publicOutput.solutionHash.assertEquals(
      this.solutionHash.getAndRequireEquals(),
      'The solution hash is not same as the one stored on-chain!'
    );

    proof.publicOutput.maxAttempts.assertEquals(
      this.maxAttempts.getAndRequireEquals(),
      'The max attempts is not same as the one stored on-chain!'
    );

    this.codebreakerId.set(proof.publicOutput.codeBreakerId);
    this.turnCount.set(proof.publicOutput.turnCount);
    this.unseparatedGuess.set(proof.publicOutput.lastGuess);
    this.serializedClue.set(proof.publicOutput.serializedClue);
    this.isSolved.set(proof.publicOutput.isSolved);
  }
}
