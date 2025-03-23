
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { FileX, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="glass-card p-12 max-w-md w-full text-center">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <FileX className="h-8 w-8 text-destructive" />
        </div>
        
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-lg mb-8 text-muted-foreground">Oops! Page not found</p>
        
        <Link 
          to="/" 
          className="glass-button px-6 py-3 inline-flex items-center justify-center font-medium"
        >
          <Home className="mr-2 h-4 w-4" />
          Return Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
