import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface PanelHeaderProps {
    icon: IconName;
    title: string;
    badge: ReactNode;
    badgeTitle?: string;
    className?: string;
}

/** Cabecera común de los tres paneles: mismo icono que su sección en el menú lateral. */
function PanelHeader({ icon, title, badge, badgeTitle, className = '' }: PanelHeaderProps) {
    return (
        <header className={`spinly-panel-header ${className}`.trim()}>
            <div className="spinly-panel-heading">
                <span className="spinly-panel-icon"><Icon name={icon} /></span>
                <h2 className="spinly-panel-title">{title}</h2>
            </div>
            <span className="spinly-badge" title={badgeTitle}>{badge}</span>
        </header>
    );
}

export default PanelHeader;
