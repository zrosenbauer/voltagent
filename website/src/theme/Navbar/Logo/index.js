import Logo from "@theme/Logo";
import React from "react";

export default function NavbarLogo() {
  return (
    <div>
      <Logo
        className="navbar__brand"
        imageClassName="navbar__logo"
        titleClassName="navbar__title text--truncate"
      />
    </div>
  );
}
