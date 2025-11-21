import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import GitStatisticsList from './pages/GitStatistics/GitStatisticsList';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GitStatisticsList />} />
        <Route path="/git-statistics" element={<GitStatisticsList />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;

