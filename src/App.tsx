import { ThemeProvider } from '@/theme/ThemeProvider'
import LotPlotterPage from '@/features/lot-plotter/LotPlotterPage'
import './App.css'

export default function App() {
  return (
    <ThemeProvider>
      <LotPlotterPage />
    </ThemeProvider>
  )
}
