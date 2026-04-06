import './App.css'
import { GraphCanvas } from '@/components/GraphCanvas'
import { GraphControls } from '@/components/GraphControls'

function App() {
  return (
    <div className="app-layout">
      <GraphControls />
      <main className="canvas-panel">
        <GraphCanvas />
      </main>
    </div>
  )
}

export default App
