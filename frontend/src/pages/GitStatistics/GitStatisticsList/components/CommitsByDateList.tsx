import React from 'react';
import { Collapse, Tag, Tooltip, Space, Typography, Tabs } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
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

export const CommitsByDateList: React.FC<CommitsByDateListProps> = ({ data, loading }) => {
  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>;
  }

  if (!data || data.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center' }}>暂无数据</div>;
  }

  return (
    <Collapse 
      defaultActiveKey={[data[0]?.date]} 
      style={{ background: '#fff' }}
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

        // 获取仓库列表（用于 Tabs）
        const repoNames = Object.keys(commitsByRepoAndBranch);
        const defaultActiveKey = repoNames[0] || '';

        return (
          <Panel
            key={date}
            header={
              <Space size="large" wrap>
                <Text strong style={{ fontSize: 16 }}>
                  {dayjs(date).format('YYYY年MM月DD日 dddd')}
                </Text>
                <Text type="secondary">
                  共 {totalCommits} 条提交
                </Text>
                {/* 工作状态标签 */}
                <Tag color={workStatusColors[workStatus]}>
                  {workStatusLabels[workStatus]}
                </Tag>
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
                        <div style={{ marginBottom: 8, fontWeight: 'bold' }}>加班提交时间：</div>
                        {latestOvertimeCommits && latestOvertimeCommits.length > 0 ? (
                          latestOvertimeCommits.map((time, idx) => (
                            <div key={idx} style={{ marginBottom: 4 }}>• {time}</div>
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
                      style={{ cursor: 'pointer' }}
                    >
                      又加班 ({overtimeCount}次)
                    </Tag>
                  </Tooltip>
                )}
              </Space>
            }
          >
            {commits.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                该日期暂无提交记录
              </div>
            ) : (
              <Tabs defaultActiveKey={defaultActiveKey} type="card">
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
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
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
                        style={{ marginTop: 8 }}
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
                                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                                    ({branchCommits.length})
                                  </Text>
                                </span>
                              }
                              key={branch}
                            >
                              <div style={{ maxHeight: shouldScroll ? 500 : 'auto', overflowY: 'auto', marginTop: 8 }}>
                                {branchCommits.map((commit) => (
                                  <div
                                    key={commit.id}
                                    style={{
                                      padding: '12px 16px',
                                      marginLeft: 16,
                                      borderLeft: '3px solid #1890ff',
                                      marginBottom: 8,
                                      backgroundColor: '#fafafa',
                                      borderRadius: 4
                                    }}
                                  >
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                      <Space size="middle" wrap>
                                        <Text code>{commit.commitHash?.substring(0, 7) || '-'}</Text>
                                        <Text style={{ color: '#1890ff', fontWeight: 500 }}>
                                          {dayjs(commit.commitDate).format('HH:mm:ss')}
                                        </Text>
                                        {commit.branch && (
                                          <Tag color="geekblue">🌿 {commit.branch}</Tag>
                                        )}
                                        {commit.isOvertime && (
                                          <Tag color="red">加班</Tag>
                                        )}
                                      </Space>
                                      
                                      <Text style={{ fontSize: 14 }}>{commit.message}</Text>
                                      
                                      <Space size="large">
                                        <Text type="secondary">
                                          文件变更: {commit.filesChanged}
                                        </Text>
                                        <Text style={{ color: '#52c41a', fontWeight: 500 }}>
                                          +{commit.insertions}
                                        </Text>
                                        <Text style={{ color: '#ff4d4f', fontWeight: 500 }}>
                                          -{commit.deletions}
                                        </Text>
                                      </Space>
                                    </Space>
                                  </div>
                                ))}
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

