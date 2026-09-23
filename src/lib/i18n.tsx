import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { pickText, type DictKey, type DictSection, type LocalMessage, type TextVars } from './strings';

export type SpinlyLang = 'en' | 'es';

const LANG_KEY = 'spinly-lang';
const LANG_EVENT = 'spinly-lang-change';

function readLang(): SpinlyLang {
    if (typeof window === 'undefined') return 'en';
    try {
        const raw = localStorage.getItem(LANG_KEY);
        return raw === 'es' ? 'es' : 'en';
    } catch {
        return 'en';
    }
}

const LangContext = createContext<{ lang: SpinlyLang; setLang: (l: SpinlyLang) => void }>({
    lang: 'en',
    setLang: () => undefined,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<SpinlyLang>(() => readLang());
    useEffect(() => {
        const onChange = (e: Event) => {
            const next = (e as CustomEvent<SpinlyLang>).detail;
            if (next === 'en' || next === 'es') setLangState(next);
        };
        window.addEventListener(LANG_EVENT, onChange as EventListener);
        return () => window.removeEventListener(LANG_EVENT, onChange as EventListener);
    }, []);
    const setLang = useCallback((next: SpinlyLang) => {
        setLangState(next);
        try {
            localStorage.setItem(LANG_KEY, next);
        } catch {
            // ignore storage errors
        }
        document.documentElement.setAttribute('lang', next);
        window.dispatchEvent(new CustomEvent<SpinlyLang>(LANG_EVENT, { detail: next }));
    }, []);
    useEffect(() => {
        document.documentElement.setAttribute('lang', lang);
    }, [lang]);
    return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLanguage() {
    return useContext(LangContext);
}

export function getStoredLang(): SpinlyLang {
    return readLang();
}

export type TranslateFn = <S extends DictSection>(section: S, key: DictKey<S>, vars?: TextVars) => string;

export function useTranslation() {
    const ctx = useContext(LangContext);
    const t = useCallback<TranslateFn>(
        (section, key, vars) => pickText(section, key, ctx.lang, vars),
        [ctx.lang],
    );
    // Pinta un LocalMessage (errores/avisos guardados en estado) en el idioma activo
    const tm = useCallback((message: LocalMessage): string => message[ctx.lang] ?? message.en, [ctx.lang]);
    return { lang: ctx.lang, setLang: ctx.setLang, t, tm };
}
