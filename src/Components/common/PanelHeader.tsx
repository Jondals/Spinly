/**
 * PanelHeader: the shared header of the side panels (icon, title and a counter badge).
 */
import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface PanelHeaderProps {
    icon: IconName;
    title: string;
    badge: ReactNode;
    badgeTitle?: string;
    className?: string;
}

/** Common header of the panels, with the same icon as their section in the side menu. */
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
