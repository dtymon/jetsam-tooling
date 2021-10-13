#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import yargs, { Arguments, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { isExistingFile } from './SubCommandHelpers';
import { SubCommand } from './SubCommand';

/**
 * `jetsam` is a command-utility that can be used to perform a number of useful
 * operations via a series of sub-commands.
 *
 * The available sub-commands can be extended by installing modules into the
 * same directory as `jetsam` that implement the required interface and whose
 * name starts with the prefix `jetsam-subcmd-`.
 */

// This is the regex that all sub-command filenames need to conform to
const SUBCMD_FILENAME_REGEX = /^jetsam-subcmd-[^.]*\.js$/;

/**
 * The main() for `jetsam`
 *
 * @returns exits the process with the appropriate exit status and as such does
 * not return
 */
async function main(): Promise<void> {
  // Start setting up yargs
  // prettier-ignore
  let argv: Argv = yargs(hideBin(process.argv))
    .showHelpOnFail(true)
    .demandCommand()
    .recommendCommands();

  // Identify the sub-command files and import them
  const subCmds: SubCommand[] = [];
  const subCmdFiles = await findSubCommandFiles();
  for (const subCmdFile of subCmdFiles) {
    await importSubCommand(subCmdFile, subCmds);
  }

  // As we add the sub-commands to yargs we will also build a map from the
  // sub-commands name to its execute() method.
  type Executor = (args: Arguments) => Promise<number>;
  const nameToExecutor: Map<string, Executor> = new Map();

  // Register each sub-command with yargs and build a map from the sub-command's
  // name to the function to invoke when that sub-command is requested.
  for (const subCmd of subCmds) {
    nameToExecutor.set(subCmd.name(), (args: Arguments) => subCmd.execute(args));
    argv = argv.command(subCmd.name(), subCmd.description(), subCmd.configure());
  }

  // yargs is setup so we should be able to workout what operation the user has
  // requested.
  try {
    // Determine what sub-command has been requested
    const args = await argv.argv;
    const subCmd = args._.shift() as string;

    // Find the executor for it
    const executor = nameToExecutor.get(subCmd);
    if (executor === undefined) {
      console.error(`Error: ${subCmd}: Unknown sub-command requested`);
      process.exit(1);
    }

    // The sub-command is valid so attempt to execute it
    else {
      const code = await executor(args);
      process.exit(code);
    }
  } catch (err) {
    console.error(`Error: Failed to execute jetsam command: ${err}`);
    process.exit(1);
  }
}

/**
 * Attempt to import a given sub-command source file
 *
 * @param subCmdFile - the file containing the sub-command source
 * @param subCmds - add the sub-command(s) imported to this list
 * @returns a promise resolved when complete
 */
async function importSubCommand(subCmdFile: string, subCmds: SubCommand[]): Promise<void> {
  try {
    // Assume we will import the filename that was passed
    let fileToImport = subCmdFile;

    // In Windows, executable wrappers have a '.js' extension but they aren't
    // actually JavaScript files. As such, attempting to import them will fail.
    // We can detect tese situations by looking for a `.js.cmd` file and
    // changing our behaviour accordingly.
    const cmdWrapper = `${subCmdFile}.js.cmd`;
    if (await isExistingFile(cmdWrapper)) {
      // Read the wrapper's contents to be able to workout the location of the
      // JavaScript source,
      const wrapperContents = await readFile(cmdWrapper, 'utf8');

      // The wrapper will contain a line that looks like this
      //
      //   @"%~dp0\..\<path-to-module>\<javascript-src-file>.js"   %*
      //
      // where <path-to-module> is relative to the node_modules directory.
      // Attempt to find this line to be able to get the path to the source.
      const match = /\.\.\\(.*)\.js/g.exec(wrapperContents);
      if (match) {
        // This is the file we need to import
        fileToImport = path.join(process.cwd(), 'node_modules', match[1]);
      } else {
        console.error(`Error: Failed to import ${subCmdFile} on Windows`);
        process.exit(1);
      }
    }

    // At this point, we have identified the file containing the JavaScript to
    // import.
    try {
      // Import the source. It needs to have a default export that contains the
      // sub-command or a list of sub-commands to add to `jetsam`.
      const importedModule: any = await import(fileToImport);
      const importedSubCmds: any = importedModule.default;

      // Now add the sub-commands to the supported list
      if (importedSubCmds !== undefined) {
        // Can be a list of sub-commands
        if (Array.isArray(importedSubCmds)) {
          subCmds.push(...importedSubCmds.filter((subCmd) => subCmd instanceof SubCommand));
        }

        // Or just a single sub-command
        else if (importedSubCmds instanceof SubCommand) {
          subCmds.push(importedSubCmds);
        }
      }
    } catch (err) {
      console.error(`Error: Failed to import ${fileToImport} : ${err}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: Failed to import sub-command ${subCmdFile}: ${err}`);
    process.exit(1);
  }
}

/**
 * Called to identify the sub-command files that need to be imported
 *
 * @returns the list of sub-command files
 */
async function findSubCommandFiles(): Promise<string[]> {
  // Determine the directory that contains the `jetsam` command as this is where
  // we will search for the supported sub-command files. This needs to be able
  // to handle the `.cmd` wrappers used on Windows in addition to the symlinks
  // used on other systems.
  const binDir = await getExecutableDir();

  // Find all sub-command files in the same bin directory as `jetsam`. These are
  // the files that conform to the required regex. When found, we turn them into
  // absolute paths without their '.js' extension which is in the form required
  // to import them.
  let subCmdFilesToImport: string[] = [];
  try {
    subCmdFilesToImport = (await readdir(binDir))
      .filter((filename) => SUBCMD_FILENAME_REGEX.test(filename))
      .map((filename) => path.join(binDir, filename.replace(/\.js$/, '')));
  } catch (err) {
    // Abort if there's any issue getting the sub-commands
    console.error(`Error: Failed to identify the jetsam sub-commands: ${err}`);
    process.exit(1);
  }

  return subCmdFilesToImport;
}

/**
 * Called to determine the directory that contains the `jetsam` executable. This
 * is done in way that will work on systems that install Node executables using
 * symlinks (eg: Mac, Linux) and Windows that uses a `.cmd` wrapper for the
 * executable.
 *
 * @returns the directory containing the `jetsam` command
 */
async function getExecutableDir(): Promise<string> {
  // The name of the script being run by Node
  const scriptBeingRun = process.argv[1];
  const scriptName = path.basename(scriptBeingRun);

  // See if `jetsam` is in a `node_modules/.bin` directory relative to the
  // current working directory. We need to check for a wrapper with a `.cmd`
  // extension too for Windows.
  const nodeBinDir = path.join(process.cwd(), 'node_modules', '.bin');
  const cliCmd = path.join(nodeBinDir, scriptName);
  if ((await isExistingFile(cliCmd)) || (await isExistingFile(`${cliCmd}.cmd`))) {
    // This is the directory that contains the script
    return nodeBinDir;
  }

  // Assume there's no symlink or wrapper in play here and that the executable
  // directory is just the directory containing the script running
  return path.dirname(scriptBeingRun);
}

main();
