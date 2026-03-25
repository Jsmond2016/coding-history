import React from 'react';
import { Collapse, Tag, Tooltip, Space, Typography, Tabs } from 'antd';
import { ClockCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CommitsByDate, Commit, WorkStatus } from '../../../../types/gitStatistics';

const { Panel } = Collapse;
const { Text } = Typography;
const { TabPane } = Tabs;

// 工作状态显示文本（中文）
const workStatusLabels: Record<WorkStatus, string> = {
  relaxed: '轻松',
  normal: '正常',
  busy: '忙碌',
  crazy: '疯狂',
  overtime: '加班',
  superCrazyOvertime: '超级疯狂加班'
};

// 工作状态提示文本
const workStatusTips: Record<WorkStatus, string> = {
  relaxed: '当日提交次数 < 6 次，且无加班记录',
  normal: '当日提交次数 >= 6 次且 < 10 次，且无加班记录',
  busy: '当日提交次数 >= 10 次且 < 15 次，且无加班记录',
  crazy: '当日提交次数 >= 15 次且 < 20 次，且无加班记录',
  overtime: '当日有提交时间 >= 19:00 的记录',
  superCrazyOvertime: '当日提交次数 >= 20 次，且有加班记录'
};

// 工作状态标签颜色
const workStatusColors: Record<WorkStatus, string> = {
  relaxed: 'green',
  normal: 'blue',
  busy: 'orange',
  crazy: 'red',
  overtime: 'red',
  superCrazyOvertime: 'magenta' // 使用紫色/洋红色来突出显示超级疯狂加班
};

interface CommitsByDateListProps {
  data: CommitsByDate[];
  loading: boolean;
}

const OVERVIEW_TAB_KEY = '__overview__';

function renderCommitBlock(commit: Commit, options?: { showRepo?: boolean }) {
  const { showRepo } = options ?? {};
  return (
    <div
      key={commit.id}
      className="py-3 px-4 ml-4 border-l-[3px] border-l-[#1890ff] mb-2 bg-[#fafafa] rounded"
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space size="middle" wrap>
          {showRepo && (
            <Tag color="processing">{commit.repoName}</Tag>
          )}
          <Text code>{commit.commitHash?.substring(0, 7) || '-'}</Text>
          <Text className="text-[#1890ff] font-medium">
            {dayjs(commit.commitDate).format('HH:mm:ss')}
          </Text>
          {commit.branch && (
            <Tag color="geekblue">🌿 {commit.branch}</Tag>
          )}
          {commit.isOvertime && (
            <Tag color="red">加班</Tag>
          )}
        </Space>

        <Text className="text-sm">{commit.message}</Text>

        <Space size="large">
          <Text type="secondary">
            文件变更: {commit.filesChanged}
          </Text>
          <Text className="text-[#52c41a] font-medium">
            +{commit.insertions}
          </Text>
          <Text className="text-[#ff4d4f] font-medium">
            -{commit.deletions}
          </Text>
        </Space>
      </Space>
    </div>
  );
}

export const CommitsByDateList: React.FC<CommitsByDateListProps> = ({ data, loading }) => {
  if (loading) {
    return <div className="p-6 text-center">加载中...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="p-6 text-center">暂无数据</div>;
  }

  return (
    <Collapse 
      defaultActiveKey={[data[0]?.date]} 
      className="bg-white"
    >
      {data.map((dateGroup) => {
        const { date, commits, totalCommits, overtimeCount, latestOvertimeCommits, workStatus, hasRelease, repositories, branches } = dateGroup;
        
        // 按仓库分组，然后按分支分组
        const commitsByRepoAndBranch = commits.reduce((acc, commit) => {
          if (!acc[commit.repoName]) {
            acc[commit.repoName] = {};
          }
          const branchKey = commit.branch || 'unknown';
          if (!acc[commit.repoName][branchKey]) {
            acc[commit.repoName][branchKey] = [];
          }
          acc[commit.repoName][branchKey].push(commit);
          return acc;
        }, {} as Record<string, Record<string, Commit[]>>);
        
        // 对每个仓库每个分支的commits按时间降序排序
        Object.keys(commitsByRepoAndBranch).forEach(repoName => {
          Object.keys(commitsByRepoAndBranch[repoName]).forEach(branch => {
            commitsByRepoAndBranch[repoName][branch].sort((a, b) => b.commitDate - a.commitDate);
          });
        });

        // 获取仓库列表（用于 Tabs）；首项为「全览」按时间线从早到晚
        const repoNames = Object.keys(commitsByRepoAndBranch);
        const timelineCommits = [...commits].sort((a, b) => a.commitDate - b.commitDate);
        const defaultActiveKey = OVERVIEW_TAB_KEY;

        return (
          <Panel
            key={date}
            header={
              <Space size="large" wrap>
                <Text strong className="text-base">
                  {dayjs(date).format('YYYY年MM月DD日 dddd')}
                </Text>
                <Text type="secondary">
                  共 {totalCommits} 条提交
                </Text>
                {/* 工作状态标签 */}
                <Tooltip title={workStatusTips[workStatus]}>
                  <Tag color={workStatusColors[workStatus]}>
                    {workStatusLabels[workStatus]}
                    <QuestionCircleOutlined className="ml-1 text-[10px]" />
                  </Tag>
                </Tooltip>
                {hasRelease && (
                  <Tag color="purple">发版</Tag>
                )}
                {/* 显示当日修改的仓库标签 */}
                {repositories && repositories.length > 0 && (
                  <>
                    {repositories.map((repoName, idx) => {
                      // 使用不同颜色区分不同仓库
                      const colors = ['blue', 'green', 'orange', 'cyan', 'purple', 'magenta', 'red', 'volcano', 'gold', 'lime'];
                      const colorIndex = idx % colors.length;
                      return (
                        <Tag key={repoName} color={colors[colorIndex]}>
                          {repoName}
                        </Tag>
                      );
                    })}
                  </>
                )}
                {/* 显示当日修改的分支标签 */}
                {branches && branches.length > 0 && (
                  <>
                    {branches.map((branch, idx) => {
                      // 使用不同颜色区分不同分支
                      const branchColors = ['geekblue', 'cyan', 'purple', 'magenta', 'volcano', 'gold'];
                      const colorIndex = idx % branchColors.length;
                      return (
                        <Tag key={branch} color={branchColors[colorIndex]}>
                          🌿 {branch}
                        </Tag>
                      );
                    })}
                  </>
                )}
                {overtimeCount > 0 && (
                  <Tooltip 
                    title={
                      <div>
                        <div className="mb-2 font-bold">加班提交时间：</div>
                        {latestOvertimeCommits && latestOvertimeCommits.length > 0 ? (
                          latestOvertimeCommits.map((time, idx) => (
                            <div key={idx} className="mb-1">• {time}</div>
                          ))
                        ) : (
                          <div>暂无数据</div>
                        )}
                      </div>
                    }
                  >
                    <Tag 
                      color="red" 
                      icon={<ClockCircleOutlined />}
                      className="cursor-pointer"
                    >
                      又加班 ({overtimeCount}次)
                    </Tag>
                  </Tooltip>
                )}
              </Space>
            }
          >
            {commits.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                该日期暂无提交记录
              </div>
            ) : (
              <Tabs defaultActiveKey={defaultActiveKey} type="card">
                <TabPane
                  tab={
                    <span>
                      全览
                      <Text type="secondary" className="ml-2 text-xs">
                        ({totalCommits})
                      </Text>
                    </span>
                  }
                  key={OVERVIEW_TAB_KEY}
                >
                  <p className="mb-3 text-sm text-neutral-500">
                    按提交时间从早到晚排列，便于查看当日跨仓库的工作顺序。
                  </p>
                  <div
                    className={
                      timelineCommits.length > 10
                        ? 'max-h-[500px] overflow-y-auto'
                        : ''
                    }
                  >
                    {timelineCommits.map((c) => renderCommitBlock(c, { showRepo: true }))}
                  </div>
                </TabPane>
                {repoNames.map((repoName) => {
                  const repoBranches = commitsByRepoAndBranch[repoName];
                  const branchNames = Object.keys(repoBranches);
                  const totalRepoCommits = Object.values(repoBranches).reduce((sum, commits) => sum + commits.length, 0);
                  const defaultBranchKey = branchNames[0] || '';
                  
                  return (
                    <TabPane 
                      tab={
                        <span>
                          {repoName}
                          <Text type="secondary" className="ml-2 text-xs">
                            ({totalRepoCommits})
                          </Text>
                        </span>
                      } 
                      key={repoName}
                    >
                      {/* 按分支分组展示 */}
                      <Tabs 
                        defaultActiveKey={defaultBranchKey} 
                        type="line"
                        size="small"
                        className="mt-2"
                      >
                        {branchNames.map((branch) => {
                          const branchCommits = repoBranches[branch];
                          const shouldScroll = branchCommits.length > 10;
                          const branchDisplayName = branch === 'unknown' ? '未知分支' : branch;
                          
                          return (
                            <TabPane
                              tab={
                                <span>
                                  🌿 {branchDisplayName}
                                  <Text type="secondary" className="ml-2 text-xs">
                                    ({branchCommits.length})
                                  </Text>
                                </span>
                              }
                              key={branch}
                            >
                              <div className={`${shouldScroll ? 'max-h-[500px] overflow-y-auto' : ''} mt-2`}>
                                {branchCommits.map((commit) => renderCommitBlock(commit))}
                              </div>
                            </TabPane>
                          );
                        })}
                      </Tabs>
                    </TabPane>
                  );
                })}
              </Tabs>
            )}
          </Panel>
        );
      })}
    </Collapse>
  );
};

