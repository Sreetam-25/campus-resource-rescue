import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Ensures that route changes scroll to the top of the viewport
export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};
