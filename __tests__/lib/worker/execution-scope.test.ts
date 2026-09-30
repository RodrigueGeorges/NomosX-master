import { assertExecutionActive, getExecutionSignal, withExecutionDeadline, withExecutionSignal } from '@/lib/worker/execution-scope';

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
