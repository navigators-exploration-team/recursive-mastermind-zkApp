import {
  Field,
  Poseidon,
  PublicKey,
  SelfProof,
  Signature,
  Struct,
  ZkProgram,
} from 'o1js';

import {
  checkIfSolved,
  deserializeClue,
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
  turnCount: Field,
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
     * @param unseparatedSecretCombination secret combination to be solved by the codeBreaker.
     * @param salt the salt to be used in the hash function to prevent pre-image attacks.
     * @returns the proof of the new game and the public output.
     */
    createGame: {
      privateInputs: [Field, Field],
      async method(
        authInputs: PublicInputs,
        unseparatedSecretCombination: Field,
        salt: Field
      ) {
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
        const codeMasterId = Poseidon.hash(authInputs.authPubKey.toFields());

        return {
          publicOutput: new PublicOutputs({
            codeMasterId: codeMasterId,
            codeBreakerId: Field.empty(),
            solutionHash,
            lastGuess: Field.empty(),
            serializedClue: Field.empty(),
            turnCount: Field.from(1),
          }),
        };
      },
    },

    /**
     * Allows the codeBreaker to make a guess and then gives it to the codeMaster to provide a clue.
     * @param authInputs contains the public key and signature of the code breaker to verify the authenticity of the caller.
     * Signature message should be the concatenation of the `unseparatedGuess` and `turnCount`.
     * @param previousClue the proof of the previous game state. It contains the last clue given by the codeMaster.
     * @param unseparatedGuess the guess made by the codeBreaker.
     * @returns the proof of the updated game state and the public output.
     * The codeBreaker can only make a guess if it is their turn and the secret combination is not solved yet, and if they have not reached the limit number of attempts.
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
          .verify(authInputs.authPubKey, [unseparatedGuess, turnCount])
          .assertTrue('You are not the codeBreaker of this game!');

        const deserializedClue = deserializeClue(
          previousClue.publicOutput.serializedClue
        );
        let isSolved = checkIfSolved(deserializedClue);

        //! Assert that the secret combination is not solved yet
        isSolved.assertFalse('You have already solved the secret combination!');

        //! Only allow codeBreaker to call this method following the correct turn sequence
        const isCodebreakerTurn = turnCount.isEven().not();
        isCodebreakerTurn.assertTrue(
          'Please wait for the codeMaster to give you a clue!'
        );

        //? If first guess ==> set the codeBreaker ID
        //? Else           ==> use the previous codeBreaker ID
        const isFirstGuess = turnCount.equals(1);
        const computedCodebreakerId = Poseidon.hash(
          authInputs.authPubKey.toFields()
        );

        //! Restrict method access solely to the correct codeBreaker
        previousClue.publicOutput.codeBreakerId
          .equals(computedCodebreakerId)
          .or(isFirstGuess)
          .assertTrue('You are not the codeBreaker of this game!');

        //! Separate and validate the guess combination
        const guessDigits = separateCombinationDigits(unseparatedGuess);
        validateCombination(guessDigits);

        return {
          publicOutput: new PublicOutputs({
            ...previousClue.publicOutput,
            codeBreakerId: computedCodebreakerId,
            lastGuess: unseparatedGuess,
            turnCount: turnCount.add(1),
          }),
        };
      },
    },

    /**
     * Allows the codeMaster to give a clue to the codeBreaker based on the guess made.
     * @param authInputs contains the public key and signature of the code master to verify the authenticity of the caller.
     * Signature message should be the concatenation of the `unseparatedSecretCombination`, `salt`, and `turnCount`.
     * @param previousGuess the proof of the previous game state. It contains the last guess made by the codeBreaker.
     * @param unseparatedSecretCombination the secret combination to be solved by the codeBreaker.
     * @param salt the salt to be used in the hash function to prevent pre-image attacks.
     * @returns the proof of the updated game state and the public output.
     * The codeMaster can only give a clue if it is their turn and the secret combination is not solved yet, and if they have not reached the limit number of attempts.
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
            turnCount,
          ])
          .assertTrue(
            'Only the codeMaster of this game is allowed to give clue!'
          );

        // Generate codeMaster ID
        const computedCodemasterId = Poseidon.hash(
          authInputs.authPubKey.toFields()
        );

        //! Restrict method access solely to the correct codeMaster
        previousGuess.publicOutput.codeMasterId.assertEquals(
          computedCodemasterId,
          'Only the codeMaster of this game is allowed to give clue!'
        );

        //! Assert that the turnCount is pair & not zero for the codeMaster to call this method
        const isNotFirstTurn = turnCount.equals(0).not();
        const isCodemasterTurn = turnCount.isEven().and(isNotFirstTurn);
        isCodemasterTurn.assertTrue(
          'Please wait for the codeBreaker to make a guess!'
        );

        // Separate the secret combination digits
        const solution = separateCombinationDigits(
          unseparatedSecretCombination
        );

        //! Compute solution hash and assert integrity to state on-chain
        const computedSolutionHash = Poseidon.hash([...solution, salt]);
        previousGuess.publicOutput.solutionHash.assertEquals(
          computedSolutionHash,
          'The secret combination is not compliant with the initial hash from game creation!'
        );

        // get & separate the latest guess
        const unseparatedGuess = previousGuess.publicOutput.lastGuess;
        const guessDigits = separateCombinationDigits(unseparatedGuess);

        // Scan the guess through the solution and return clue result(hit or blow)
        let clue = getClueFromGuess(guessDigits, solution);

        // Serialize & give the clue
        const serializedClue = serializeClue(clue);

        return {
          publicOutput: new PublicOutputs({
            ...previousGuess.publicOutput,
            serializedClue,
            turnCount: turnCount.add(1),
          }),
        };
      },
    },
  },
});

class StepProgramProof extends ZkProgram.Proof(StepProgram) {}
