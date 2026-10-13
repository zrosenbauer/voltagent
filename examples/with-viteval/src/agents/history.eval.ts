import { evaluate, scorers } from "viteval";
import historyDataset from "./history.dataset.js";
import { historyAgent } from "./history.js";

evaluate("History Agent", {
  description: "Evaluates the history agent knowledge and accuracy",
  data: historyDataset,
  task: async ({ input }) => {
    const result = await historyAgent.generateText(input);
    return result.text;
  },
  scorers: [scorers.answerCorrectness],
  threshold: 0.7,
});
