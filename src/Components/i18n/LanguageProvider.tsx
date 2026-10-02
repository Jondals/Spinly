/**
 * Language context: the active UI language (English or Spanish) and the translation helpers.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { pickText, type DictKey, type DictSection, type LocalMessage, type SpinlyLang, type TextVars } from '../../scripts/strings';

const LANG_KEY = 'spinly-lang';

/** Reads the saved language (English by default or when storage is unavailable). */
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

/** UI language: persisted and mirrored on <html lang> for screen readers and SEO. */
export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<SpinlyLang>(readStoredLang);

    useEffect(() => {
        document.documentElement.setAttribute('lang', lang);
        try {
            localStorage.setItem(LANG_KEY, lang);
        } catch {
            // No storage access: the language is kept in memory.
        }
    }, [lang]);

    return <LangContext.Provider value={{ lang, setLang: setLangState }}>{children}</LangContext.Provider>;
}

export type TranslateFn = <S extends DictSection>(section: S, key: DictKey<S>, vars?: TextVars) => string;

/** Active language plus `t(section, key, vars)` for dictionary texts and `tm(message)` for bilingual messages. */
export function useTranslation() {
    const { lang, setLang } = useContext(LangContext);
    const t = useCallback<TranslateFn>((section, key, vars) => pickText(section, key, lang, vars), [lang]);
    /** Resolves a bilingual message in the active language. */
    const tm = useCallback((message: LocalMessage): string => message[lang] ?? message.en, [lang]);
    return { lang, setLang, t, tm };
}
