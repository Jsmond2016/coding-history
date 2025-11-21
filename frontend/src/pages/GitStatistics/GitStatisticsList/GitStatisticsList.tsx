import React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useMount } from 'ahooks';
import { message } from 'antd';
import { Card } from 'antd';
import { StatisticsFilter } from './components/StatisticsFilter';
import { StatisticsCards } from './components/StatisticsCards';
import { CommitsTable } from './components/CommitsTable';
import { 
  filterAtom, 
  commitsTableAtom, 
  statisticsAtom,
  repositoriesAtom 
} from '../../../biz/atoms/gitStatistics.atom';
import { gitStatisticsApi } from '../../../services/gitStatisticsApi';
import type { CommitsQuery } from '../../../types/gitStatistics';

const GitStatisticsList: React.FC = () => {
  const filter = useAtomValue(filterAtom);
  const [tableState, setTableState] = useAtom(commitsTableAtom);
  const setStatistics = useSetAtom(statisticsAtom);
  const setRepositories = useSetAtom(repositoriesAtom);

  // 加载仓库列表
  useMount(async () => {
    try {
      const repos = await gitStatisticsApi.getRepositories();
      setRepositories(repos);
    } catch (error) {
      message.error('加载仓库列表失败');
    }
  });

  // 加载数据
  const loadData = React.useCallback(async () => {
    const startDate = filter.dateRange[0].valueOf();
    const endDate = filter.dateRange[1].valueOf();
    const repositoryIds = filter.repositoryIds.length > 0 ? filter.repositoryIds : undefined;
    const page = tableState.pagination.current;
    const pageSize = tableState.pagination.pageSize;

    const query: CommitsQuery = {
      startDate,
      endDate,
      repositoryIds,
      page,
      pageSize
    };

    setTableState(prev => ({ ...prev, loading: true }));

    try {
      // 并行加载提交记录和统计数据
      const [commitsResult, statisticsResult] = await Promise.all([
        gitStatisticsApi.getCommits(query),
        gitStatisticsApi.getStatistics({
          startDate,
          endDate,
          repositoryIds
        })
      ]);

      setTableState({
        data: commitsResult.data,
        pagination: {
          current: page,
          pageSize,
          total: commitsResult.total
        },
        loading: false
      });

      setStatistics(statisticsResult);
    } catch (error) {
      message.error('加载数据失败');
      setTableState(prev => ({ ...prev, loading: false }));
    }
  }, [
    filter.dateRange,
    filter.repositoryIds,
    tableState.pagination.current,
    tableState.pagination.pageSize,
    setTableState,
    setStatistics
  ]);

  // 当筛选条件变化时重新加载数据
  React.useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 24 }}>
        <StatisticsFilter />
      </Card>
      
      <StatisticsCards />
      
      <Card>
        <CommitsTable />
      </Card>
    </div>
  );
};

export default GitStatisticsList;

