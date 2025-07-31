import { describe, it } from "vitest";
import { createMockWorkflowExecuteContext } from "../../test-utils";
import { andAll } from "./and-all";
import { andThen } from "./and-then";

describe("andAll", () => {
  it("should return the results in order", async () => {
    const step = andAll({
      id: "and-all",
      steps: [
        andThen({
          id: "a",
          execute: async () => {
            return {
              a: 2,
            };
          },
        }),
        andThen({
          id: "b",
          execute: async () => {
            return {
              b: 3,
            };
          },
        }),
      ],
    });

    expect(await step.execute(createMockWorkflowExecuteContext())).toEqual([{ a: 2 }, { b: 3 }]);
  });

  it("should provide the correct type for the result", async () => {
    type INPUT = string;
    type DATA = { name: string };

    const steps = [
      andThen<INPUT, DATA, { a: number }>({
        id: "a",
        execute: async () => {
          return {
            a: 2,
          };
        },
      }),
      andThen<INPUT, DATA, { b: number }>({
        id: "b",
        execute: async () => {
          return {
            b: 3,
          };
        },
      }),
    ] as const;

    const step = andAll<string, { name: string }, { a: number } | { b: number }, typeof steps>({
      id: "and-all",
      steps,
    });

    expectTypeOf(step.execute).toExtend<
      (context: any) => Promise<ReadonlyArray<{ a: number } | { b: number }>>
    >();
  });
});
