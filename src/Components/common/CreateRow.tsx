/**
 * CreateRow: the row holding a panel's "New / Save" button, which folds away while its form is open.
 */
import type { ReactNode } from 'react';

interface CreateRowProps {
    visible: boolean;
    children: ReactNode;
}

/**
 * Row of the "New / Save" button. It folds while the form (CollapsePanel) is open and unfolds as the
 * form closes, so the height moves from one to the other without jumps. While hidden it is `inert`,
 * out of the focus order and of screen readers.
 */
function CreateRow({ visible, children }: CreateRowProps) {
    return (
        <div className={`spinly-create-row${visible ? '' : ' spinly-create-row--hidden'}`} aria-hidden={!visible} inert={!visible}>
            <div className="spinly-create-row-inner">{children}</div>
        </div>
    );
}

export default CreateRow;
