import React from 'react';
import { Table, Tag, Space, Popover } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ScheduledTaskLog } from '../../../types/logs';
import dayjs from 'dayjs';

interface ScheduledTaskLogsTableProps {
  data: ScheduledTaskLog[];
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
}

const ScheduledTaskLogsTable: React.FC<ScheduledTaskLogsTableProps> = ({ data, loading, pagination }) => {
  const getStatusColor = (status: string) => {
    return status === 'success' ? 'green' : 'red';
  };

  const getStatusText = (status: string) => {
    return status === 'success' ? '成功' : '失败';
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    if (!endTime) return '-';
    const duration = endTime - startTime;
    if (duration < 1000) {
      return `${duration}ms`;
    } else if (duration < 60000) {
      return `${(duration / 1000).toFixed(2)}s`;
    } else {
      return `${(duration / 60000).toFixed(2)}min`;
    }
  };

  const columns: ColumnsType<ScheduledTaskLog> = [
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 180,
      render: (startTime: number) => dayjs(startTime).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => a.startTime - b.startTime
    },
    {
      title: '任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      width: 200
    },
    {
      title: 'Cron 表达式',
      dataIndex: 'cronExpression',
      key: 'cronExpression',
      width: 150,
      ellipsis: true
    },
    {
      title: '仓库',
      dataIndex: 'repositories',
      key: 'repositories',
      render: (repositories: string[]) => (
        <Popover
          title="扫描的仓库"
          content={
            <ul className="m-0 pl-5">
              {repositories.map((repo, index) => (
                <li key={index}>{repo}</li>
              ))}
            </ul>
          }
          trigger="hover"
        >
          <a>{repositories.length} 个仓库</a>
        </Popover>
      )
    },
    {
      title: 'Commit 数',
      dataIndex: 'totalCommits',
      key: 'totalCommits',
      width: 120,
      render: (totalCommits: number) => (
        <Tag color="blue">{totalCommits}</Tag>
      )
    },
    {
      title: '耗时',
      key: 'duration',
      width: 120,
      render: (_, record) => formatDuration(record.startTime, record.endTime)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space size="middle">
          {record.errorMessage && (
            <Popover
              title="错误信息"
              content={
                <pre className="max-w-[500px] max-h-[300px] overflow-auto m-0">
                  {record.errorMessage}
                </pre>
              }
              trigger="click"
            >
              <a>查看错误</a>
            </Popover>
          )}
        </Space>
      )
    }
  ];

  return (
    <Table
      columns={columns}
      dataSource={data}
      loading={loading}
      rowKey="id"
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
        onChange: pagination.onChange,
        onShowSizeChange: pagination.onChange
      }}
    />
  );
};

export default ScheduledTaskLogsTable;
