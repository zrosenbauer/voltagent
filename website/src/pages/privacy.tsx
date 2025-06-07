import React from "react";
import Layout from "@theme/Layout";
import { PrivacyPolicy } from "../components/privacy-policy";

export default function PrivacyPolicyPage() {
  return (
    <Layout title="Privacy Policy" description="VoltAgent Privacy Policy">
      <main className="flex-1 mt-4">
        <PrivacyPolicy />
      </main>
    </Layout>
  );
}
