import React from "react";
import Layout from "@theme-original/Layout";
import { useLocation } from "@docusaurus/router";
import DynamicAnnouncement from "../../components/DynamicAnnouncement";

export default function LayoutWrapper(props) {
  return (
    <>
      <DynamicAnnouncement />
      <Layout {...props} />
    </>
  );
}
