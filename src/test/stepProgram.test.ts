import { Field, PrivateKey, PublicKey, Poseidon } from 'o1js';
import { Combination, Clue } from '../utils';
import { StepProgram, StepProgramProof } from '../stepProgram';
import {
  StepProgramCreateGame,
  StepProgramGiveClue,
  StepProgramMakeGuess,
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
    it('Should reject codeMaster with invalid secret combination: second digit is 0', async () => {
      const expectedErrorMessage =
        'Combination digit 2 is not in range [1, 7]!';
      await expectCreateGameToFail([5, 0, 4, 6], expectedErrorMessage);
    });

    it('Should reject codeMaster with invalid secret combination: third digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 3 is not unique!';
      await expectCreateGameToFail([2, 3, 2, 9], expectedErrorMessage);
    });

    it('Should create a game successfully', async () => {
      lastProof = await StepProgramCreateGame(
        secretNumbers,
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;

      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(Field.from(0));
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.lastCompressedGuess).toEqual(Field.from(0));
      expect(publicOutputs.lastcompressedClue).toEqual(Field.from(0));
      expect(publicOutputs.turnCount.toBigInt()).toEqual(1n);
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(Field.from(0));
    });
  });

  describe('makeGuess method tests: first guess', () => {
    it('Should reject codeBreaker with invalid guess combination: second greater than 7 and fouth digit is 0', async () => {
      const expectedErrorMessage =
        'Combination digit 2 is not in range [1, 7]!';
      await expectGuessToFail([6, 9, 3, 0], expectedErrorMessage);
    });

    it('Should reject codeBreaker with invalid guess combination: second digit is not unique', async () => {
      const expectedErrorMessage = 'Combination digit 2 is not unique!';
      await expectGuessToFail([1, 1, 2, 9], expectedErrorMessage);
    });

    it('Should reject giveClue in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });

    it('CodeBreaker should make a guess successfully', async () => {
      lastGuessNumbers = [1, 5, 6, 2];
      lastGuess = Combination.from(lastGuessNumbers);
      lastProof = await StepProgramMakeGuess(
        lastProof,
        lastGuessNumbers,
        codeBreakerKey
      );

      const publicOutputs = lastProof.publicOutput;

      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.lastCompressedGuess).toEqual(lastGuess.compress());
      expect(publicOutputs.lastcompressedClue).toEqual(Field.from(0));
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(
        Combination.updateHistory(lastGuess, Field.from(0), Field.from(0))
      );
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(2n);
    });

    it('Should reject makeGuess in the wrong turn', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';

      await expectGuessToFail([2, 3, 4, 5], expectedErrorMessage);
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

    it('CodeMaster should give clue successfully', async () => {
      lastProof = await StepProgramGiveClue(
        lastProof,
        secretNumbers,
        codeMasterSalt,
        codeMasterKey
      );

      lastClue = Clue.giveClue(lastGuess.digits, secretCombination.digits);

      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(1),
          blows: Field.from(1),
        }).compress()
      );

      const publicOutputs = lastProof.publicOutput;
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.lastCompressedGuess).toEqual(lastGuess.compress());
      expect(publicOutputs.lastcompressedClue).toEqual(lastClue.compress());
      expect(publicOutputs.packedClueHistory).toEqual(
        Clue.updateHistory(lastClue, Field.from(0), Field.from(0))
      );
      expect(publicOutputs.packedGuessHistory).toEqual(
        lastProof.publicOutput.packedGuessHistory
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(3n);
      expect(
        Clue.decompress(publicOutputs.lastcompressedClue).isSolved().toBoolean()
      ).toEqual(false);
    });

    it('Should reject the codeMaster from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeBreaker to make a guess!';
      await expectGiveClueToFail([1, 2, 3, 4], expectedErrorMessage);
    });
  });

  describe('Second guess', () => {
    it('Should reject any caller other than the codeBreaker', async () => {
      const expectedErrorMessage = 'You are not the codeBreaker of this game!';
      await expectGuessToFail(
        [1, 4, 7, 2],
        expectedErrorMessage,
        PrivateKey.random()
      );
    });

    it('Should accept another valid guess', async () => {
      lastGuessNumbers = [1, 4, 7, 2];
      lastGuess = Combination.from(lastGuessNumbers);
      const guessHistory = lastProof.publicOutput.packedGuessHistory;

      lastProof = await StepProgramMakeGuess(
        lastProof,
        lastGuessNumbers,
        codeBreakerKey
      );

      const publicOutputs = lastProof.publicOutput;
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.lastCompressedGuess).toEqual(lastGuess.compress());
      expect(publicOutputs.lastcompressedClue).toEqual(lastClue.compress());
      expect(publicOutputs.packedClueHistory).toEqual(
        Clue.updateHistory(lastClue, Field.from(0), Field.from(0))
      );
      expect(publicOutputs.packedGuessHistory).toEqual(
        Combination.updateHistory(lastGuess, guessHistory, Field.from(1))
      );
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(4n);
    });

    it('Should reject the codebraker from calling this method out of sequence', async () => {
      const expectedErrorMessage =
        'Please wait for the codeMaster to give you a clue!';
      await expectGuessToFail([1, 2, 4, 8], expectedErrorMessage);
    });
  });

  describe('New game after completion', () => {
    it('Should create a new game successfully with new secret', async () => {
      secretNumbers = [7, 1, 6, 3];
      secretCombination = Combination.from(secretNumbers);

      lastProof = await StepProgramCreateGame(
        secretNumbers,
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(Field.from(0));
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.lastCompressedGuess).toEqual(Field.from(0));
      expect(publicOutputs.lastcompressedClue).toEqual(Field.from(0));
      expect(publicOutputs.turnCount.toBigInt()).toEqual(1n);
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(Field.from(0));
    });

    it('Should solve the game in the first round', async () => {
      lastGuessNumbers = [7, 1, 6, 3];
      lastGuess = Combination.from(lastGuessNumbers);

      lastProof = await StepProgramMakeGuess(
        lastProof,
        lastGuessNumbers,
        codeBreakerKey
      );

      const publicOutputs = lastProof.publicOutput;

      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.lastCompressedGuess).toEqual(lastGuess.compress());
      expect(publicOutputs.lastcompressedClue).toEqual(Field.from(0));
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(
        Combination.updateHistory(lastGuess, Field.from(0), Field.from(0))
      );
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(2n);
    });

    it('Should give clue and report that the secret is solved', async () => {
      lastClue = Clue.giveClue(lastGuess.digits, secretCombination.digits);
      lastProof = await StepProgramGiveClue(
        lastProof,
        [7, 1, 6, 3],
        codeMasterSalt,
        codeMasterKey
      );

      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(4),
          blows: Field.from(0),
        }).compress()
      );

      const publicOutputs = lastProof.publicOutput;
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.lastCompressedGuess).toEqual(lastGuess.compress());
      expect(publicOutputs.lastcompressedClue).toEqual(lastClue.compress());
      expect(publicOutputs.packedClueHistory).toEqual(
        Clue.updateHistory(lastClue, Field.from(0), Field.from(0))
      );
      expect(publicOutputs.packedGuessHistory).toEqual(
        lastProof.publicOutput.packedGuessHistory
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(3n);
      expect(
        Clue.decompress(publicOutputs.lastcompressedClue).isSolved().toBoolean()
      ).toEqual(true);
    });

    it('Should reject next guess: secret is already solved', async () => {
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
    it('Should create a new game successfully with new secret', async () => {
      secretNumbers = [6, 3, 2, 4];
      secretCombination = Combination.from(secretNumbers);

      lastProof = await StepProgramCreateGame(
        secretNumbers,
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.codeBreakerId).toEqual(Field.from(0));
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.lastCompressedGuess).toEqual(Field.from(0));
      expect(publicOutputs.lastcompressedClue).toEqual(Field.from(0));
      expect(publicOutputs.turnCount.toBigInt()).toEqual(1n);
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(Field.from(0));
    });

    it('Should make a correct number - wrong position guess', async () => {
      lastGuessNumbers = [2, 4, 6, 3];
      lastGuess = Combination.from(lastGuessNumbers);

      lastProof = await StepProgramMakeGuess(
        lastProof,
        lastGuessNumbers,
        codeBreakerKey
      );

      const publicOutputs = lastProof.publicOutput;

      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.lastCompressedGuess).toEqual(lastGuess.compress());
      expect(publicOutputs.lastcompressedClue).toEqual(Field.from(0));
      expect(publicOutputs.packedClueHistory).toEqual(Field.from(0));
      expect(publicOutputs.packedGuessHistory).toEqual(
        Combination.updateHistory(lastGuess, Field.from(0), Field.from(0))
      );
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(2n);
    });

    it('Should give clue and report that the secret is not solved', async () => {
      lastClue = Clue.giveClue(lastGuess.digits, secretCombination.digits);
      expect(lastClue.compress()).toEqual(
        new Clue({
          hits: Field.from(0),
          blows: Field.from(4),
        }).compress()
      );
      lastProof = await StepProgramGiveClue(
        lastProof,
        secretNumbers,
        codeMasterSalt,
        codeMasterKey
      );

      const publicOutputs = lastProof.publicOutput;
      expect(publicOutputs.codeBreakerId).toEqual(codeBreakerId);
      expect(publicOutputs.codeMasterId).toEqual(codeMasterId);
      expect(publicOutputs.solutionHash).toEqual(
        Poseidon.hash([...secretCombination.digits, codeMasterSalt])
      );
      expect(publicOutputs.lastCompressedGuess).toEqual(lastGuess.compress());
      expect(publicOutputs.lastcompressedClue).toEqual(lastClue.compress());
      expect(publicOutputs.packedClueHistory).toEqual(
        Clue.updateHistory(lastClue, Field.from(0), Field.from(0))
      );
      expect(publicOutputs.packedGuessHistory).toEqual(
        lastProof.publicOutput.packedGuessHistory
      );
      expect(publicOutputs.turnCount.toBigInt()).toEqual(3n);
      expect(
        Clue.decompress(publicOutputs.lastcompressedClue).isSolved().toBoolean()
      ).toEqual(false);
    });
  });
});
