import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ShellMenuContext = createContext(null);

/**
 * Lets workspace pages (Admin, etc.) register section links into the
 * global mobile drawer so the site has one coordinated menu — not two hamburgers.
 */
export function ShellMenuProvider({ children }) {
  const [pageMenu, setPageMenu] = useState(null);

  const registerPageMenu = useCallback((menu) => {
    setPageMenu(menu);
  }, []);

  const clearPageMenu = useCallback(() => {
    setPageMenu(null);
  }, []);

  const value = useMemo(
    () => ({ pageMenu, registerPageMenu, clearPageMenu }),
    [pageMenu, registerPageMenu, clearPageMenu]
  );

  return (
    <ShellMenuContext.Provider value={value}>
      {children}
    </ShellMenuContext.Provider>
  );
}

export function useShellMenu() {
  const ctx = useContext(ShellMenuContext);
  if (!ctx) {
    return {
      pageMenu: null,
      registerPageMenu: () => {},
      clearPageMenu: () => {},
    };
  }
  return ctx;
}
