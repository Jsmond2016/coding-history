import React from 'react';

interface LayoutContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export const LayoutContext = React.createContext<LayoutContextValue>({
  collapsed: false,
  setCollapsed: () => {}
});

export const LayoutProvider: React.FC<{ 
  children: React.ReactNode; 
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}> = ({ children, collapsed, setCollapsed }) => {
  return (
    <LayoutContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayoutContext = () => React.useContext(LayoutContext);
