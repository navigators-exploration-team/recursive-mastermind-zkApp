import {
  Field,
  Poseidon,
  PublicKey,
  SelfProof,
  Signature,
  Struct,
  UInt8,
  ZkProgram,
} from 'o1js';

import { Combination, Clue } from './utils.js';

export { StepProgram, PublicInputs, PublicOutputs, StepProgramProof };

/**
 * authPubKey and authSignature is used for the authenticity of the data transferred. It enables a p2p authenticated communication.
 */
class PublicInputs extends Struct({
  authPubKey: PublicKey,
  authSignature: Signature,
}) {}

/**
 * @param `codeMasterId` and `codeBreakerId` should be same with the on-chain values of players.
 * @param `solutionHash` should also be same with the one on-chain value.
 * @param `lastGuess` and `serializedClue` are the values obtained from the `makeGuess` and `giveClue` methods, respectively.
 * @param `turnCount` is the turn count of the game. Even turn counts represent the turns of code master and odd turn counts represent the turn of the code breaker.
 * @param `packedGuessHistory` is a serialized data that keeps all guesses done so far.
 * @param `packedClueHistory` is a serialized data that keeps all clues given so far.
 */
class PublicOutputs extends Struct({
  codeMasterId: Field,
  codeBreakerId: Field,
  solutionHash: Field,
  lastCompressedGuess: Field,
  compressedClue: Field,
  turnCount: UInt8,
  packedGuessHistory: Field,
  packedClueHistory: Field,
}) {}

const StepProgram = ZkProgram({
  name: 'StepProgram',
  publicInput: PublicInputs,
  publicOutput: PublicOutputs,

  methods: {
    /**
     * Creates a new game by setting the secret combination and salt. You can think of this as base case of the recursion.
     * @param authInputs contains the public key and signature of the code master to verify the authenticity of the caller.
     * Signature message should be the concatenation of the `secretCombination` and `salt`.
     * @param secretCombination secret combination to be solved by the codeBreaker.
     * @param salt the salt to be used in the hash function to prevent pre-image attacks.
     * @returns the proof of the new game and the public output.
     */
    createGame: {
      privateInputs: [Combination, Field],
      async method(
        authInputs: PublicInputs,
        secretCombination: Combination,
        salt: Field
      ) {
        secretCombination.validate();

        authInputs.authSignature
          .verify(authInputs.authPubKey, [...secretCombination.digits, salt])
          .assertTrue('Invalid signature!');

        return {
          publicOutput: new PublicOutputs({
            codeMasterId: Poseidon.hash(authInputs.authPubKey.toFields()),
            codeBreakerId: Field.from(0),
            solutionHash: Poseidon.hash([...secretCombination.digits, salt]),
            lastCompressedGuess: Field.from(0),
            compressedClue: Field.from(0),
            turnCount: UInt8.from(1),
            packedGuessHistory: Field.from(0),
            packedClueHistory: Field.from(0),
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
      privateInputs: [SelfProof, Combination],
      async method(
        authInputs: PublicInputs,
        previousClue: SelfProof<PublicInputs, PublicOutputs>,
        guessCombination: Combination
      ) {
        previousClue.verify();

        const turnCount = previousClue.publicOutput.turnCount.value;
        turnCount
          .isEven()
          .assertFalse('Please wait for the codeMaster to give you a clue!');

        authInputs.authSignature
          .verify(authInputs.authPubKey, [
            ...guessCombination.digits,
            turnCount,
          ])
          .assertTrue('You are not the codeBreaker of this game!');

        Clue.decompress(previousClue.publicOutput.compressedClue)
          .isSolved()
          .assertFalse('You have already solved the secret combination!');

        const computedCodebreakerId = Poseidon.hash(
          authInputs.authPubKey.toFields()
        );

        previousClue.publicOutput.codeBreakerId
          .equals(computedCodebreakerId)
          .or(turnCount.equals(1))
          .assertTrue('You are not the codeBreaker of this game!');

        guessCombination.validate();

        const packedGuessHistory = Combination.updateHistory(
          guessCombination,
          previousClue.publicOutput.packedGuessHistory,
          turnCount.sub(1).div(2)
        );

        return {
          publicOutput: new PublicOutputs({
            ...previousClue.publicOutput,
            codeBreakerId: computedCodebreakerId,
            lastCompressedGuess: guessCombination.compress(),
            turnCount: previousClue.publicOutput.turnCount.add(1),
            packedGuessHistory,
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
      privateInputs: [SelfProof, Combination, Field],
      async method(
        authInputs: PublicInputs,
        previousGuess: SelfProof<PublicInputs, PublicOutputs>,
        secretCombination: Combination,
        salt: Field
      ) {
        previousGuess.verify();

        const turnCount = previousGuess.publicOutput.turnCount.value;
        turnCount
          .isEven()
          .and(turnCount.equals(0).not())
          .assertTrue('Please wait for the codeBreaker to make a guess!');

        authInputs.authSignature
          .verify(authInputs.authPubKey, [
            ...secretCombination.digits,
            salt,
            turnCount,
          ])
          .assertTrue(
            'Only the codeMaster of this game is allowed to give clue!'
          );

        const computedCodemasterId = Poseidon.hash(
          authInputs.authPubKey.toFields()
        );

        previousGuess.publicOutput.codeMasterId.assertEquals(
          computedCodemasterId,
          'Only the codeMaster of this game is allowed to give clue!'
        );

        const computedSolutionHash = Poseidon.hash([
          ...secretCombination.digits,
          salt,
        ]);
        previousGuess.publicOutput.solutionHash.assertEquals(
          computedSolutionHash,
          'The secret combination is not compliant with the initial hash from game creation!'
        );

        const lastGuess = Combination.decompress(
          previousGuess.publicOutput.lastCompressedGuess
        );

        let clue = Clue.giveClue(lastGuess.digits, secretCombination.digits);

        const packedClueHistory = Clue.updateHistory(
          clue,
          previousGuess.publicOutput.packedClueHistory,
          turnCount.div(2).sub(1)
        );

        return {
          publicOutput: new PublicOutputs({
            ...previousGuess.publicOutput,
            compressedClue: clue.compress(),
            turnCount: previousGuess.publicOutput.turnCount.add(1),
            packedClueHistory,
          }),
        };
      },
    },
  },
});

class StepProgramProof extends ZkProgram.Proof(StepProgram) {}
