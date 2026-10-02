/**
 * AuthorTag: avatar and name of whoever shared a community theme or preset.
 */
import Avatar from './Avatar';
import { useTranslation } from '../i18n/LanguageProvider';
import type { CommunityAuthor } from '../../scripts/community';

/** Display name of a community item's author; without a profiles row a generic name is shown. */
export function authorName(author: CommunityAuthor, fallback: string): string {
    return author.username || fallback;
}

interface AuthorTagProps {
    author: CommunityAuthor;
}

/** Tag with the photo and name of whoever shared the item. */
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
