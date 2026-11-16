import { useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ManagerDashboard from './pages/ManagerDashboard.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';

export default function App() {
  const { session, ready } = useAuth();

  if (!ready) return null;
  if (!session) return <LoginPage />;

  const isDashboardRole = ['admin', 'MD', 'manager', 'sales manager', 'sales_manager'].includes(
    session.user.role
  );
  return isDashboardRole ? <ManagerDashboard /> : <EmployeeDashboard />;
}
