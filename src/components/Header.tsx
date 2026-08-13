import { LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function Header() {
  const { logout, user } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-6 shrink-0">
      <div className="font-medium text-neutral-800">Textile Trading System</div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-neutral-500 hidden sm:inline">{user?.email}</span>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </header>
  );
}
