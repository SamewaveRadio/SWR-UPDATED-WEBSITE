import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Database, Package, CheckCircle2, ShoppingCart } from 'lucide-react';
import { Navigation } from './Navigation';
import { useAdminAuth } from '../contexts/AdminAuthContext';

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAdminAuth();
  const location = useLocation();
  const onOrders = location.pathname.startsWith('/admin/orders');

  return (
    <div className="min-h-screen bg-black text-white pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-light mb-1">Admin</h1>
            <p className="text-xs sm:text-sm text-white/40">Signed in as {user?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>

        <div className="flex gap-1 mb-6 border-b border-white/10 overflow-x-auto">
          <Link to="/admin" className={tabCls(!onOrders)}><Database className="w-4 h-4 inline mr-1.5" />Mixcloud</Link>
          <Link to="/admin?tab=products" className={tabCls(false)}><Package className="w-4 h-4 inline mr-1.5" />Products</Link>
          <Link to="/admin?tab=printify" className={tabCls(false)}><CheckCircle2 className="w-4 h-4 inline mr-1.5" />Printify</Link>
          <Link to="/admin/orders" className={tabCls(onOrders)}><ShoppingCart className="w-4 h-4 inline mr-1.5" />Orders</Link>
        </div>

        {children}
      </div>
    </div>
  );
}

function tabCls(active: boolean): string {
  return `px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
    active ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/70'
  }`;
}
