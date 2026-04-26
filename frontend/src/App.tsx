import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout/AppLayout';
import DataOverview from './pages/DataOverview';
import GitStatisticsList from './pages/GitStatistics/GitStatisticsList';
import LogsList from './pages/Logs/LogsList';
import TasksList from './pages/Tasks/TasksList';
import ConfigList from './pages/Config/ConfigList';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/data-overview" replace />} />
          <Route path="/data-overview" element={<DataOverview />} />
          <Route path="/git-statistics" element={<GitStatisticsList />} />
          <Route path="/tasks" element={<TasksList />} />
          <Route path="/logs" element={<LogsList />} />
          <Route path="/config" element={<ConfigList />} />
          <Route path="*" element={<Navigate to="/data-overview" replace />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
};

export default App;
