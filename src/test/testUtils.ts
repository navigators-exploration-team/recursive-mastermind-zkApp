import { Field, PrivateKey, Signature } from 'o1js';
import { compressCombinationDigits } from '../utils';
import { StepProgram, StepProgramProof } from '../stepProgram';

/**
 * Creates a new game and returns the resulting proof.
 */
export const StepProgramCreateGame = async (
  secret: number[],
  salt: Field,
  codeMasterKey: PrivateKey
): Promise<StepProgramProof> => {
  const unseparatedSecret = compressCombinationDigits(secret.map(Field));

  const { proof } = await StepProgram.createGame(
    {
      authPubKey: codeMasterKey.toPublicKey(),
      authSignature: Signature.create(codeMasterKey, [unseparatedSecret, salt]),
    },
    unseparatedSecret,
    salt
  );
  return proof;
};

/**
 * Makes a guess and returns the updated proof.
 */
export const StepProgramMakeGuess = async (
  prevProof: StepProgramProof,
  guess: number[],
  codeBreakerKey: PrivateKey
): Promise<StepProgramProof> => {
  const unseparatedGuess = compressCombinationDigits(guess.map(Field));
  const { proof } = await StepProgram.makeGuess(
    {
      authPubKey: codeBreakerKey.toPublicKey(),
      authSignature: Signature.create(codeBreakerKey, [
        unseparatedGuess,
        Field.from(prevProof.publicOutput.turnCount.toBigInt()),
      ]),
    },
    prevProof,
    unseparatedGuess
  );
  return proof;
};

/**
 * Gives a clue and returns the updated proof.
 */
export const StepProgramGiveClue = async (
  prevProof: StepProgramProof,
  combination: number[],
  salt: Field,
  codeMasterKey: PrivateKey
): Promise<StepProgramProof> => {
  const unseparatedCombination = compressCombinationDigits(
    combination.map(Field)
  );
  const { proof } = await StepProgram.giveClue(
    {
      authPubKey: codeMasterKey.toPublicKey(),
      authSignature: Signature.create(codeMasterKey, [
        unseparatedCombination,
        salt,
        Field.from(prevProof.publicOutput.turnCount.toBigInt()),
      ]),
    },
    prevProof,
    unseparatedCombination,
    salt
  );
  return proof;
};
