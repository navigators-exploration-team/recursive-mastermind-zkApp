import { Field, Poseidon, PrivateKey } from 'o1js';
import {
  generateTestProofs,
  gameGuesses,
  secretCombination,
} from './testUtils';
import { StepProgram } from '../stepProgram';

describe('Should generate StepProgramProof for given parameters', () => {
  let codeMasterKey: PrivateKey;
  let codeBreakerKey: PrivateKey;
  let codeMasterSalt: Field;
  let secret: number[];

  beforeAll(async () => {
    codeBreakerKey = PrivateKey.random();
    codeMasterKey = PrivateKey.random();
    codeMasterSalt = Field.random();

    const proofsEnabled = false;

    // Can be changed depending on need.
    secret = secretCombination;

    await StepProgram.compile({
      proofsEnabled,
    });
  });

  it('Should generate codeMaster victory proof with random actions', async () => {
    // On-chain limit for maxAttempts (if not specified for a custom value) is 15. Any attempts equal to 15 and not solved (or any attempts that is greater than 15) would lead to codemaster's victory.
    const rounds = 15;
    const winnerFlag = 'codemaster-victory';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey
    );

    const publicOutputs = proof.publicOutput;

    // Get outputted numbers and history
    const outputNumbers = separateCombinationDigits(
      proof.publicOutput.lastGuess
    );

    const computedHash = Poseidon.hash([...outputNumbers, salt]);

    const solutionHash = proof.publicOutput.solutionHash;
    expect(solutionHash).not.toEqual(computedHash);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate codeBreaker victory proof with random actions', async () => {
    const rounds = 7;
    const winnerFlag = 'codebreaker-victory';
    const actions = gameGuesses;
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = separateCombinationDigits(publicOutputs.lastGuess);

    // Getting until round - 1, since in proof generation first round - 1 elements are used before secret combination.
    const attemptList = actions.totalAttempts.slice(0, rounds - 1);
    attemptList.push(secretCombination);

    const computedHash = Poseidon.hash([...outputNumbers, salt]);
    const solutionHash = publicOutputs.solutionHash;

    expect(solutionHash).toEqual(computedHash);
    expect(outputNumbers.map(Number)).toEqual([6, 3, 8, 4]);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate an unsolved game proof with random actions.', async () => {
    const rounds = 10;
    const winnerFlag = 'unsolved';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = separateCombinationDigits(publicOutputs.lastGuess);

    const computedHash = Poseidon.hash([...outputNumbers, salt]);
    const solutionHash = publicOutputs.solutionHash;

    expect(solutionHash).not.toEqual(computedHash);

    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate codeMaster victory proof with predefined actions.', async () => {
    const rounds = 15;
    const winnerFlag = 'codemaster-victory';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    // Get outputted numbers and history
    const outputNumbers = separateCombinationDigits(
      proof.publicOutput.lastGuess
    );

    const history = deserializeCombinationHistory(
      proof.publicOutput.packedGuessHistory
    );
    const separatedHistory = Array.from({ length: rounds }, (_, i) =>
      separateCombinationDigits(history[i]).map(Number)
    );
    const attemptList = gameGuesses.totalAttempts.slice(0, rounds);

    const computedHash = Poseidon.hash([...outputNumbers, salt]);
    let secretDigits = secret.map(Field);

    const myHash = Poseidon.hash([...secretDigits, salt]);
    const solutionHash = proof.publicOutput.solutionHash;

    expect(myHash).toEqual(solutionHash);

    expect(separatedHistory).toEqual(attemptList);
    expect(solutionHash).not.toEqual(computedHash);
    expect(outputNumbers.map(Number)).toEqual([8, 3, 5, 2]);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate codeBreaker victory proof with predefined actions', async () => {
    const rounds = 7;
    const winnerFlag = 'codebreaker-victory';
    const actions = gameGuesses;
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = separateCombinationDigits(publicOutputs.lastGuess);
    const history = deserializeCombinationHistory(
      publicOutputs.packedGuessHistory
    );
    const separatedHistory = Array.from({ length: rounds }, (_, i) =>
      separateCombinationDigits(history[i]).map(Number)
    );

    // Getting until round - 1, since in proof generation first round - 1 elements are used before secret combination.
    const attemptList = actions.totalAttempts.slice(0, rounds - 1);
    attemptList.push(secretCombination);

    const computedHash = Poseidon.hash([...outputNumbers, salt]);
    const solutionHash = publicOutputs.solutionHash;

    expect(separatedHistory).toEqual(attemptList);
    expect(solutionHash).toEqual(computedHash);
    expect(outputNumbers.map(Number)).toEqual([6, 3, 8, 4]);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate an unsolved game proof with predefined actions.', async () => {
    const rounds = 10;
    const winnerFlag = 'unsolved';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = separateCombinationDigits(publicOutputs.lastGuess);

    const history = deserializeCombinationHistory(
      publicOutputs.packedGuessHistory
    );
    const separatedHistory = Array.from({ length: rounds }, (_, i) =>
      separateCombinationDigits(history[i]).map(Number)
    );

    const attemptList = gameGuesses.totalAttempts.slice(0, rounds);

    const computedHash = Poseidon.hash([...outputNumbers, salt]);
    const solutionHash = publicOutputs.solutionHash;

    expect(separatedHistory).toEqual(attemptList);
    expect(solutionHash).not.toEqual(computedHash);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });
});
