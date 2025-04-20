# VoltAgent CLI

CLI tool for VoltAgent applications. This tool is used to view update notifications and announcements during project development.

## Features

- 📢 **Announcements**: Displays important announcements about VoltAgent
- 🔄 **Update Checks**: Checks for updates to VoltAgent versions
- 🚀 **Easy Integration**: Integrates with existing projects with a single command
- ⚙️ **Configurable**: Can be customized according to needs

## Installation

```bash
npm install @voltagent/cli --save-dev
# or
pnpm add @voltagent/cli -D
# or
yarn add @voltagent/cli --dev
```

## Usage

### Integrating with Your Project

To integrate the CLI tool into your project:

```bash
npx voltagent init
# or
pnpm voltagent init
# or
yarn voltagent init
```

This command automatically detects your package manager and adds CLI pre-checks to the commands you select (e.g., `npm run dev` or `npm run build`).

> **Note**: Different package managers use different naming conventions for pre-hooks:
>
> - **npm/yarn**: Uses `pre<script>` format (e.g., `predev`)
> - **pnpm**: Uses `<script>:pre` format (e.g., `dev:pre`)
>
> The `init` command will handle this automatically.

### Viewing Announcements

To see the latest announcements:

```bash
npx voltagent news
# or
pnpm voltagent news
# or
yarn voltagent news
```

### Available Commands

- `voltagent news`: Shows announcements
- `voltagent check`: Checks for updates and announcements (usually runs automatically)
- `voltagent init`: Integrates the CLI tool into your project

## How Features Work

### How Announcements Work

The CLI tool checks for the latest announcements each time it runs during a project development session and displays unread important announcements. Announcements can be marked as read.

### Configuration

You can use local configuration to change the behavior of the CLI tool:

```bash
# Disable announcements
npx voltagent config set showAnnouncements false

# Change update check frequency
npx voltagent config set checkFrequency weekly
```

## License

MIT
