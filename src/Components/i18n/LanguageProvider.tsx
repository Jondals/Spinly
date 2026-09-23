import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { pickText, type DictKey, type DictSection, type LocalMessage, type SpinlyLang, type TextVars } from '../../scripts/strings';

const LANG_KEY = 'spinly-lang';

function readStoredLang(): SpinlyLang {
    try {
        return localStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
    } catch {
        return 'en';
    }
}

const LangContext = createContext<{ lang: SpinlyLang; setLang: (lang: SpinlyLang) => void }>({
    lang: 'en',
    setLang: () => undefined,
});

/** Idioma de la UI: se persiste y se refleja en <html lang> para lectores de pantalla y SEO. */
export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<SpinlyLang>(readStoredLang);

    useEffect(() => {
        document.documentElement.setAttribute('lang', lang);
        try {
            localStorage.setItem(LANG_KEY, lang);
        } catch {
            // Sin acceso a storage: el idioma se mantiene en memoria.
        }
    }, [lang]);

    return <LangContext.Provider value={{ lang, setLang: setLangState }}>{children}</LangContext.Provider>;
}

export type TranslateFn = <S extends DictSection>(section: S, key: DictKey<S>, vars?: TextVars) => string;

export function useTranslation() {
    const { lang, setLang } = useContext(LangContext);
    const t = useCallback<TranslateFn>((section, key, vars) => pickText(section, key, lang, vars), [lang]);
    const tm = useCallback((message: LocalMessage): string => message[lang] ?? message.en, [lang]);
    return { lang, setLang, t, tm };
}
