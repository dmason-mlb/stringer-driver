import { Sidebar } from './components/Sidebar'
import { StringerView } from './components/StringerView'

function App(): JSX.Element {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <StringerView />
    </div>
  )
}

export default App
