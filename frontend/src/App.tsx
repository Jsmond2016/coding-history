import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout/AppLayout';
import GitStatisticsList from './pages/GitStatistics/GitStatisticsList';
import LogsList from './pages/Logs/LogsList';
import TasksList from './pages/Tasks/TasksList';
import ConfigList from './pages/Config/ConfigList';

const App: React.FC = () => {
  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/git-statistics" replace />} />
          <Route path="/git-statistics" element={<GitStatisticsList />} />
          <Route path="/tasks" element={<TasksList />} />
          <Route path="/logs" element={<LogsList />} />
          <Route path="/config" element={<ConfigList />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  );
};

export default App;

