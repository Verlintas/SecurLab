import { create } from 'zustand'
import i18n from '../i18n'

export type Page = 'dashboard' | 'lab' | 'run' | 'reports' | 'forensics' | 'settings'

export type Lang = 'zh-CN' | 'en'

interface UiState {
  page: Page
  lang: Lang
  setPage: (page: Page) => void
  toggleLang: () => void
}

export const useUi = create<UiState>((set, get) => ({
  page: 'dashboard',
  lang: 'zh-CN',
  setPage: (page) => set({ page }),
  toggleLang: () => {
    const next: Lang = get().lang === 'zh-CN' ? 'en' : 'zh-CN'
    void i18n.changeLanguage(next)
    set({ lang: next })
  }
}))
