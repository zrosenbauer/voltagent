import type { AsyncIterableStream, StreamTextTransform, ToolSet } from "ai";

/** Adapt our orchestration iterables without eagerly draining the producer. */
export function readableFromIterable<T>(source: AsyncIterable<T>): AsyncIterableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<T>(
    {
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel() {
        await iterator.return?.();
      },
    },
    { highWaterMark: 0 },
  ) as AsyncIterableStream<T>;
}

/** Each result getter gets its own branch, as with the SDK's stream getters. */
export function replayableStream<T>(create: () => AsyncIterable<T>): () => AsyncIterableStream<T> {
  let remaining: ReadableStream<T> | undefined;
  return () => {
    remaining ??= readableFromIterable(create());
    const [branch, rest] = remaining.tee();
    remaining = rest;
    return branch as AsyncIterableStream<T>;
  };
}

/** Preserve SDK getters and method receivers, including fields added by newer SDKs. */
export function delegateStreamResult<T extends object, E extends object>(
  result: T,
  extensions: E,
  gate?: () => Promise<void>,
): Omit<T, keyof E> & E {
  return new Proxy(result, {
    get(target, key) {
      if (Object.hasOwn(extensions, key)) return Reflect.get(extensions, key, extensions);
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value === "function") return value.bind(target);
      if (
        gate &&
        value != null &&
        typeof value === "object" &&
        "then" in value &&
        typeof value.then === "function"
      ) {
        // Attach both handlers immediately, including when the gate rejects first.
        return Promise.all([gate(), value]).then(([, resolved]) => resolved);
      }
      return value;
    },
    has(target, key) {
      return Object.hasOwn(extensions, key) || Reflect.has(target, key);
    },
    ownKeys(target) {
      return [
        ...Reflect.ownKeys(target),
        ...Reflect.ownKeys(extensions).filter((key) => !Reflect.has(target, key)),
      ];
    },
    getOwnPropertyDescriptor(target, key) {
      if (Object.hasOwn(extensions, key)) {
        // SDK prototype getters (notably elementStream) must stay off object
        // spreads: reading one can consume a stream or reject an output mode.
        if (Reflect.has(target, key) && !Object.hasOwn(target, key)) return undefined;
        return { ...Reflect.getOwnPropertyDescriptor(extensions, key), configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  }) as unknown as Omit<T, keyof E> & E;
}

/** Recovered SDK stream errors never reach its public transform pipeline. */
export function observeTerminalStreamErrors<TOOLS extends ToolSet>(
  transforms: StreamTextTransform<TOOLS> | StreamTextTransform<TOOLS>[] | undefined,
  onError: (error: unknown) => Promise<void>,
): StreamTextTransform<TOOLS>[] {
  const observer: StreamTextTransform<TOOLS> = () =>
    new TransformStream({
      async transform(part, controller) {
        if (part.type === "error") await onError(part.error);
        controller.enqueue(part);
      },
    });
  return [observer, ...(Array.isArray(transforms) ? transforms : transforms ? [transforms] : [])];
}
