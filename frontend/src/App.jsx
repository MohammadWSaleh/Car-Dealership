import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Catalogue from './pages/Catalogue.jsx';
import TrimDetail from './pages/TrimDetail.jsx';
import Compare from './pages/Compare.jsx';
import EVCheck from './pages/EVCheck.jsx';
import { Login, Register } from './pages/Auth.jsx';
import TestDriveManage from './pages/TestDriveManage.jsx';
import Refer from './pages/Refer.jsx';
const Account = lazy(() => import('./pages/Account.jsx'));
const Console = lazy(() => import('./staff/Console.jsx'));
const Lazy = ({ children }) => <Suspense fallback={<Spinner />}>{children}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login landing />} />
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route element={<Layout />}>
        <Route path="home" element={<Home />} />
        <Route path="cars" element={<Catalogue />} />
        <Route path="cars/:id" element={<TrimDetail />} />
        <Route path="compare" element={<Compare />} />
        <Route path="ev-check" element={<EVCheck />} />
        <Route path="test-drive/manage" element={<TestDriveManage />} />
        <Route path="refer/:code" element={<Refer />} />
        <Route path="account/*" element={<Lazy><Account /></Lazy>} />
        <Route path="staff/*" element={<Lazy><Console /></Lazy>} />
        <Route path="*" element={<div className="py-20 text-center text-slate-500">404</div>} />
      </Route>
    </Routes>
  );
}
