import {
  compressRewardAndFinalizeSlot,
  compressTurnCountMaxAttemptSolved,
  separateTurnCountAndMaxAttemptSolved,
  separateRewardAndFinalizeSlot,
  getClueFromGuess,
  separateCombinationDigits,
  validateCombination,
} from '../utils';
import { Field, UInt32, UInt64 } from 'o1js';

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
});
