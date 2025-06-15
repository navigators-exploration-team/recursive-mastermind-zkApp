import { Field, PrivateKey, PublicKey, Signature } from 'o1js';
import { StepProgram, StepProgramProof } from '../stepProgram.js';
import { Combination } from '../utils.js';

export {
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramMakeGuess,
  StepProgramMakeGuessInvalidSignature,
  StepProgramGiveClueInvalidSignature,
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
  codeMasterKey: PrivateKey,
  contractAddress: PublicKey
): Promise<StepProgramProof> => {
  const secretCombination = Combination.from(secret);

  const { proof } = await StepProgram.createGame(
    {
      authPubKey: codeMasterKey.toPublicKey(),
      authSignature: Signature.create(codeMasterKey, [
        ...secretCombination.digits,
        salt,
        ...contractAddress.toFields(),
      ]),
    },
    secretCombination,
    salt,
    contractAddress
  );
  return proof;
};

/**
 * Makes a guess and returns the updated proof.
 */
const StepProgramMakeGuess = async (
  prevProof: StepProgramProof,
  guess: number[],
  codeBreakerKey: PrivateKey,
  contractAddress: PublicKey
): Promise<StepProgramProof> => {
  const guessCombination = Combination.from(guess);
  const { proof } = await StepProgram.makeGuess(
    {
      authPubKey: codeBreakerKey.toPublicKey(),
      authSignature: Signature.create(codeBreakerKey, [
        ...guessCombination.digits,
        prevProof.publicOutput.turnCount.value,
        ...contractAddress.toFields(),
      ]),
    },
    prevProof,
    guessCombination,
    contractAddress
  );
  return proof;
};

const StepProgramMakeGuessInvalidSignature = async (
  prevProof: StepProgramProof,
  guess: number[],
  codeBreakerKey: PrivateKey,
  config: {
    wrongPubKey: boolean;
    wrongMessage: boolean;
    wrongSigner: boolean;
    wrongContractAddress?: boolean;
  },
  contractAddress: PublicKey
): Promise<void> => {
  const guessCombination = Combination.from(guess);
  const randomKey = PrivateKey.random();
  const randomContractAddress = PrivateKey.random().toPublicKey();
  const authSignature = Signature.create(
    config.wrongSigner ? randomKey : codeBreakerKey,
    config.wrongMessage
      ? Array.from({ length: 4 }, () => Field.random())
      : [
          ...guessCombination.digits,
          prevProof.publicOutput.turnCount.value,
          ...(config.wrongContractAddress
            ? randomContractAddress.toFields()
            : contractAddress.toFields()),
        ]
  );

  await StepProgram.makeGuess(
    {
      authPubKey: config.wrongPubKey
        ? randomKey.toPublicKey()
        : codeBreakerKey.toPublicKey(),
      authSignature,
    },
    prevProof,
    guessCombination,
    config.wrongContractAddress ? randomContractAddress : contractAddress
  );
};

/**
 * Gives a clue and returns the updated proof.
 */
const StepProgramGiveClue = async (
  prevProof: StepProgramProof,
  combination: number[],
  salt: Field,
  codeMasterKey: PrivateKey,
  contractAddress: PublicKey
): Promise<StepProgramProof> => {
  const secretCombination = Combination.from(combination);
  const { proof } = await StepProgram.giveClue(
    {
      authPubKey: codeMasterKey.toPublicKey(),
      authSignature: Signature.create(codeMasterKey, [
        ...secretCombination.digits,
        salt,
        prevProof.publicOutput.turnCount.value,
        ...contractAddress.toFields(),
      ]),
    },
    prevProof,
    secretCombination,
    salt,
    contractAddress
  );
  return proof;
};

const StepProgramGiveClueInvalidSignature = async (
  prevProof: StepProgramProof,
  combination: number[],
  salt: Field,
  codeMasterKey: PrivateKey,
  config: {
    wrongPubKey: boolean;
    wrongMessage: boolean;
    wrongSigner: boolean;
    wrongContractAddress?: boolean;
  },
  contractAddress: PublicKey
): Promise<void> => {
  const secretCombination = Combination.from(combination);
  const randomKey = PrivateKey.random();
  const randomContractAddress = PrivateKey.random().toPublicKey();
  const authSignature = Signature.create(
    config.wrongSigner ? randomKey : codeMasterKey,
    config.wrongMessage
      ? Array.from({ length: 4 }, () => Field.random())
      : [
          ...secretCombination.digits,
          salt,
          prevProof.publicOutput.turnCount.value,
          ...(config.wrongContractAddress
            ? randomContractAddress.toFields()
            : contractAddress.toFields()),
        ]
  );

  await StepProgram.giveClue(
    {
      authPubKey: config.wrongPubKey
        ? randomKey.toPublicKey()
        : codeMasterKey.toPublicKey(),
      authSignature,
    },
    prevProof,
    secretCombination,
    salt,
    config.wrongContractAddress ? randomContractAddress : contractAddress
  );
};

/**
 * Generates a random number between 1 and 7.
 * @returns - A randomly generated number between 1 and 7.
 */
function generateRandomNumber(): number {
  return Math.floor(Math.random() * 7) + 1;
}

/**
 * Generates an array of four unique random numbers between 1 and 7.
 * The array is intended to be used as a guess in the game.
 * @returns - An array of four randomly generated numbers.
 */
function generateRandomGuess(secret: number[]): number[] {
  const numbers = new Set<number>();

  while (numbers.size < 4) {
    numbers.add(generateRandomNumber());
  }
  let output = Array.from(numbers);

  if (secret.every((num, index) => num === output[index])) {
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
  codeMasterKey: PrivateKey,
  contractAddress: PublicKey
): Promise<StepProgramProof> {
  let guess;
  for (let i = 0; i < rounds; i++) {
    guess = generateRandomGuess(secret);

    lastProof = await StepProgramMakeGuess(
      lastProof,
      guess,
      codeBreakerKey,
      contractAddress
    );

    lastProof = await StepProgramGiveClue(
      lastProof,
      secret,
      salt,
      codeMasterKey,
      contractAddress
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
  codeMasterKey: PrivateKey,
  contractAddress: PublicKey
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

    lastProof = await StepProgramMakeGuess(
      lastProof,
      guess,
      codeBreakerKey,
      contractAddress
    );

    lastProof = await StepProgramGiveClue(
      lastProof,
      secret,
      salt,
      codeMasterKey,
      contractAddress
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
  contractAddress: PublicKey,
  guesses?: typeof gameGuesses
): Promise<StepProgramProof> => {
  if (rounds < 1 || rounds > 7) {
    throw new Error('Rounds must be between 1 and 7!');
  }

  let lastProof = await StepProgramCreateGame(
    secret,
    salt,
    codeMasterKey,
    contractAddress
  );

  if (flag === 'codemaster-victory') {
    lastProof =
      guesses === undefined
        ? await generateRecursiveRandomProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey,
            contractAddress
          )
        : await generateRecursiveGuessProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey,
            contractAddress
          );
    return lastProof;
  } else if (flag === 'codebreaker-victory') {
    lastProof =
      guesses === undefined
        ? await generateRecursiveRandomProof(
            rounds - 1,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey,
            contractAddress
          )
        : await generateRecursiveGuessProof(
            rounds - 1,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey,
            contractAddress
          );

    // Last step that simulates the correct secret submission by codeBreaker.
    lastProof = await StepProgramMakeGuess(
      lastProof,
      secret,
      codeBreakerKey,
      contractAddress
    );

    // Return the last proof that result is checked by codeMaster.
    return await StepProgramGiveClue(
      lastProof,
      secret,
      salt,
      codeMasterKey,
      contractAddress
    );
  } else if (flag === 'unsolved') {
    lastProof =
      guesses === undefined
        ? await generateRecursiveRandomProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey,
            contractAddress
          )
        : await generateRecursiveGuessProof(
            rounds,
            lastProof,
            salt,
            secret,
            codeBreakerKey,
            codeMasterKey,
            contractAddress
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
const secretCombination = [6, 3, 1, 4];

const gameGuesses = {
  totalAttempts: [
    [2, 1, 3, 4],
    [5, 3, 7, 1],
    [3, 5, 1, 2],
    [2, 4, 3, 5],
    [5, 4, 3, 2],
    [5, 3, 7, 2],
    [5, 3, 2, 1],
    [3, 1, 7, 2],
    [5, 4, 6, 2],
    [5, 3, 6, 2],
    [5, 3, 6, 7],
    [5, 3, 7, 2],
    [7, 3, 5, 2],
    [5, 2, 1, 3],
    [4, 3, 5, 2],
    [4, 3, 3, 2],
    [7, 1, 3, 2],
    [4, 3, 5, 2],
    [4, 7, 3, 1],
  ],
};
