/**
 * ItemList: a search box plus a list of cards, with its loading, error and empty states.
 */
import type { ReactNode } from 'react';
import SearchBar from './SearchBar';
import StatusMessage from './StatusMessage';

interface ItemListProps {
    search: string;
    onSearch: (value: string) => void;
    searchPlaceholder: string;
    searchLabel: string;
    count: number;
    emptyText: string;
    listClassName: string;
    emptyClassName: string;
    loadingText?: string;
    loading?: boolean;
    error?: string | null;
    children: ReactNode;
}

/** Search box + card list with its states (loading, error, empty). Used by Presets and Themes. */
function ItemList({ search, onSearch, searchPlaceholder, searchLabel, count, emptyText, listClassName, emptyClassName, loadingText, loading = false, error = null, children }: ItemListProps) {
    let content: ReactNode;
    if (loading) content = <StatusMessage>{loadingText}</StatusMessage>;
    else if (error) content = <StatusMessage tone="error">{error}</StatusMessage>;
    else if (count === 0) content = <p className={emptyClassName}>{emptyText}</p>;
    else content = <ul className={listClassName}>{children}</ul>;

    return (
        <>
            <SearchBar value={search} onChange={onSearch} placeholder={searchPlaceholder} ariaLabel={searchLabel} />
            {content}
        </>
    );
}

export default ItemList;
