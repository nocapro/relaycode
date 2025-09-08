#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { watchCommand } from './commands/watch';
import { COMMAND_NAME } from './utils/constants';
import { revertCommand } from './commands/revert';
import { logCommand } from './commands/log';
import { applyCommand } from './commands/apply';
import { gitCommitCommand } from './commands/git-commit';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Default version in case we can't find the package.json
let version = '0.0.0';

try {
  const require = createRequire(import.meta.url);
  let pkg;
  try {
    // This works when installed as a package
    pkg = require('relaycode/package.json');
  } catch (e) {
    // Fallback for local development
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      pkg = require(join(__dirname, '..', 'package.json'));
    } catch (e2) {
      // ignore
    }
  }
  
  if (pkg && pkg.version) {
    version = pkg.version;
  }
} catch (error) {
  // Fallback to default version if we can't find the package.json
  console.error('Warning: Could not determine package version', error);
}

interface CommandInfo {
  name: string;
  alias: string;
  description: string;
  action: (...args: any[]) => void;
  args?: { syntax: string; description: string };
  options?: { flags: string; description: string }[];
}

const skipConfirmationOption = { flags: '-y, --yes', description: 'Skip confirmation prompts' };

const program = new Command();

program
  .name(COMMAND_NAME)
  .version(version, '-v, --version')
  .description('A developer assistant that automates applying code changes from LLMs.');

const mainCommands: CommandInfo[] = [
  { name: 'init', alias: 'i', description: 'Initializes relaycode in the current project.', action: () => initCommand(process.cwd()) },
  { name: 'watch', alias: 'w', description: 'Starts watching the clipboard for code changes to apply.',
    action: (options: { yes: boolean }) => { watchCommand(options, process.cwd()); },
    options: [skipConfirmationOption]
  },
  { name: 'apply', alias: 'a', description: 'Applies a patch from a specified file.',
    args: { syntax: '<filePath>', description: 'The path to the file containing the patch.' },
    action: (filePath: string, options: { yes: boolean }) => applyCommand(filePath, options, process.cwd()),
    options: [skipConfirmationOption]
  },
  { name: 'log', alias: 'l', description: 'Displays a log of all committed transactions.', action: () => logCommand(process.cwd()) },
  { name: 'revert', alias: 'u', description: 'Reverts a transaction. Defaults to the last one.',
    args: { syntax: '[uuid_or_index]', description: 'The UUID or index (e.g., 1, 2) of the transaction to revert.' },
    action: (identifier: string, options: { yes: boolean }) => revertCommand(identifier, options, process.cwd()),
    options: [skipConfirmationOption]
  },
];

const gitCommands: CommandInfo[] = [
  {
    name: 'commit',
    alias: 'c',
    description: 'Commits the last transaction using the message from the transaction log.',
    action: (options: { yes: boolean }) => gitCommitCommand(options, process.cwd()),
    options: [skipConfirmationOption]
  },
];

const setupCommands = (parent: Command, commandList: CommandInfo[]) => {
  commandList.forEach(cmdInfo => {
    const command = parent
      .command(cmdInfo.name)
      .alias(cmdInfo.alias)
      .description(cmdInfo.description);
  
    if (cmdInfo.args) {
      command.argument(cmdInfo.args.syntax, cmdInfo.args.description);
    }
  
    if (cmdInfo.options) {
      cmdInfo.options.forEach(opt => {
        command.option(opt.flags, opt.description);
      });
    }
  
    command.action(cmdInfo.action);
  });
};

setupCommands(program, mainCommands);

// Git command group
const git = program.command('git').description('Git related commands');
setupCommands(git, gitCommands);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}