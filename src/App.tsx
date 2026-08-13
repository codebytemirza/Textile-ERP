import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { YarnInventoryPage } from './pages/YarnInventory';
import { ProductionLots } from './pages/ProductionLots';
import { FinishedInventory } from './pages/FinishedInventory';
import { RetailSales } from './pages/RetailSales';
import { WholesaleSales } from './pages/WholesaleSales';
import { Customers } from './pages/Customers';
import { Ledgers } from './pages/Ledgers';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';

function ProtectedRoute({ allowedRoles }: { allowedRoles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />

              <Route element={<ProtectedRoute allowedRoles={['Admin', 'Manager']} />}>
                <Route path="/yarn" element={<YarnInventoryPage />} />
                <Route path="/production" element={<ProductionLots />} />
                <Route path="/inventory" element={<FinishedInventory />} />
                <Route path="/wholesale" element={<WholesaleSales />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/ledgers" element={<Ledgers />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/users" element={<Users />} />
              </Route>

              <Route path="/retail" element={<RetailSales />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
