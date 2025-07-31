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

  it("should return the results in order for dynamic steps", async () => {
    const step = andAll({
      id: "and-all",
      steps: async () => {
        return [
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
        ] as const;
      },
    });

    expect(await step.execute(createMockWorkflowExecuteContext())).toEqual([{ a: 2 }, { b: 3 }]);
  });
});
