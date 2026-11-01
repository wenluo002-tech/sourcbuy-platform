import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Factories from './pages/Factories'
import FactoryDetail from './pages/FactoryDetail'
import Calculator from './pages/Calculator'
import Layout from './components/Layout'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/factories" element={<Factories />} />
        <Route path="/factories/:id" element={<FactoryDetail />} />
        <Route path="/calculator" element={<Calculator />} />
      </Route>
    </Routes>
  )
}
