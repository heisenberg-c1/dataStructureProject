type CancelableFn<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
};

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): CancelableFn<TArgs> {
  let timerId: number | null = null;

  const debounced = ((...args: TArgs) => {
    if (timerId != null) {
      window.clearTimeout(timerId);
    }
    timerId = window.setTimeout(() => {
      timerId = null;
      fn(...args);
    }, waitMs);
  }) as CancelableFn<TArgs>;

  debounced.cancel = () => {
    if (timerId != null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
  };

  return debounced;
}

export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): CancelableFn<TArgs> {
  let timerId: number | null = null;
  let pendingArgs: TArgs | null = null;

  const run = (args: TArgs) => {
    fn(...args);
    timerId = window.setTimeout(() => {
      timerId = null;
      if (pendingArgs) {
        const next = pendingArgs;
        pendingArgs = null;
        run(next);
      }
    }, waitMs);
  };

  const throttled = ((...args: TArgs) => {
    if (timerId == null) {
      run(args);
      return;
    }
    pendingArgs = args;
  }) as CancelableFn<TArgs>;

  throttled.cancel = () => {
    if (timerId != null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    pendingArgs = null;
  };

  return throttled;
}
