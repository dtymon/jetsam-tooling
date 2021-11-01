import { copy } from 'fs-extra';
import klaw from 'klaw';
import mkdirp from 'mkdirp';
import path from 'path';
import { Argv, Arguments } from 'yargs';

import { isExistingDir, isExistingPath, filterFile, findFiles } from './SubCommandHelpers';
import { SubCommand } from './SubCommand';

// A standard set of files to always copy to the distribution if they exist
const STANDARD_FILES = ['CHANGELOG.md', 'LICENSE', 'README.md', '.npmignore'];

/**
 * A `jetsam` sub-command that is used to copy auxiliary files into the
 * distribution of the package that is being built.
 */
class BuildDistribution extends SubCommand {
  /**
   * Get the name of the sub-command to be passed to `jetsam`
   *
   * @returns the name of the sub-command
   */
  public name(): string {
    return 'build-dist';
  }

  /**
   * Provides a description of the sub-command that will appear in the help
   *
   * @returns a description of what the sub-command does
   */
  public description(): string {
    return 'Copy auxiliary files into the build area';
  }

  /**
   * Called to get a function that will be invoked to add the required
   * configuration to `yargs`. The function will be passed a `yargs` argv
   * instance that it can use to configure the command-line it supports.
   *
   * @returns the function to call to configure the sub-command
   */
  public configure(): (yargs: Argv) => Argv {
    return (yargs: Argv) =>
      yargs
        .option('out', {
          alias: 'o',
          description: 'The output directory to copy files to',
          default: 'dist',
        })
        .option('files', {
          alias: 'f',
          description: 'Files to copy in addition to the standard files',
          type: 'array',
        })
        .option('src', {
          alias: 's',
          description: 'Directory containing the source files',
          default: 'src',
        });
  }

  /**
   * Called to execute the sub-command given the command-line arguments passed
   * to `jetsam`.
   *
   * @param args - the command-line arguments
   * @returns the exit status to use for `jetsam`
   */
  public async execute(args: Arguments): Promise<number> {
    // Ensure the output directory exists
    const srcDir = args.src as string;
    const outDir = args.out as string;
    await mkdirp(outDir);

    await this.copyPackageManifest(outDir);
    await this.copyAuxiliaryFiles((args.files as string[]) ?? [], outDir);
    await this.copyConfigFiles(srcDir, outDir);
    await this.copyScripts(srcDir, outDir);

    return 0;
  }

  /**
   * Called `package.json` into the distribution area after passing it through a
   * filter.
   *
   * @param dstoot - the directory where files are to be copied to
   * @returns a promise resolved when complete
   */
  private async copyPackageManifest(dstRoot: string): Promise<void> {
    const file = 'package.json';
    const dst = path.join(dstRoot, file);

    // Remove all /dist references in the file
    await filterFile(file, dst, (c: string): string => c.replace(/dist\//gm, ''));
  }

  /**
   * Called to auxiliary files to the distribution area
   *
   * @param files - the additional files to copy
   * @param dstoot - the directory where files are to be copied to
   * @returns a promise resolved when complete
   */
  private async copyAuxiliaryFiles(files: string[], dstRoot: string): Promise<void> {
    // Include the standard auxiliary files to
    const allFiles: string[] = [...files, ...STANDARD_FILES];
    for (const file of allFiles) {
      if (await isExistingPath(file)) {
        const dst = path.normalize(path.join(dstRoot, path.basename(file)));
        await copy(file, dst, { overwrite: true, preserveTimestamps: true });
      }
    }
  }

  /**
   * Called to copy the configuration source
   *
   * @param srcRoot - the directory containing the source files
   * @param dstoot - the directory where files are to be copied to
   * @returns a promise resolved when complete
   */
  private async copyConfigFiles(srcRoot: string, dstRoot: string): Promise<void> {
    const srcDir = path.resolve(path.join(srcRoot, 'config'));
    const dstDir = path.join(dstRoot, 'config');
    if (!(await isExistingDir(srcDir))) {
      // No configuration to copy
      return;
    }

    // Copy each file found in the config source tree to the destination
    for await (const entry of klaw(srcDir)) {
      // Only interested in files
      if (entry.stats.isFile()) {
        const fileOffset = entry.path.replace(srcDir, '');
        const dst = path.join(dstDir, fileOffset);
        await copy(entry.path, dst, { overwrite: true, preserveTimestamps: true });
      }
    }
  }

  /**
   * Called to copy the scripts into the distribution area
   *
   * @param srcRoot - the directory containing the source files
   * @param dstoot - the directory where files are to be copied to
   * @returns a promise resolved when complete
   */
  private async copyScripts(srcRoot: string, dstRoot: string): Promise<void> {
    const srcDir = path.resolve(path.join(srcRoot, 'bin'));
    const dstDir = path.join(dstRoot, 'bin');
    if (!(await isExistingDir(srcDir))) {
      // No configuration to copy
      return;
    }

    // Find any shell scripts under the given source root
    const scripts: string[] = await findFiles(srcDir, (entry) => {
      return entry.stats.isFile() && /\.sh$/.test(entry.path);
    });
    if (scripts.length < 1) {
      return;
    }

    // And copy each file into the distribution
    await mkdirp(dstDir);
    for (const file of scripts) {
      const dstFile = path.join(dstDir, path.basename(file).replace(/\.sh$/, ''));
      await copy(file, dstFile, { overwrite: true, preserveTimestamps: true });
    }
  }
}

export default new BuildDistribution();
