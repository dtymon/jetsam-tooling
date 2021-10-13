import { Arguments, Argv } from 'yargs';
import chalk from 'chalk';

import { executeCmd } from './SubCommandHelpers';
import { SubCommand } from './SubCommand';

// These are the severities that `yarn audit` can return
type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

// `yarn audit` uses an exit status that is a bit-mask where a bit is set if an
// issue with a given serverity is found. These are the bits that are used to
// indicate each severity.
// prettier-ignore
const YarnAuditSeverityBits: { [severity in Severity]: number } = {
  info:     0x01,
  low:      0x02,
  moderate: 0x04,
  high:     0x08,
  critical: 0x0f
};

/**
 * Essentially a wrapper around `yarn audit` to show all audit issues but only
 * exit with a non-zero exit status for issues at or above a given severity.
 */
class AuditDependencies extends SubCommand {
  /**
   * Get the name of the sub-command to be passed to `jetsam`
   *
   * @returns the name of the sub-command
   */
  public name(): string {
    return 'audit';
  }

  /**
   * Provides a description of the sub-command that will appear in the help
   *
   * @returns a description of what the sub-command does
   */
  public description(): string {
    return 'Perform an audit of the package dependencies';
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
        .option('level', {
          alias: 'l',
          description: 'Only issues at this severity or higher or shown',
          choices: Object.keys(YarnAuditSeverityBits),
        })
        .option('json', {
          alias: 'j',
          description: 'Output issues as JSON',
          type: 'boolean',
        })
        .option('minimum', {
          alias: 'm',
          description: 'The audit only fails for issues at this severity or higher',
          choices: Object.keys(YarnAuditSeverityBits),
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
    // Some options we support are just proxied on to `yarn audit`
    const yarnArgs: string[] = ['audit'];
    if (args.level !== undefined) {
      yarnArgs.push('--level', args.level as string);
    }
    if (args.json) {
      yarnArgs.push('--json');
    }

    // Run `yarn audit` and get back its exit status
    let exitStatus = await executeCmd('yarn', yarnArgs, { stdio: 'inherit' });

    // If there are any issues (ie: exit status is non-zero) and a minimum
    // severity was provided then see if they can be suppressed.
    const minSeverity = args.minimum as Severity;
    if (minSeverity !== undefined && exitStatus != 0) {
      // Convert the string severity into its corresponding bit
      const minStatusBit = YarnAuditSeverityBits[minSeverity];

      // And see if we can suppress these issues
      if (minStatusBit !== undefined && exitStatus < minStatusBit) {
        // All issues are below the threshold so we can ignore them
        // eslint-disable-next-line no-console
        console.log(`${chalk.green('Info')}: Ignoring issues found below severity "${minSeverity}" as requested`);
        exitStatus = 0;
      }
    }

    return exitStatus;
  }
}

export default new AuditDependencies();
