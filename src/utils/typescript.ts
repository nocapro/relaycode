import ts from 'typescript';
import path from 'path';
import { logger } from './logger';

const countErrors = (diagnostics: readonly ts.Diagnostic[]): number => {
  return diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length;
};

const parseTscCommand = (command: string) => {
  const projectFlagRegex = /(?:--project|-p)\s+([^\s]+)/;
  const buildFlagRegex = /(?:--build|-b)/;

  let projectPath: string | undefined;
  const projectMatch = command.match(projectFlagRegex);
  if (projectMatch) {
    projectPath = projectMatch[1];
  }

  let buildPath: string | undefined;
  const buildMatch = command.match(/(?:--build|-b)\s+([^\s]+)/);
  if (buildMatch) {
    buildPath = buildMatch[1];
  }

  return {
    project: projectPath,
    build: buildFlagRegex.test(command),
    buildPath: buildPath
  };
};

const getTsConfigPath = (command: string, cwd: string): string | undefined => {
  const options = parseTscCommand(command);
  let tsconfigPath: string | undefined;

  if (options.buildPath) {
    tsconfigPath = path.resolve(cwd, options.buildPath);
  } else if (options.project) {
    tsconfigPath = path.resolve(cwd, options.project);
  }

  if (tsconfigPath && ts.sys.directoryExists(tsconfigPath)) {
    tsconfigPath = path.join(tsconfigPath, 'tsconfig.json');
  }

  if (!tsconfigPath) {
    tsconfigPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
  }

  if (!tsconfigPath || !ts.sys.fileExists(tsconfigPath)) {
    logger.debug(`Could not find tsconfig.json to use with TypeScript API.`);
    return undefined;
  }

  logger.debug(`Using tsconfig for API-based linting: ${tsconfigPath}`);
  return tsconfigPath;
};


export const getTypeScriptErrorCount = (linterCommand: string, cwd: string): number => {
  const commandOptions = parseTscCommand(linterCommand);
  const tsconfigPath = getTsConfigPath(linterCommand, cwd);

  if (!tsconfigPath) {
    return -1; // Sentinel value to indicate fallback
  }

  const diagnostics: ts.Diagnostic[] = [];
  const reportDiagnostic = (d: ts.Diagnostic) => diagnostics.push(d);

  try {
    if (commandOptions.build) {
      const host = ts.createSolutionBuilderHost(ts.sys, undefined, reportDiagnostic, reportDiagnostic);

      // To prevent emitting files if --noEmit is not in tsconfig, we can't easily override compilerOptions
      // for each project in the solution build. Instead, we can just intercept writeFile.
      host.writeFile = (path) => {
        logger.debug(`Intercepted write for ${path} during API-based linting.`);
      };

      const builder = ts.createSolutionBuilder(host, [tsconfigPath], { force: true, verbose: false });
      builder.build();

      return countErrors(diagnostics);
    } else {
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      if (configFile.error) {
        diagnostics.push(configFile.error);
        return countErrors(diagnostics);
      }

      const parsedCommandLine = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
      );

      if (parsedCommandLine.errors.length > 0) {
        diagnostics.push(...parsedCommandLine.errors);
      }

      const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options);
      diagnostics.push(...ts.getPreEmitDiagnostics(program));

      return countErrors(diagnostics);
    }
  } catch (e) {
    logger.debug(`Error during TypeScript API-based linting: ${e instanceof Error ? e.message : String(e)}`);
    return -1; // Fallback on any error
  }
};
