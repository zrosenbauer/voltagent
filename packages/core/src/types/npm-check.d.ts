declare module "npm-check" {
  export interface NpmCheckOptions {
    cwd?: string;
    skipUnused?: boolean;
    ignoreDev?: boolean;
    ignoreUnknown?: boolean;
  }

  export interface NpmCheckPackage {
    moduleName: string;
    homepage: string;
    regError?: string;
    pkgError?: string;
    latest: string;
    installed: string;
    isInstalled: boolean;
    notInstalled: boolean;
    packageWanted: string;
    packageJson: string;
    devDependency: boolean;
    usedInScripts?: string[];
    mismatch: boolean;
    semverValid: string;
    easyUpgrade: boolean;
    bump: "major" | "minor" | "patch";
    unused: boolean;
  }

  export interface NpmCheckState {
    get(key: string): NpmCheckPackage[];
  }

  export default function npmCheck(options?: NpmCheckOptions): Promise<NpmCheckState>;
}
