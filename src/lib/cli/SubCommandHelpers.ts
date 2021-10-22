/**
 * A series of helper functions used by `jetsam` and its sub-commands
 */
import { spawn, SpawnOptions } from 'child_process';
import { stat, readFile, writeFile } from 'fs/promises';
import { Stats } from 'fs';
import klaw from 'klaw';
import { createInterface } from 'readline';
import { promisify } from 'util';

/**
 * Prompt for input
 *
 * @param prompt - the prompt to display
 * @param choices - optional list of valid choices
 * @param defaultChoice - optional default choice
 * @returns the user's input
 */
export async function getInput(prompt: string, choices?: string[], defaultChoice?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const question = promisify(rl.question).bind(rl);

  // Build the full prompt
  let fullPrompt = prompt;
  if (choices !== undefined && choices.length > 0) {
    fullPrompt += ` [${choices.join(',')}]`;
    if (defaultChoice !== undefined) {
      fullPrompt += ` (${defaultChoice})`;
    }
  }
  fullPrompt += '? ';

  // Prompt the user for a response until we are satisfied
  let done = false;
  let answer = '';
  while (!done) {
    answer = (await question(fullPrompt)) as any;

    // If there's a default choice and the user's response is empty then set it
    // to the default.
    if (defaultChoice !== undefined && answer === '') {
      answer = defaultChoice;
      done = true;
    }

    // If we have a list of valid choices then make sure the user entered one
    else if (choices !== undefined && choices.length > 0) {
      done = choices.indexOf(answer) >= 0;
    }

    // Any response will do
    else {
      done = true;
    }
  }
  return answer;
}

/**
 * Prompt for a yes/no confirmation
 *
 * @param prompt - the prompt to display
 * @param defaultChoice - optional default choice
 * @returns true if the user positively confirms the question
 */
export async function confirm(prompt: string, defaultChoice?: boolean): Promise<boolean> {
  const answer = await getInput(
    prompt,
    ['yes', 'no'],
    defaultChoice === true ? 'yes' : defaultChoice === false ? 'no' : undefined
  );
  return answer === 'yes';
}

/**
 * Determine if a given path exists on the filesystem
 *
 * @param path - the path to test
 * @returns the stats for the path if it exists or null if it does not exist
 */
export async function isExistingPath(path: string): Promise<Stats | null> {
  try {
    const stats = await stat(path);
    return stats;
  } catch (err) {
    // If the error is because the file does not exist then return null
    const errnoErr = err as NodeJS.ErrnoException;
    if (errnoErr.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Determine if a given path exists on the filesystem and is a directory
 *
 * @param path - the path to test
 * @returns true if the path is a directory
 */
export async function isExistingDir(path: string): Promise<boolean> {
  const stats = await isExistingPath(path);
  return stats === null ? false : stats.isDirectory();
}

/**
 * Determine if a given path exists on the filesystem and is a file
 *
 * @param path - the path to test
 * @returns true if the path is a file
 */
export async function isExistingFile(path: string): Promise<boolean> {
  const stats = await isExistingPath(path);
  return stats === null ? false : stats.isFile();
}

/**
 * Given a parent directory and filter, find files and directories under the
 * parent that pass the filter.
 *
 * @param parent - the parent directory
 * @param filter - takes a stats entry for a candidate and returns true if the
 * candidate passes the filter
 * @returns the entries that passed the filter
 */
export async function findFiles(parent: string, filter: (item: klaw.Item) => boolean): Promise<string[]> {
  const passed: string[] = [];
  for await (const candidate of klaw(parent)) {
    if (filter(candidate)) {
      passed.push(candidate.path);
    }
  }

  return passed;
}

/**
 * Given a path to a file, read its contents and pass it through a given filter
 * with the result of the filter been written to the given destination.
 *
 * @param src - the source file
 * @param dst - the destination file
 * @param filter - the filter function
 * @returns a promise resolved when complete
 */
export async function filterFile(
  src: string,
  dst: string,
  filter: (contents: string) => string | Promise<string>
): Promise<void> {
  const contents = await filter(await readFile(src, 'utf8'));
  await writeFile(dst, contents, 'utf8');
}

/**
 * Execute a given command
 *
 * @param cmd - the command to execute
 * @param args - the arguments for the command
 * @param opts - the options for spawn
 * @param quiet - if true, do not output any errors
 * @returns the exit status of the command or undefined if the command failed
 */
export function executeCmdRaw(
  cmd: string,
  args: any[],
  opts?: SpawnOptions,
  quiet?: boolean
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    // Set the default spawn options
    opts = opts ?? {
      stdio: 'inherit',
    };

    // Run the command
    const child = spawn(cmd, args, opts);
    if (child === null) {
      if (!quiet) {
        console.error(`Failed to execute command: "${cmd} ${args.join(' ')}"`);
      }
      resolve(undefined);
      return;
    }

    // Take care to only fulfill the promise exactly once
    let fulfilled = 0;
    child.on('error', (err) => !fulfilled++ && reject(err));
    child.on('close', (code) => !fulfilled++ && resolve(code as number));
  });
}

/**
 * Execute a given command
 *
 * @param cmd - the command to execute
 * @param args - the arguments for the command
 * @returns the exit status of the command
 */
export async function executeCmd(cmd: string, ...args: any[]): Promise<number> {
  const result = await executeCmdRaw(cmd, args);
  return result === undefined ? -1 : result;
}

/**
 * Execute a command completely silently, just returning its exit status
 *
 * @param cmd - the command to execute
 * @param args - the arguments for the command
 * @returns the exit status of the command
 */
export async function executeCmdSilently(cmd: string, ...args: any[]): Promise<number | undefined> {
  const options: SpawnOptions = { stdio: 'ignore' };
  const result = await executeCmdRaw(cmd, args, options, true);
  return result === undefined ? -1 : result;
}

/**
 * Execute a given command and return its output. Any trailing newline in the
 * output is not removed.
 *
 * @param cmd - the command to execute
 * @param args - the arguments for the command
 * @returns the command's output or undefined on error
 */
export function getOutputFromCmdNoChomp(cmd: string, ...args: any[]): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    // Run the command using this process's stdin and stderr and reading from
    // the child's stdout.
    const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'inherit'] });
    if (child === null) {
      console.error(`Failed to execute command: "${cmd} ${args.join(' ')}"`);
      resolve(undefined);
      return;
    }

    // Read blocks from stdout
    const buffers: Buffer[] = [];
    child.stdout.on('data', (buffer) => buffers.push(buffer));

    // Take care to only fulfill the promise exactly once
    let fulfilled = 0;
    child.on('error', (err) => !fulfilled++ && reject(err));
    child.on('close', (code) => {
      if (!fulfilled) {
        ++fulfilled;
        if (code === 0) {
          resolve(Buffer.concat(buffers).toString());
        } else {
          resolve(undefined);
        }
      }
    });
  });
}

/**
 * Execute a given command and return its output removing any trailing newline
 *
 * @param cmd - the command to execute
 * @param args - the arguments for the command
 * @returns the command's output or undefined on error
 */
export async function getOutputFromCmd(cmd: string, ...args: any[]): Promise<string | undefined> {
  const contents = await getOutputFromCmdNoChomp(cmd, ...args);
  return contents === undefined ? undefined : contents.replace(/\n$/, '');
}
