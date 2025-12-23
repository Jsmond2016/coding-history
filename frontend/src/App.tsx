import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout/AppLayout';
import GitStatisticsList from './pages/GitStatistics/GitStatisticsList';
import LogsList from './pages/Logs/LogsList';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/git-statistics" replace />} />
          <Route path="/git-statistics" element={<GitStatisticsList />} />
          <Route path="/logs" element={<LogsList />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
};

export default App;

