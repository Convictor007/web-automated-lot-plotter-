import React, { createContext, useContext, useEffect, useState } from 'react'
import { darkColors, lightColors, type AppThemeColors } from './colors'

const THEME_STORAGE_KEY = 'lot-plotter-theme'

type ThemeContextType = {
  isDarkMode: boolean
  toggleTheme: () => void
  colors: AppThemeColors
}

const ThemeContext = createContext<ThemeContextType>({
  isDarkMode: false,
  toggleTheme: () => {},
  colors: lightColors,
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'dark') setIsDarkMode(true)
    } catch {
      // ignore
    }
  }, [])

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light')
      } catch {
        // ignore
      }
      return next
    })
  }

  const colors: AppThemeColors = isDarkMode ? darkColors : lightColors

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}
