import axios from 'axios';
import { assertExecutionActive, consumeExecutionBudget, consumeRootBudget, getExecutionDeadlineAt, getExecutionSignal, recordExecutionCost, withExecutionDeadline, withExecutionScope, withExecutionSignal } from '@/lib/worker/execution-scope';

it.each([false, true])('axios observes parent cancellation with an existing signal=%s', async existing => {
  const parent = new AbortController();
  const local = new AbortController();
  let requestSignal: AbortSignal | undefined;
  await withExecutionSignal(parent.signal, () => axios.get('https://example.test/offline', {
    signal: existing ? local.signal : undefined,
    adapter: async config => {
      requestSignal = config.signal as AbortSignal;
      return { data: null, status: 200, statusText: 'OK', headers: {}, config };
    },
  }));
  parent.abort(new Error('lease lost'));
  expect(requestSignal?.aborted).toBe(true);
  expect(requestSignal?.reason.message).toBe('lease lost');
  expect(local.signal.aborted).toBe(false);
});

it('axios rejects work resumed inside an aborted scope before reaching the adapter', async () => {
  const parent = new AbortController();
  const adapter = jest.fn();
  await withExecutionSignal(parent.signal, async () => {
    parent.abort(new Error('cancelled before request'));
    await expect(axios.get('https://example.test/offline', { adapter })).rejects.toThrow();
  });
  expect(adapter).not.toHaveBeenCalled();
});

it('enforces elapsed deadlines even before the timer callback runs', async () => {
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    await expect(withExecutionDeadline(100, 'resume', async () => {
      clock.mockReturnValue(now + 101);
      assertExecutionActive();
    })).rejects.toThrow('timed out');
  } finally {
    clock.mockRestore();
  }
});

it('a manually supplied child signal cannot escape parent cancellation', async () => {
  const parent = new AbortController();
  const child = new AbortController();
  await withExecutionSignal(parent.signal, () => withExecutionSignal(child.signal, async () => {
    parent.abort(new Error('parent cancelled'));
    expect(() => assertExecutionActive()).toThrow('parent cancelled');
  }));
});

it('cancels an in-flight axios request without aborting the request owner', async () => {
  const parent = new AbortController();
  const local = new AbortController();
  const pending = withExecutionSignal(parent.signal, () => axios.get('https://example.test/offline', {
    signal: local.signal,
    adapter: config => new Promise((_, reject) => {
      config.signal!.addEventListener!('abort', () => reject(new Error('adapter cancelled')));
      parent.abort(new Error('lease lost'));
    }),
  }));
  await expect(pending).rejects.toThrow();
  expect(local.signal.aborted).toBe(false);
});

it('preserves request-local cancellation without aborting the parent', async () => {
  const parent = new AbortController();
  const local = new AbortController();
  const pending = withExecutionSignal(parent.signal, () => axios.get('https://example.test/offline', {
    signal: local.signal,
    adapter: config => new Promise((_, reject) => {
      config.signal!.addEventListener!('abort', () => reject(new Error('adapter cancelled')));
      local.abort();
    }),
  }));
  await expect(pending).rejects.toThrow();
  expect(parent.signal.aborted).toBe(false);
});

it('retains costs from completed and timed-out children without double-counting', async () => {
  const work = withExecutionDeadline(30, 'dispatch', async () => {
    await withExecutionDeadline(1000, 'initial', async () => recordExecutionCost(0.4));
    return withExecutionDeadline(1000, 'regen', async () => {
      recordExecutionCost(0.3);
      return new Promise<never>(() => {});
    });
  });
  await expect(work).rejects.toMatchObject({ costUsd: 0.7 });
  await expect(withExecutionDeadline(10, 'sibling', async () => new Promise<never>(() => {})))
    .rejects.not.toHaveProperty('costUsd');
});

test('a deadline blocks detached work even after its owner stopped awaiting it', async () => {
  let finish!: () => void;
  const delayed = new Promise<void>(resolve => { finish = resolve; });
  const paidWork = jest.fn();
  let detached!: Promise<void>;
  await expect(withExecutionDeadline(10, 'test', async () => {
    detached = delayed.then(() => {
      assertExecutionActive();
      paidWork();
    });
    return new Promise<never>(() => {});
  })).rejects.toThrow('timed out');
  const rejection = expect(detached).rejects.toThrow('timed out');
  finish();
  await rejection;
  expect(paidWork).not.toHaveBeenCalled();
});

test('getExecutionDeadlineAt reports the tightest ancestor deadline', async () => {
  // S35 regression: a regen child creates its own format-sized inner
  // deadline (65min) inside a tighter outer scope (35min) — headroom
  // guards must read the MIN, not the nearest scope.
  const before = Date.now();
  await withExecutionDeadline(2_100_000, 'regen', async () => {
    const outer = getExecutionDeadlineAt();
    expect(outer).toBeGreaterThanOrEqual(before + 2_100_000);
    expect(outer).toBeLessThanOrEqual(Date.now() + 2_100_000);
    // Inner scope with a LOOSER deadline — the regen bound must still win.
    await withExecutionDeadline(3_900_000, 'inner-pipeline', async () => {
      expect(getExecutionDeadlineAt()).toBe(outer);
    });
    // A plain child scope (no deadline) inherits the ancestor bound.
    await withExecutionScope('node', async () => {
      expect(getExecutionDeadlineAt()).toBe(outer);
    });
  });
  expect(getExecutionDeadlineAt()).toBeUndefined();
});

test('parent cancellation aborts a nested deadline', async () => {
  const controller = new AbortController();
  const work = withExecutionSignal(controller.signal, () => withExecutionDeadline(10000, 'nested', async () => {
    expect(getExecutionSignal()?.aborted).toBe(false);
    return new Promise<never>(() => {});
  }));
  controller.abort(new Error('lease lost'));
  await expect(work).rejects.toThrow('lease lost');
});

test('a completed scope invalidates detached work without aborting its sibling', async () => {
  let late!: () => void;
  await withExecutionDeadline(1000, 'first', async () => {
    const signal = getExecutionSignal()!;
    late = () => signal.throwIfAborted();
  });
  expect(late).toThrow('scope closed');
  await expect(withExecutionDeadline(1000, 'second', async () => {
    assertExecutionActive();
    return 'ok';
  })).resolves.toBe('ok');
});

test('sibling scopes get fresh local ledgers — one node cannot starve the next', async () => {
  const job = new AbortController();
  await withExecutionSignal(job.signal, async () => {
    for (let node = 0; node < 3; node++) {
      await withExecutionScope(`node-${node}`, async () => {
        for (let i = 0; i < 10; i++) {
          expect(consumeExecutionBudget('fresh:x', 10)).toBe(true);
        }
        expect(consumeExecutionBudget('fresh:x', 10)).toBe(false);
      });
    }
  });
});

test('root budget binds total consumption across child scopes', async () => {
  const job = new AbortController();
  const deniedIn: number[] = [];
  await withExecutionSignal(job.signal, async () => {
    for (let node = 0; node < 4; node++) {
      await withExecutionScope(`node-${node}`, async () => {
        for (let i = 0; i < 6; i++) {
          if (!consumeRootBudget('rootcap:test', 12)) deniedIn.push(node);
        }
      });
    }
  });
  // 24 attempts vs root cap 12: nodes 0-1 pass fully, node 2 denied entirely
  expect(deniedIn).toEqual([2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3]);
});

test('parent cancellation propagates into a scope without deadline', async () => {
  const job = new AbortController();
  const work = withExecutionSignal(job.signal, () =>
    withExecutionScope('child', async () => new Promise<never>(() => {})));
  job.abort(new Error('lease lost'));
  await expect(work).rejects.toThrow('lease lost');
});
