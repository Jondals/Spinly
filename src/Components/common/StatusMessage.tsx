import type { ReactNode } from 'react';
import type { LocalMessage } from '../../scripts/strings';

/** Aviso de un panel. LocalMessage y no string: se re-traduce si cambia el idioma con él en pantalla. */
export type Notice = { tone: 'ok' | 'error'; text: LocalMessage };

interface StatusMessageProps {
    tone?: 'info' | 'ok' | 'error';
    children: ReactNode;
}

function StatusMessage({ tone = 'info', children }: StatusMessageProps) {
    const toneClass = tone === 'info' ? '' : ` spinly-status--${tone}`;
    return (
        <p className={`spinly-status${toneClass}`} role={tone === 'error' ? 'alert' : 'status'}>
            {children}
        </p>
    );
}

export default StatusMessage;
