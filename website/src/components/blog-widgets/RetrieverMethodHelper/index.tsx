import type React from "react";
import { useState } from "react";
import styles from "./styles.module.css"; // Assuming shared styles or create new ones

type Recommendation = {
  method: "Direct Attachment" | "Tool" | "Unsure";
  reasoning: string;
};

const frequencyOptions = [
  { value: "always", label: "Always (on almost every request)" },
  {
    value: "sometimes",
    label: "Sometimes (only for specific types of queries)",
  },
  { value: "unsure", label: "I'm not sure yet" },
];

const agentDecisionOptions = [
  { value: "not_important", label: "Not Important (It can always retrieve)" },
  { value: "somewhat_important", label: "Somewhat Important" },
  { value: "very_important", label: "Very Important (Agent should choose)" },
];

const RetrieverMethodHelper: React.FC = () => {
  const [frequency, setFrequency] = useState<string>("");
  const [agentDecision, setAgentDecision] = useState<string>("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null,
  );

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    calculateRecommendation(value, agentDecision);
  };

  const handleAgentDecisionChange = (value: string) => {
    setAgentDecision(value);
    calculateRecommendation(frequency, value);
  };

  const calculateRecommendation = (
    currentFrequency: string,
    currentAgentDecision: string,
  ) => {
    if (!currentFrequency || !currentAgentDecision) {
      setRecommendation(null);
      return;
    }

    let rec: Recommendation;

    if (currentFrequency === "always") {
      if (currentAgentDecision === "not_important") {
        rec = {
          method: "Direct Attachment",
          reasoning:
            "Since the context is always needed and agent autonomy isn't critical, direct attachment is simpler and ensures context is always available.",
        };
      } else {
        rec = {
          method: "Unsure",
          reasoning:
            "You always need context, but also want agent control. Direct attachment ensures context, but using it as a tool gives control. Consider if the simplicity of direct attachment outweighs the need for agent decision in this specific case.",
        };
      }
    } else if (currentFrequency === "sometimes") {
      if (currentAgentDecision === "very_important") {
        rec = {
          method: "Tool",
          reasoning:
            "Context is needed selectively, and agent decision is important. Using the retriever as a tool is the most efficient and flexible approach here.",
        };
      } else {
        rec = {
          method: "Tool",
          reasoning:
            "Context is needed selectively. Using the retriever as a tool is generally more efficient, allowing the agent to decide when to fetch information.",
        };
      }
    } else {
      // unsure frequency
      rec = {
        method: "Unsure",
        reasoning:
          "It's unclear how often context is needed. Starting with the retriever as a tool offers more flexibility, but direct attachment is simpler if you find context is almost always required.",
      };
    }

    setRecommendation(rec);
  };

  return (
    <div className={styles.widgetContainer}>
      <h4>Help Me Choose: Retriever Method</h4>

      {/* Frequency Question */}
      <div className={styles.questionBlock}>
        <p className={styles.questionLabel}>
          How often will your agent need the retrieved information?
        </p>
        <div className={styles.radioGroup}>
          {frequencyOptions.map((option) => (
            <label key={option.value} className={styles.radioOption}>
              <input
                type="radio"
                name="frequency"
                value={option.value}
                checked={frequency === option.value}
                onChange={() => handleFrequencyChange(option.value)}
                className={styles.radioInput}
              />
              <span className={styles.radioLabel}>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Agent Decision Question */}
      <div className={styles.questionBlock}>
        <p className={styles.questionLabel}>
          How important is it for the agent (LLM) to *decide* when to retrieve?
        </p>
        <div className={styles.radioGroup}>
          {agentDecisionOptions.map((option) => (
            <label key={option.value} className={styles.radioOption}>
              <input
                type="radio"
                name="agentDecision"
                value={option.value}
                checked={agentDecision === option.value}
                onChange={() => handleAgentDecisionChange(option.value)}
                className={styles.radioInput}
              />
              <span className={styles.radioLabel}>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Recommendation Box */}
      {recommendation && (
        <div
          className={styles.recommendationBox}
          data-recommendation-type={recommendation.method.toLowerCase()}
        >
          <h5>Recommendation: {recommendation.method}</h5>
          <p>{recommendation.reasoning}</p>
          {recommendation.method !== "Unsure" && (
            <p>
              Learn more in the{" "}
              <a
                href="/docs/agents/retriever"
                target="_blank"
                rel="noopener noreferrer"
              >
                Retriever Documentation
              </a>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default RetrieverMethodHelper;
