import React from "react";
import Layout from "@theme-original/Layout";
import { useLocation } from "@docusaurus/router";
import { Footer as CustomFooter } from "../../components/footer";

export default function LayoutWrapper(props) {
  return (
    <>
      <Layout {...props} />
      <CustomFooter />
    </>
  );
}
