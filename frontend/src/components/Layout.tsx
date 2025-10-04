import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import BottomNavigation from "./BottomNavigation";
import AuthRequired from "./AuthRequired";
import LoadingSpinner from "./LoadingSpinner";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check for deep link redirect after authentication
    if (isAuthenticated) {
      const redirectPath = sessionStorage.getItem("deepLinkRedirect");
      if (redirectPath) {
        sessionStorage.removeItem("deepLinkRedirect");
        navigate(redirectPath);
      }
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <AuthRequired />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Main content area */}
      <main className="flex-1 pb-16 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <BottomNavigation />
    </div>
  );
}
