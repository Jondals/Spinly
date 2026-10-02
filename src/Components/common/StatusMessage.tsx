/**
 * StatusMessage: the inline info / success / error line shown inside panels.
 */
import type { ReactNode } from 'react';
import type { LocalMessage } from '../../scripts/strings';

/** A panel notice. LocalMessage instead of string: it is translated again if the language changes while it is on screen. */
export type Notice = { tone: 'ok' | 'error'; text: LocalMessage };

interface StatusMessageProps {
    tone?: 'info' | 'ok' | 'error';
    children: ReactNode;
}

/** Renders the message; errors are announced as alerts, the rest as polite status updates. */
function StatusMessage({ tone = 'info', children }: StatusMessageProps) {
    const toneClass = tone === 'info' ? '' : ` spinly-status--${tone}`;
    return (
        <p className={`spinly-status${toneClass}`} role={tone === 'error' ? 'alert' : 'status'}>
            {children}
        </p>
    );
}

export default StatusMessage;
