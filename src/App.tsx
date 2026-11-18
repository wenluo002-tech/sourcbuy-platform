import { useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router'
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
import Verify from './pages/Verify'
import VerifyReport from './pages/VerifyReport'
import SourcingRequest from './pages/SourcingRequest'
import QcUpload from './pages/QcUpload'
import OpsOrders from './pages/OpsOrders'
import OpsInspection from './pages/OpsInspection'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/Dashboard'
import AdminChannels from './pages/admin/Channels'
import AdminBuyers from './pages/admin/Buyers'
import AdminBuyerDetail from './pages/admin/BuyerDetail'
import AdminOrders from './pages/admin/Orders'
import AdminHealth from './pages/admin/Health'
import Layout from './components/Layout'
import { captureTouch, trackPageView } from './lib/track'

// M5：全局埋点——首次加载捕获 UTM/来源触点，之后每次路由变化上报 page_view
function PageTracker() {
  const loc = useLocation()
  const lastPath = useRef<string | null>(null)
  useEffect(() => { captureTouch() }, [])
  useEffect(() => {
    // StrictMode 双调用/同路径防抖：同一路径只记一次
    if (lastPath.current === loc.pathname) return
    lastPath.current = loc.pathname
    trackPageView(loc.pathname)
  }, [loc.pathname])
  return null
}

export default function App() {
  return (
    <>
      <PageTracker />
      <Routes>
        {/* 工厂端质检上传页：独立路由不进 Layout（无导航/无页脚，纯取证界面） */}
        <Route path="/qc/:token" element={<QcUpload />} />
        {/* M5 经营驾驶舱：独立壳，左栏导航，桌面优先 */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="channels" element={<AdminChannels />} />
          <Route path="buyers" element={<AdminBuyers />} />
          <Route path="buyers/:id" element={<AdminBuyerDetail />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="health" element={<AdminHealth />} />
        </Route>
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
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:id" element={<VerifyReport />} />
          <Route path="/sourcing/:id" element={<SourcingRequest />} />
          <Route path="/addresses" element={<Addresses />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/inquiries" element={<Inquiries />} />
          {/* 运营质检工作台（白名单闸在服务端 opsQuery，页面只兜展示） */}
          <Route path="/ops" element={<OpsOrders />} />
          <Route path="/ops/qc/:id" element={<OpsInspection />} />
        </Route>
      </Routes>
    </>
  )
}
