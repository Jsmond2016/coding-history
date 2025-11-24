import React from 'react';
import { Collapse, Tag, Tooltip, Space, Typography, Divider } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CommitsByDate, Commit } from '../../../../types/gitStatistics';

const { Panel } = Collapse;
const { Text } = Typography;

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
        const { date, commits, totalCommits, overtimeCount, latestOvertimeCommits } = dateGroup;
        
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

        // 计算总高度（用于滚动）
        const totalCommitsCount = commits.length;
        const shouldScroll = totalCommitsCount > 10;

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
            <div style={{ maxHeight: shouldScroll ? 600 : 'auto', overflowY: 'auto' }}>
              {commits.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                  该日期暂无提交记录
                </div>
              ) : (
                Object.entries(commitsByRepo).map(([repoName, repoCommits], repoIndex) => (
                  <div key={repoName}>
                    {repoIndex > 0 && <Divider style={{ margin: '16px 0' }} />}
                    <div style={{ marginBottom: 16 }}>
                      <Text strong style={{ fontSize: 15, color: '#1890ff' }}>
                        {repoName}
                      </Text>
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        ({repoCommits.length} 条提交)
                      </Text>
                    </div>
                    {repoCommits.map((commit, commitIndex) => (
                      <div
                        key={commit.id}
                        style={{
                          padding: '12px 16px',
                          marginLeft: 16,
                          borderLeft: '2px solid #f0f0f0',
                          marginBottom: commitIndex < repoCommits.length - 1 ? 8 : 0
                        }}
                      >
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Space size="middle">
                            <Text code>{commit.commitHash.substring(0, 7)}</Text>
                            <Text type="secondary">
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
                ))
              )}
            </div>
          </Panel>
        );
      })}
    </Collapse>
  );
};

