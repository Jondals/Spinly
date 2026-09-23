import SearchIcon from './SearchIcon';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
}

// Buscador compartido (Mis temas, Mis presets y Comunidad en ambos): misma fila,
// mismo ancho completo (.spinly-toolbar + .spinly-search) y filtrado en tiempo real.
function SearchBar({ value, onChange, placeholder, ariaLabel }: SearchBarProps) {
    return (
        <div className="spinly-toolbar">
            <label className="spinly-search">
                <SearchIcon />
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
