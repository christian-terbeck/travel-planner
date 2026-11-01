import i18n from "i18next";
import { useCallback } from "react";
import { initReactI18next, useTranslation } from "react-i18next";
import { ApiError } from "@/api/client";
import de from "./de";
import en from "./en";

export const LANGUAGES = ["en", "de"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The UI language: chosen explicitly, or German for German formats and English otherwise. */
export function uiLanguage(setting: string | null | undefined, locale: string): Language {
  if (setting === "en" || setting === "de") return setting;
  return locale.toLowerCase().startsWith("de") ? "de" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;

export function useT() {
  return useTranslation().t;
}

/** Human-readable text for an error from the core (stable codes are translated). */
export function useErrorText() {
  const t = useT();
  return useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError) {
        const key = `errors.${e.code}`;
        const text = i18n.exists(key) ? t(key) : t("errors.unknown");
        if (e.code === "validation" && e.field)
          return t("errors.validation_field", { field: e.field, message: e.message });
        return text;
      }
      return t("errors.unknown");
    },
    [t],
  );
}
