import {
  Bool,
  Field,
  Poseidon,
  PublicKey,
  SelfProof,
  Signature,
  Struct,
  UInt8,
  ZkProgram,
} from 'o1js';

import {
  checkIfSolved,
  getClueFromGuess,
  separateCombinationDigits,
  serializeClue,
  validateCombination,
} from './utils.js';

export { StepProgram, PublicInputs, PublicOutputs, StepProgramProof };

class PublicInputs extends Struct({
  authPubKey: PublicKey,
  authSignature: Signature,
}) {}

class PublicOutputs extends Struct({
  codeMasterId: Field,
  codeBreakerId: Field,
  solutionHash: Field,
  lastGuess: Field,
  serializedClue: Field,
  isSolved: Bool,
  turnCount: UInt8,
  maxAttempts: UInt8,
}) {}

const StepProgram = ZkProgram({
  name: 'StepProgram',
  publicInput: PublicInputs,
  publicOutput: PublicOutputs,

  methods: {
    /**
     * Creates a new game by setting the secret combination and salt. You can think of this as base case of the recursion.
     * @param authInputs contains the public key and signature of the code master to verify the authenticity of the caller.
     * Signature message should be the concatenation of the `unseparatedSecretCombination` and `salt`.
     * @param maxAttempts maximum number of attempts allowed to solve the secret combination.
     * @param unseparatedSecretCombination secret combination to be solved by the codebreaker.
     * @param salt the salt to be used in the hash function to prevent pre-image attacks.
     * @returns the proof of the new game and the public output.
     */
    createGame: {
      privateInputs: [UInt8, Field, Field],
      async method(
        authInputs: PublicInputs,
        maxAttempts: UInt8,
        unseparatedSecretCombination: Field,
        salt: Field
      ) {
        maxAttempts.assertGreaterThanOrEqual(
          UInt8.from(5),
          'The minimum number of attempts allowed is 5!'
        );

        maxAttempts.assertLessThanOrEqual(
          UInt8.from(15),
          'The maximum number of attempts allowed is 15!'
        );

        //! Separate combination digits and validate
        const secretCombination = separateCombinationDigits(
          unseparatedSecretCombination
        );

        validateCombination(secretCombination);
        const solutionHash = Poseidon.hash([...secretCombination, salt]);

        //! Verify the signature of code master
        authInputs.authSignature.verify(authInputs.authPubKey, [
          unseparatedSecretCombination,
          salt,
        ]);
        const codemasterId = Poseidon.hash(authInputs.authPubKey.toFields());

        return {
          publicOutput: {
            codeMasterId: codemasterId,
            codeBreakerId: Field.empty(),
            solutionHash,
            lastGuess: Field.empty(),
            serializedClue: Field.empty(),
            isSolved: Bool.empty(),
            turnCount: UInt8.one,
            maxAttempts,
          },
        };
      },
    },

    /**
     * Allows the codebreaker to make a guess and then gives it to the codemaster to provide a clue.
     * @param authInputs contains the public key and signature of the code breaker to verify the authenticity of the caller.
     * Signature message should be the concatenation of the `unseparatedGuess` and `turnCount`.
     * @param previousClue the proof of the previous game state. It contains the last clue given by the codemaster.
     * @param unseparatedGuess the guess made by the codebreaker.
     * @returns the proof of the updated game state and the public output.
     * The codebreaker can only make a guess if it is their turn and the secret combination is not solved yet, and if they have not reached the limit number of attempts.
     */
    makeGuess: {
      privateInputs: [SelfProof, Field],
      async method(
        authInputs: PublicInputs,
        previousClue: SelfProof<PublicInputs, PublicOutputs>,
        unseparatedGuess: Field
      ) {
        previousClue.verify();

        const turnCount = previousClue.publicOutput.turnCount;

        //! Verify the signature of code breaker
        authInputs.authSignature
          .verify(authInputs.authPubKey, [unseparatedGuess, turnCount.value])
          .assertTrue('You are not the codebreaker of this game!');

        //! Assert that the secret combination is not solved yet
        previousClue.publicOutput.isSolved.assertFalse(
          'You have already solved the secret combination!'
        );

        //! Only allow codebreaker to call this method following the correct turn sequence
        const isCodebreakerTurn = turnCount.value.isEven().not();
        isCodebreakerTurn.assertTrue(
          'Please wait for the codemaster to give you a clue!'
        );

        //! Assert that the codebreaker has not reached the limit number of attempts
        const maxAttempts = previousClue.publicOutput.maxAttempts;
        turnCount.assertLessThan(
          maxAttempts.mul(2),
          'You have reached the number limit of attempts to solve the secret combination!'
        );

        //? If first guess ==> set the codebreaker ID
        //? Else           ==> use the previous codebreaker ID
        const isFirstGuess = turnCount.value.equals(1);
        const computedCodebreakerId = Poseidon.hash(
          authInputs.authPubKey.toFields()
        );

        //! Restrict method access solely to the correct codebreaker
        previousClue.publicOutput.codeBreakerId
          .equals(computedCodebreakerId)
          .or(isFirstGuess)
          .assertTrue('You are not the codebreaker of this game!');

        //! Separate and validate the guess combination
        const guessDigits = separateCombinationDigits(unseparatedGuess);
        validateCombination(guessDigits);

        return {
          publicOutput: {
            ...previousClue.publicOutput,
            codeBreakerId: computedCodebreakerId,
            lastGuess: unseparatedGuess,
            turnCount: turnCount.add(1),
          },
        };
      },
    },

    /**
     * Allows the codemaster to give a clue to the codebreaker based on the guess made.
     * @param authInputs contains the public key and signature of the code master to verify the authenticity of the caller.
     * Signature message should be the concatenation of the `unseparatedSecretCombination`, `salt`, and `turnCount`.
     * @param previousGuess the proof of the previous game state. It contains the last guess made by the codebreaker.
     * @param unseparatedSecretCombination the secret combination to be solved by the codebreaker.
     * @param salt the salt to be used in the hash function to prevent pre-image attacks.
     * @returns the proof of the updated game state and the public output.
     * The codemaster can only give a clue if it is their turn and the secret combination is not solved yet, and if they have not reached the limit number of attempts.
     */
    giveClue: {
      privateInputs: [SelfProof, Field, Field],
      async method(
        authInputs: PublicInputs,
        previousGuess: SelfProof<PublicInputs, PublicOutputs>,
        unseparatedSecretCombination: Field,
        salt: Field
      ) {
        previousGuess.verify();

        const turnCount = previousGuess.publicOutput.turnCount;

        //! Verify the signature of code master
        authInputs.authSignature
          .verify(authInputs.authPubKey, [
            unseparatedSecretCombination,
            salt,
            turnCount.value,
          ])
          .assertTrue(
            'Only the codemaster of this game is allowed to give clue!'
          );

        // Generate codemaster ID
        const computedCodemasterId = Poseidon.hash(
          authInputs.authPubKey.toFields()
        );

        //! Restrict method access solely to the correct codemaster
        previousGuess.publicOutput.codeMasterId.assertEquals(
          computedCodemasterId,
          'Only the codemaster of this game is allowed to give clue!'
        );

        //! Assert that the codebreaker has not reached the limit number of attempts
        const maxAttempts = previousGuess.publicOutput.maxAttempts;
        turnCount.assertLessThanOrEqual(
          maxAttempts.mul(2),
          'The codebreaker has finished the number of attempts without solving the secret combination!'
        );

        //! Assert that the secret combination is not solved yet
        previousGuess.publicOutput.isSolved.assertFalse(
          'The codebreaker has already solved the secret combination!'
        );

        //! Assert that the turnCount is pair & not zero for the codemaster to call this method
        const isNotFirstTurn = turnCount.value.equals(0).not();
        const isCodemasterTurn = turnCount.value.isEven().and(isNotFirstTurn);
        isCodemasterTurn.assertTrue(
          'Please wait for the codebreaker to make a guess!'
        );

        // Separate the secret combination digits
        const solution = separateCombinationDigits(
          unseparatedSecretCombination
        );

        //! Compute solution hash and assert integrity to state on-chain
        const computedSolutionHash = Poseidon.hash([...solution, salt]);
        previousGuess.publicOutput.solutionHash.assertEquals(
          computedSolutionHash,
          'The secret combination is not compliant with the stored hash on-chain!'
        );

        // get & separate the latest guess
        const unseparatedGuess = previousGuess.publicOutput.lastGuess;
        const guessDigits = separateCombinationDigits(unseparatedGuess);

        // Scan the guess through the solution and return clue result(hit or blow)
        let clue = getClueFromGuess(guessDigits, solution);

        // Check if the guess is correct & update the on-chain state
        let isSolved = checkIfSolved(clue);

        // Serialize & give the clue
        const serializedClue = serializeClue(clue);

        return {
          publicOutput: {
            ...previousGuess.publicOutput,
            serializedClue,
            isSolved,
            turnCount: turnCount.add(1),
          },
        };
      },
    },
  },
});

class StepProgramProof extends ZkProgram.Proof(StepProgram) {}
