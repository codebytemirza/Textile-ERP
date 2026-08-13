import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import {
  LayoutDashboard,
  Package,
  Factory,
  Layers,
  Store,
  Briefcase,
  BookOpen,
  Settings,
  Users,
} from "lucide-react";

export function Sidebar() {
  const { user } = useAuth();
  const isAdminOrManager = user?.role === 'Admin' || user?.role === 'Manager';

  return (
    <aside className="w-64 bg-neutral-900 text-neutral-100 flex flex-col shrink-0">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Factory className="w-6 h-6 text-blue-400" />
          Textile ERP
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />

        {isAdminOrManager && (
          <>
            <NavItem to="/yarn" icon={<Package size={20} />} label="Yarn Inventory" />
            <NavItem to="/production" icon={<Factory size={20} />} label="Production Lots" />
            <NavItem to="/inventory" icon={<Layers size={20} />} label="Finished Fabrics" />
          </>
        )}

        <NavItem to="/retail" icon={<Store size={20} />} label="Retail POS" />

        {isAdminOrManager && (
          <>
            <NavItem to="/wholesale" icon={<Briefcase size={20} />} label="Wholesale" />
            <NavItem to="/customers" icon={<Users size={20} />} label="Customers" />
            <NavItem to="/ledgers" icon={<BookOpen size={20} />} label="Ledgers" />
            <NavItem to="/users" icon={<Users size={20} />} label="Users" />
            <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
          </>
        )}
      </nav>

      <div className="p-4 border-t border-neutral-800">
        <p className="text-sm text-neutral-400">Logged in as:</p>
        <p className="font-medium truncate">{user?.name}</p>
        <span className="inline-block px-2 py-1 mt-1 text-xs font-semibold bg-neutral-800 rounded-md">
          {user?.role}
        </span>
      </div>
    </aside>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
          isActive ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
