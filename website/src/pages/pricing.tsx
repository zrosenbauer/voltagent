import React from "react";
import Layout from "@theme/Layout";
import { motion } from "framer-motion";
import PricingSection from "../components/console/PricingSection";
import { DotPattern } from "../components/ui/dot-pattern";

export default function Pricing(): JSX.Element {
  return (
    <Layout
      title="VoltOps LLM Observability Pricing"
      description="Simple, transparent pricing for VoltOps LLM Observability platform. VoltAgent Core Framework is free and open source. Monitor and scale your AI applications with confidence."
    >
      <DotPattern dotColor="#94a3b8" dotSize={1.2} spacing={20} />
      <main className="min-h-screen">
        {/* Hero Section */}
        <section className="relative py-20 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6">
                <span className="text-white">Choose Your</span>{" "}
                <span className="text-orange-400">Observability Plan</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-4xl mx-auto leading-relaxed">
                Monitor your AI agents with{" "}
                <span className="text-orange-400 font-medium">
                  VoltOps LLM Observability
                </span>{" "}
                Platform.
              </p>

              {/* Open Source Notice */}
              <div className="max-w-5xl mx-auto mb-8">
                <div className="bg-gradient-to-r from-blue-500/10 to-emerald-500/10 border border-blue-500/20 rounded-2xl p-6">
                  <p className="text-gray-300 text-base leading-relaxed mb-4">
                    The{" "}
                    <span className="text-emerald-400 font-medium">
                      VoltAgent Core Framework
                    </span>{" "}
                    is{" "}
                    <span className="text-emerald-400 font-medium">
                      open source and free
                    </span>
                    . Build AI agents without any cost.
                  </p>
                  <p className="text-gray-300 text-base leading-relaxed">
                    The pricing is for{" "}
                    <span className="text-orange-400 font-medium">
                      VoltOps LLM Observability
                    </span>
                    , a monitoring and analytics platform that helps you track,
                    debug, test, and optimize your AI app and agent performance
                    whether you're building with VoltAgent or not, in both local
                    development and production.
                  </p>
                  <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
                    <a
                      href="https://github.com/voltagent/voltagent"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center bg-blue-500/20 text-blue-400 font-medium px-4 py-2 rounded-lg border border-blue-500/30 hover:bg-blue-500/30 transition-colors no-underline text-sm"
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <title>GitHub</title>
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                      VoltAgent on GitHub
                    </a>
                    <a
                      href="/docs/"
                      className="inline-flex items-center justify-center bg-emerald-500/20 text-emerald-400 font-medium px-4 py-2 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors no-underline text-sm"
                    >
                      Framework Documentation
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
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-gray-400 text-lg">
                Everything you need to know about VoltOps LLM Observability
                pricing
              </p>
            </motion.div>

            <div className="space-y-8">
              {[
                {
                  question: "Is VoltAgent Core Framework really free?",
                  answer:
                    "Yes! VoltAgent Core Framework is completely free and open source under the MIT license. You can build, deploy, and use AI agents without any cost. The pricing on this page is only for VoltOps LLM Observability, our optional monitoring platform.",
                },
                {
                  question: "What counts as a trace in VoltOps?",
                  answer:
                    "A trace represents a single execution flow through your AI agent or application. This includes LLM calls, tool usage, and any nested operations that occur during a single request or conversation turn.",
                },
                {
                  question: "How does the overage pricing work?",
                  answer:
                    "If you exceed your plan's included traces, you'll be charged $10 for every additional 5,000 traces. Use our pricing calculator to estimate your monthly costs based on your expected usage.",
                },
                {
                  question: "Can I use VoltAgent without VoltOps monitoring?",
                  answer:
                    "Absolutely! VoltAgent Core Framework works independently. VoltOps LLM Observability is an optional service that provides advanced monitoring, analytics, and debugging capabilities for production AI applications.",
                },
                {
                  question: "Can I change plans anytime?",
                  answer:
                    "Yes! You can upgrade or downgrade your VoltOps plan at any time. Changes take effect immediately, and you'll be charged or credited on a pro-rated basis.",
                },
                {
                  question: "Do you offer annual discounts?",
                  answer:
                    "Yes, we offer significant discounts for annual VoltOps subscriptions. Contact our sales team for enterprise pricing and custom arrangements.",
                },
                {
                  question: "What happens if I exceed my limits?",
                  answer:
                    "Your VoltOps service won't be interrupted. You'll automatically be charged for overage usage at the rates specified in your plan. You can set up billing alerts to monitor your usage.",
                },
                {
                  question: "Is there a free trial for paid plans?",
                  answer:
                    "Our VoltOps Free plan gives you a comprehensive look at all core monitoring features. For Enterprise features, we offer a 14-day trial period to evaluate the platform with your specific requirements.",
                },
              ].map((faq, index) => (
                <motion.div
                  key={faq.question}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                  className="bg-[#191c24] border border-gray-700/50 rounded-lg p-6 hover:border-emerald-400/30 transition-colors"
                >
                  <h3 className="text-xl font-semibold text-white mb-3">
                    {faq.question}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">{faq.answer}</p>
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
