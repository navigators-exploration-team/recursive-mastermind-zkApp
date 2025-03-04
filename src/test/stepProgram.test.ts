import { Field, PrivateKey, PublicKey, Poseidon, Signature } from 'o1js';
import {
  compressCombinationDigits,
  deserializeClue,
  deserializeClueHistory,
  deserializeCombinationHistory,
  separateCombinationDigits,
  serializeClue,
} from '../utils';
import { StepProgram, StepProgramProof } from '../stepProgram';
import {
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramMakeGuess,
} from './testUtils';

describe('Mastermind ZkProgram Tests', () => {
  // Global variables
  let codeMasterKey: PrivateKey;
  let codeMasterPubKey: PublicKey;
  let codeMasterSalt: Field;
  let codeMasterId: Field;

  let codeBreakerKey: PrivateKey;
  let codeBreakerPubKey: PublicKey;
  let codeBreakerId: Field;

  // Compressed secret combination for codeMaster
  let secretCombination: number[];
  let unseparatedSecretCombination: Field;

  // Hold the last proof we produced
  let lastProof: StepProgramProof;

  beforeAll(async () => {
    // Compile the ZkProgram before tests
    await StepProgram.compile();

    // Create codeMaster keys & derive ID
    codeMasterKey = PrivateKey.random();
    codeMasterPubKey = codeMasterKey.toPublicKey();
    codeMasterId = Poseidon.hash(codeMasterPubKey.toFields());

    // Generate secret combination for the codeMaster
    secretCombination = [1, 2, 3, 4];
    unseparatedSecretCombination = Field.from(1234);

    // Generate random field as salt for the codeMaster
    codeMasterSalt = Field.random();

    // Create codeBreaker keys & derive ID
    codeBreakerKey = PrivateKey.random();
    codeBreakerPubKey = codeBreakerKey.toPublicKey();
    codeBreakerId = Poseidon.hash(codeBreakerPubKey.toFields());
  });

  async function expectCreateGameToFail(
    combination: number[],
    expectedErrorMessage?: string
  ) {
    await expect(async () => {
      await StepProgramCreateGame(combination, codeMasterSalt, codeMasterKey);
    }).rejects.toThrowError(expectedErrorMessage);
  }
  async function expectGuessToFail(
    guess: number[],
    expectedErrorMessage?: string,
    signerKey = codeBreakerKey
  ) {
    await expect(async () => {
      await StepProgramMakeGuess(lastProof, guess, signerKey);
    }).rejects.toThrowError(expectedErrorMessage);
  }

  async function expectGiveClueToFail(
    combination: number[],
    expectedErrorMessage?: string,
    signerKey = codeMasterKey,
    signerSalt = codeMasterSalt
  ) {
    const giveClue = async () => {
      await StepProgramGiveClue(lastProof, combination, signerSalt, signerKey);
    };

    if (expectedErrorMessage)
      await expect(giveClue).rejects.toThrowError(expectedErrorMessage);
    else await expect(giveClue).rejects.toThrow();
  }

  describe('createGame method', () => {
    it('should reject codeMaster with invalid secret combination: second digit is 0', async () => {
      const expectedErrorMessage = 'Combination digit 2 should not be zero!';
      await expectCreateGameToFail([5, 0, 4, 6], expectedErrorMessage);
    });

    it('should reject codeMaster with invalid secret combination: third digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 3 is not unique!';
      await expectCreateGameToFail([2, 3, 2, 9], expectedErrorMessage);
    });

    it('should create a game successfully', async () => {
      lastProof = await StepProgramCreateGame(
        secretCombination,
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(Field.empty());
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([
          ...separateCombinationDigits(unseparatedSecretCombination),
          codeMasterSalt,
        ])
      );
      expect(publicOutputs.lastGuess).toEqual(Field.empty());
      expect(publicOutputs.serializedClue).toEqual(Field.empty());
      expect(publicOutputs.turnCount.toBigInt()).toEqual(1n);
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(Field.from(0));
    });
  });

  describe('makeGuess method tests: first guess', () => {
    it('should reject codeBreaker with invalid guess combination: fouth digit is 0', async () => {
      const expectedErrorMessage = 'Combination digit 4 should not be zero!';
      await expectGuessToFail([6, 9, 3, 0], expectedErrorMessage);
    });

    it('should reject codeBreaker with invalid guess combination: second digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 2 is not unique!';
      await expectGuessToFail([1, 1, 2, 9], expectedErrorMessage);
    });

    it('should reject giveClue in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });

    it('codeBreaker should make a guess successfully', async () => {
      const firstGuess = [1, 5, 6, 2];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));
      lastProof = await StepProgramMakeGuess(
        lastProof,
        firstGuess,
        codeBreakerKey
      );

      const publicOutputs = lastProof.publicOutput;
      const deserializedGuess = deserializeCombinationHistory(
        publicOutputs.packedGuessHistory
      )[0];

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );

      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.lastGuess).toEqual(deserializedGuess);
      expect(publicOutputs.serializedClue).toEqual(Field.empty());
      expect(publicOutputs.turnCount.toBigInt()).toEqual(2n);
      expect(deserializedGuess).toEqual(unseparatedGuess);
    });

    it('should reject makeGuess in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';

      await expectGuessToFail([2, 3, 4, 5], expectedErrorMessage);
    });
  });

  describe('giveClue method tests', () => {
    it('should reject any caller other than the codeMaster', async () => {
      const expectedErrorMessage =
        'Only the codeMaster of this game is allowed to give clue!';
      await expectGiveClueToFail(
        [1, 2, 3, 4],
        expectedErrorMessage,
        PrivateKey.random()
      );
    });

    it('should reject codeMaster with different salt', async () => {
      const differentSalt = Field.random();
      const expectedErrorMessage =
        'The secret combination is not compliant with the initial hash from game creation!';
      await expectGiveClueToFail(
        [1, 2, 3, 4],
        expectedErrorMessage,
        codeMasterKey,
        differentSalt
      );
    });

    it('should reject codeMaster with non-compliant secret combination', async () => {
      const expectedErrorMessage =
        'The secret combination is not compliant with the initial hash from game creation!';
      await expectGiveClueToFail([1, 5, 3, 4], expectedErrorMessage);
    });

    it('codeMaster should give clue successfully', async () => {
      lastProof = await StepProgramGiveClue(
        lastProof,
        [1, 2, 3, 4],
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;

      const deserializedClue = deserializeClueHistory(
        publicOutputs.packedClueHistory
      )[0];

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(Field.from(1562));

      expect(publicOutputs.serializedClue).toEqual(
        serializeClue([2, 0, 0, 1].map(Field))
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(3n);
      expect(publicOutputs.packedClueHistory).toEqual(deserializedClue);
    });

    it('should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('second guess', () => {
    it('should reject any caller other than the codeBreaker', async () => {
      const expectedErrorMessage = 'You are not the codeBreaker of this game!';
      await expectGuessToFail(
        [1, 4, 7, 2],
        expectedErrorMessage,
        PrivateKey.random()
      );
    });

    it('should accept another valid guess', async () => {
      const secondGuess = [1, 4, 7, 2];
      const unseparatedGuess = compressCombinationDigits(
        secondGuess.map(Field)
      );

      lastProof = await StepProgramMakeGuess(
        lastProof,
        secondGuess,
        codeBreakerKey
      );

      const publicOutputs = lastProof.publicOutput;
      const [firstData, secondData] = deserializeCombinationHistory(
        publicOutputs.packedGuessHistory
      );

      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.turnCount.toBigInt()).toEqual(4n);
      expect(firstData).toEqual(Field.from(1562));
      expect(secondData).toEqual(unseparatedGuess);
    });

    it('should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await expectGuessToFail([1, 2, 4, 8], expectedErrorMessage);
    });
  });

  describe('new game after completion', () => {
    it('should create a new game successfully with new secret', async () => {
      // Generate new secret combination for the codeMaster
      secretCombination = [7, 1, 6, 3];
      unseparatedSecretCombination = Field.from(7163);

      lastProof = await StepProgramCreateGame(
        secretCombination,
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(Field.empty());
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([
          ...separateCombinationDigits(unseparatedSecretCombination),
          codeMasterSalt,
        ])
      );
      expect(publicOutputs.lastGuess).toEqual(Field.empty());
      expect(publicOutputs.serializedClue).toEqual(Field.empty());
      expect(publicOutputs.turnCount.toBigInt()).toEqual(1n);
    });

    it('should solve the game in the first round', async () => {
      const firstGuess = [7, 1, 6, 3];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      lastProof = await StepProgramMakeGuess(
        lastProof,
        firstGuess,
        codeBreakerKey
      );

      const publicOutputs = lastProof.publicOutput;

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.serializedClue).toEqual(Field.empty());
      expect(publicOutputs.turnCount.toBigInt()).toEqual(2n);
    });

    it('should give clue and report that the secret is solved', async () => {
      lastProof = await StepProgramGiveClue(
        lastProof,
        [7, 1, 6, 3],
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;
      const deserializedClue = deserializeClueHistory(
        publicOutputs.packedClueHistory
      )[0];
      const clue = deserializeClue(deserializedClue);

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(Field.from(7163));
      expect(publicOutputs.serializedClue).toEqual(
        serializeClue([2, 2, 2, 2].map(Field))
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(3n);
      expect(clue).toEqual([2, 2, 2, 2].map(Field));
    });

    it('should reject next guess: secret is already solved', async () => {
      const expectedErrorMessage =
        'You have already solved the secret combination!';
      await expectGuessToFail([1, 2, 3, 4], expectedErrorMessage);
    });

    it('should reject next clue: secret is already solved', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([2, 2, 2, 2], expectedErrorMessage);
    });
  });

  describe('Another new game after second completion for Clue comparison', () => {
    it('should create a new game successfully with new secret', async () => {
      // Generate new secret combination for the codeMaster
      unseparatedSecretCombination = Field.from(6384);

      const stepProof = await StepProgram.createGame(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
          ]),
        },
        unseparatedSecretCombination,
        codeMasterSalt
      );

      const publicOutputs = stepProof.proof.publicOutput;

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(Field.empty());
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([
          ...separateCombinationDigits(unseparatedSecretCombination),
          codeMasterSalt,
        ])
      );
      expect(publicOutputs.lastGuess).toEqual(Field.empty());
      expect(publicOutputs.serializedClue).toEqual(Field.empty());
      expect(publicOutputs.turnCount.toBigInt()).toEqual(1n);

      lastProof = stepProof.proof;
    });

    it('Should make a correct number - wrong position guess', async () => {
      const firstGuess = [8, 4, 6, 3];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1n
            ),
          ]),
        },
        lastProof,
        unseparatedGuess
      );

      const publicOutputs = stepProof.proof.publicOutput;

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.serializedClue).toEqual(Field.empty());
      expect(publicOutputs.turnCount.toBigInt()).toEqual(2n);

      lastProof = stepProof.proof;
    });

    it('should give clue and report that the secret is solved', async () => {
      const unseparatedCombination = compressCombinationDigits(
        [6, 3, 8, 4].map(Field)
      );

      const stepProof = await StepProgram.giveClue(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1n
            ),
          ]),
        },
        lastProof,
        unseparatedCombination,
        codeMasterSalt
      );

      const publicOutputs = stepProof.proof.publicOutput;

      const deserializedClue = deserializeClueHistory(
        publicOutputs.packedClueHistory
      )[0];

      const clue = deserializeClue(deserializedClue);

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(Field.from(8463));
      expect(publicOutputs.serializedClue).toEqual(
        serializeClue([1, 1, 1, 1].map(Field))
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(3n);
      expect(clue).toEqual([1, 1, 1, 1].map(Field));
      expect(deserializedClue.toBigInt()).toEqual(85n); // it is stored as [01010101], which is 85.

      lastProof = stepProof.proof;
    });
  });
});
