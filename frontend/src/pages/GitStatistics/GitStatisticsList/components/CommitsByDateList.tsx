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
  relaxed: '悠闲',
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
        const { date, commits, totalCommits, overtimeCount, latestOvertimeCommits, workStatus } = dateGroup;
        
        // 按仓库分组
        const commitsByRepo = commits.reduce((acc, commit) => {
          if (!acc[commit.repoName]) {
            acc[commit.repoName] = [];
          }
          acc[commit.repoName].push(commit);
          return acc;
        }, {} as Record<string, Commit[]>);
        
        // 对每个仓库的commits按时间降序排序
        Object.keys(commitsByRepo).forEach(repoName => {
          commitsByRepo[repoName].sort((a, b) => b.commitDate - a.commitDate);
        });

        // 获取仓库列表（用于 Tabs）
        const repoNames = Object.keys(commitsByRepo);
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
                  const repoCommits = commitsByRepo[repoName];
                  const shouldScroll = repoCommits.length > 10;
                  
                  return (
                    <TabPane 
                      tab={
                        <span>
                          {repoName}
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            ({repoCommits.length})
                          </Text>
                        </span>
                      } 
                      key={repoName}
                    >
                      <div style={{ maxHeight: shouldScroll ? 600 : 'auto', overflowY: 'auto' }}>
                        {repoCommits.map((commit) => (
                          <div
                            key={commit.id}
                            style={{
                              padding: '12px 16px',
                              marginLeft: 16,
                              borderLeft: '2px solid #f0f0f0',
                              marginBottom: 8
                            }}
                          >
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Space size="middle">
                                <Text code>{commit.commitHash?.substring(0, 7) || '-'}</Text>
                                <Text style={{ color: '#1890ff', fontWeight: 500 }}>
                                  {dayjs(commit.commitDate).format('HH:mm:ss')}
                                </Text>
                                {commit.isOvertime && (
                                  <Tag color="red">加班</Tag>
                                )}
                              </Space>
                              
                              <Text>{commit.message}</Text>
                              
                              <Space size="large">
                                <Text type="secondary">
                                  文件变更: {commit.filesChanged}
                                </Text>
                                <Text style={{ color: '#52c41a' }}>
                                  +{commit.insertions}
                                </Text>
                                <Text style={{ color: '#ff4d4f' }}>
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
            )}
          </Panel>
        );
      })}
    </Collapse>
  );
};

