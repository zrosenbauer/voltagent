import React, { useState } from "react";
import Layout from "@theme/Layout";
import { motion } from "framer-motion";
import PricingSection from "../components/console/PricingSection";
import { DotPattern } from "../components/ui/dot-pattern";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

export default function Pricing(): JSX.Element {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenFAQ(openFAQ === index ? null : index);
  };

  const faqData = [
    {
      question:
        "My application isn't written in Python or TypeScript. Will VoltOps be helpful?",
      answer:
        "Yes! VoltOps LLM Observability works with applications written in any programming language. Our REST API and webhook integrations allow you to send traces from Java, C#, Go, Ruby, PHP, or any other language. We also provide SDKs for Python and JavaScript/TypeScript for easier integration.",
    },
    {
      question: "How can VoltOps help with observability and evaluation?",
      answer:
        "VoltOps provides comprehensive LLM observability with detailed traces, token usage tracking, cost analysis, performance metrics, and user session monitoring. You can evaluate your AI agents' performance, debug issues in real-time, and optimize your applications based on production data insights.",
    },
    {
      question: "What counts as a trace in VoltOps?",
      answer:
        "A trace represents a single execution flow through your AI agent or application. This includes LLM calls, tool usage, function calls, and any nested operations that occur during a single request or conversation turn. Each user interaction that triggers your AI system typically generates one trace.",
    },
    {
      question: "How does VoltOps pricing work with trace overages?",
      answer:
        "VoltOps Pro plan includes 5,000 traces per month for $50. If you exceed this limit, you'll be charged $10 for every additional 5,000 traces. Use our pricing calculator to estimate your monthly costs based on expected usage. You can set up billing alerts to monitor your usage.",
    },
    {
      question:
        "I can't have data leave my environment. Can I self-host VoltOps?",
      answer:
        "Yes! VoltOps Enterprise plan includes self-hosted deployment options. You can run VoltOps entirely within your own infrastructure, ensuring your sensitive AI application data never leaves your environment while still getting full monitoring capabilities.",
    },
    {
      question: "Where is VoltOps data stored?",
      answer:
        "For our cloud offering, VoltOps data is securely stored in SOC 2 compliant data centers with encryption at rest and in transit. For Enterprise customers, we offer self-hosted options where all data remains in your own infrastructure and never leaves your environment.",
    },
    {
      question: "Will VoltOps add latency to my application?",
      answer:
        "VoltOps is designed for minimal performance impact. Our SDKs send data asynchronously in the background, typically adding less than 1ms of overhead. The monitoring happens without blocking your AI application's main execution flow.",
    },
    {
      question: "Will you train on the data that I send VoltOps?",
      answer:
        "No, absolutely not. VoltOps never uses your data to train models or for any other purpose beyond providing you with monitoring and analytics. Your AI application data is strictly used only for observability features and remains completely private to your organization.",
    },
  ];

  return (
    <Layout
      title="VoltOps LLM Observability Pricing"
      description="Simple, transparent pricing for VoltOps LLM Observability platform. VoltAgent Core Framework is free and open source. Monitor and scale your AI applications with confidence."
    >
      <DotPattern dotColor="#94a3b8" dotSize={1.2} spacing={20} />
      <main className="min-h-screen">
        {/* Hero Section */}
        <section className="relative  px-4">
          <div className="max-w-7xl mx-auto md:pt-20 pt-8 text-center px-4 landing-xs:px-3 landing-sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl landing-xs:text-xl landing-sm:text-4xl md:text-5xl lg:text-5xl text-left font-bold mb-4 landing-md:mb-6">
                <span className="text-white">Choose Your</span>{" "}
                <span className="text-orange-400">Observability Plan</span>
              </h1>
              <p className="text-xl landing-xs:text-sm landing-sm:text-lg md:text-2xl text-gray-400 mb-8 landing-xs:mb-6 max-w-4xl text-left leading-relaxed">
                Track, debug, test, monitor and optimize your AI app & agents
                performance with{" "}
                <span className="text-orange-400 font-medium">
                  VoltOps LLM Observability
                </span>{" "}
                Platform whether you're building with VoltAgent or not.
              </p>

              {/* Open Source Notice */}
              <div className="text-left mb-8 landing-xs:mb-6">
                <div className="bg-gradient-to-r from-blue-500/10 to-emerald-500/10 border border-blue-500/20  rounded-2xl landing-xs:rounded-lg ">
                  <p className="text-sm landing-xs:text-lg leading-relaxed mb-4 landing-xs:mb-3">
                    The{" "}
                    <span className="text-emerald-400 font-medium">
                      VoltAgent Core Framework
                    </span>{" "}
                    is{" "}
                    <span className="text-emerald-400 font-medium">
                      open source and free
                    </span>
                    . Build AI agents & LLM Apps without any cost.
                  </p>
                  <p className="text-xs landing-xs:text-lg leading-relaxed">
                    The pricing is for{" "}
                    <span className="text-orange-400 font-medium">
                      VoltOps LLM Observability
                    </span>
                    , a framework-agnostic monitoring and analytics platform.
                  </p>
                  <div className="mt-4 landing-xs:mt-3 flex flex-col sm:flex-row gap-3 landing-xs:gap-2 text-left ">
                    <a
                      href="/voltops-llm-observability-docs/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center  border-solid border-orange-500/20 text-orange-400 font-medium px-4 py-2 landing-xs:px-3 landing-xs:py-1.5 rounded-lg border border-orange-500/30 hover:bg-orange-500/30 transition-colors no-underline text-xs landing-xs:text-sm"
                    >
                      VoltOps LLM Observability Docs
                      <ArrowTopRightOnSquareIcon className="w-4 h-4 landing-xs:w-3 landing-xs:h-3 ml-2 landing-xs:ml-1" />
                    </a>
                    <a
                      href="/docs/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center  border-solid border-emerald-500/20 text-emerald-400 font-medium px-4 py-2 landing-xs:px-3 landing-xs:py-1.5 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors no-underline text-xs landing-xs:text-sm"
                    >
                      VoltAgent Core Framework Docs
                      <ArrowTopRightOnSquareIcon className="w-4 h-4 landing-xs:w-3 landing-xs:h-3 ml-2 landing-xs:ml-1" />
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Pricing Section */}
        <PricingSection />

        {/* FAQ Section */}
        <section className="landing-xs:pt-8 landing-sm:pt-16 landing-md:pt-20 px-4 landing-xs:px-3 landing-sm:px-6">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-center mb-12 landing-xs:mb-8 landing-sm:mb-16"
            >
              <h2 className="text-3xl landing-xs:text-lg landing-sm:text-3xl md:text-4xl font-bold text-white mb-4 landing-xs:mb-3">
                Frequently Asked Questions
              </h2>
              <p className="text-gray-400 text-lg landing-xs:text-xs landing-sm:text-lg">
                Everything you need to know about VoltOps LLM Observability
              </p>
            </motion.div>

            <div className="space-y-4 landing-xs:space-y-2">
              {faqData.map((faq, index) => (
                <motion.div
                  key={faq.question}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                  className="bg-[#191c24] border border-solid border-gray-700/50 rounded-lg landing-xs:rounded-md overflow-hidden hover:border-emerald-400/30 transition-colors"
                >
                  <div
                    onClick={() => toggleFAQ(index)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        toggleFAQ(index);
                      }
                    }}
                    className="w-full text-left p-6 landing-xs:p-3 landing-sm:p-5 flex items-center justify-between focus:outline-none focus:bg-gray-800/20 hover:bg-gray-800/20 transition-colors cursor-pointer"
                  >
                    <span className="text-lg landing-xs:text-xs landing-sm:text-lg font-semibold text-white pr-4 landing-xs:pr-2">
                      {faq.question}
                    </span>
                    <ChevronDownIcon
                      className={`w-5 h-5 landing-xs:w-3 landing-xs:h-3 landing-sm:w-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
                        openFAQ === index ? "rotate-180" : ""
                      }`}
                    />
                  </div>

                  <motion.div
                    initial={false}
                    animate={{
                      height: openFAQ === index ? "auto" : 0,
                      opacity: openFAQ === index ? 1 : 0,
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 landing-xs:px-3 landing-xs:pb-3 landing-sm:px-5 landing-sm:pb-5">
                      <p className="text-gray-400 leading-relaxed landing-xs:text-xs landing-sm:text-base">
                        {faq.answer}
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="bg-gradient-to-r from-emerald-400/10 to-emerald-600/10 border border-emerald-400/20 rounded-2xl p-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to start monitoring your AI agents?
              </h2>
              <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
                Start building with the free VoltAgent framework, then add
                VoltOps monitoring when you're ready to scale in production.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="https://console.voltagent.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center bg-emerald-400 text-gray-900 font-semibold px-8 py-4 rounded-lg hover:bg-emerald-300 transition-colors no-underline"
                >
                  Start VoltOps Free
                </a>
                <a
                  href="https://forms.gle/BrnyFF4unP9pZxAh7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center bg-transparent text-emerald-400 font-semibold px-8 py-4 rounded-lg border border-emerald-400/30 hover:bg-emerald-400/10 transition-colors no-underline"
                >
                  Contact Sales
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
