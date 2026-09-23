import type { ReactNode } from 'react';

interface CreateRowProps {
    visible: boolean;
    children: ReactNode;
}

/**
 * Fila del botón "Nuevo/Guardar". Se pliega mientras el formulario (CollapsePanel) está
 * abierto y se despliega a la vez que este se cierra: la altura se traspasa de uno a otro
 * sin saltos. Oculta queda `inert`, fuera del foco y del lector de pantalla.
 */
function CreateRow({ visible, children }: CreateRowProps) {
    return (
        <div className={`spinly-create-row${visible ? '' : ' spinly-create-row--hidden'}`} aria-hidden={!visible} inert={!visible}>
            <div className="spinly-create-row-inner">{children}</div>
        </div>
    );
}

export default CreateRow;
