import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Factories from './pages/Factories'
import FactoryDetail from './pages/FactoryDetail'
import Calculator from './pages/Calculator'
import BuyerChat from './pages/BuyerChat'
import ProductDetail from './pages/ProductDetail'
import Radar from './pages/Radar'
import Login from './pages/Login'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Dashboard from './pages/Dashboard'
import Addresses from './pages/Addresses'
import Notifications from './pages/Notifications'
import Inquiries from './pages/Inquiries'
import QcUpload from './pages/QcUpload'
import OpsOrders from './pages/OpsOrders'
import OpsInspection from './pages/OpsInspection'
import Layout from './components/Layout'

export default function App() {
  return (
    <Routes>
      {/* 工厂端质检上传页：独立路由不进 Layout（无导航/无页脚，纯取证界面） */}
      <Route path="/qc/:token" element={<QcUpload />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/buyer" element={<BuyerChat />} />
        <Route path="/radar" element={<Radar />} />
        <Route path="/factories" element={<Factories />} />
        <Route path="/factories/:id" element={<FactoryDetail />} />
        <Route path="/products/:offerId" element={<ProductDetail />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/login" element={<Login />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/addresses" element={<Addresses />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/inquiries" element={<Inquiries />} />
        {/* 运营质检工作台（白名单闸在服务端 opsQuery，页面只兜展示） */}
        <Route path="/ops" element={<OpsOrders />} />
        <Route path="/ops/qc/:id" element={<OpsInspection />} />
      </Route>
    </Routes>
  )
}
