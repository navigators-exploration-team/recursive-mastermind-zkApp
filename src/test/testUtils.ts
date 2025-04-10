import { Field, PrivateKey, Signature } from 'o1js';
import { StepProgram, StepProgramProof } from '../stepProgram';
import { Combination } from '../utils';

export {
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramMakeGuess,
  generateTestProofs,
  secretCombination,
  gameGuesses,
};

/**
 * Creates a new game and returns the resulting proof.
 */
const StepProgramCreateGame = async (
  secret: number[],
  salt: Field,
  codeMasterKey: PrivateKey
): Promise<StepProgramProof> => {
  const secretCombination = Combination.from(secret);

  const { proof } = await StepProgram.createGame(
    {
      authPubKey: codeMasterKey.toPublicKey(),
      authSignature: Signature.create(codeMasterKey, [
        ...secretCombination.digits,
        salt,
      ]),
    },
    secretCombination,
    salt
  );
  return proof;
};

/**
 * Makes a guess and returns the updated proof.
 */
const StepProgramMakeGuess = async (
  prevProof: StepProgramProof,
  guess: number[],
  codeBreakerKey: PrivateKey
): Promise<StepProgramProof> => {
  const guessCombination = Combination.from(guess);
  const { proof } = await StepProgram.makeGuess(
    {
      authPubKey: codeBreakerKey.toPublicKey(),
      authSignature: Signature.create(codeBreakerKey, [
        ...guessCombination.digits,
        Field.from(prevProof.publicOutput.turnCount.toBigInt()),
      ]),
    },
    prevProof,
    guessCombination
  );
  return proof;
};

/**
 * Gives a clue and returns the updated proof.
 */
const StepProgramGiveClue = async (
  prevProof: StepProgramProof,
  combination: number[],
  salt: Field,
  codeMasterKey: PrivateKey
): Promise<StepProgramProof> => {
  const secretCombination = Combination.from(combination);
  const { proof } = await StepProgram.giveClue(
    {
      authPubKey: codeMasterKey.toPublicKey(),
      authSignature: Signature.create(codeMasterKey, [
        ...secretCombination.digits,
        salt,
        Field.from(prevProof.publicOutput.turnCount.toBigInt()),
      ]),
    },
    prevProof,
    secretCombination,
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
function generateRandomGuess(secret: number[]): number[] {
  const numbers = new Set<number>();

  while (numbers.size < 4) {
    numbers.add(generateRandomNumber());
  }
  let output = Array.from(numbers);

  if (output === secret) {
    return generateRandomGuess(secret);
  }

  return output;
}

/**
 * Generates a sequence of recursive proofs by making random guesses and receiving clues for a given number of rounds.
 * @param rounds - The number of rounds to simulate the game.
 * @param lastProof - An instance of game creation proof.
 * @param salt -  The salt to be used in the hash function to prevent pre-image attacks.
 * @param codeBreakerKey - The key to be used for signing codeBreaker related actions.
 * @param codeMasterKey  The key to be used for signing codeMaster's actions.
 * @returns {StepProgramProof}
 */
async function generateRecursiveRandomProof(
  rounds: number,
  lastProof: StepProgramProof,
  salt: Field,
  secret: number[],
  codeBreakerKey: PrivateKey,
  codeMasterKey: PrivateKey
): Promise<StepProgramProof> {
  let guess;
  for (let i = 0; i < rounds; i++) {
    guess = generateRandomGuess(secret);

    lastProof = await StepProgramMakeGuess(lastProof, guess, codeBreakerKey);

    lastProof = await StepProgramGiveClue(
      lastProof,
      secret,
      salt,
      codeMasterKey
    );
  }
  return lastProof;
}

/**
 * Generates a sequence of recursive proofs by making guesses taken from a predetermined list and receiving clues for a given number of rounds.
 * @param rounds - The number of rounds to simulate the game.
 * @param lastProof - An instance of game creation proof.
 * @param salt -  The salt to be used in the hash function to prevent pre-image attacks.
 * @param codeBreakerKey - The key to be used for signing codeBreaker related actions.
 * @param codeMasterKey  The key to be used for signing codeMaster's actions.
 * @returns {StepProgramProof}
 */
async function generateRecursiveGuessProof(
  rounds: number,
  lastProof: StepProgramProof,
  salt: Field,
  secret: number[],
  codeBreakerKey: PrivateKey,
  codeMasterKey: PrivateKey
): Promise<StepProgramProof> {
  let guess;
  const guesses = gameGuesses.totalAttempts;

  const isSecretIncluded = gameGuesses.totalAttempts.some(
    (guess) => guess.toString() === secret.toString()
  );

  if (isSecretIncluded) {
    throw new Error("Game secret can't be included in guesses!");
  }

  for (let i = 0; i < rounds; i++) {
    guess = guesses[i];

    lastProof = await StepProgramMakeGuess(lastProof, guess, codeBreakerKey);

    lastProof = await StepProgramGiveClue(
      lastProof,
      secret,
      salt,
      codeMasterKey
    );
  }

  return lastProof;
}

/**
 * Simulates the recursive game steps and generates a {StepProgramProof} based on the given outcome and game state.
 * @param flag - A flag to determine the output state of the game.
 * @param rounds - The number of rounds to simulate.
 * @param salt - The salt to be used in the hash function to prevent pre-image attacks.
 * @param codeBreakerKey - The key to be used for signing codeBreaker related actions.
 * @param codeMasterKey - The key to be used for signing codeBreaker related actions.
 * @param guesses - An optional list of predefined actions that codeBreaker can use.
 * @returns {StepProgramProof}
 */
const generateTestProofs = async (
  flag: string,
  rounds: number,
  salt: Field,
  secret: number[],
  codeBreakerKey: PrivateKey,
  codeMasterKey: PrivateKey,
  guesses?: typeof gameGuesses
): Promise<StepProgramProof> => {
  let lastProof = await StepProgramCreateGame(secret, salt, codeMasterKey);

  if (flag === 'codemaster-victory') {
    lastProof =
      guesses === undefined
        ? await generateRecursiveRandomProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey
          )
        : await generateRecursiveGuessProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey
          );
    return lastProof;
  } else if (flag === 'codebreaker-victory') {
    if (rounds > 15)
      throw new Error(
        "Maximum attempts for codebreaker victory case can't be more than 15!"
      );

    lastProof =
      guesses === undefined
        ? await generateRecursiveRandomProof(
            rounds - 1,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey
          )
        : await generateRecursiveGuessProof(
            rounds - 1,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey
          );

    // Last step that simulates the correct secret submission by codeBreaker.
    lastProof = await StepProgramMakeGuess(lastProof, secret, codeBreakerKey);

    // Return the last proof that result is checked by codeMaster.
    return await StepProgramGiveClue(lastProof, secret, salt, codeMasterKey);
  } else if (flag === 'unsolved') {
    if (guesses)
      if (rounds > 15)
        throw new Error(
          "Maximum attempts for unsolved case can't be more than 15!"
        );

    lastProof =
      guesses === undefined
        ? await generateRecursiveRandomProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey
          )
        : await generateRecursiveGuessProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey
          );

    return lastProof;
  } else {
    throw new Error('Winner flag is not valid!');
  }
};

/**
 * Predefined actions for simulating the guessing process in the game.
 *
 * @property {number[]} secret - The secret combination that needs to be guessed.
 * @property {number[][]} totalAttempts - A predefined sequence of guesses used during the game.
 *                                        Each nested array represents a single guess attempt.
 */
const secretCombination = [6, 3, 8, 4];

const gameGuesses = {
  totalAttempts: [
    [2, 1, 3, 4],
    [8, 3, 7, 1],
    [3, 5, 8, 2],
    [2, 8, 3, 5],
    [5, 8, 3, 2],
    [5, 3, 7, 2],
    [5, 3, 8, 1],
    [3, 1, 7, 2],
    [5, 4, 8, 2],
    [5, 3, 6, 2],
    [5, 3, 8, 9],
    [5, 3, 8, 2],
    [7, 3, 8, 2],
    [5, 2, 8, 3],
    [8, 3, 5, 2],
    [8, 3, 3, 2],
    [7, 1, 3, 8],
    [4, 3, 5, 2],
    [4, 7, 3, 1],
  ],
};
