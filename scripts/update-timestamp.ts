import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const updateTimestamp = async (filePath: string) => {
    try {
        let content = '';
        try {
            content = await fs.readFile(filePath, 'utf-8');
        } catch (e) {
            if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) {
                throw e;
            }
        }
        
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const regex = /(export const __LAST_MODIFIED__ = ')[^']*(';)/;

        if (regex.test(content)) {
            content = content.replace(regex, `$1${timestamp}$2`);
        } else {
            const exportStatement = `export const __LAST_MODIFIED__ = '${timestamp}';`;
            if (content.trim() === '') {
                content = exportStatement;
            } else {
                content = content.trimEnd() + '\n\n' + exportStatement;
            }
        }

        await fs.writeFile(filePath, content.trim() + '\n', 'utf-8');
        console.log(`Updated timestamp in ${path.relative(process.cwd(), filePath)} to ${timestamp}`);
    } catch (error) {
        console.error(`Failed to update timestamp in ${filePath}:`, error);
        process.exit(1);
    }
};

const targetFilePath = path.resolve(__dirname, '../src/index.ts');
updateTimestamp(targetFilePath);