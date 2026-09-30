import { assertExecutionActive, consumeExecutionBudget, consumeRootBudget, getExecutionSignal, withExecutionDeadline, withExecutionScope, withExecutionSignal } from '@/lib/worker/execution-scope';

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
