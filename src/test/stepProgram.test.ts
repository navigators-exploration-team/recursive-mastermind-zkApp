import { Field, PrivateKey, PublicKey, Poseidon, UInt8 } from 'o1js';
import { Combination, Clue } from '../utils';
import { PublicOutputs, StepProgram, StepProgramProof } from '../stepProgram';
import {
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramGiveClueInvalidSignature,
  StepProgramMakeGuess,
  StepProgramMakeGuessInvalidSignature,
} from './testUtils';

const proofsEnabled = false;

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
  let secretNumbers: number[];
  let secretCombination: Combination;
  let lastGuessNumbers: number[];
  let lastGuess: Combination;
  let lastClue: Clue;
  let lastGuessHistory: Field;
  let lastClueHistory: Field;
  let guessCount: number;
  let clueCount: number;

  // Hold the last proof we produced
  let lastProof: StepProgramProof;

  beforeAll(async () => {
    // Compile the ZkProgram before tests
    await StepProgram.compile({ proofsEnabled });

    // Create codeMaster keys & derive ID
    codeMasterKey = PrivateKey.random();
    codeMasterPubKey = codeMasterKey.toPublicKey();
    codeMasterId = Poseidon.hash(codeMasterPubKey.toFields());

    // Generate secret combination for the codeMaster
    secretNumbers = [1, 2, 3, 4];
    secretCombination = Combination.from(secretNumbers);

    guessCount = 0;
    clueCount = 0;

    lastClueHistory = Field.from(0);
    lastGuessHistory = Field.from(0);

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
  async function expectMakeGuessToFail(
    guess: number[],
    expectedErrorMessage?: string,
    signerKey = codeBreakerKey,
    invalidSignatureConfig?: {
      wrongPubKey: boolean;
      wrongMessage: boolean;
      wrongSigner: boolean;
    }
  ) {
    const makeGuess = invalidSignatureConfig
      ? async () => {
          await StepProgramMakeGuessInvalidSignature(
            lastProof,
            guess,
            signerKey,
            invalidSignatureConfig
          );
        }
      : async () => {
          await StepProgramMakeGuess(lastProof, guess, signerKey);
        };
    if (expectedErrorMessage)
      await expect(makeGuess).rejects.toThrowError(expectedErrorMessage);
    else await expect(makeGuess).rejects.toThrow();
  }

  async function expectGiveClueToFail(
    combination: number[],
    expectedErrorMessage?: string,
    signerKey = codeMasterKey,
    signerSalt = codeMasterSalt,
    invalidSignatureConfig?: {
      wrongPubKey: boolean;
      wrongMessage: boolean;
      wrongSigner: boolean;
    }
  ) {
    const giveClue = invalidSignatureConfig
      ? async () => {
          await StepProgramGiveClueInvalidSignature(
            lastProof,
            combination,
            signerSalt,
            signerKey,
            invalidSignatureConfig
          );
        }
      : async () => {
          await StepProgramGiveClue(
            lastProof,
            combination,
            signerSalt,
            signerKey
          );
        };

    if (expectedErrorMessage)
      await expect(giveClue).rejects.toThrowError(expectedErrorMessage);
    else await expect(giveClue).rejects.toThrow();
  }

  async function makeGuess(guessNumbers: number[]) {
    lastGuessNumbers = guessNumbers;
    lastGuess = Combination.from(lastGuessNumbers);
    lastGuessHistory = Combination.updateHistory(
      lastGuess,
      lastProof.publicOutput.packedGuessHistory,
      Field.from(guessCount)
    );

    lastProof = await StepProgramMakeGuess(
      lastProof,
      lastGuessNumbers,
      codeBreakerKey
    );

    guessCount++;
  }

  async function giveClue(secretNumbers: number[]) {
    lastProof = await StepProgramGiveClue(
      lastProof,
      secretNumbers,
      codeMasterSalt,
      codeMasterKey
    );

    lastClue = Clue.giveClue(lastGuess.digits, secretCombination.digits);
    lastClueHistory = Clue.updateHistory(
      lastClue,
      lastProof.publicOutput.packedClueHistory,
      Field.from(clueCount)
    );

    clueCount++;
  }

  function expectedPublicOutput(
    _publicOutput: PublicOutputs = lastProof.publicOutput,
    _codeBreakerId: Field = codeBreakerId,
    _codeMasterId: Field = codeMasterId,
    _lastCompressedGuess: Field = lastGuess.compress(),
    _lastcompressedClue: Field = lastClue.compress(),
    _packedClueHistory: Field = lastClueHistory,
    _packedGuessHistory: Field = lastGuessHistory,
    _turnCount: UInt8 = UInt8.from(guessCount + clueCount + 1)
  ) {
    expect(_publicOutput.codeBreakerId).toEqual(_codeBreakerId);
    expect(_publicOutput.codeMasterId).toEqual(_codeMasterId);
    expect(_publicOutput.lastCompressedGuess).toEqual(_lastCompressedGuess);
    expect(_publicOutput.lastcompressedClue).toEqual(_lastcompressedClue);
    expect(_publicOutput.packedClueHistory).toEqual(_packedClueHistory);
    expect(_publicOutput.packedGuessHistory).toEqual(_packedGuessHistory);
    expect(_publicOutput.turnCount).toEqual(_turnCount);
    expect(_publicOutput.solutionHash).toEqual(
      Poseidon.hash([...secretCombination.digits, codeMasterSalt])
    );
  }

  describe('Invalid game creation', () => {
    describe('Invalid range of digits', () => {
      it('Should reject codeMaster with invalid secret combination: first digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 1 is not in range [0, 7]!';
        await expectCreateGameToFail([8, 2, 3, 4], expectedErrorMessage);
      });

      it('Should reject codeMaster with invalid secret combination: second digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 2 is not in range [0, 7]!';
        await expectCreateGameToFail([6, 9, 3, 4], expectedErrorMessage);
      });

      it('Should reject codeMaster with invalid secret combination: third digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 3 is not in range [0, 7]!';
        await expectCreateGameToFail([2, 3, 10, 4], expectedErrorMessage);
      });

      it('Should reject codeMaster with invalid secret combination: fourth digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 4 is not in range [0, 7]!';
        await expectCreateGameToFail([3, 6, 2, 11], expectedErrorMessage);
      });
    });

    describe('Invalid uniqueness of digits', () => {
      it('Should reject codeMaster with invalid secret combination: second digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        await expectCreateGameToFail([1, 1, 2, 6], expectedErrorMessage);
      });

      it('Should reject codeMaster with invalid secret combination: third digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 3 is not unique!';
        await expectCreateGameToFail([1, 2, 2, 6], expectedErrorMessage);
      });

      it('Should reject codeMaster with invalid secret combination: fourth digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 4 is not unique!';
        await expectCreateGameToFail([1, 2, 3, 1], expectedErrorMessage);
      });

      it('Should reject codeMaster with invalid secret combination: all digits are the same', async () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        await expectCreateGameToFail([1, 1, 1, 1], expectedErrorMessage);
      });
    });
  });

  describe('makeGuess method tests: first guess', () => {
    it('Should create a game successfully', async () => {
      lastProof = await StepProgramCreateGame(
        secretNumbers,
        codeMasterSalt,
        codeMasterKey
      );

      expectedPublicOutput(
        undefined,
        Field.from(0),
        undefined,
        Field.from(0),
        Field.from(0)
      );
    });

    describe('Invalid guess', () => {
      it('Should reject codeBreaker with invalid guess combination: first digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 1 is not in range [0, 7]!';
        await expectMakeGuessToFail([8, 2, 3, 4], expectedErrorMessage);
      });
      it('Should reject codeBreaker with invalid guess combination: second digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 2 is not in range [0, 7]!';
        await expectMakeGuessToFail([1, 9, 3, 4], expectedErrorMessage);
      });
      it('Should reject codeBreaker with invalid guess combination: third digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 3 is not in range [0, 7]!';
        await expectMakeGuessToFail([1, 2, 10, 4], expectedErrorMessage);
      });
      it('Should reject codeBreaker with invalid guess combination: fourth digit is greater than 7', async () => {
        const expectedErrorMessage =
          'Combination digit 4 is not in range [0, 7]!';
        await expectMakeGuessToFail([1, 2, 3, 12], expectedErrorMessage);
      });
      it('Should reject codeBreaker with invalid guess combination: second digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        await expectMakeGuessToFail([1, 1, 2, 6], expectedErrorMessage);
      });
      it('Should reject codeBreaker with invalid guess combination: third digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 3 is not unique!';
        await expectMakeGuessToFail([1, 2, 2, 6], expectedErrorMessage);
      });
      it('Should reject codeBreaker with invalid guess combination: fourth digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 4 is not unique!';
        await expectMakeGuessToFail([1, 2, 3, 1], expectedErrorMessage);
      });
    });

    describe('Invalid code breaker signature', () => {
      it('Should reject codeBreaker with invalid signature: wrong public key', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectMakeGuessToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeBreakerKey,
          {
            wrongPubKey: true,
            wrongMessage: false,
            wrongSigner: false,
          }
        );
      });

      it('Should reject codeBreaker with invalid signature: wrong message', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectMakeGuessToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeBreakerKey,
          {
            wrongPubKey: false,
            wrongMessage: true,
            wrongSigner: false,
          }
        );
      });

      it('Should reject codeBreaker with invalid signature: wrong signer', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectMakeGuessToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeBreakerKey,
          {
            wrongPubKey: false,
            wrongMessage: false,
            wrongSigner: true,
          }
        );
      });
    });

    it('Should reject giveClue in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });

    it('CodeBreaker should make a guess successfully', async () => {
      await makeGuess([7, 5, 6, 2]);
      expectedPublicOutput(
        undefined,
        undefined,
        undefined,
        undefined,
        Field.from(0)
      );
    });

    it('Should reject makeGuess in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await expectMakeGuessToFail([2, 3, 4, 5], expectedErrorMessage);
    });
  });

  describe('giveClue method tests', () => {
    it('Should reject any caller other than the codeMaster', async () => {
      const expectedErrorMessage =
        'Only the codeMaster of this game is allowed to give clue!';
      await expectGiveClueToFail(
        [1, 2, 3, 4],
        expectedErrorMessage,
        PrivateKey.random()
      );
    });

    it('Should reject codeMaster with different salt', async () => {
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

    it('Should reject codeMaster with non-compliant secret combination', async () => {
      const expectedErrorMessage =
        'The secret combination is not compliant with the initial hash from game creation!';
      await expectGiveClueToFail([1, 5, 3, 4], expectedErrorMessage);
    });

    it('Should reject codeMaster with wrong secret combination and salt', async () => {
      const expectedErrorMessage =
        'The secret combination is not compliant with the initial hash from game creation!';
      await expectGiveClueToFail(
        [7, 2, 1, 6],
        expectedErrorMessage,
        codeMasterKey,
        Field.random()
      );
    });

    describe('Invalid code master signature', () => {
      it('Should reject codeMaster with invalid signature: wrong public key', async () => {
        const expectedErrorMessage =
          'Only the codeMaster of this game is allowed to give clue!';
        await expectGiveClueToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeMasterKey,
          codeMasterSalt,
          {
            wrongPubKey: true,
            wrongMessage: false,
            wrongSigner: false,
          }
        );
      });
      it('Should reject codeMaster with invalid signature: wrong message', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectGiveClueToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeMasterKey,
          codeMasterSalt,
          {
            wrongPubKey: false,
            wrongMessage: true,
            wrongSigner: false,
          }
        );
      });
      it('Should reject codeMaster with invalid signature: wrong signer', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectGiveClueToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeMasterKey,
          codeMasterSalt,
          {
            wrongPubKey: false,
            wrongMessage: false,
            wrongSigner: true,
          }
        );
      });
    });

    it('CodeMaster should give clue successfully', async () => {
      await giveClue(secretNumbers);
      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(0),
          blows: Field.from(1),
        }).compress()
      );
      expectedPublicOutput();
    });

    it('Should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('Second guess', () => {
    describe('Invalid code breaker signature', () => {
      it('Should reject codeBreaker with invalid signature: wrong public key', async () => {
        const expectedErrorMessage =
          'You are not the codeBreaker of this game!';
        await expectMakeGuessToFail(
          [1, 4, 7, 2],
          expectedErrorMessage,
          codeBreakerKey,
          {
            wrongPubKey: true,
            wrongMessage: false,
            wrongSigner: false,
          }
        );
      });

      it('Should reject codeBreaker with invalid signature: wrong message', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectMakeGuessToFail(
          [1, 4, 7, 2],
          expectedErrorMessage,
          codeBreakerKey,
          {
            wrongPubKey: false,
            wrongMessage: true,
            wrongSigner: false,
          }
        );
      });

      it('Should reject codeBreaker with invalid signature: wrong signer', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectMakeGuessToFail(
          [1, 4, 7, 2],
          expectedErrorMessage,
          codeBreakerKey,
          {
            wrongPubKey: false,
            wrongMessage: false,
            wrongSigner: true,
          }
        );
      });
    });

    describe('Make guess and try again', () => {
      it('Should accept valid guess', async () => {
        await makeGuess([1, 4, 7, 2]);

        expectedPublicOutput();
      });

      it('Should reject the codebraker from calling this method out of sequence', async () => {
        const expectedErrorMessage =
          'Please wait for the codeMaster to give you a clue!';
        await expectMakeGuessToFail([1, 2, 4, 6], expectedErrorMessage);
      });
    });

    describe('Invalid code master signature', () => {
      it('Should reject codeMaster with invalid signature: wrong public key', async () => {
        const expectedErrorMessage =
          'Only the codeMaster of this game is allowed to give clue!';
        await expectGiveClueToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeMasterKey,
          codeMasterSalt,
          {
            wrongPubKey: true,
            wrongMessage: false,
            wrongSigner: false,
          }
        );
      });
      it('Should reject codeMaster with invalid signature: wrong message', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectGiveClueToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeMasterKey,
          codeMasterSalt,
          {
            wrongPubKey: false,
            wrongMessage: true,
            wrongSigner: false,
          }
        );
      });
      it('Should reject codeMaster with invalid signature: wrong signer', async () => {
        const expectedErrorMessage = 'Invalid signature!';
        await expectGiveClueToFail(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codeMasterKey,
          codeMasterSalt,
          {
            wrongPubKey: false,
            wrongMessage: false,
            wrongSigner: true,
          }
        );
      });
    });

    describe('Give clue and try again', () => {
      it('code Master should give clue successfully', async () => {
        await giveClue(secretNumbers);
        expect(lastClue.compress()).toEqual(
          new Clue({
            hits: Field.from(1),
            blows: Field.from(2),
          }).compress()
        );

        expectedPublicOutput();
      });

      it('Should reject the codeMaster from calling this method out of sequence', async () => {
        const expectedErrorMessage =
          'Please wait for the codeBreaker to make a guess!';
        await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
      });
    });
  });

  describe('Third guess', () => {
    it('Should accept valid guess', async () => {
      await makeGuess([6, 5, 7, 3]);

      expectedPublicOutput();
    });
    it('Should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await expectMakeGuessToFail([1, 2, 4, 6], expectedErrorMessage);
    });
    it('code Master should give clue successfully', async () => {
      await giveClue(secretNumbers);
      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(0),
          blows: Field.from(1),
        }).compress()
      );

      expectedPublicOutput();
    });
    it('Should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('Fourth guess', () => {
    it('Should accept valid guess', async () => {
      await makeGuess([7, 5, 6, 3]);
      expectedPublicOutput();
    });
    it('Should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await expectMakeGuessToFail([1, 2, 4, 6], expectedErrorMessage);
    });
    it('code Master should give clue successfully', async () => {
      await giveClue(secretNumbers);
      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(0),
          blows: Field.from(1),
        }).compress()
      );

      expectedPublicOutput();
      expect(
        Clue.decompress(lastProof.publicOutput.lastcompressedClue)
          .isSolved()
          .toBoolean()
      ).toEqual(false);
    });
    it('Should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('Fifth guess', () => {
    it('Should accept valid guess', async () => {
      await makeGuess([4, 2, 7, 5]);
      expectedPublicOutput();
    });
    it('Should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await expectMakeGuessToFail([1, 2, 4, 6], expectedErrorMessage);
    });

    it('code Master should give clue successfully', async () => {
      await giveClue(secretNumbers);
      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(1),
          blows: Field.from(1),
        }).compress()
      );

      expectedPublicOutput();
    });

    it('Should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('Sixth guess', () => {
    it('Should accept valid guess', async () => {
      await makeGuess([4, 1, 2, 3]);

      expectedPublicOutput();
    });

    it('Should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await expectMakeGuessToFail([1, 2, 4, 6], expectedErrorMessage);
    });

    it('code Master should give clue successfully', async () => {
      await giveClue(secretNumbers);
      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(0),
          blows: Field.from(4),
        }).compress()
      );

      expectedPublicOutput();
    });
    it('Should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('Final guess', () => {
    it('Should accept valid guess', async () => {
      await makeGuess([1, 2, 3, 4]);

      expectedPublicOutput();
    });

    it('Should give clue and report that the secret is solved', async () => {
      await giveClue(secretNumbers);

      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(4),
          blows: Field.from(0),
        }).compress()
      );

      expectedPublicOutput();
      expect(
        Clue.decompress(lastProof.publicOutput.lastcompressedClue)
          .isSolved()
          .toBoolean()
      ).toEqual(true);
    });
  });

  describe('Reject guess after completion', () => {
    it('Should reject next guess: secret is already solved', async () => {
      const expectedErrorMessage =
        'You have already solved the secret combination!';
      await expectMakeGuessToFail([1, 2, 3, 4], expectedErrorMessage);
    });

    it('Should reject next clue: secret is already solved', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('New game after completion', () => {
    beforeAll(() => {
      // Reset the guess and clue counts for the new game
      guessCount = 0;
      clueCount = 0;

      lastClueHistory = Field.from(0);
      lastGuessHistory = Field.from(0);
    });

    it('Should create a new game successfully with new secret', async () => {
      secretNumbers = [7, 1, 6, 3];
      secretCombination = Combination.from(secretNumbers);

      lastProof = await StepProgramCreateGame(
        secretNumbers,
        codeMasterSalt,
        codeMasterKey
      );

      expectedPublicOutput(
        undefined,
        Field.from(0),
        undefined,
        Field.from(0),
        Field.from(0)
      );
    });

    it('Should solve the game in the first round', async () => {
      await makeGuess([7, 1, 6, 3]);
      expectedPublicOutput(
        undefined,
        undefined,
        undefined,
        undefined,
        Field.from(0)
      );
    });

    it('Should give clue and report that the secret is solved', async () => {
      await giveClue(secretNumbers);

      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(4),
          blows: Field.from(0),
        }).compress()
      );

      expectedPublicOutput();
      expect(
        Clue.decompress(lastProof.publicOutput.lastcompressedClue)
          .isSolved()
          .toBoolean()
      ).toEqual(true);
    });

    it('Should reject next guess: secret is already solved', async () => {
      const expectedErrorMessage =
        'You have already solved the secret combination!';
      await expectMakeGuessToFail([1, 2, 3, 4], expectedErrorMessage);
    });

    it('should reject next clue: secret is already solved', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });
});
