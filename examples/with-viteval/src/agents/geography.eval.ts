import { evaluate, scorers } from "viteval";
import geographyDataset from "./geography.dataset.js";
import { geographyAgent } from "./geography.js";

evaluate("Geography Agent", {
  description: "Evaluates the geography agent knowledge and accuracy",
  data: geographyDataset,
  task: async ({ input }) => {
    const result = await geographyAgent.generateText(input);
    return result.text;
  },
  scorers: [scorers.answerCorrectness],
  threshold: 0.7,
});
