import { readFile } from 'fs/promises';
import { Arguments, Argv } from 'yargs';

import { confirm, getInput, executeCmd, executeCmdSilently, getOutputFromCmd } from './SubCommandHelpers';
import { SubCommand } from './SubCommand';

/**
 * A `jetsam` sub-command that is used to release a package.
 */
class PerformRelease extends SubCommand {
  /**
   * Get the name of the sub-command to be passed to `jetsam`
   *
   * @returns the name of the sub-command
   */
  public name(): string {
    return 'release';
  }

  /**
   * Provides a description of the sub-command that will appear in the help
   *
   * @returns a description of what the sub-command does
   */
  public description(): string {
    return 'Creates a release for the package';
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
        .option('dry-run', {
          alias: 'd',
          description: 'Perform a dry-run of the release',
          type: 'boolean',
        })
        .option('ignore-changelog', {
          description: 'Do not enforce an entry for the version in the CHANGELOG',
          type: 'boolean',
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
    const dryRun = args.dryRun === true;
    const ignoreChangelog = args.ignoreChangelog === true;

    // Get the current branch name and make sure it is a release branch
    const branch = await getOutputFromCmd('git', 'branch', '--show-current');
    if (branch === undefined) {
      console.error('Error: Failed to get the git branch name');
      return 1;
    }

    // Make sure it conforms to the required format
    const match = /^release\/v(\d+\.\d+\.\d+)$/.exec(branch);
    if (match === null) {
      console.error(`Error: Branch "${branch}" does not conform to the naming convention "release/vX.Y.Z"`);
      return 1;
    }

    // Make sure this version tag does not already exist. This command will
    // succeed if the tag exists and fail if it does not.
    const versionNum = match[1];
    const version = `v${versionNum}`;
    let exitStatus = await executeCmdSilently('git', 'rev-parse', '--verify', '--quiet', version);
    if (exitStatus === 0) {
      console.error(`Error: The release tag "${version}" already exists`);
      return 1;
    }

    // Make sure the checkout is clean, that is, no versioned controlled files
    // are currently modified.
    const modifiedFiles = await getOutputFromCmd(
      'git',
      'diff-index',
      '--name-only',
      '--ignore-submodules',
      'HEAD',
      '--'
    );
    if (modifiedFiles === undefined) {
      console.error('Error: Failed to determine if the checkout is clean');
      return 1;
    }

    if (modifiedFiles !== '') {
      const fileList = modifiedFiles.replace(/^/gm, '  - ');
      console.error(`Error: The checkout is not clean with at least one modified file:\n${fileList}\n`);
      return 1;
    }

    // Make sure that the local branch is not ahead of the origin
    const numCommitsAhead = await getOutputFromCmd(
      'git',
      'rev-list',
      `HEAD...origin/${branch}`,
      '--ignore-submodules',
      '--count'
    );
    if (numCommitsAhead === undefined) {
      console.error('Error: Failed to determine if the local checkout is ahead of the origin');
      return 1;
    }

    // It must be zero commits ahead. Note that it will be string '0'.
    if (numCommitsAhead !== '0') {
      console.error(`Error: The local branch is ${numCommitsAhead} commits ahead of the origin`);
      return 1;
    }

    // Confirm that this is the version they wish to release
    if (!(await confirm(`Do you wish to release version "${version}"`))) {
      // eslint-disable-next-line no-console
      console.log('Aborting release procedure');
      return 1;
    }

    // Make sure the local branch is up-to-date with the origin
    if (!dryRun) {
      this.banner(`Updating local branch ${branch} from origin`);
      exitStatus = await executeCmd('git', 'pull', '--rebase');
      if (exitStatus !== 0) {
        console.error(`Error: Failed to update the local branch from the origin`);
        return exitStatus ?? 1;
      }
    }

    // Read in the contens of package.json
    let manifest: Record<string, any>;
    try {
      manifest = JSON.parse(await readFile('package.json', 'utf8'));
    } catch (err) {
      console.error(`Error: Failed to read package.json: ${err}`);
      return 1;
    }

    // Make sure the version in package.json matches the version being released
    if (manifest.version !== versionNum) {
      console.error(
        `Error: Version in package.json does not match that being released: ${manifest.version} != ${versionNum}`
      );
      return 1;
    }

    // Make sure the CHANGELOG contains an entry for this version
    if (!ignoreChangelog) {
      try {
        const changelog = await readFile('CHANGELOG.md', 'utf8');
        const regex = new RegExp(`^#+ +${versionNum}$`, 'gm');
        if (!regex.test(changelog)) {
          console.error(`Error: CHANGELOG does not contain an entry for version $versionNum`);
          return 1;
        }
      } catch (err) {
        console.error(`Error: Failed to read CHANGELOG: ${err}`);
        return 1;
      }
    }

    // Make sure the pre-commit checks pass before continuing
    this.banner(`Checking version ${version} passes pre-commit checks`);
    exitStatus = await executeCmd('yarn', 'pre-commit');
    if (exitStatus !== 0) {
      console.error(`Error: Pre-commit checks failed on ${branch}`);
      return exitStatus ?? 1;
    }

    if (!dryRun) {
      // Switch to master and pull the latest from the origin
      this.banner(`Ensuring master is up to date`);
      exitStatus = await executeCmd('git', 'checkout', 'master');
      if (exitStatus !== 0) {
        console.error(`Error: Failed to change branch to master`);
        return exitStatus ?? 1;
      }

      exitStatus = await executeCmd('git', 'pull', '--rebase');
      if (exitStatus !== 0) {
        console.error(`Error: Failed to pull latest changes to master from origin`);
        return exitStatus ?? 1;
      }

      // Perform the merge into master ensuring that a merge arrow is created
      this.banner(`Merging ${branch} into master`);
      exitStatus = await executeCmd('git', 'merge', '--no-ff', '--no-edit', branch);
      if (exitStatus !== 0) {
        console.error(`Error: Failed to merge ${branch} into master`);
        return exitStatus ?? 1;
      }

      // Make sure the pre-commit checks pass after the merge
      this.banner(`Checking master passes pre-commit checks after merge`);
      exitStatus = await executeCmd('yarn', 'pre-commit');
      if (exitStatus !== 0) {
        console.error(`Error: Pre-commit checks failed on master after merge`);
        console.error(`Error: Issue "git reset --hard origin/master" to undo merge`);
        return exitStatus ?? 1;
      }

      // Everything looks good so confirm with the user before pushing the merge
      // to the origin.
      if (!(await confirm(`Pushing release "${version}" to origin ... continue`))) {
        // eslint-disable-next-line no-console
        console.log('Aborting release procedure');
        return 1;
      }

      // Push the merge result to origin
      this.banner(`Pushing result of merging ${version} to the origin`);
      exitStatus = await executeCmd('git', 'push');
      if (exitStatus !== 0) {
        console.error(`Error: Pre-commit checks failed on master after merge`);
        console.error(`Error: Issue "git reset --hard origin/master" to undo merge`);
        return exitStatus ?? 1;
      }

      // Confirm whether we can tag the release
      if (!(await confirm(`Tagging release "${version}" ... continue`))) {
        // eslint-disable-next-line no-console
        console.log('Aborting release procedure');
        return 1;
      }

      // Create the version tag and push to the origin
      this.banner(`Tagging release ${version}`);
      exitStatus = await executeCmd('git', 'tag', version);
      if (exitStatus !== 0) {
        console.error(`Error: Failed to create local tag "${version}"`);
        return exitStatus ?? 1;
      }
      exitStatus = await executeCmd('git', 'push', 'origin', version);
      if (exitStatus !== 0) {
        console.error(`Error: Failed to push local tag "${version}" to origin`);
        return exitStatus ?? 1;
      }
    }

    // Potentially setup the next release branch
    this.banner(`Creating branch for next release`);
    const choices = ['major', 'minor', 'patch', 'none'];
    const nextReleaseType = await getInput('What is the expected type of the next release', choices, 'minor');

    // We are done if there is no next branch to create
    if (nextReleaseType === 'none') {
      // eslint-disable-next-line no-console
      console.log(`Successfully created release ${version}`);
      return 0;
    }

    // Use semver to get the next version number based on this input
    const nextVersionNum = await getOutputFromCmd('semver', '-i', nextReleaseType, versionNum);
    if (nextVersionNum === undefined) {
      console.error('Error: Failed to calculate the next releases number');
      return 1;
    }
    const nextVersion = `v${nextVersionNum}`;

    // Make sure the new branch does not exist locally
    const newBranch = `release/${nextVersion}`;
    exitStatus = await executeCmdSilently('git', 'show-branch', newBranch);
    if (exitStatus === 0) {
      console.error(`Error: A branch for release "${nextVersion}" already exists locally`);
      return 1;
    }

    // Make sure the new branch does not exist on the origin
    exitStatus = await executeCmdSilently('git', 'show-branch', `remotes/origin/${newBranch}`);
    if (exitStatus === 0) {
      console.error(`Error: A branch for release "${nextVersion}" already exists on the origin`);
      return 1;
    }

    if (!dryRun) {
      // Create the next release branch
      this.banner(`Creating release branch for ${nextVersion}`);
      exitStatus = await executeCmd('git', 'checkout', '-b', newBranch);
      if (exitStatus !== 0) {
        console.error(`Error: Failed to create release branch ${newBranch}`);
        return exitStatus ?? 1;
      }

      // Bump the version number for the release branch
      exitStatus = await executeCmd(
        'yarn',
        'version',
        '--no-git-tag-version',
        '--no-commit-hooks',
        '--new-version',
        nextVersionNum
      );
      if (exitStatus !== 0) {
        console.error(`Error: Failed to update package version to ${nextVersionNum}`);
        return exitStatus ?? 1;
      }

      // Commit the change to package.json
      exitStatus = await executeCmd('git', 'commit', 'package.json', '-m', `Bump version to ${nextVersionNum}`);
      if (exitStatus !== 0) {
        console.error(`Error: Failed to commit version bump to package.json`);
        return exitStatus ?? 1;
      }

      // And get confirmation before pushing the new branch
      if (!(await confirm(`Pushing new branch "${newBranch}" to origin ... continue`))) {
        // eslint-disable-next-line no-console
        console.log('Aborting release procedure');
        return 1;
      }

      // Push the branch to the origin
      exitStatus = await executeCmd('git', 'push', '--set-upstream', 'origin', newBranch);
      if (exitStatus !== 0) {
        console.error(`Error: Failed to push branch ${newBranch} to origin`);
        return exitStatus ?? 1;
      }
    }

    // eslint-disable-next-line no-console
    console.log(`Successfully created release ${version}`);
    return 0;
  }

  /**
   * Displays a banner to the console
   *
   * @param text - the text to display in the banner
   */
  private banner(text: string) {
    // eslint-disable-next-line no-console
    console.log(`\n${'#'.repeat(78)}\n# ${text}\n#\n`);
  }
}

export default new PerformRelease();
