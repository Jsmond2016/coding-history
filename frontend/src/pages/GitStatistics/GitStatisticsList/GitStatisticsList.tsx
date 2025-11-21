import React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useMount } from 'ahooks';
import { message, Empty } from 'antd';
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
  const [hasSearched, setHasSearched] = React.useState(false);

  // 加载仓库列表
  useMount(async () => {
    try {
      const repos = await gitStatisticsApi.getRepositories();
      setRepositories(repos);
      // 自动执行一次搜索
      handleSearch();
    } catch (error) {
      message.error('加载仓库列表失败');
    }
  });

  // 加载数据
  const handleSearch = React.useCallback(async () => {
    const startDate = filter.dateRange[0].valueOf();
    const endDate = filter.dateRange[1].valueOf();
    const repositoryIds = filter.repositoryIds.length > 0 ? filter.repositoryIds : undefined;
    const page = 1; // 搜索时重置到第一页
    const pageSize = tableState.pagination.pageSize;

    const query: CommitsQuery = {
      startDate,
      endDate,
      repositoryIds,
      page,
      pageSize
    };

    setTableState(prev => ({ ...prev, loading: true }));
    setHasSearched(true);

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
    tableState.pagination.pageSize,
    setTableState,
    setStatistics
  ]);

  // 翻页时加载数据
  const handlePageChange = React.useCallback(async (page: number, pageSize: number) => {
    const startDate = filter.dateRange[0].valueOf();
    const endDate = filter.dateRange[1].valueOf();
    const repositoryIds = filter.repositoryIds.length > 0 ? filter.repositoryIds : undefined;

    const query: CommitsQuery = {
      startDate,
      endDate,
      repositoryIds,
      page,
      pageSize
    };

    setTableState(prev => ({ ...prev, loading: true }));

    try {
      const commitsResult = await gitStatisticsApi.getCommits(query);
      setTableState({
        data: commitsResult.data,
        pagination: {
          current: page,
          pageSize,
          total: commitsResult.total
        },
        loading: false
      });
    } catch (error) {
      message.error('加载数据失败');
      setTableState(prev => ({ ...prev, loading: false }));
    }
  }, [filter.dateRange, filter.repositoryIds, setTableState]);

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 24 }}>
        <StatisticsFilter onSearch={handleSearch} />
      </Card>
      
      {hasSearched ? (
        <>
          <StatisticsCards />
          <Card>
            <CommitsTable onPageChange={handlePageChange} />
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="请选择时间范围和仓库，然后点击搜索按钮查看统计数据" />
        </Card>
      )}
    </div>
  );
};

export default GitStatisticsList;

