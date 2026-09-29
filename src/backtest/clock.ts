export interface Clock {
  now(): number;
}

export class SimulationClock implements Clock {
  #timestamp = Number.NEGATIVE_INFINITY;

  now(): number {
    return this.#timestamp;
  }

  advance(timestamp: number): void {
    if (timestamp <= this.#timestamp) {
      throw new Error("Simulation timestamps must be strictly increasing");
    }
    this.#timestamp = timestamp;
  }
}
