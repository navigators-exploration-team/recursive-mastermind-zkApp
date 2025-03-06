/* eslint-disable no-unused-vars */
import type {
  ZkappWorkerRequest,
  ZkappWorkerReponse,
  WorkerFunctions,
} from './worker.js';

export default class WorkerClient {
  setActiveInstanceToLocal() {
    return this._call('setActiveInstanceToLocal', {});
  }

  loadAndCompileContract() {
    return this._call('loadAndCompileContract', {});
  }

  compileProgram() {
    return this._call('compileProgram', {});
  }

  deployAndInitializeContract() {
    return this._call('deployAndInitializeContract', {});
  }

  acceptGame() {
    return this._call('acceptGame', {});
  }

  solveBenchmark({
    secretCombination,
    steps,
  }: {
    secretCombination: number[];
    steps: number[];
  }): Promise<BenchmarkResults> {
    return this._call('solveBenchmark', {
      secretCombination,
      steps,
    }) as Promise<BenchmarkResults>;
  }

  worker: Worker;

  promises: {
    [id: number]: { resolve: (res: any) => void; reject: (err: any) => void };
  };

  nextId: number;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url));
    this.promises = {};
    this.nextId = 0;

    this.worker.onmessage = (event: MessageEvent<ZkappWorkerReponse>) => {
      this.promises[event.data.id].resolve(event.data.data);
      delete this.promises[event.data.id];
    };
  }

  _call(fn: WorkerFunctions, args: any) {
    return new Promise((resolve, reject) => {
      this.promises[this.nextId] = { resolve, reject };

      const message: ZkappWorkerRequest = {
        id: this.nextId,
        fn,
        args,
      };

      this.worker.postMessage(message);

      this.nextId++;
    });
  }
}
