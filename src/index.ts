import { MastermindZkApp } from './Mastermind.js';
import {
  StepProgram,
  StepProgramProof,
  PublicInputs,
  PublicOutputs,
} from './stepProgram.js';
import {
  separateCombinationDigits,
  compressCombinationDigits,
  validateCombination,
  serializeClue,
  deserializeClue,
  serializeClueHistory,
  deserializeClueHistory,
  getClueFromGuess,
  checkIfSolved,
  serializeCombinationHistory,
  deserializeCombinationHistory,
  updateElementAtIndex,
  getElementAtIndex,
} from './utils.js';

export {
  MastermindZkApp,
  StepProgram,
  PublicInputs,
  PublicOutputs,
  StepProgramProof,
  separateCombinationDigits,
  compressCombinationDigits,
  validateCombination,
  serializeClue,
  deserializeClue,
  serializeClueHistory,
  deserializeClueHistory,
  getClueFromGuess,
  checkIfSolved,
  serializeCombinationHistory,
  deserializeCombinationHistory,
  updateElementAtIndex,
  getElementAtIndex,
};
