import Avatar from './Avatar';
import { useTranslation } from '../i18n/LanguageProvider';
import type { CommunityAuthor } from '../../scripts/community';

/** Autor de un elemento de la comunidad; sin fila en profiles se muestra un nombre genérico. */
export function authorName(author: CommunityAuthor, fallback: string): string {
    return author.username || fallback;
}

interface AuthorTagProps {
    author: CommunityAuthor;
}

/** Etiqueta con la foto y el nombre de quien compartió el elemento. */
function AuthorTag({ author }: AuthorTagProps) {
    const { t } = useTranslation();
    const name = authorName(author, t('common', 'unknownUser'));
    return (
        <span className="spinly-author" title={name}>
            <Avatar src={author.avatar_url} size="sm" alt={t('common', 'photoOf', { name })} />
            <span className="spinly-author-name">{name}</span>
        </span>
    );
}

export default AuthorTag;
