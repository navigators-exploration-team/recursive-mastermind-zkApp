import { Field, Bool, Provable, UInt64, UInt32, Struct, UInt8 } from 'o1js';
import { MAX_ATTEMPTS } from './constants';

export { Combination, Clue, GameState };

class Combination extends Struct({
  digits: Provable.Array(Field, 4),
}) {
  static from(numbers: number[]) {
    if (numbers.length !== 4) {
      throw new Error('Combination must have exactly 4 digits');
    }
    const combination = new this({
      digits: numbers.map((number) => Field(number)),
    });

    combination.validate();
    return combination;
  }

  toBits() {
    return this.digits.map((digit) => digit.toBits(3)).flat();
  }

  compress() {
    return Field.fromBits(this.toBits());
  }

  static decompress(compressedCombination: Field) {
    const bits = compressedCombination.toBits(12);

    return new this({
      digits: [
        Field.fromBits(bits.slice(0, 3)),
        Field.fromBits(bits.slice(3, 6)),
        Field.fromBits(bits.slice(6, 9)),
        Field.fromBits(bits.slice(9, 12)),
      ],
    });
  }

  validate() {
    for (let i = 0; i < 4; i++) {
      this.digits[i]
        .equals(0)
        .or(this.digits[i].equals(8)) // do we need check for after 3 bits?
        .or(this.digits[i].equals(9))
        .assertFalse(`Combination digit ${i + 1} is not in range [1, 7]!`);
    }

    for (let i = 1; i < 4; i++) {
      for (let j = i; j < 4; j++) {
        this.digits[i - 1].assertNotEquals(
          this.digits[j],
          `Combination digit ${j + 1} is not unique!`
        );
      }
    }
  }

  private static decompressHistory(compressedHistory: Field) {
    const historyBits = compressedHistory.toBits(12 * MAX_ATTEMPTS);
    const historyBitPacks: Bool[][] = [];

    for (let i = 0; i < historyBits.length; i += 12) {
      historyBitPacks.push(historyBits.slice(i, i + 12));
    }

    return historyBitPacks.map((bits) => Field.fromBits(bits));
  }

  static updateHistory(
    newCombination: Combination,
    compressedHistory: Field,
    index: Field
  ) {
    const combinationHistory = this.decompressHistory(compressedHistory);

    const newCombinationCompressed = newCombination.compress();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      combinationHistory[i] = Provable.if(
        index.equals(i),
        newCombinationCompressed,
        combinationHistory[i]
      );
    }

    const updatedHistory = combinationHistory.map((c) => c.toBits(12)).flat();
    return Field.fromBits(updatedHistory);
  }

  static getElementFromHistory(compressedHistory: Field, index: Field) {
    let combinationHistory = this.decompressHistory(compressedHistory);

    let element = Field(0);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      element = Provable.if(index.equals(i), combinationHistory[i], element);
    }
    return Combination.decompress(element);
  }
}

class Clue extends Struct({
  hits: Field,
  blows: Field,
}) {
  compress() {
    return Field.fromBits(this.hits.toBits(3).concat(this.blows.toBits(3)));
  }

  static decompress(compressedClue: Field) {
    const bits = compressedClue.toBits(6);
    return new this({
      hits: Field.fromBits(bits.slice(0, 3)),
      blows: Field.fromBits(bits.slice(3, 6)),
    });
  }

  static giveClue(guess: Field[], solution: Field[]) {
    let hits = Field(0);
    let blows = Field(0);

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const isEqual = guess[i].equals(solution[j]).toField();
        if (i === j) {
          hits = hits.add(isEqual);
        } else {
          blows = blows.add(isEqual);
        }
      }
    }
    return new this({ hits, blows });
  }

  isSolved() {
    return this.hits.equals(4);
  }

  static updateHistory(newClue: Clue, compressedHistory: Field, index: Field) {
    const historyBits = compressedHistory.toBits(6 * MAX_ATTEMPTS);
    const historyBitPacks: Bool[][] = [];

    for (let i = 0; i < historyBits.length; i += 6) {
      historyBitPacks.push(historyBits.slice(i, i + 6));
    }

    let clueHistory = historyBitPacks.map((bits) => Field.fromBits(bits));

    const newClueCompressed = newClue.compress();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      clueHistory[i] = Provable.if(
        index.equals(i),
        newClueCompressed,
        clueHistory[i]
      );
    }

    const updatedHistory = clueHistory.map((c) => c.toBits(6)).flat();
    return Field.fromBits(updatedHistory);
  }
}

class GameState extends Struct({
  rewardAmount: UInt64,
  finalizeSlot: UInt32,
  turnCount: UInt8,
  isSolved: Bool,
}) {
  static default = new this({
    rewardAmount: UInt64.from(1e9),
    finalizeSlot: UInt32.from(0),
    turnCount: UInt8.from(0),
    isSolved: Bool(false),
  });

  pack() {
    const { rewardAmount, finalizeSlot, turnCount, isSolved } = this;

    const serializedState = [
      rewardAmount.toBits(),
      finalizeSlot.toBits(),
      turnCount.toBits(),
      isSolved.toField().toBits(1),
    ].flat();

    return Field.fromBits(serializedState);
  }

  static unpack(serializedState: Field) {
    const bits = serializedState.toBits();

    const rewardAmount = UInt64.fromBits(bits.slice(0, 64));
    const finalizeSlot = UInt32.fromBits(bits.slice(64, 96));
    const turnCount = UInt8.fromBits(bits.slice(96, 104));
    const isSolved = bits[104];

    return new this({
      rewardAmount,
      finalizeSlot,
      turnCount,
      isSolved,
    });
  }
}
