import { Argv, Arguments } from 'yargs';

/**
 * An abstract base class that defines the interface that all `jetsam`
 * sub-commands must implement.
 */
export abstract class SubCommand {
  /**
   * Get the name of the sub-command to be passed to `jetsam`
   *
   * @returns the name of the sub-command
   */
  public abstract name(): string;

  /**
   * Provides a description of the sub-command that will appear in the help
   *
   * @returns a description of what the sub-command does
   */
  public abstract description(): string;

  /**
   * Called to get a function that will be invoked to add the required
   * configuration to `yargs`. The function will be passed a `yargs` argv
   * instance that it can use to configure the command-line it supports.
   *
   * @returns the function to call to configure the sub-command
   */
  public abstract configure(): (yargs: Argv) => Argv;

  /**
   * Called to execute the sub-command given the command-line arguments passed
   * to `jetsam`.
   *
   * @param args - the command-line arguments
   * @returns the exit status to use for `jetsam`
   */
  public abstract execute(args: Arguments): Promise<number>;
}
