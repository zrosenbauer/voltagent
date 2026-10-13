import { evaluate, scorers } from "viteval";
import generalDataset from "./general.dataset.js";
import { generalAgent } from "./general.js";

evaluate("General Agent", {
  description: "Evaluates the general question-answering agent capabilities",
  data: generalDataset,
  task: async ({ input }) => {
    const result = await generalAgent.generateText(input);
    return result.text;
  },
  scorers: [scorers.answerCorrectness],
  threshold: 0.6,
});
