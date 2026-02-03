import React from 'react';

interface ScanContextValue {
  onScanComplete?: () => void;
}

export const ScanContext = React.createContext<ScanContextValue>({});

export const ScanProvider: React.FC<{ children: React.ReactNode; onScanComplete?: () => void }> = ({ 
  children, 
  onScanComplete 
}) => {
  return (
    <ScanContext.Provider value={{ onScanComplete }}>
      {children}
    </ScanContext.Provider>
  );
};

export const useScanContext = () => React.useContext(ScanContext);
