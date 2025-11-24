import React from 'react';
import { Collapse, Tag, Tooltip, Space, Typography } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CommitsByDate } from '../../../../types/gitStatistics';

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
        const { date, commits, totalCommits, overtimeCount } = dateGroup;
        
        // 获取当天所有加班提交的时间点（最多5个）
        const overtimeTimes = commits
          .filter(c => c.isOvertime)
          .map(c => dayjs(c.commitDate).format('HH:mm'))
          .slice(0, 5);

        return (
          <Panel
            key={date}
            header={
              <Space size="large">
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
                        <div>加班提交时间：</div>
                        {overtimeTimes.map((time, idx) => (
                          <div key={idx}>• {time}</div>
                        ))}
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
            <div style={{ maxHeight: commits.length > 3 ? 400 : 'auto', overflowY: 'auto' }}>
              {commits.map((commit) => (
                <div
                  key={commit.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    '&:last-child': { borderBottom: 'none' }
                  }}
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space size="middle">
                      <Text strong>{commit.repoName}</Text>
                      <Text code>{commit.commitHash.substring(0, 7)}</Text>
                      <Text type="secondary">
                        {dayjs(commit.commitDate).format('HH:mm:ss')}
                      </Text>
                      {commit.isOvertime && (
                        <Tag color="red" size="small">加班</Tag>
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
          </Panel>
        );
      })}
    </Collapse>
  );
};

