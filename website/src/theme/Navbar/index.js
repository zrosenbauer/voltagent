import React from "react";
import CustomNavbar from "@site/src/components/navbar";
import DocNavbar from "@site/src/components/doc-navbar";
import { useLocation } from "@docusaurus/router";

export default function Navbar() {
  const location = useLocation();
  const isDocsPage = location.pathname.includes("/docs");

  if (isDocsPage) {
    return <DocNavbar />;
  }

  return <CustomNavbar />;
}
