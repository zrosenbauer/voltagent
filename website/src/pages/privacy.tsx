import React from "react";
import Layout from "@theme/Layout";
import { PrivacyPolicy } from "../components/privacy-policy";
import { Footer } from "../components/footer";

export default function PrivacyPolicyPage() {
  return (
    <Layout title="Privacy Policy" description="VoltAgent Privacy Policy">
      <main className="flex-1 mt-4">
        <PrivacyPolicy />
        <Footer />
      </main>
    </Layout>
  );
}
