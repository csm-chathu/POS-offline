import { createBrowserRouter, createHashRouter, Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectToken, selectRole } from '../features/auth/authSlice';
import AppLayout      from '../layouts/AppLayout';
import CashierLayout  from '../layouts/CashierLayout';
import GuestLayout    from '../layouts/GuestLayout';
import Login       from '../pages/Login';
import Dashboard   from '../pages/Dashboard';
import ProductsIndex  from '../pages/products/Index';
import ProductCreate  from '../pages/products/Create';
import ProductEdit    from '../pages/products/Edit';
import ProductIntake  from '../pages/products/Intake';
import SalesIndex     from '../pages/sales/Index';
import SalesCreate    from '../pages/sales/Create';
import SalesCreate2   from '../pages/sales/Create2';
import SalesCreate3   from '../pages/sales/Create3';
import SalesShow      from '../pages/sales/Show';
import CustomersIndex  from '../pages/customers/Index';
import CustomerCredit  from '../pages/customers/Credit';
import CreditIndex     from '../pages/credit/Index';
import PurchasesIndex from '../pages/purchases/Index';
import PurchasesCreate from '../pages/purchases/Create';
import PurchasesShow   from '../pages/purchases/Show';
import Reports         from '../pages/reports/Index';
import UsersIndex     from '../pages/users/Index';
import SuppliersIndex   from '../pages/suppliers/Index';
import CategoriesIndex  from '../pages/categories/Index';
import ImportDataPage   from '../pages/admin/ImportData';
import Settings         from '../pages/Settings';
import RolesPage        from '../pages/settings/Roles';
import InvoicesIndex    from '../pages/invoices/Index';
import InvoiceCreate    from '../pages/invoices/Create';
import InvoiceShow      from '../pages/invoices/Show';

function ProtectedRoute() {
  const token = useSelector(selectToken);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

function POSRoute() {
  const iface = localStorage.getItem('pos_interface') || '1';
  return iface === '3' ? <SalesCreate3 /> : iface === '2' ? <SalesCreate2 /> : <SalesCreate />;
}

function RoleLayout() {
  const role = useSelector(selectRole);
  return role === 'cashier' ? <CashierLayout /> : <AppLayout />;
}

function AdminRoute() {
  const role = useSelector(selectRole);
  return (role === 'admin' || role === 'manager' || role === 'custom') ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

function AdminOnlyRoute() {
  const role = useSelector(selectRole);
  return role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

// Electron's packaged renderer loads index.html via the `file://` protocol,
// where `window.location.pathname` resolves to the absolute file path on
// disk instead of `/`. createBrowserRouter can never match a route against
// that, so it falls straight to the router's default 404 error screen.
// createHashRouter keeps all routing state after a `#`, which is untouched
// by `file://` resolution, so it works correctly in the packaged app. The
// web/PWA build still gets clean URLs via createBrowserRouter.
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
const createAppRouter = isElectron ? createHashRouter : createBrowserRouter;

export const router = createAppRouter([
  {
    path: '/login',
    element: <GuestLayout><Login /></GuestLayout>,
  },
  {
    element: <ProtectedRoute />,
    children: [{
      element: <RoleLayout />,
      children: [
        { index: true,                  element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard',            element: <Dashboard /> },
        { path: 'sales',                element: <SalesIndex /> },
        { path: 'sales/create',         element: <POSRoute /> },
        { path: 'sales/:id',            element: <SalesShow /> },
        { path: 'products',             element: <ProductsIndex /> },
        { path: 'products/create',      element: <ProductCreate /> },
        { path: 'products/intake',      element: <ProductIntake /> },
        { path: 'products/:id/edit',    element: <ProductEdit /> },
        { path: 'customers',            element: <CustomersIndex /> },
        { path: 'customers/:id/credit', element: <CustomerCredit /> },
        { path: 'credit',               element: <CreditIndex /> },
        { path: 'purchases',            element: <PurchasesIndex /> },
        { path: 'purchases/create',     element: <PurchasesCreate /> },
        { path: 'purchases/:id',        element: <PurchasesShow /> },
        { path: 'suppliers',            element: <SuppliersIndex /> },
        { path: 'categories',           element: <CategoriesIndex /> },
        {
          element: <AdminRoute />,
          children: [
            { path: 'reports',  element: <Reports /> },
            { path: 'users',    element: <UsersIndex /> },
            { path: 'settings', element: <Settings /> },
            { path: 'settings/roles', element: <RolesPage /> },
            { path: 'invoices', element: <InvoicesIndex /> },
            { path: 'invoices/create', element: <InvoiceCreate /> },
            { path: 'invoices/:id', element: <InvoiceShow /> },
            {
              element: <AdminOnlyRoute />,
              children: [
                { path: 'admin/data-import', element: <ImportDataPage /> },
              ],
            },
          ],
        },
      ],
    }],
  },
]);
