import React from "react";
import Layout from "@theme/Layout";
import { TermsAndConditions } from "../components/terms";
import { Footer } from "../components/footer";

export default function TermsPage() {
  return (
    <Layout
      title="Terms And Conditions"
      description="VoltAgent Terms And Conditions"
    >
      <main className="flex-1 mt-4">
        <TermsAndConditions />
        <Footer />
      </main>
    </Layout>
  );
}
