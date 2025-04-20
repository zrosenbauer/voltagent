export type ProjectOptions = {
  projectName: string;
  typescript: boolean;
  packageManager: "npm" | "yarn" | "pnpm";
  features: Feature[];
};

export type Feature = "voice" | "chat" | "ui" | "vision";

export type TemplateFile = {
  sourcePath: string;
  targetPath: string;
  transform?: (content: string, options: ProjectOptions) => string;
};
