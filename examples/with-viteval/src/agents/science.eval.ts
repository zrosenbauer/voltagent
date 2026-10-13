import { evaluate, scorers } from "viteval";
import scienceDataset from "./science.dataset.js";
import { scienceAgent } from "./science.js";

evaluate("Science Agent", {
  description: "Evaluates the science agent knowledge and accuracy",
  data: scienceDataset,
  task: async ({ input }) => {
    const result = await scienceAgent.generateText(input);
    return result.text;
  },
  scorers: [scorers.answerCorrectness],
  threshold: 0.7,
});
