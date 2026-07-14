import React from 'react';
import { Table, Tag, Space, Popover } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RequestLog } from '../../../types/logs';
import dayjs from 'dayjs';

interface RequestLogsTableProps {
  data: RequestLog[];
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
}

const RequestLogsTable: React.FC<RequestLogsTableProps> = ({ data, loading, pagination }) => {
  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) {
      return 'green';
    } else if (statusCode >= 300 && statusCode < 400) {
      return 'blue';
    } else if (statusCode >= 400 && statusCode < 500) {
      return 'orange';
    } else {
      return 'red';
    }
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET':
        return 'blue';
      case 'POST':
        return 'green';
      case 'PUT':
        return 'orange';
      case 'DELETE':
        return 'red';
      default:
        return 'default';
    }
  };

  const columns: ColumnsType<RequestLog> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: number) => dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => a.timestamp - b.timestamp
    },
    {
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      width: 100,
      render: (method: string) => (
        <Tag color={getMethodColor(method)}>{method}</Tag>
      )
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
      render: (module: string) => (
        <Tag color="blue">{module || '-'}</Tag>
      ),
      filters: [
        { text: 'repositories', value: 'repositories' },
        { text: 'commits', value: 'commits' },
        { text: 'logs', value: 'logs' },
        { text: 'tasks', value: 'tasks' },
        { text: 'config', value: 'config' },
        { text: 'statistics', value: 'statistics' }
      ],
      onFilter: (value, record) => record.module === value
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
      render: (url: string) => {
        try {
          const urlObj = new URL(url);
          return urlObj.pathname + urlObj.search;
        } catch {
          return url;
        }
      }
    },
    {
      title: '路由',
      dataIndex: 'routeName',
      key: 'routeName',
      width: 150,
      ellipsis: true
    },
    {
      title: '状态码',
      dataIndex: 'statusCode',
      key: 'statusCode',
      width: 100,
      render: (statusCode: number) => (
        <Tag color={getStatusColor(statusCode)}>{statusCode}</Tag>
      )
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      render: (duration: number) => `${duration}ms`,
      sorter: (a, b) => a.duration - b.duration
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="middle">
          {record.requestBody && (
            <Popover
              title="请求体"
              content={
                <pre className="max-w-[500px] max-h-[300px] overflow-auto m-0">
                  {record.requestBody}
                </pre>
              }
              trigger="click"
            >
              <a>请求</a>
            </Popover>
          )}
          {record.responseBody && (
            <Popover
              title="响应体"
              content={
                <pre className="max-w-[500px] max-h-[300px] overflow-auto m-0">
                  {record.responseBody}
                </pre>
              }
              trigger="click"
            >
              <a>响应</a>
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

export default RequestLogsTable;
