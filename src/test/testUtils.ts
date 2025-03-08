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

/**
 * Generates a random number between 1 and 9.
 * @returns - A randomly generated number between 1 and 9.
 */
function generateRandomNumber(): number {
  return Math.floor(Math.random() * 9) + 1;
}

/**
 * Generates an array of four unique random numbers between 1 and 9.
 * The array is intended to be used as a guess in the game.
 * @returns - An array of four randomly generated numbers.
 */
function generateRandomGuess(): number[] {
  const numbers = new Set<number>();

  while (numbers.size < 4) {
    numbers.add(generateRandomNumber());
  }

  return Array.from(numbers);
}

/**
 * In this function, guesses are obtained from a predefined list of actions.
 * @param winnerFlag - A flag that determines the outcome of the function: `0` produces results on behalf of the codeMaster, `1` for the codeBreaker, and `2` for an unsolved game case.
 * @param actions - A predetermined list of number sequences that can represent guesses or solutions. These are used to simulate guesses.
 * @param round - The number of rounds to be simulated. In each round, both `.makeGuess()` and `.giveClue()` methods are executed; hence, one round consists of two consecutive turns.
 * @param lastProof - The `StepProgramProof` instance that initiates the recursive proof generation process.
 * @param codeBreakerKey - The private key of the codeBreaker, used for signature creation.
 * @param codeMasterKey - The private key of the codeMaster, used for signature creation.
 * @param salt - The salt used in the hash function to prevent pre-image attacks.
 * @param secretCombination - The secret combination of the game, specified by the codeMaster.
 * @returns - A `StepProgramProof` instance.
 */
export const generateTestProofs = async (
  round: number,
  winnerFlag: number,
  actions: typeof guessConfig1,
  lastProof: StepProgramProof,
  codeBreakerKey: PrivateKey,
  codeMasterKey: PrivateKey,
  salt: Field
): Promise<StepProgramProof> => {
  const secretCombination = actions.secret;
  const guesses = actions.totalAttempts;

  if (winnerFlag == 0) {
    for (let i = 0; i < round; i++) {
      const guess = guesses[i];

      lastProof = await StepProgramMakeGuess(lastProof, guess, codeBreakerKey);

      lastProof = await StepProgramGiveClue(
        lastProof,
        secretCombination,
        salt,
        codeMasterKey
      );
    }

    return lastProof;
  } else if (winnerFlag == 1) {
    for (let i = 0; i < round - 1; i++) {
      const guess = guesses[i];

      lastProof = await StepProgramMakeGuess(lastProof, guess, codeBreakerKey);

      lastProof = await StepProgramGiveClue(
        lastProof,
        secretCombination,
        salt,
        codeMasterKey
      );
    }

    lastProof = await StepProgramMakeGuess(
      lastProof,
      secretCombination,
      codeBreakerKey
    );

    lastProof = await StepProgramGiveClue(
      lastProof,
      secretCombination,
      salt,
      codeMasterKey
    );

    return lastProof;
  } else if (winnerFlag == 2) {
    for (let i = 0; i < round; i++) {
      let guess = generateRandomGuess();

      lastProof = await StepProgramMakeGuess(lastProof, guess, codeBreakerKey);

      lastProof = await StepProgramGiveClue(
        lastProof,
        secretCombination,
        salt,
        codeMasterKey
      );
    }
    return lastProof;
  } else {
    throw new Error('WinnerFlag is not valid!');
  }
};

/**
 * Predefined actions for simulating the guessing process in the game.
 *
 * @property {number[]} secret - The secret combination that needs to be guessed.
 * @property {number[][]} totalAttempts - A predefined sequence of guesses used during the game.
 *                                        Each nested array represents a single guess attempt.
 */
export const guessConfig1 = {
  secret: [6, 3, 8, 4],

  totalAttempts: [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [3, 5, 8, 2],
    [2, 8, 3, 5],
    [5, 8, 3, 2],
    [5, 3, 7, 2],
    [5, 3, 8, 1],
    [6, 3, 8, 2],
    [5, 4, 8, 2],
    [5, 3, 6, 2],
    [5, 3, 8, 9],
    [5, 3, 8, 2],
    [7, 3, 8, 2],
    [5, 2, 8, 3],
    [8, 3, 5, 2],
  ],
};
