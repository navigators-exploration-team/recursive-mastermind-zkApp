import { Field, PrivateKey, PublicKey, Signature, Poseidon } from 'o1js';
import {
  compressCombinationDigits,
  deserializeClue,
  deserializeClueHistory,
  deserializeCombinationHistory,
  separateCombinationDigits,
  serializeClue,
} from '../utils';
import { StepProgram, StepProgramProof } from '../stepProgram';

describe('Mastermind ZkProgram Tests', () => {
  let codeMasterKey: PrivateKey,
    codeMasterPubKey: PublicKey,
    codeMasterSalt: Field,
    codeMasterId: Field,
    codeBreakerKey: PrivateKey,
    codeBreakerPubKey: PublicKey,
    codeBreakerId: Field,
    unseparatedSecretCombination: Field,
    lastProof: StepProgramProof;

  beforeAll(async () => {
    await StepProgram.compile();

    codeMasterKey = PrivateKey.random();
    codeMasterPubKey = codeMasterKey.toPublicKey();
    codeMasterId = Poseidon.hash(codeMasterPubKey.toFields());

    // Generate secret combination for the codeMaster
    unseparatedSecretCombination = Field.from(1234);

    // Generate random field as salt for the codeMaster
    codeMasterSalt = Field.random();

    codeBreakerKey = PrivateKey.random();
    codeBreakerPubKey = codeBreakerKey.toPublicKey();
    codeBreakerId = Poseidon.hash(codeBreakerPubKey.toFields());
  });

  async function testInvalidCreateGame(
    combination: number[],
    expectedErrorMessage?: string
  ) {
    const secretCombination = compressCombinationDigits(combination.map(Field));

    const gameCreation = async () => {
      await StepProgram.createGame(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            secretCombination,
            codeMasterSalt,
          ]),
        },
        secretCombination,
        codeMasterSalt
      );
    };

    await expect(gameCreation).rejects.toThrowError(expectedErrorMessage);
  }
  async function testInvalidGuess(
    guess: number[],
    expectedErrorMessage?: string,
    signerKey = codeBreakerKey
  ) {
    const unseparatedGuess = compressCombinationDigits(guess.map(Field));

    const makeGuess = async () => {
      await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(signerKey, [
            unseparatedGuess,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1n
            ),
          ]),
        },
        lastProof,
        unseparatedGuess
      );
    };

    await expect(makeGuess).rejects.toThrowError(expectedErrorMessage);
  }

  async function testInvalidClue(
    combination: number[],
    expectedErrorMessage?: string,
    signerKey = codeMasterKey,
    signerSalt = codeMasterSalt
  ) {
    const unseparatedCombination = compressCombinationDigits(
      combination.map(Field)
    );

    const giveClue = async () => {
      await StepProgram.giveClue(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(signerKey, [
            unseparatedCombination,
            signerSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1n
            ),
          ]),
        },
        lastProof,
        unseparatedCombination,
        signerSalt
      );
    };

    if (expectedErrorMessage)
      await expect(giveClue).rejects.toThrowError(expectedErrorMessage);
    else await expect(giveClue).rejects.toThrow();
  }

  describe('createGame method', () => {
    it('should reject codeMaster with invalid secret combination: second digit is 0', async () => {
      const expectedErrorMessage = 'Combination digit 2 should not be zero!';
      await testInvalidCreateGame([5, 0, 4, 6], expectedErrorMessage);
    });

    it('should reject codeMaster with invalid secret combination: third digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 3 is not unique!';
      await testInvalidCreateGame([2, 3, 2, 9], expectedErrorMessage);
    });

    it('should create a game successfully', async () => {
      const stepProof = await StepProgram.createGame(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1n
            ),
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
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(Field.from(0));

      lastProof = stepProof.proof;
    });
  });

  describe('makeGuess method tests: first guess', () => {
    it('should reject codeBreaker with invalid guess combination: fouth digit is 0', async () => {
      const expectedErrorMessage = 'Combination digit 4 should not be zero!';
      await testInvalidGuess([6, 9, 3, 0], expectedErrorMessage);
    });

    it('should reject codeBreaker with invalid guess combination: second digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 2 is not unique!';
      await testInvalidGuess([1, 1, 2, 9], expectedErrorMessage);
    });

    it('should reject giveClue in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await testInvalidClue([1, 2, 3, 4], expectedErrorMessage);
    });

    it('codeBreaker should make a guess successfully', async () => {
      const firstGuess = [1, 5, 6, 2];
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
      const deserializedGuess = deserializeCombinationHistory(
        publicOutputs.packedGuessHistory
      )[0];

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.lastGuess).toEqual(deserializedGuess);
      expect(publicOutputs.serializedClue).toEqual(Field.empty());
      expect(publicOutputs.turnCount.toBigInt()).toEqual(2n);
      expect(deserializedGuess).toEqual(unseparatedGuess);
      lastProof = stepProof.proof;
    });

    it('should reject makeGuess in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';

      await testInvalidGuess([2, 3, 4, 5], expectedErrorMessage);
    });
  });

  describe('giveClue method tests', () => {
    it('should reject any caller other than the codeMaster', async () => {
      const expectedErrorMessage =
        'Only the codeMaster of this game is allowed to give clue!';
      await testInvalidClue(
        [1, 2, 3, 4],
        expectedErrorMessage,
        PrivateKey.random()
      );
    });

    it('should reject codeMaster with different salt', async () => {
      const differentSalt = Field.random();
      const expectedErrorMessage =
        'The secret combination is not compliant with the initial hash from game creation!';
      await testInvalidClue(
        [1, 2, 3, 4],
        expectedErrorMessage,
        codeMasterKey,
        differentSalt
      );
    });

    it('should reject codeMaster with non-compliant secret combination', async () => {
      const expectedErrorMessage =
        'The secret combination is not compliant with the initial hash from game creation!';
      await testInvalidClue([1, 5, 3, 4], expectedErrorMessage);
    });

    it('codeMaster should give clue successfully', async () => {
      const stepProof = await StepProgram.giveClue(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toBigInt() : 1n
            ),
          ]),
        },
        lastProof,
        unseparatedSecretCombination,
        codeMasterSalt
      );

      const publicOutputs = stepProof.proof.publicOutput;
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

      lastProof = stepProof.proof;
    });

    it('should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await testInvalidClue([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('second guess', () => {
    it('should reject any caller other than the codeBreaker', async () => {
      const expectedErrorMessage = 'You are not the codeBreaker of this game!';
      await testInvalidGuess(
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
      const [firstData, secondData] = deserializeCombinationHistory(
        publicOutputs.packedGuessHistory
      );

      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.turnCount.toBigInt()).toEqual(4n);
      expect(firstData).toEqual(Field.from(1562));
      expect(secondData).toEqual(unseparatedGuess);

      lastProof = stepProof.proof;
    });

    it('should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await testInvalidGuess([1, 2, 4, 8], expectedErrorMessage);
    });
  });

  describe('new game after completion', () => {
    it('should create a new game successfully with new secret', async () => {
      // Generate new secret combination for the codeMaster
      unseparatedSecretCombination = Field.from(7163);

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

    it('should solve the game in the first round', async () => {
      const firstGuess = [7, 1, 6, 3];
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
        [7, 1, 6, 3].map(Field)
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
      expect(publicOutputs.lastGuess).toEqual(Field.from(7163));
      expect(publicOutputs.serializedClue).toEqual(
        serializeClue([2, 2, 2, 2].map(Field))
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(3n);
      expect(clue).toEqual([2, 2, 2, 2].map(Field));

      lastProof = stepProof.proof;
    });

    it('should reject next guess: secret is already solved', async () => {
      const expectedErrorMessage =
        'You have already solved the secret combination!';
      await testInvalidGuess([1, 2, 3, 4], expectedErrorMessage);
    });

    it('should reject next clue: secret is already solved', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await testInvalidClue([2, 2, 2, 2], expectedErrorMessage);
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
