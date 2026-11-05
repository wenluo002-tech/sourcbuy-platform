import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Factories from './pages/Factories'
import FactoryDetail from './pages/FactoryDetail'
import Calculator from './pages/Calculator'
import BuyerChat from './pages/BuyerChat'
import ProductDetail from './pages/ProductDetail'
import Radar from './pages/Radar'
import Login from './pages/Login'
import Layout from './components/Layout'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/buyer" element={<BuyerChat />} />
        <Route path="/radar" element={<Radar />} />
        <Route path="/factories" element={<Factories />} />
        <Route path="/factories/:id" element={<FactoryDetail />} />
        <Route path="/products/:offerId" element={<ProductDetail />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/login" element={<Login />} />
      </Route>
    </Routes>
  )
}
