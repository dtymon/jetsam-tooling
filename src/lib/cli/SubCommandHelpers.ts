/**
 * A series of helper functions used by `jetsam` and its sub-commands
 */
import { spawn, SpawnOptions } from 'child_process';
import { stat, readFile, writeFile } from 'fs/promises';
import { Stats } from 'fs';
import klaw from 'klaw';

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
 * @returns the exit status of the command
 */
export function executeCmd(cmd: string, args: any[], opts: SpawnOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    // Run the command
    const child = spawn(cmd, args, opts);
    if (child === null) {
      throw new Error(`Failed to execute command: ${cmd}`);
    }

    // Take care to only fulfill the promise exactly once
    let fulfilled = 0;
    child.on('error', (err) => !fulfilled++ && reject(err));
    child.on('close', (code) => !fulfilled++ && resolve(code as number));
  });
}
