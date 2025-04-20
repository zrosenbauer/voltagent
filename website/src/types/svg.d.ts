declare module "*.svg" {
  import React from "react";
  const SVGComponent: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  export default SVGComponent;
}
