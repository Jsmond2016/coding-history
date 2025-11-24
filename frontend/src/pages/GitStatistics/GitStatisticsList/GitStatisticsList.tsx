import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMount } from 'ahooks';
import { message, Empty, Spin } from 'antd';
import { Card } from 'antd';
import { StatisticsFilter } from './components/StatisticsFilter';
import { StatisticsCards } from './components/StatisticsCards';
import { CommitsByDateList } from './components/CommitsByDateList';
import { 
  filterAtom, 
  statisticsAtom,
  repositoriesAtom 
} from '../../../biz/atoms/gitStatistics.atom';
import { gitStatisticsApi } from '../../../services/gitStatisticsApi';
import type { CommitsByDate } from '../../../types/gitStatistics';

const GitStatisticsList: React.FC = () => {
  const filter = useAtomValue(filterAtom);
  const setStatistics = useSetAtom(statisticsAtom);
  const setRepositories = useSetAtom(repositoriesAtom);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [commitsByDate, setCommitsByDate] = React.useState<CommitsByDate[]>([]);

  // 加载数据
  const handleSearch = React.useCallback(async () => {
    const startDate = filter.dateRange[0].valueOf();
    const endDate = filter.dateRange[1].valueOf();
    const repositoryIds = filter.repositoryIds.length > 0 ? filter.repositoryIds : undefined;
    const isOvertime = filter.isOvertime;

    console.log('[Frontend] Search params:', {
      startDate,
      endDate,
      repositoryIds,
      isOvertime,
      dateRange: [
        filter.dateRange[0].format('YYYY-MM-DD'),
        filter.dateRange[1].format('YYYY-MM-DD')
      ]
    });

    setLoading(true);
    setHasSearched(true);

    try {
      // 并行加载提交记录和统计数据
      const [commitsByDateResult, statisticsResult] = await Promise.all([
        gitStatisticsApi.getCommitsByDate({
          startDate,
          endDate,
          repositoryIds,
          isOvertime
        }),
        gitStatisticsApi.getStatistics({
          startDate,
          endDate,
          repositoryIds
        })
      ]);

      console.log('[Frontend] Search results:', {
        total: commitsByDateResult.total,
        dateCount: commitsByDateResult.data.length,
        totalCommits: statisticsResult.totalCommits
      });

      setCommitsByDate(commitsByDateResult.data);
      setStatistics(statisticsResult);
    } catch (error) {
      console.error('[Frontend] Search error:', error);
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [
    filter,
    setStatistics
  ]);

  // 加载仓库列表
  useMount(async () => {
    try {
      const repos = await gitStatisticsApi.getRepositories();
      setRepositories(repos);
      // 自动执行一次搜索
      await handleSearch();
    } catch (error) {
      message.error('加载仓库列表失败');
    }
  });


  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 24 }}>
        <StatisticsFilter onSearch={handleSearch} />
      </Card>
      
      {hasSearched ? (
        <>
          <StatisticsCards />
          <Card title="提交记录（按日期分组）" style={{ marginTop: 24 }}>
            <Spin spinning={loading}>
              <CommitsByDateList data={commitsByDate} loading={loading} />
            </Spin>
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

