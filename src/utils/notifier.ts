// @ts-ignore - toasted-notifier doesn't have TypeScript declarations
import toastedNotifier from 'toasted-notifier';
import chalk from 'chalk';

// Manually define the interface for the parts of toasted-notifier we use,
// as it doesn't have official TypeScript definitions.
interface NotifyOptions {
  title: string;
  message: string;
  sound: boolean;
  wait: boolean;
  actions?: string[];
  timeout?: number;
}

interface ToastedNotifier {
  notify(
    options: NotifyOptions,
    callback?: (err: Error | null, response: string) => void,
  ): void;
}

const notifier: ToastedNotifier = toastedNotifier;
import { APP_NAME } from './constants';
import { getErrorMessage, logger } from './logger';

// This is a "fire-and-forget" utility. If notifications fail for any reason
// (e.g., unsupported OS, DND mode, permissions), it should not crash the app.
const sendNotification = (options: { title: string; message: string; enableNotifications?: boolean }) => {
    // Skip notification if explicitly disabled
    if (options.enableNotifications === false) {
        return;
    }
    
    try {
        notifier.notify({
            title: options.title,
            message: options.message,
            sound: false, // Keep it quiet by default
            wait: false,
        }, (err: Error | null) => {
            if (err) {
                // Silently ignore errors. This is a non-critical feature.
            }
        });
    } catch (err) {
        // Silently ignore errors.
    }
};

export const createNotifier = (messageTemplate: (param: string) => string) => {
    return (param: string, enableNotifications: boolean = true) => {
        sendNotification({
            title: APP_NAME,
            message: messageTemplate(param),
            enableNotifications,
        });
    };
};

export const notifyPatchDetected = createNotifier(
    (projectId: string) => `New patch detected for project \`${projectId}\`.`
);

export const notifyApprovalRequired = createNotifier(
    (projectId: string) => `Action required to approve changes for \`${projectId}\`.`
);

export const notifySuccess = createNotifier(
    (uuid: string) => `Patch \`${uuid}\` applied successfully.`
);

export const notifyFailure = createNotifier(
    (uuid: string) => `Patch \`${uuid}\` failed and was rolled back.`
);

export const notifyRollbackFailure = createNotifier(
    (uuid: string) => `CRITICAL: Rollback for patch \`${uuid}\` FAILED. Manual intervention required.`
);

export const requestApprovalWithNotification = (
    projectId: string,
    enableNotifications: boolean = true
): Promise<'approved' | 'rejected' | 'timeout' | 'unsupported'> => {
    if (enableNotifications === false) {
        return Promise.resolve('unsupported');
    }

    return new Promise((resolve) => {
        try {
            notifier.notify(
                {
                    title: `Approval Required for ${projectId}`,
                    message: 'A patch requires your approval. You can also approve/reject in the terminal.',
                    sound: true,
                    wait: true, // This is key. It makes the notifier wait for user action.
                    actions: ['Approve', 'Reject'],
                    timeout: 30, // seconds
                },
                (err: Error | null, response: string) => {
                    if (err) {
                        logger.debug(`Notification approval error: ${getErrorMessage(err)}`);
                        return resolve('unsupported');
                    }
                    const cleanResponse = (response || '').toLowerCase().trim();
                    if (cleanResponse.startsWith('approve')) {
                        resolve('approved');
                    } else if (cleanResponse.startsWith('reject')) {
                        resolve('rejected');
                    } else if (cleanResponse === 'timeout') {
                        logger.info(chalk.gray('Notification timed out. Please use the terminal to respond.'));
                        return resolve('timeout');
                    } else {
                        logger.debug(`Notification approval received non-action response: "${cleanResponse}"`);
                        resolve('timeout');
                    }
                }
            );
        } catch (err) {
            logger.debug(`Notification dispatch threw synchronous error: ${getErrorMessage(err)}`);
            resolve('unsupported');
        }
    });
};