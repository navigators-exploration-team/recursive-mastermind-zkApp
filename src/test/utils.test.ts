import { MAX_ATTEMPTS } from '../constants';
import { Combination, Clue, GameState } from '../utils';

import { Bool, Field, UInt32, UInt64, UInt8 } from 'o1js';

/*
 * Random combination generator function for utility function tests.
 */
function generateRandomCombinationNumbers(length: number): number[] {
  const randomNumbers: number[] = [];
  const available = [1, 2, 3, 4, 5, 6, 7];

  for (let i = 0; i < length; i++) {
    const randIndex = Math.floor(Math.random() * available.length);
    randomNumbers.push(available[randIndex]);
    available.splice(randIndex, 1);
  }

  return randomNumbers;
}

describe('utility.ts unit tests', () => {
  describe('Combination class', () => {
    describe('derive Combination from random numbers', () => {
      it('should create a valid Combination from an array of 4 digits in [1..7]', () => {
        const randomNumbers = generateRandomCombinationNumbers(4);
        expect(() => Combination.from(randomNumbers)).not.toThrow();
      });
      it('should throw an error if the array length is greater than 4', () => {
        const randomNumbers = generateRandomCombinationNumbers(5);
        expect(() => Combination.from(randomNumbers)).toThrow(
          'Combination must have exactly 4 digits'
        );
      });
      it('should throw an error if the array length is less than 4', () => {
        const randomNumbers = generateRandomCombinationNumbers(3);
        expect(() => Combination.from(randomNumbers)).toThrow(
          'Combination must have exactly 4 digits'
        );
      });
      it('should throw an error if the digits are not unique', () => {
        const combinationNumbers = [1, 2, 3, 1];
        expect(() => Combination.from(combinationNumbers)).toThrow(
          'Combination digit 4 is not unique!'
        );

        const combinationNumbers2 = [1, 2, 3, 3];
        expect(() => Combination.from(combinationNumbers2)).toThrow(
          'Combination digit 4 is not unique!'
        );

        const combinationNumbers3 = [1, 2, 2, 3];
        expect(() => Combination.from(combinationNumbers3)).toThrow(
          'Combination digit 3 is not unique!'
        );

        const combinationNumbers4 = [1, 1, 2, 3];
        expect(() => Combination.from(combinationNumbers4)).toThrow(
          'Combination digit 2 is not unique!'
        );
      });

      it('should throw an error if the digits are above from range [1, 7]', () => {
        const combinationNumbers = [1, 2, 3, 8];
        expect(() => Combination.from(combinationNumbers)).toThrow(
          'Combination digit 4 is not in range [1, 7]!'
        );
      });
      it('should throw an error if the digits are below from range [1, 7]', () => {
        const combinationNumbers = [1, 0, 3, 4];
        expect(() => Combination.from(combinationNumbers)).toThrow(
          'Combination digit 2 is not in range [1, 7]!'
        );
      });

      it('should throw an error if the digits are not unique and above from range [1, 7]', () => {
        const combinationNumbers = [1, 1, 3, 8];
        expect(() => Combination.from(combinationNumbers)).toThrow(
          'Combination digit 4 is not in range [1, 7]!'
        );
      });
      it('should throw an error if the digits are not unique and below from range [1, 7]', () => {
        const combinationNumbers = [1, 2, 2, 0];
        expect(() => Combination.from(combinationNumbers)).toThrow(
          'Combination digit 4 is not in range [1, 7]!'
        );
      });
    });

    describe('toBits() method', () => {
      it('should convert the combination to bits correctly for [1, 2, 3, 4]', () => {
        const combination = Combination.from([1, 2, 3, 4]);
        const expectedBits = [
          ...Field(1).toBits(3),
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(4).toBits(3),
        ];
        expect(combination.toBits()).toEqual(expectedBits);
      });

      it('should convert the combination to bits correctly for [5, 6, 7, 1]', () => {
        const combination = Combination.from([5, 6, 7, 1]);
        const expectedBits = [
          ...Field(5).toBits(3),
          ...Field(6).toBits(3),
          ...Field(7).toBits(3),
          ...Field(1).toBits(3),
        ];
        expect(combination.toBits()).toEqual(expectedBits);
      });

      it('should convert the combination to bits correctly for [7, 6, 5, 4]', () => {
        const combination = Combination.from([7, 6, 5, 4]);
        const expectedBits = [
          ...Field(7).toBits(3),
          ...Field(6).toBits(3),
          ...Field(5).toBits(3),
          ...Field(4).toBits(3),
        ];
        expect(combination.toBits()).toEqual(expectedBits);
      });

      it('should convert the combination to bits correctly for [1, 2, 3, 7]', () => {
        const combination = Combination.from([1, 2, 3, 7]);
        const expectedBits = [
          ...Field(1).toBits(3),
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(7).toBits(3),
        ];
        expect(combination.toBits()).toEqual(expectedBits);
      });

      it('should convert the combination to bits correctly for [2, 3, 4, 5]', () => {
        const combination = Combination.from([2, 3, 4, 5]);
        const expectedBits = [
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(4).toBits(3),
          ...Field(5).toBits(3),
        ];
        expect(combination.toBits()).toEqual(expectedBits);
      });

      it('should convert the combination to bits correctly for [1, 2, 3, 6]', () => {
        const combination = Combination.from([1, 2, 3, 6]);
        const expectedBits = [
          ...Field(1).toBits(3),
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(6).toBits(3),
        ];
        expect(combination.toBits()).toEqual(expectedBits);
      });
    });

    describe('compress() method', () => {
      it('should compress the combination correctly for [1, 2, 3, 4]', () => {
        const combination = Combination.from([1, 2, 3, 4]);
        const compressed = combination.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(1).toBits(3),
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(4).toBits(3),
          ...Field(0).toBits().slice(12),
        ]);
      });

      it('should compress the combination correctly for [5, 6, 7, 1]', () => {
        const combination = Combination.from([5, 6, 7, 1]);
        const compressed = combination.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(5).toBits(3),
          ...Field(6).toBits(3),
          ...Field(7).toBits(3),
          ...Field(1).toBits(3),
          ...Field(0).toBits().slice(12),
        ]);
      });
      it('should compress the combination correctly for [7, 6, 5, 4]', () => {
        const combination = Combination.from([7, 6, 5, 4]);
        const compressed = combination.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(7).toBits(3),
          ...Field(6).toBits(3),
          ...Field(5).toBits(3),
          ...Field(4).toBits(3),
          ...Field(0).toBits().slice(12),
        ]);
      });
      it('should compress the combination correctly for [1, 2, 3, 7]', () => {
        const combination = Combination.from([1, 2, 3, 7]);
        const compressed = combination.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(1).toBits(3),
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(7).toBits(3),
          ...Field(0).toBits().slice(12),
        ]);
      });
      it('should compress the combination correctly for [2, 3, 4, 5]', () => {
        const combination = Combination.from([2, 3, 4, 5]);
        const compressed = combination.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(4).toBits(3),
          ...Field(5).toBits(3),
          ...Field(0).toBits().slice(12),
        ]);
      });
    });

    describe('decompress() method', () => {
      it('should decompress the combination correctly for [1, 2, 3, 4]', () => {
        const compressed = Field.fromBits([
          ...Field(1).toBits(3),
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(4).toBits(3),
        ]);
        const combination = Combination.decompress(compressed);
        expect(combination.digits.map((digit) => digit.toBigInt())).toEqual([
          BigInt(1),
          BigInt(2),
          BigInt(3),
          BigInt(4),
        ]);
      });

      it('should decompress the combination correctly for [5, 6, 7, 1]', () => {
        const compressed = Field.fromBits([
          ...Field(5).toBits(3),
          ...Field(6).toBits(3),
          ...Field(7).toBits(3),
          ...Field(1).toBits(3),
        ]);
        const combination = Combination.decompress(compressed);
        expect(combination.digits.map((digit) => digit.toBigInt())).toEqual([
          BigInt(5),
          BigInt(6),
          BigInt(7),
          BigInt(1),
        ]);
      });

      it('should decompress the combination correctly for [7, 6, 5, 4]', () => {
        const compressed = Field.fromBits([
          ...Field(7).toBits(3),
          ...Field(6).toBits(3),
          ...Field(5).toBits(3),
          ...Field(4).toBits(3),
        ]);
        const combination = Combination.decompress(compressed);
        expect(combination.digits.map((digit) => digit.toBigInt())).toEqual([
          BigInt(7),
          BigInt(6),
          BigInt(5),
          BigInt(4),
        ]);
      });

      it('should decompress the combination correctly for [1, 2, 3, 7]', () => {
        const compressed = Field.fromBits([
          ...Field(1).toBits(3),
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(7).toBits(3),
        ]);
        const combination = Combination.decompress(compressed);
        expect(combination.digits.map((digit) => digit.toBigInt())).toEqual([
          BigInt(1),
          BigInt(2),
          BigInt(3),
          BigInt(7),
        ]);
      });

      it('should decompress the combination correctly for [2, 3, 4, 5]', () => {
        const compressed = Field.fromBits([
          ...Field(2).toBits(3),
          ...Field(3).toBits(3),
          ...Field(4).toBits(3),
          ...Field(5).toBits(3),
        ]);
        const combination = Combination.decompress(compressed);
        expect(combination.digits.map((digit) => digit.toBigInt())).toEqual([
          BigInt(2),
          BigInt(3),
          BigInt(4),
          BigInt(5),
        ]);
      });
    });

    describe('validate() method', () => {
      it('should validate a correct combination', () => {
        const combination = Combination.from([2, 3, 4, 5]);
        expect(() => combination.validate()).not.toThrow();
      });

      it('should throw an error for a combination with duplicate digits', () => {
        const combination = new Combination({
          digits: [Field(1), Field(2), Field(3), Field(1)],
        });
        expect(() => combination.validate()).toThrow(
          'Combination digit 4 is not unique!'
        );
      });

      it('should throw an error for a combination with digits out of range', () => {
        const combination = new Combination({
          digits: [Field(1), Field(2), Field(3), Field(8)],
        });
        expect(() => combination.validate()).toThrow(
          'Combination digit 4 is not in range [1, 7]!'
        );

        const combination2 = new Combination({
          digits: [Field(1), Field(2), Field(3), Field(9)],
        });
        expect(() => combination2.validate()).toThrow(
          'Combination digit 4 is not in range [1, 7]!'
        );
      });

      it('should throw an error for a combination with digits below range', () => {
        const combination = new Combination({
          digits: [Field(1), Field(0), Field(3), Field(4)],
        });
        expect(() => combination.validate()).toThrow(
          'Combination digit 2 is not in range [1, 7]!'
        );

        const combination2 = new Combination({
          digits: [Field(0), Field(2), Field(3), Field(4)],
        });
        expect(() => combination2.validate()).toThrow(
          'Combination digit 1 is not in range [1, 7]!'
        );
      });

      it('should throw an error for a combination with digits out of range and duplicates', () => {
        const combination = new Combination({
          digits: [Field(1), Field(1), Field(3), Field(8)],
        });
        expect(() => combination.validate()).toThrow(
          'Combination digit 4 is not in range [1, 7]!'
        );
      });

      it('should throw an error for a combination with digits out of range and duplicates', () => {
        const combination = new Combination({
          digits: [Field(1), Field(2), Field(2), Field(8)],
        });
        expect(() => combination.validate()).toThrow(
          'Combination digit 4 is not in range [1, 7]!'
        );
      });
    });

    describe('updateHistory() method', () => {
      it('should update the history correctly for a new combination', () => {
        const newCombination = Combination.from([1, 2, 3, 4]);
        const compressedHistory = Field.fromBits([
          ...Field(5).toBits(3),
          ...Field(6).toBits(3),
          ...Field(7).toBits(3),
          ...Field(2).toBits(3),
        ]);
        const updatedHistory = Combination.updateHistory(
          newCombination,
          compressedHistory,
          Field(0)
        );
        expect(updatedHistory).toEqual(
          Field.fromBits([
            ...newCombination.toBits(),
            ...compressedHistory.toBits().slice(12),
          ])
        );
      });

      it('should update the history correctly for a new combination with existing history', () => {
        const newCombination = Combination.from([1, 2, 3, 4]);
        const compressedHistory = Field.fromBits([
          ...Field(5).toBits(3),
          ...Field(6).toBits(3),
          ...Field(7).toBits(3),
          ...Field(2).toBits(3),
        ]);
        const updatedHistory = Combination.updateHistory(
          newCombination,
          compressedHistory,
          Field(1)
        );
        expect(updatedHistory).toEqual(
          Field.fromBits([
            ...compressedHistory.toBits().slice(0, 12),
            ...newCombination.toBits(),
            ...compressedHistory.toBits().slice(24),
          ])
        );
      });
    });

    describe('getElementFromHistory() method', () => {
      const combinations = Array.from({ length: MAX_ATTEMPTS }, () =>
        Combination.from(generateRandomCombinationNumbers(4))
      );

      let combinationHistory = combinations.reduce((acc, curr, i) => {
        return Combination.updateHistory(curr, acc, Field(i));
      }, Field(0));

      it('should return the correct combination from the history', () => {
        const index = Field(2);
        const expectedCombination = combinations[2];
        const retrievedCombination = Combination.getElementFromHistory(
          combinationHistory,
          index
        );
        expect(retrievedCombination).toEqual(expectedCombination);
      });

      it('should return the correct combination from the history for the last element', () => {
        const index = Field(MAX_ATTEMPTS - 1);
        const expectedCombination = combinations[MAX_ATTEMPTS - 1];
        const retrievedCombination = Combination.getElementFromHistory(
          combinationHistory,
          index
        );
        expect(retrievedCombination).toEqual(expectedCombination);
      });

      it('should return the correct combination from the history for the first element', () => {
        const index = Field(0);
        const expectedCombination = combinations[0];
        const retrievedCombination = Combination.getElementFromHistory(
          combinationHistory,
          index
        );
        expect(retrievedCombination).toEqual(expectedCombination);
      });

      it('should return the correct combination from the history for an out-of-bounds index', () => {
        const index = Field(MAX_ATTEMPTS);
        const retrievedCombination = Combination.getElementFromHistory(
          combinationHistory,
          index
        );
        expect(retrievedCombination).toEqual(Combination.decompress(Field(0)));
      });

      it('should return the correct combination with another random index', () => {
        const index = Field(4);
        const expectedCombination = combinations[4];
        const retrievedCombination = Combination.getElementFromHistory(
          combinationHistory,
          index
        );
        expect(retrievedCombination).toEqual(expectedCombination);
      });
    });
  });

  describe('Clue class', () => {
    describe('compress() method', () => {
      it('should compress the clue correctly for hits=2 and blows=1', () => {
        const clue = new Clue({ hits: Field(2), blows: Field(1) });
        const compressed = clue.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(2).toBits(3),
          ...Field(1).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
      });

      it('should compress the clue correctly for hits=0 and blows=0', () => {
        const clue = new Clue({ hits: Field(0), blows: Field(0) });
        const compressed = clue.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(0).toBits(3),
          ...Field(0).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
      });

      it('should compress the clue correctly for hits=3 and blows=2', () => {
        const clue = new Clue({ hits: Field(3), blows: Field(2) });
        const compressed = clue.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(3).toBits(3),
          ...Field(2).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
      });

      it('should compress the clue correctly for hits=1 and blows=3', () => {
        const clue = new Clue({ hits: Field(1), blows: Field(3) });
        const compressed = clue.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(1).toBits(3),
          ...Field(3).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
      });

      it('should compress the clue correctly for hits=0 and blows=4', () => {
        const clue = new Clue({ hits: Field(0), blows: Field(4) });
        const compressed = clue.compress();
        expect(compressed.toBits()).toEqual([
          ...Field(0).toBits(3),
          ...Field(4).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
      });
    });

    describe('decompress() method', () => {
      it('should decompress the clue correctly for hits=2 and blows=1', () => {
        const compressed = Field.fromBits([
          ...Field(2).toBits(3),
          ...Field(1).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
        const clue = Clue.decompress(compressed);
        expect(clue.hits).toEqual(Field(2));
        expect(clue.blows).toEqual(Field(1));
      });

      it('should decompress the clue correctly for hits=0 and blows=0', () => {
        const compressed = Field.fromBits([
          ...Field(0).toBits(3),
          ...Field(0).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
        const clue = Clue.decompress(compressed);
        expect(clue.hits).toEqual(Field(0));
        expect(clue.blows).toEqual(Field(0));
      });

      it('should decompress the clue correctly for hits=3 and blows=2', () => {
        const compressed = Field.fromBits([
          ...Field(3).toBits(3),
          ...Field(2).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
        const clue = Clue.decompress(compressed);
        expect(clue.hits).toEqual(Field(3));
        expect(clue.blows).toEqual(Field(2));
      });

      it('should decompress the clue correctly for hits=1 and blows=3', () => {
        const compressed = Field.fromBits([
          ...Field(1).toBits(3),
          ...Field(3).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
        const clue = Clue.decompress(compressed);
        expect(clue.hits).toEqual(Field(1));
        expect(clue.blows).toEqual(Field(3));
      });

      it('should decompress the clue correctly for hits=0 and blows=4', () => {
        const compressed = Field.fromBits([
          ...Field(0).toBits(3),
          ...Field(4).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
        const clue = Clue.decompress(compressed);
        expect(clue.hits).toEqual(Field(0));
        expect(clue.blows).toEqual(Field(4));
      });

      it('should decompress the clue correctly for hits=4 and blows=0', () => {
        const compressed = Field.fromBits([
          ...Field(4).toBits(3),
          ...Field(0).toBits(3),
          ...Field(0).toBits().slice(6),
        ]);
        const clue = Clue.decompress(compressed);
        expect(clue.hits).toEqual(Field(4));
        expect(clue.blows).toEqual(Field(0));
      });
    });

    describe('compress() and decompress() methods', () => {
      it('should compress and decompress the clue correctly for hits=2 and blows=1', () => {
        const clue = new Clue({ hits: Field(2), blows: Field(1) });
        const compressed = clue.compress();
        const decompressed = Clue.decompress(compressed);
        expect(decompressed.hits).toEqual(Field(2));
        expect(decompressed.blows).toEqual(Field(1));
      });

      it('should compress and decompress the clue correctly for hits=0 and blows=0', () => {
        const clue = new Clue({ hits: Field(0), blows: Field(0) });
        const compressed = clue.compress();
        const decompressed = Clue.decompress(compressed);
        expect(decompressed.hits).toEqual(Field(0));
        expect(decompressed.blows).toEqual(Field(0));
      });

      it('should compress and decompress the clue correctly for hits=3 and blows=1', () => {
        const clue = new Clue({ hits: Field(3), blows: Field(1) });
        const compressed = clue.compress();
        const decompressed = Clue.decompress(compressed);
        expect(decompressed.hits).toEqual(Field(3));
        expect(decompressed.blows).toEqual(Field(1));
      });
    });

    describe('giveClue() method', () => {
      it('should give the correct clue for guess=[1, 2, 3, 4] and solution=[1, 2, 3, 4]', () => {
        const guess = [Field(1), Field(2), Field(3), Field(4)];
        const solution = [Field(1), Field(2), Field(3), Field(4)];
        const clue = Clue.giveClue(guess, solution);
        expect(clue.hits).toEqual(Field(4));
        expect(clue.blows).toEqual(Field(0));
      });

      it('should give the correct clue for guess=[1, 2, 3, 4] and solution=[4, 3, 2, 1]', () => {
        const guess = [Field(1), Field(2), Field(3), Field(4)];
        const solution = [Field(4), Field(3), Field(2), Field(1)];
        const clue = Clue.giveClue(guess, solution);
        expect(clue.hits).toEqual(Field(0));
        expect(clue.blows).toEqual(Field(4));
      });

      it('should give the correct clue for guess=[1, 2, 3, 4] and solution=[1, 3, 2, 4]', () => {
        const guess = [Field(1), Field(2), Field(3), Field(4)];
        const solution = [Field(1), Field(3), Field(2), Field(4)];
        const clue = Clue.giveClue(guess, solution);
        expect(clue.hits).toEqual(Field(2));
        expect(clue.blows).toEqual(Field(2));
      });
      it('should give the correct clue for guess=[1, 2, 3, 4] and solution=[2, 1, 4, 3]', () => {
        const guess = [Field(1), Field(2), Field(3), Field(4)];
        const solution = [Field(2), Field(1), Field(4), Field(3)];
        const clue = Clue.giveClue(guess, solution);
        expect(clue.hits).toEqual(Field(0));
        expect(clue.blows).toEqual(Field(4));
      });
    });

    describe('updateHistory() method', () => {
      it('should update the history correctly for a new clue', () => {
        const newClue = new Clue({ hits: Field(2), blows: Field(1) });
        const updatedHistory = Clue.updateHistory(
          newClue,
          Field.from(0),
          Field.from(0)
        );
        expect(updatedHistory).toEqual(
          Field.fromBits([
            ...newClue.hits.toBits(3),
            ...newClue.blows.toBits(3),
            ...Field(0).toBits().slice(6),
          ])
        );
      });

      it('should update the history correctly for a new clue with existing history', () => {
        const newClue = new Clue({ hits: Field(2), blows: Field(1) });
        const updatedHistory = Clue.updateHistory(
          newClue,
          Field.from(0),
          Field.from(1)
        );
        expect(updatedHistory).toEqual(
          Field.fromBits([
            ...Field(0).toBits().slice(0, 6),
            ...newClue.hits.toBits(3),
            ...newClue.blows.toBits(3),
            ...Field(0).toBits().slice(12),
          ])
        );
      });

      it('should update the history correctly for a new clue with existing history', () => {
        const newClue = new Clue({ hits: Field(4), blows: Field(0) });
        const oldClue = new Clue({ hits: Field(2), blows: Field(1) });
        const updatedHistory = Clue.updateHistory(
          newClue,
          Clue.updateHistory(oldClue, Field.from(0), Field.from(1)),
          Field.from(2)
        );
        expect(updatedHistory).toEqual(
          Field.fromBits([
            ...Field(0).toBits().slice(0, 6),
            ...oldClue.hits.toBits(3),
            ...oldClue.blows.toBits(3),
            ...newClue.hits.toBits(3),
            ...newClue.blows.toBits(3),
            ...Field(0).toBits().slice(18),
          ])
        );
      });
    });
  });

  describe('GameState class', () => {
    describe('constructors', () => {
      it('should create a GameState object with default values', () => {
        const gameState = GameState.default;
        expect(gameState).toBeInstanceOf(GameState);
        expect(gameState.rewardAmount).toEqual(UInt64.from(1e9));
        expect(gameState.finalizeSlot).toEqual(UInt32.from(0));
        expect(gameState.turnCount).toEqual(UInt8.from(0));
        expect(gameState.isSolved).toEqual(Bool(false));
      });

      it('should create a GameState object with custom values', () => {
        const gameState = new GameState({
          rewardAmount: UInt64.from(2e9),
          finalizeSlot: UInt32.from(1),
          turnCount: UInt8.from(2),
          isSolved: Bool(true),
        });
        expect(gameState).toBeInstanceOf(GameState);
        expect(gameState.rewardAmount).toEqual(UInt64.from(2e9));
        expect(gameState.finalizeSlot).toEqual(UInt32.from(1));
        expect(gameState.turnCount).toEqual(UInt8.from(2));
        expect(gameState.isSolved).toEqual(Bool(true));
      });
    });

    describe('pack() method', () => {
      it('should pack the GameState object correctly', () => {
        const gameState = new GameState({
          rewardAmount: UInt64.from(2287634827),
          finalizeSlot: UInt32.from(715237),
          turnCount: UInt8.from(72),
          isSolved: Bool(true),
        });
        const packed = gameState.pack();
        expect(packed).toEqual(
          Field.fromBits([
            ...UInt64.from(2287634827).toBits(),
            ...UInt32.from(715237).toBits(),
            ...UInt8.from(72).toBits(),
            Bool(true),
          ])
        );
      });

      it('should pack the GameState object correctly with default values', () => {
        const gameState = GameState.default;
        const packed = gameState.pack();
        expect(packed).toEqual(
          Field.fromBits([
            ...UInt64.from(1e9).toBits(),
            ...UInt32.from(0).toBits(),
            ...UInt8.from(0).toBits(),
            Bool(false),
          ])
        );
      });

      it('should pack the GameState object correctly with custom values', () => {
        const gameState = new GameState({
          rewardAmount: UInt64.from(2e9),
          finalizeSlot: UInt32.from(1),
          turnCount: UInt8.from(2),
          isSolved: Bool(true),
        });
        const packed = gameState.pack();
        expect(packed).toEqual(
          Field.fromBits([
            ...UInt64.from(2e9).toBits(),
            ...UInt32.from(1).toBits(),
            ...UInt8.from(2).toBits(),
            Bool(true),
          ])
        );
      });

      it('should pack the GameState object correctly with big values', () => {
        const gameState = new GameState({
          rewardAmount: UInt64.from(2n ** 64n - 1n),
          finalizeSlot: UInt32.from(2n ** 32n - 1n),
          turnCount: UInt8.from(255),
          isSolved: Bool(true),
        });
        const packed = gameState.pack();
        expect(packed).toEqual(
          Field.fromBits([
            ...UInt64.from(2n ** 64n - 1n).toBits(),
            ...UInt32.from(2n ** 32n - 1n).toBits(),
            ...UInt8.from(255).toBits(),
            Bool(true),
          ])
        );
      });
    });

    describe('unpack() method', () => {
      it('should unpack the GameState object correctly', () => {
        const packed = Field.fromBits([
          ...UInt64.from(2e9).toBits(),
          ...UInt32.from(1).toBits(),
          ...UInt8.from(2).toBits(),
          Bool(true),
        ]);
        const gameState = GameState.unpack(packed);
        expect(gameState).toBeInstanceOf(GameState);
        expect(gameState.rewardAmount).toEqual(UInt64.from(2e9));
        expect(gameState.finalizeSlot).toEqual(UInt32.from(1));
        expect(gameState.turnCount).toEqual(UInt8.from(2));
        expect(gameState.isSolved).toEqual(Bool(true));
      });

      it('should unpack the GameState object correctly with default values', () => {
        const packed = Field.fromBits([
          ...UInt64.from(1e9).toBits(),
          ...UInt32.from(0).toBits(),
          ...UInt8.from(0).toBits(),
          Bool(false),
        ]);
        const gameState = GameState.unpack(packed);
        expect(gameState).toBeInstanceOf(GameState);
        expect(gameState.rewardAmount).toEqual(UInt64.from(1e9));
        expect(gameState.finalizeSlot).toEqual(UInt32.from(0));
        expect(gameState.turnCount).toEqual(UInt8.from(0));
        expect(gameState.isSolved).toEqual(Bool(false));
      });

      it('should unpack the GameState object correctly with custom values', () => {
        const packed = Field.fromBits([
          ...UInt64.from(3e9).toBits(),
          ...UInt32.from(109).toBits(),
          ...UInt8.from(5).toBits(),
          Bool(true),
        ]);
        const gameState = GameState.unpack(packed);
        expect(gameState).toBeInstanceOf(GameState);
        expect(gameState.rewardAmount).toEqual(UInt64.from(3e9));
        expect(gameState.finalizeSlot).toEqual(UInt32.from(109));
        expect(gameState.turnCount).toEqual(UInt8.from(5));
        expect(gameState.isSolved).toEqual(Bool(true));
      });

      it('should unpack the GameState object correctly with big values', () => {
        const packed = Field.fromBits([
          ...UInt64.from(2n ** 64n - 1n).toBits(),
          ...UInt32.from(2n ** 32n - 1n).toBits(),
          ...UInt8.from(255).toBits(),
          Bool(true),
        ]);
        const gameState = GameState.unpack(packed);
        expect(gameState).toBeInstanceOf(GameState);
        expect(gameState.rewardAmount).toEqual(UInt64.from(2n ** 64n - 1n));
        expect(gameState.finalizeSlot).toEqual(UInt32.from(2n ** 32n - 1n));
        expect(gameState.turnCount).toEqual(UInt8.from(255));
        expect(gameState.isSolved).toEqual(Bool(true));
      });
    });
  });
});
