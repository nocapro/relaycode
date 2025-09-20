import clipboardy from 'clipboardy';
import { logger, getErrorMessage } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { exec, type ExecException } from 'child_process';
import { executeShellCommand } from '../utils/shell';
import { FALLBACKS_DIR, WINDOWS_CLIPBOARD_EXE_NAME, WINDOWS_DIR } from '../utils/constants';
import { fileURLToPath } from 'url';

type ClipboardCallback = (content: string) => void;
type ClipboardReader = () => Promise<string>;
type BulkClipboardCallback = (contents: string[]) => void;

// Path to the directory of the current module (e.g., /path/to/relaycode/dist)
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// Path to the root of the relaycode package
const packageRoot = path.join(moduleDir, '..');
// Path to the clipboard executable within the package
const sourceExePath = path.join(packageRoot, FALLBACKS_DIR, WINDOWS_DIR, WINDOWS_CLIPBOARD_EXE_NAME);


const checkLinuxClipboardDependencies = async () => {
  if (process.platform === 'linux') {
      logger.debug('Checking for clipboard dependencies on Linux (xsel or xclip)...');
      try {
          // Using `command -v` is more portable than `which`. Redirect stdout/stderr to keep it clean.
          const { exitCode } = await executeShellCommand('command -v xsel >/dev/null 2>&1 || command -v xclip >/dev/null 2>&1');
          if (exitCode !== 0) {
              logger.error('-----------------------------------------------------------------------');
              logger.error('ACTION REQUIRED: Clipboard support on Linux requires `xsel` or `xclip`.');
              logger.error('Please install one of these tools to enable clipboard monitoring.');
              logger.error('Example on Debian/Ubuntu: sudo apt install xsel');
              logger.error('Example on Fedora/CentOS: sudo dnf install xsel');
              logger.error('Example on Arch Linux:    sudo pacman -S xsel');
              logger.error('-----------------------------------------------------------------------');
          } else {
              logger.debug('Linux clipboard dependency check passed.');
          }
      } catch (error) {
          logger.warn(`An error occurred while checking for clipboard dependencies: ${getErrorMessage(error)}`);
      }
  }
};

const WINDOWS_FALLBACK_DIR = path.join(process.cwd(), FALLBACKS_DIR, WINDOWS_DIR);
const WINDOWS_CLIPBOARD_PATH = path.join(WINDOWS_FALLBACK_DIR, WINDOWS_CLIPBOARD_EXE_NAME);

// Direct Windows clipboard reader that uses the executable directly
const createDirectWindowsClipboardReader = (): ClipboardReader => {
  return () => new Promise((resolve) => {
    try {
      if (!fs.existsSync(WINDOWS_CLIPBOARD_PATH)) {
        logger.error('Windows clipboard executable not found. Cannot watch clipboard on Windows.');
        // Resolve with empty string to avoid stopping the watcher loop, but log an error.
        return resolve('');
      }
      
      const command = `"${WINDOWS_CLIPBOARD_PATH}" --paste`;
      
      exec(command, { encoding: 'utf8' }, (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          // It's common for the clipboard executable to fail if the clipboard is empty
          // or contains non-text data (e.g., an image). We can treat this as "no content".
          // We don't log this as an error to avoid spamming the console during normal use.
          logger.debug(`Windows clipboard read command failed (this is often normal): ${stderr.trim()}`);
          resolve('');
        } else {
          resolve(stdout);
        }
      });
    } catch (syncError) {
      // Catch synchronous errors during setup (e.g., path issues).
      logger.error(`A synchronous error occurred while setting up clipboard reader: ${getErrorMessage(syncError)}`);
      resolve('');
    }
  });
};

// Check if the clipboard executable exists and fix path issues on Windows
const ensureClipboardExecutable = () => {
  if (process.platform === 'win32') {
    try {
      // Create fallbacks directory in the current project if it doesn't exist
      if (!fs.existsSync(WINDOWS_FALLBACK_DIR)) {
        fs.mkdirSync(WINDOWS_FALLBACK_DIR, { recursive: true });
      }
      
      if (fs.existsSync(sourceExePath)) {
        let shouldCopy = true;
        if (fs.existsSync(WINDOWS_CLIPBOARD_PATH)) {
          // If the file exists, check if the size is the same.
          // This is a simple way to check if it's the same file.
          if (fs.statSync(sourceExePath).size === fs.statSync(WINDOWS_CLIPBOARD_PATH).size) {
            shouldCopy = false;
          }
        }
        
        if (shouldCopy) {
          fs.copyFileSync(sourceExePath, WINDOWS_CLIPBOARD_PATH);
          logger.info('Copied Windows clipboard executable to local fallbacks directory');
        }
      } else {
        logger.error(`Windows clipboard executable not found in package at: ${sourceExePath}`);
      }
    } catch (error) {
      logger.warn('Error ensuring clipboard executable: ' + getErrorMessage(error));
    }
  }
};

export const createClipboardWatcher = (
  pollInterval: number,
  callback: ClipboardCallback,
  reader?: ClipboardReader,
) => {
  // Ensure clipboard executable exists before starting
  ensureClipboardExecutable();
  // Check for Linux dependencies. This is fire-and-forget.
  checkLinuxClipboardDependencies();
  
  // On Windows, use the direct Windows reader
  // Otherwise use the provided reader or clipboardy
  const clipboardReader = process.platform === 'win32' ? 
    createDirectWindowsClipboardReader() : 
    reader || clipboardy.read;
  
  let lastContent = '';
  let intervalId: NodeJS.Timeout | null = null;

  const checkClipboard = async () => {
    try {
      const content = await clipboardReader();
      if (content && content !== lastContent) {
        lastContent = content;
        callback(content);
      }
    } catch (error) {
      // It's common for clipboard access to fail occasionally (e.g., on VM focus change)
      // So we log a warning but don't stop the watcher.
      logger.warn('Could not read from clipboard: ' + getErrorMessage(error));
    }
  };

  const start = () => {
    if (intervalId) {
      return;
    }
    logger.info(`Starting clipboard watcher (polling every ${pollInterval}ms)`);
    // Immediately check once, then start the interval
    checkClipboard();
    intervalId = setInterval(checkClipboard, pollInterval);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info('Clipboard watcher stopped.');
    }
  };

  start();
  
  return { stop };
};

export const createBulkClipboardWatcher = (
  pollInterval: number,
  bulkCallback: BulkClipboardCallback,
  bulkSize: number = 5,
  bulkTimeout: number = 30000,
  reader?: ClipboardReader,
) => {
  // Ensure clipboard executable exists before starting
  ensureClipboardExecutable();
  // Check for Linux dependencies. This is fire-and-forget.
  checkLinuxClipboardDependencies();
  
  // On Windows, use the direct Windows reader
  // Otherwise use the provided reader or clipboardy
  const clipboardReader = process.platform === 'win32' ? 
    createDirectWindowsClipboardReader() : 
    reader || clipboardy.read;
  
  let lastContent = '';
  let intervalId: NodeJS.Timeout | null = null;
  let bulkTimer: NodeJS.Timeout | null = null;
  let clipboardBuffer: string[] = [];

  const processBulk = () => {
    if (clipboardBuffer.length > 0) {
      const contentsToProcess = [...clipboardBuffer];
      clipboardBuffer = [];
      bulkCallback(contentsToProcess);
    }
    if (bulkTimer) {
      clearTimeout(bulkTimer);
      bulkTimer = null;
    }
  };

  const checkClipboard = async () => {
    try {
      const content = await clipboardReader();
      if (content && content !== lastContent) {
        lastContent = content;
        clipboardBuffer.push(content);
        
        // Process immediately if we reach the bulk size
        if (clipboardBuffer.length >= bulkSize) {
          processBulk();
        } else {
          // Set or reset the bulk timer
          if (bulkTimer) {
            clearTimeout(bulkTimer);
          }
          bulkTimer = setTimeout(processBulk, bulkTimeout);
        }
      }
    } catch (error) {
      // It's common for clipboard access to fail occasionally (e.g., on VM focus change)
      // So we log a warning but don't stop the watcher.
      logger.warn('Could not read from clipboard: ' + getErrorMessage(error));
    }
  };

  const start = () => {
    if (intervalId) {
      return;
    }
    logger.info(`Starting bulk clipboard watcher (polling every ${pollInterval}ms, bulk size: ${bulkSize})`);
    // Immediately check once, then start the interval
    checkClipboard();
    intervalId = setInterval(checkClipboard, pollInterval);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (bulkTimer) {
      clearTimeout(bulkTimer);
      bulkTimer = null;
    }
    // Process any remaining items in the buffer
    processBulk();
    logger.info('Bulk clipboard watcher stopped.');
  };

  start();
  
  return { stop };
};