import { type LanguageModel, wrapLanguageModel } from "ai";

export type ResolvedRetryModel = Exclude<LanguageModel, string>;
type ProviderModel = ReturnType<typeof wrapLanguageModel>;
export type ProviderCallOptions = Parameters<ProviderModel["doGenerate"]>[0];
type GenerateResult = Awaited<ReturnType<ProviderModel["doGenerate"]>>;
type StreamResult = Awaited<ReturnType<ProviderModel["doStream"]>>;
export type ProviderResult = GenerateResult | StreamResult;
export type ProviderStreamPart = StreamResult["stream"] extends ReadableStream<infer Part>
  ? Part
  : never;

type RunModelAttempt = <T extends ProviderResult>(
  run: (model: ResolvedRetryModel) => Promise<T>,
  params: ProviderCallOptions,
  streaming: boolean,
) => Promise<T>;

const retryingModels = new WeakSet<object>();
export const isRetryingLanguageModel = (model: LanguageModel): boolean =>
  typeof model !== "string" && retryingModels.has(model);

/** Retry provider calls while the SDK retains ownership of steps and tool execution. */
export function createRetryingLanguageModel(
  initialModel: ResolvedRetryModel,
  run: RunModelAttempt,
): ProviderModel {
  const adapt = (model: ResolvedRetryModel) => wrapLanguageModel({ model, middleware: [] });
  let current = adapt(initialModel);
  const wrapped: ProviderModel = {
    specificationVersion: "v4",
    get provider() {
      return current.provider;
    },
    get modelId() {
      return current.modelId;
    },
    get supportedUrls() {
      return current.supportedUrls;
    },
    doGenerate: (params) =>
      run(
        async (model) => {
          current = adapt(model);
          return current.doGenerate(params);
        },
        params,
        false,
      ),
    doStream: (params) =>
      run(
        async (model) => {
          current = adapt(model);
          const result = await current.doStream(params);
          return { ...result, stream: await prepareModelStream(result.stream, params.abortSignal) };
        },
        params,
        true,
      ),
  };
  retryingModels.add(wrapped);
  return wrapped;
}

/**
 * Hide only unsuccessful stream preludes. Once a content/start/finish event is
 * exposed, the SDK owns that stream and failures must not replay its contents.
 */
async function prepareModelStream(
  stream: ReadableStream<ProviderStreamPart>,
  signal?: AbortSignal,
): Promise<ReadableStream<ProviderStreamPart>> {
  const reader = stream.getReader();
  const buffered: ProviderStreamPart[] = [];
  let done = false;
  const cancel = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = await reader.read();
      signal?.throwIfAborted();
      if (next.done) {
        done = true;
        break;
      }
      if (next.value.type === "error") throw next.value.error;
      buffered.push(next.value);
      if (next.value.type !== "stream-start" && next.value.type !== "response-metadata") break;
    }
  } catch (error) {
    // A provider's cancel hook can stall; retry must not wait for it to settle.
    void reader
      .cancel(error)
      .catch(() => {})
      .finally(() => reader.releaseLock());
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return new ReadableStream<ProviderStreamPart>(
    {
      async pull(controller) {
        const bufferedPart = buffered.shift();
        if (bufferedPart) {
          controller.enqueue(bufferedPart);
          return;
        }
        if (done) {
          reader.releaseLock();
          controller.close();
          return;
        }
        try {
          const next = await reader.read();
          if (next.done) {
            done = true;
            reader.releaseLock();
            controller.close();
          } else controller.enqueue(next.value);
        } catch (error) {
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
    },
    { highWaterMark: 0 },
  );
}

/** Abortable backoff also honors SDK step/total timeout signals. */
export async function waitForModelRetry(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
