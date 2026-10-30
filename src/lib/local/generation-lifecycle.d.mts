export function createGenerationLifecycle(stop: () => void): {
  readonly closed: boolean;
  push<T>(value: T, accept: (value: T) => void): boolean;
  close(completed: boolean): void;
};
