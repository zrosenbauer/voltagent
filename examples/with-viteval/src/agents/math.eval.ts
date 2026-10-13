import { evaluate, scorers } from "viteval";
import mathDataset from "./math.dataset.js";
import { mathAgent } from "./math.js";

evaluate("Math Agent", {
  description: "Evaluates the math agent problem-solving capabilities",
  data: mathDataset,
  task: async ({ input }) => {
    const result = await mathAgent.generateText(input);
    return result.text;
  },
  scorers: [scorers.answerCorrectness],
  threshold: 0.7,
});
