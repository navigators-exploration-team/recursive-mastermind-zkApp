import { Field, PrivateKey, PublicKey, UInt8, Signature, Poseidon } from 'o1js';
import {
  compressCombinationDigits,
  separateCombinationDigits,
  serializeClue,
} from './utils';
import { StepProgram, StepProgramProof } from './stepProgram';

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

    // Generate secret combination for the codemaster
    unseparatedSecretCombination = Field.from(1234);

    // Generate random field as salt for the codemaster
    codeMasterSalt = Field.random();

    codeBreakerKey = PrivateKey.random();
    codeBreakerPubKey = codeBreakerKey.toPublicKey();
    codeBreakerId = Poseidon.hash(codeBreakerPubKey.toFields());
  });
  async function testInvalidCreateGame(
    combination: number[],
    expectedErrorMessage?: string
  ) {
    const maxAttempts = UInt8.from(5);
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
        maxAttempts,
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
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
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
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
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
    it('should reject codemaster with invalid secret combination: second digit is 0', async () => {
      const expectedErrorMessage = 'Combination digit 2 should not be zero!';
      await testInvalidCreateGame([5, 0, 4, 6], expectedErrorMessage);
    });

    it('should reject codemaster with invalid secret combination: third digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 3 is not unique!';
      await testInvalidCreateGame([2, 3, 2, 9], expectedErrorMessage);
    });

    it('should reject creating a game with less than 5 attempts', async () => {
      const maxAttempts = UInt8.from(4);

      const gameCreation = async () => {
        await StepProgram.createGame(
          {
            authPubKey: codeMasterPubKey,
            authSignature: Signature.create(codeMasterKey, [
              unseparatedSecretCombination,
              codeMasterSalt,
              Field.from(
                lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
              ),
            ]),
          },
          maxAttempts,
          unseparatedSecretCombination,
          codeMasterSalt
        );
      };

      const expectedErrorMessage =
        'The minimum number of attempts allowed is 5!';
      await expect(gameCreation).rejects.toThrowError(expectedErrorMessage);
    });

    it('should reject creating a game with more than 15 attempts', async () => {
      const maxAttempts = UInt8.from(16);

      const gameCreation = async () => {
        await StepProgram.createGame(
          {
            authPubKey: codeMasterPubKey,
            authSignature: Signature.create(codeMasterKey, [
              unseparatedSecretCombination,
              codeMasterSalt,
              Field.from(
                lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
              ),
            ]),
          },
          maxAttempts,
          unseparatedSecretCombination,
          codeMasterSalt
        );
      };

      const expectedErrorMessage =
        'The maximum number of attempts allowed is 15!';
      await expect(gameCreation).rejects.toThrowError(expectedErrorMessage);
    });

    it('should create a game successfully', async () => {
      const stepProof = await StepProgram.createGame(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        UInt8.from(5),
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
      expect(publicOutputs.isSolved.toBoolean()).toEqual(false);
      expect(publicOutputs.turnCount.toNumber()).toEqual(1);
      expect(publicOutputs.maxAttempts.toNumber()).toEqual(5);

      lastProof = stepProof.proof;
    });
  });

  describe('makeGuess method tests: first guess', () => {
    it('should reject codebreaker with invalid guess combination: fouth digit is 0', async () => {
      const expectedErrorMessage = 'Combination digit 4 should not be zero!';
      await testInvalidGuess([6, 9, 3, 0], expectedErrorMessage);
    });

    it('should reject codebreaker with invalid guess combination: second digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 2 is not unique!';
      await testInvalidGuess([1, 1, 2, 9], expectedErrorMessage);
    });

    it('should reject giveClue in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codebreaker to make a guess!';
      await testInvalidClue([1, 2, 3, 4], expectedErrorMessage);
    });

    it('codebreaker should make a guess successfully', async () => {
      const firstGuess = [1, 5, 6, 2];
      const unseparatedGuess = compressCombinationDigits(firstGuess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
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
      expect(publicOutputs.isSolved.toBoolean()).toEqual(false);
      expect(publicOutputs.turnCount.toNumber()).toEqual(2);
      expect(publicOutputs.maxAttempts.toNumber()).toEqual(5);

      lastProof = stepProof.proof;
    });

    it('should reject makeGuess in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codemaster to give you a clue!';

      await testInvalidGuess([2, 3, 4, 5], expectedErrorMessage);
    });
  });

  describe('giveClue method tests', () => {
    it('should reject any caller other than the codemaster', async () => {
      const expectedErrorMessage =
        'Only the codemaster of this game is allowed to give clue!';
      await testInvalidClue(
        [1, 2, 3, 4],
        expectedErrorMessage,
        PrivateKey.random()
      );
    });
    it('should reject codemaster with different salt', async () => {
      const differentSalt = Field.random();
      const expectedErrorMessage =
        'The secret combination is not compliant with the stored hash on-chain!';
      await testInvalidClue(
        [1, 2, 3, 4],
        expectedErrorMessage,
        codeMasterKey,
        differentSalt
      );
    });
    it('should reject codemaster with non-compliant secret combination', async () => {
      const expectedErrorMessage =
        'The secret combination is not compliant with the stored hash on-chain!';
      await testInvalidClue([1, 5, 3, 4], expectedErrorMessage);
    });
    it('codemaster should give clue successfully', async () => {
      const stepProof = await StepProgram.giveClue(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedSecretCombination,
        codeMasterSalt
      );

      const publicOutputs = stepProof.proof.publicOutput;

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(Field.from(1562));
      expect(publicOutputs.serializedClue).toEqual(
        serializeClue([2, 0, 0, 1].map(Field))
      );
      expect(publicOutputs.isSolved.toBoolean()).toEqual(false);
      expect(publicOutputs.turnCount.toNumber()).toEqual(3);
      expect(publicOutputs.maxAttempts.toNumber()).toEqual(5);

      lastProof = stepProof.proof;
    });
    it('should reject the codemaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codebreaker to make a guess!';
      await testInvalidClue([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('second guess', () => {
    it('should reject any caller other than the codebreaker', async () => {
      const expectedErrorMessage = 'You are not the codebreaker of this game!';
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
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedGuess
      );

      const publicOutputs = stepProof.proof.publicOutput;

      expect(publicOutputs.lastGuess).toEqual(unseparatedGuess);
      expect(publicOutputs.turnCount.toNumber()).toEqual(4);

      lastProof = stepProof.proof;
    });
    it('should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codemaster to give you a clue!';
      await testInvalidGuess([1, 2, 4, 8], expectedErrorMessage);
    });
  });

  describe('test game to completion reaching number limit of attempts=5', () => {
    async function makeGuess(guess: number[]) {
      const unseparatedGuess = compressCombinationDigits(guess.map(Field));

      const stepProof = await StepProgram.makeGuess(
        {
          authPubKey: codeBreakerPubKey,
          authSignature: Signature.create(codeBreakerKey, [
            unseparatedGuess,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedGuess
      );

      lastProof = stepProof.proof;
    }

    async function giveClue(expectedClue: number[]) {
      const stepProof = await StepProgram.giveClue(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
            Field.from(
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedSecretCombination,
        codeMasterSalt
      );

      const publicOutputs = stepProof.proof.publicOutput;

      expect(publicOutputs.serializedClue).toEqual(
        serializeClue(expectedClue.map(Field))
      );

      lastProof = stepProof.proof;
    }

    it('should give clue of second guess', async () => {
      await giveClue([2, 1, 0, 1]);
    });

    it('should make third guess', async () => {
      await makeGuess([1, 3, 4, 8]);
    });

    it('should give clue of third guess', async () => {
      await giveClue([2, 1, 1, 0]);
    });

    it('should make fourth guess', async () => {
      await makeGuess([5, 8, 3, 7]);
    });

    it('should give clue of fourth guess', async () => {
      await giveClue([0, 0, 2, 0]);
    });

    it('should make fifth guess', async () => {
      await makeGuess([9, 1, 2, 4]);
    });

    it('should give clue of fifth guess', async () => {
      await giveClue([0, 1, 1, 2]);
    });

    it('should reject 6th guess: reached limited number of attempts', async () => {
      const expectedErrorMessage =
        'You have reached the number limit of attempts to solve the secret combination!';
      await testInvalidGuess([1, 2, 3, 4], expectedErrorMessage);
    });

    it('should reject giving 6th clue: reached limited number of attempts', async () => {
      const expectedErrorMessage =
        'The codebreaker has finished the number of attempts without solving the secret combination!';
      await testInvalidClue([2, 2, 2, 2], expectedErrorMessage);
    });
  });

  describe('new game after completion', () => {
    it('should create a new game successfully with new secret', async () => {
      // Generate new secret combination for the codemaster
      unseparatedSecretCombination = Field.from(7163);

      const stepProof = await StepProgram.createGame(
        {
          authPubKey: codeMasterPubKey,
          authSignature: Signature.create(codeMasterKey, [
            unseparatedSecretCombination,
            codeMasterSalt,
          ]),
        },
        UInt8.from(5),
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
      expect(publicOutputs.isSolved.toBoolean()).toEqual(false);
      expect(publicOutputs.turnCount.toNumber()).toEqual(1);
      expect(publicOutputs.maxAttempts.toNumber()).toEqual(5);

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
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
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
      expect(publicOutputs.isSolved.toBoolean()).toEqual(false);
      expect(publicOutputs.turnCount.toNumber()).toEqual(2);
      expect(publicOutputs.maxAttempts.toNumber()).toEqual(5);

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
              lastProof ? lastProof.publicOutput.turnCount.toNumber() : 1
            ),
          ]),
        },
        lastProof,
        unseparatedCombination,
        codeMasterSalt
      );

      const publicOutputs = stepProof.proof.publicOutput;

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.solutionHash).toEqual(
        lastProof.publicOutput.solutionHash
      );
      expect(publicOutputs.lastGuess).toEqual(Field.from(7163));
      expect(publicOutputs.serializedClue).toEqual(
        serializeClue([2, 2, 2, 2].map(Field))
      );

      expect(publicOutputs.isSolved.toBoolean()).toEqual(true);
      expect(publicOutputs.turnCount.toNumber()).toEqual(3);
      expect(publicOutputs.maxAttempts.toNumber()).toEqual(5);

      lastProof = stepProof.proof;
    });

    it('should reject next guess: secret is already solved', async () => {
      const expectedErrorMessage =
        'You have already solved the secret combination!';
      await testInvalidGuess([1, 2, 3, 4], expectedErrorMessage);
    });

    it('should reject next clue: secret is already solved', async () => {
      const expectedErrorMessage =
        'The codebreaker has already solved the secret combination!';
      await testInvalidClue([2, 2, 2, 2], expectedErrorMessage);
    });
  });
});
