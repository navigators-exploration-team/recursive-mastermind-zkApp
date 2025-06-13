import { Field, Poseidon, PrivateKey, PublicKey } from 'o1js';
import {
  generateTestProofs,
  gameGuesses,
  secretCombination,
} from './testUtils';
import { StepProgram } from '../stepProgram';
import { Combination } from '../utils';

describe('Should generate StepProgramProof for given parameters', () => {
  let codeMasterKey: PrivateKey;
  let codeBreakerKey: PrivateKey;
  let codeMasterSalt: Field;
  let secret: number[];
  let contractAddress: PublicKey;

  beforeAll(async () => {
    codeBreakerKey = PrivateKey.random();
    codeMasterKey = PrivateKey.random();
    codeMasterSalt = Field.random();
    secret = secretCombination;
    contractAddress = PrivateKey.random().toPublicKey();

    await StepProgram.compile({
      proofsEnabled: false,
    });
  });

  it('Should generate codeMaster victory proof with random actions', async () => {
    // On-chain limit for maxAttempts (if not specified for a custom value) is 7. Any attempts equal to 7 and not solved (or any attempts that is greater than 7) would lead to codemaster's victory.
    const rounds = 7;
    const winnerFlag = 'codemaster-victory';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      contractAddress
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = Combination.decompress(
      proof.publicOutput.lastCompressedGuess
    ).digits;

    const computedHash = Poseidon.hash([
      ...outputNumbers,
      salt,
      ...contractAddress.toFields(),
    ]);

    const solutionHash = proof.publicOutput.solutionHash;
    expect(solutionHash).not.toEqual(computedHash);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate codeBreaker victory proof with random actions', async () => {
    const rounds = 3;
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
      contractAddress
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = Combination.decompress(
      proof.publicOutput.lastCompressedGuess
    ).digits;

    // Getting until round - 1, since in proof generation first round - 1 elements are used before secret combination.
    const attemptList = actions.totalAttempts.slice(0, rounds - 1);
    attemptList.push(secretCombination);

    const computedHash = Poseidon.hash([
      ...outputNumbers,
      salt,
      ...contractAddress.toFields(),
    ]);
    const solutionHash = publicOutputs.solutionHash;

    expect(solutionHash).toEqual(computedHash);
    expect(outputNumbers.map(Number)).toEqual([6, 3, 1, 4]);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate an unsolved game proof with random actions.', async () => {
    const rounds = 4;
    const winnerFlag = 'unsolved';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      contractAddress,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = Combination.decompress(
      proof.publicOutput.lastCompressedGuess
    ).digits;

    const computedHash = Poseidon.hash([
      ...outputNumbers,
      salt,
      ...contractAddress.toFields(),
    ]);
    const solutionHash = publicOutputs.solutionHash;

    expect(solutionHash).not.toEqual(computedHash);

    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate codeMaster victory proof with predefined actions.', async () => {
    const rounds = 7;
    const winnerFlag = 'codemaster-victory';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      contractAddress,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    // Get outputted numbers and history
    const outputNumbers = Combination.decompress(
      proof.publicOutput.lastCompressedGuess
    ).digits;

    const separatedHistory = Array.from({ length: rounds }, (_, i) =>
      Combination.getElementFromHistory(
        proof.publicOutput.packedGuessHistory,
        Field(i)
      ).digits.map(Number)
    );
    const attemptList = gameGuesses.totalAttempts.slice(0, rounds);

    const computedHash = Poseidon.hash([
      ...outputNumbers,
      salt,
      ...contractAddress.toFields(),
    ]);
    let secretDigits = secret.map(Field);

    const myHash = Poseidon.hash([
      ...secretDigits,
      salt,
      ...contractAddress.toFields(),
    ]);
    const solutionHash = proof.publicOutput.solutionHash;

    expect(myHash).toEqual(solutionHash);

    expect(separatedHistory).toEqual(attemptList);
    expect(solutionHash).not.toEqual(computedHash);
    expect(outputNumbers.map(Number)).toEqual([5, 3, 2, 1]);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate codeBreaker victory proof with predefined actions', async () => {
    const rounds = 3;
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
      contractAddress,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = Combination.decompress(
      proof.publicOutput.lastCompressedGuess
    ).digits;
    const separatedHistory = Array.from({ length: rounds }, (_, i) =>
      Combination.getElementFromHistory(
        proof.publicOutput.packedGuessHistory,
        Field(i)
      ).digits.map(Number)
    );

    // Getting until round - 1, since in proof generation first round - 1 elements are used before secret combination.
    const attemptList = actions.totalAttempts.slice(0, rounds - 1);
    attemptList.push(secretCombination);

    const computedHash = Poseidon.hash([
      ...outputNumbers,
      salt,
      ...contractAddress.toFields(),
    ]);
    const solutionHash = publicOutputs.solutionHash;

    expect(separatedHistory).toEqual(attemptList);
    expect(solutionHash).toEqual(computedHash);
    expect(outputNumbers.map(Number)).toEqual([6, 3, 1, 4]);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });

  it('Should generate an unsolved game proof with predefined actions.', async () => {
    const rounds = 4;
    const winnerFlag = 'unsolved';
    const salt = codeMasterSalt;

    const proof = await generateTestProofs(
      winnerFlag,
      rounds,
      salt,
      secret,
      codeBreakerKey,
      codeMasterKey,
      contractAddress,
      gameGuesses
    );

    const publicOutputs = proof.publicOutput;

    const outputNumbers = Combination.decompress(
      proof.publicOutput.lastCompressedGuess
    ).digits;

    const separatedHistory = Array.from({ length: rounds }, (_, i) =>
      Combination.getElementFromHistory(
        proof.publicOutput.packedGuessHistory,
        Field(i)
      ).digits.map(Number)
    );

    const attemptList = gameGuesses.totalAttempts.slice(0, rounds);

    const computedHash = Poseidon.hash([
      ...outputNumbers,
      salt,
      ...contractAddress.toFields(),
    ]);
    const solutionHash = publicOutputs.solutionHash;

    expect(separatedHistory).toEqual(attemptList);
    expect(solutionHash).not.toEqual(computedHash);
    expect(BigInt(rounds)).toEqual(
      publicOutputs.turnCount.sub(1).div(2).toBigInt()
    );
  });
});
