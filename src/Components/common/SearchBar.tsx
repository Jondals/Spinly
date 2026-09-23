import Icon from './Icon';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
}

function SearchBar({ value, onChange, placeholder, ariaLabel }: SearchBarProps) {
    return (
        <div className="spinly-toolbar">
            <label className="spinly-search">
                <Icon name="search" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                />
            </label>
        </div>
    );
}

export default SearchBar;
