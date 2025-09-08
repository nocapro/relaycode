import { promises as fs } from 'fs';
import path from 'path';
import { getErrorMessage, isEnoentError } from './logger';

export const readFileContent = async (filePath: string, cwd: string = process.cwd()): Promise<string | null> => {
  try {
    return await fs.readFile(path.resolve(cwd, filePath), 'utf-8');
  } catch (error) {
    if (isEnoentError(error)) {
      return null; // File doesn't exist
    }
    throw error;
  }
};

export const writeFileContent = async (filePath: string, content: string, cwd: string = process.cwd()): Promise<void> => {
  const sanitizedPath = filePath.replace(/[/\\]+$/, '');
  if (!sanitizedPath) {
    console.warn(`Invalid file path (points to root directory): ${filePath}. Skipping.`);
    return;
  }
  const absolutePath = path.resolve(cwd, sanitizedPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf-8');
};

export const deleteFile = async (filePath: string, cwd: string = process.cwd()): Promise<void> => {
  try {
    await fs.unlink(path.resolve(cwd, filePath));
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR')) {
      // File already deleted or is a directory, which is fine for an unlink operation.
      return;
    }
    throw error;
  }
};

export const fileExists = async (filePath: string, cwd: string = process.cwd()): Promise<boolean> => {
  try {
    await fs.access(path.resolve(cwd, filePath));
    return true;
  } catch {
    return false;
  }
};

export const safeRename = async (fromPath: string, toPath:string): Promise<void> => {
    try {
        await fs.rename(fromPath, toPath);
    } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EXDEV') {
            await fs.copyFile(fromPath, toPath);
            await fs.unlink(fromPath);
        } else {
            throw error;
        }
    }
};

export const renameFile = async (fromPath: string, toPath: string, cwd: string = process.cwd()): Promise<void> => {
  const fromAbsolutePath = path.resolve(cwd, fromPath);
  const toAbsolutePath = path.resolve(cwd, toPath);
  await fs.mkdir(path.dirname(toAbsolutePath), { recursive: true });
  await safeRename(fromAbsolutePath, toAbsolutePath);
};

// Helper to check if a directory is empty
export const isDirectoryEmpty = async (dirPath: string): Promise<boolean> => {
  try {
    const files = await fs.readdir(dirPath);
    return files.length === 0;
  } catch (error) {
    // If directory doesn't exist or is not accessible, consider it "not empty"
    return false;
  }
};

// Recursively remove all empty parent directories up to a limit
export const removeEmptyParentDirectories = async (dirPath: string, rootDir: string): Promise<void> => {
  if (!dirPath.startsWith(rootDir) || dirPath === rootDir) {
    return;
  }
  
  try {
    const isEmpty = await isDirectoryEmpty(dirPath);
    if (isEmpty) {
      await fs.rmdir(dirPath);
      // Recursively check parent directory
      await removeEmptyParentDirectories(path.dirname(dirPath), rootDir);
    }
  } catch (error: unknown) {
    // Ignore directory removal errors, but don't continue up the chain
    if (!(error instanceof Error && 'code' in error &&
        ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR'))) {
      console.warn(`Failed to clean up directory ${dirPath}:`, getErrorMessage(error));
    }
  }
};