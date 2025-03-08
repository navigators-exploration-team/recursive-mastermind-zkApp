import { StepProgram } from '../stepProgram';
import {
  compressRewardAndFinalizeSlot,
  compressTurnCountMaxAttemptSolved,
  separateTurnCountAndMaxAttemptSolved,
  separateRewardAndFinalizeSlot,
  getClueFromGuess,
  separateCombinationDigits,
  validateCombination,
  updateElementAtIndex,
  getElementAtIndex,
  deserializeClue,
  serializeClue,
  serializeCombinationHistory,
  deserializeCombinationHistory,
  serializeClueHistory,
  deserializeClueHistory,
} from '../utils';
import {
  generateTestProofs,
  guessConfig1,
  StepProgramCreateGame,
} from './testUtils';
import { Field, UInt32, UInt64, Poseidon, PrivateKey } from 'o1js';

/*
 * Random combination generator function for utility function tests.
 *
 */
function generateRandomCombinations(length: number): Field[] {
  const randomNumbers: number[] = [];

  for (let i = 0; i < length; i++) {
    const randomFourDigitNumber = Math.floor(1000 + Math.random() * 9000);
    randomNumbers.push(randomFourDigitNumber);
  }

  return randomNumbers.map(Field);
}

describe('Provable utilities - unit tests', () => {
  describe('Tests for separateCombinationDigits function', () => {
    it('should reject a 3-digit combination', () => {
      const combination = Field(123);
      const expectedErrorMessage =
        'The combination must be a four-digit Field!';
      expect(() => separateCombinationDigits(combination)).toThrowError(
        expectedErrorMessage
      );
    });

    it('should reject a 5-digit combination', () => {
      const combination = Field(12345);
      const expectedErrorMessage =
        'The combination must be a four-digit Field!';
      expect(() => separateCombinationDigits(combination)).toThrowError(
        expectedErrorMessage
      );
    });

    it('should return the correct separated digits - case 1', () => {
      const combination = Field(1234);
      const expectedDigits = [1, 2, 3, 4].map(Field);

      expect(separateCombinationDigits(combination)).toEqual(expectedDigits);
    });

    it('should return the correct separated digits - case 2', () => {
      const combination = Field(5678);
      const expectedDigits = [5, 6, 7, 8].map(Field);

      expect(separateCombinationDigits(combination)).toEqual(expectedDigits);
    });

    it('should return the correct separated digits - case 3', () => {
      const combination = Field(7185);
      const expectedDigits = [7, 1, 8, 5].map(Field);

      expect(separateCombinationDigits(combination)).toEqual(expectedDigits);
    });
  });
  describe('Tests for validateCombination function', () => {
    describe('InValid Combinations: contains 0', () => {
      // No need to check if the first digit is 0, as this would reduce the combination to a 3-digit value.
      it('should reject combination: second digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 2 should not be zero!';
        const combination = [1, 0, 9, 8].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: third digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 3 should not be zero!';
        const combination = [7, 2, 0, 5].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: fourth digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 4 should not be zero!';
        const combination = [9, 1, 5, 0].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });
    });

    describe('Invalid Combinations: Not unique digits', () => {
      it('should reject combination: second digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        const combination = [1, 1, 9, 3].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: third digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 3 is not unique!';
        const combination = [2, 5, 5, 7].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: fourth digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 4 is not unique!';
        const combination = [2, 7, 5, 2].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });
    });

    describe('Valid Combinations', () => {
      it('should accept a valid combination: case 1', () => {
        const combination = [2, 7, 5, 3].map(Field);
        expect(() => validateCombination(combination)).not.toThrow();
      });

      it('should accept a valid combination: case 2', () => {
        const combination = [9, 8, 6, 4].map(Field);
        expect(() => validateCombination(combination)).not.toThrow();
      });

      it('should accept a valid combination: case 3', () => {
        const combination = [7, 1, 3, 5].map(Field);
        expect(() => validateCombination(combination)).not.toThrow();
      });
    });
  });

  describe('Tests for getClueFromGuess function', () => {
    it('should return the correct clue: 0 hits - 0 blows', () => {
      const solution = [1, 2, 3, 4].map(Field);
      const guess = [5, 7, 8, 9].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([0, 0, 0, 0].map(Field));
    });

    it('should return the correct clue: 1 hits - 0 blows', () => {
      const solution = [1, 2, 3, 4].map(Field);
      const guess = [1, 7, 8, 9].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 0, 0, 0].map(Field));
    });

    it('should return the correct clue: 4 hits - 0 blows', () => {
      const solution = [1, 7, 3, 9].map(Field);
      const guess = [1, 7, 3, 9].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 2, 2, 2].map(Field));
    });

    it('should return the correct clue: 1 hits - 1 blows', () => {
      const guess = [1, 7, 8, 2].map(Field);
      const solution = [1, 2, 3, 4].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 0, 0, 1].map(Field));
    });

    it('should return the correct clue: 2 hits - 2 blows', () => {
      const guess = [5, 3, 2, 7].map(Field);
      const solution = [5, 2, 3, 7].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 1, 1, 2].map(Field));
    });

    it('should return the correct clue: 0 hits - 4 blows', () => {
      const guess = [1, 2, 3, 4].map(Field);
      const solution = [4, 3, 2, 1].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([1, 1, 1, 1].map(Field));
    });
  });

  describe('Tests for compressTurnCountMaxAttemptSolved function', () => {
    it('should compress the turn count, max attempt, and solved flag into a single Field value', () => {
      const turnCount = Field(5);
      const maxAttempts = Field(10);
      const isSolved = Field(1);

      const expectedValue = Field(51001);
      expect(
        compressTurnCountMaxAttemptSolved([turnCount, maxAttempts, isSolved])
      ).toEqual(expectedValue);
    });

    it('should throw an error if the turn count is greater than 100', () => {
      const turnCount = Field(101);
      const maxAttempts = Field(10);
      const isSolved = Field(1);

      const expectedErrorMessage = 'Turn count must be less than 100!';
      expect(() =>
        compressTurnCountMaxAttemptSolved([turnCount, maxAttempts, isSolved])
      ).toThrowError(expectedErrorMessage);
    });

    it('should throw an error if the max attempt is greater than 100', () => {
      const turnCount = Field(10);
      const maxAttempts = Field(101);
      const isSolved = Field(1);

      const expectedErrorMessage = 'Max attempt must be less than 100!';
      expect(() =>
        compressTurnCountMaxAttemptSolved([turnCount, maxAttempts, isSolved])
      ).toThrowError(expectedErrorMessage);
    });

    it('should throw an error if the solved flag is greater than 2', () => {
      const turnCount = Field(10);
      const maxAttempts = Field(10);
      const isSolved = Field(2);

      const expectedErrorMessage = 'Solved flag must be less than 2!';
      expect(() =>
        compressTurnCountMaxAttemptSolved([turnCount, maxAttempts, isSolved])
      ).toThrowError(expectedErrorMessage);
    });

    it('should successfully separate the compressed value into turn count, max attempt, and solved flag', () => {
      const compressedValue = Field(51001);
      const expectedDigits = [5, 10, 1].map(Field);

      expect(separateTurnCountAndMaxAttemptSolved(compressedValue)).toEqual(
        expectedDigits
      );
    });
  });

  describe('Tests for compressRewardAndFinalizeSlot function', () => {
    const rewardAmount = UInt64.from(100);
    const finalizeSlot = UInt32.from(10);
    it('should compress the reward amount and finalize slot into a single Field value', () => {
      const expectedValue = Field(2 ** 32 * 100 + 10);
      expect(compressRewardAndFinalizeSlot(rewardAmount, finalizeSlot)).toEqual(
        expectedValue
      );
    });

    it('should successfully separate the compressed value into reward amount and finalize slot', () => {
      const compressedValue = Field(2 ** 32 * 100 + 10);

      const separatedRewardAndFinalizeSlot =
        separateRewardAndFinalizeSlot(compressedValue);

      expect(separatedRewardAndFinalizeSlot.finalizeSlot).toEqual(finalizeSlot);
      expect(separatedRewardAndFinalizeSlot.rewardAmount).toEqual(rewardAmount);
    });
  });

  describe('Tests for packing/unpacking multiple fields', () => {
    describe('combination history', () => {
      it('should correctly pack and unpack a combination history of 4 updated elements', () => {
        const inputs = generateRandomCombinations(4);
        const packed = serializeCombinationHistory(inputs);
        const unpacked = deserializeCombinationHistory(packed);

        expect(unpacked.slice(0, inputs.length)).toEqual(inputs);
      });

      it('should correctly pack and unpack a combination history of 15 elements', () => {
        const inputs = generateRandomCombinations(15);
        const packed = serializeCombinationHistory(inputs);
        const unpacked = deserializeCombinationHistory(packed);

        expect(unpacked.slice(0, inputs.length)).toEqual(inputs);
      });

      it('should throw an error when attempting to pack more than 15 elements in combination history', () => {
        const shouldReject = () => {
          const inputs = generateRandomCombinations(16);
          const packed = serializeCombinationHistory(inputs);
          deserializeCombinationHistory(packed);
        };
        expect(shouldReject).toThrow();
      });
    });

    describe('clue history tests', () => {
      it('should correctly pack and unpack a clue history of 3 updated elements', () => {
        const clues = [
          [2, 0, 0, 1],
          [1, 2, 0, 0],
          [2, 2, 2, 2],
        ].map((c) => c.map(Field));

        const serializedClues = clues.map(serializeClue);
        const packedSerializedClues = serializeClueHistory(serializedClues);
        const unpackedSerializedClues = deserializeClueHistory(
          packedSerializedClues
        );
        const unpackedDeserializedClues =
          unpackedSerializedClues.map(deserializeClue);

        expect(unpackedDeserializedClues.slice(0, clues.length)).toEqual(clues);
      });

      it('should correctly pack and unpack a clue history of 15 elements', () => {
        const clues = Array.from({ length: 15 }, () => [1, 2, 1, 0].map(Field));
        const serializedClues = clues.map(serializeClue);
        const packedSerializedClues = serializeClueHistory(serializedClues);
        const unpackedSerializedClues = deserializeClueHistory(
          packedSerializedClues
        );
        const unpackedDeserializedClues =
          unpackedSerializedClues.map(deserializeClue);

        expect(unpackedDeserializedClues.slice(0, clues.length)).toEqual(clues);
      });

      it('should throw an error when attempting to pack more than 15 elements in clue history', () => {
        const shouldReject = () => {
          const clues = Array.from({ length: 16 }, () =>
            [1, 2, 1, 0].map(Field)
          );
          const serializedClues = clues.map(serializeClue);
          const packedSerializedClues = serializeClueHistory(serializedClues);
          deserializeClueHistory(packedSerializedClues);
        };
        expect(shouldReject).toThrow();
      });
    });
  });

  describe('Tests for dynamic indexing & updating of field arrays', () => {
    describe('getElementAtIndex', () => {
      it('should return the same elements as JS array indexing', () => {
        const fieldArray = generateRandomCombinations(10);
        for (let i = 0; i < fieldArray.length; i++) {
          expect(getElementAtIndex(fieldArray, Field(i))).toEqual(
            fieldArray[i]
          );
        }
      });

      it('should throw an error for out-of-bounds index', () => {
        const fieldArray = generateRandomCombinations(15);
        const shouldReject = () => {
          const outOfBoundIndex = Field(16);
          getElementAtIndex(fieldArray, outOfBoundIndex);
        };

        expect(shouldReject).toThrow(
          'Invalid index: Index out of bounds or multiple indices match!'
        );
      });
    });

    describe('updateElementAtIndex', () => {
      it('should correctly update an element at the specified index', () => {
        const fieldArray = generateRandomCombinations(10);
        const newValue = Field(9999);
        const indexToUpdate = Field(4); // Choose an index to update

        const updatedArray = updateElementAtIndex(
          newValue,
          fieldArray,
          indexToUpdate
        );

        // Ensure the updated index has the new value
        expect(getElementAtIndex(updatedArray, indexToUpdate)).toEqual(
          newValue
        );

        // Ensure other elements remain unchanged
        for (let i = 0; i < fieldArray.length; i++) {
          if (i !== 4) {
            expect(getElementAtIndex(updatedArray, Field(i))).toEqual(
              fieldArray[i]
            );
          }
        }
      });

      it('should throw an error for out-of-bounds index during update', () => {
        const fieldArray = generateRandomCombinations(10);
        const newValue = Field(9999);
        const outOfBoundIndex = Field(12); // Out of bounds for an array of length 10

        const shouldReject = () => {
          updateElementAtIndex(newValue, fieldArray, outOfBoundIndex);
        };

        expect(shouldReject).toThrow('Invalid index: Index out of bounds!');
      });
    });
  });
  describe.only('Should generate StepProgramProof for given parameters', () => {
    let codeMasterKey: PrivateKey;
    let codeBreakerKey: PrivateKey;
    let codeMasterSalt: Field;

    beforeAll(async () => {
      codeBreakerKey = PrivateKey.random();
      codeMasterKey = PrivateKey.random();
      codeMasterSalt = Field.random();

      await StepProgram.compile();
    });

    it('Should generate proofs and we shall obtain of codeMaster win.', async () => {
      const round = 15;
      const winnerFlag = 0;
      const actions = guessConfig1;
      const salt = codeMasterSalt;

      const secretCombination = actions.secret;
      const lastGameProof = await StepProgramCreateGame(
        secretCombination,
        salt,
        codeMasterKey
      );

      const proof = await generateTestProofs(
        round,
        winnerFlag,
        actions,
        lastGameProof,
        codeBreakerKey,
        codeMasterKey,
        salt
      );

      // Get outputted numbers and history
      const outputNumbers = separateCombinationDigits(
        proof.publicOutput.lastGuess
      );

      const history = deserializeCombinationHistory(
        proof.publicOutput.packedGuessHistory
      );
      const separatedHistory = Array.from({ length: round }, (_, i) =>
        separateCombinationDigits(history[i]).map(Number)
      );
      const attemptList = actions.totalAttempts.slice(0, round);

      const computedHash = Poseidon.hash([...outputNumbers, salt]);
      const solutionHash = proof.publicOutput.solutionHash;

      expect(separatedHistory).toEqual(attemptList);
      expect(solutionHash).not.toEqual(computedHash);
      console.log(outputNumbers);
      expect(outputNumbers.map(Number)).toEqual([8, 3, 5, 2]);
    });

    it('Should generate a game where codeBreaker wins', async () => {
      const round = 7;
      const winnerFlag = 1;
      const actions = guessConfig1;
      const salt = codeMasterSalt;

      const secretCombination = actions.secret;
      const lastGameProof = await StepProgramCreateGame(
        secretCombination,
        salt,
        codeMasterKey
      );

      const proof = await generateTestProofs(
        round,
        winnerFlag,
        actions,
        lastGameProof,
        codeBreakerKey,
        codeMasterKey,
        salt
      );

      const publicOutputs = proof.publicOutput;

      const outputNumbers = separateCombinationDigits(publicOutputs.lastGuess);
      const history = deserializeCombinationHistory(
        publicOutputs.packedGuessHistory
      );
      const separatedHistory = Array.from({ length: round }, (_, i) =>
        separateCombinationDigits(history[i]).map(Number)
      );

      // Getting until round - 1, since in proof generation first round - 1 elements are used before secret combination.
      const attemptList = actions.totalAttempts.slice(0, round - 1);
      attemptList.push(secretCombination);

      const computedHash = Poseidon.hash([...outputNumbers, salt]);
      const solutionHash = publicOutputs.solutionHash;

      expect(separatedHistory).toEqual(attemptList);
      expect(solutionHash).toEqual(computedHash);
      expect(outputNumbers.map(Number)).toEqual([6, 3, 8, 4]);
      expect(BigInt(round)).toEqual(
        publicOutputs.turnCount.sub(1).div(2).toBigInt()
      );
    });
    it('Should generate a proof that is not solved yet.', async () => {
      const round = 7;
      const winnerFlag = 2;
      const actions = guessConfig1;
      const salt = codeMasterSalt;

      const secretCombination = actions.secret;
      const lastGameProof = await StepProgramCreateGame(
        secretCombination,
        salt,
        codeMasterKey
      );

      const proof = await generateTestProofs(
        round,
        winnerFlag,
        actions,
        lastGameProof,
        codeBreakerKey,
        codeMasterKey,
        salt
      );

      const publicOutputs = proof.publicOutput;

      const outputNumbers = separateCombinationDigits(publicOutputs.lastGuess);

      const computedHash = Poseidon.hash([...outputNumbers, salt]);
      const solutionHash = publicOutputs.solutionHash;

      expect(solutionHash).not.toEqual(computedHash);

      expect(BigInt(round)).toEqual(
        publicOutputs.turnCount.sub(1).div(2).toBigInt()
      );
    });
  });
});
