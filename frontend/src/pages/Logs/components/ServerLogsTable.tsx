import React from 'react';
import { Table, Tag, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ServerLog } from '../../../types/logs';
import dayjs from 'dayjs';

interface ServerLogsTableProps {
  data: ServerLog[];
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
}

const ServerLogsTable: React.FC<ServerLogsTableProps> = ({ data, loading, pagination }) => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'start':
        return 'green';
      case 'stop':
        return 'blue';
      case 'error':
        return 'red';
      default:
        return 'default';
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'start':
        return '启动';
      case 'stop':
        return '关闭';
      case 'error':
        return '异常';
      default:
        return type;
    }
  };

  const columns: ColumnsType<ServerLog> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: number) => dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => a.timestamp - b.timestamp
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={getTypeColor(type)}>{getTypeText(type)}</Tag>
      )
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space size="middle">
          {record.errorStack && (
            <a
              onClick={() => {
                const modal = window.open('', '_blank');
                if (modal) {
                  modal.document.write(`
                    <html>
                      <head><title>错误堆栈</title></head>
                      <body style="font-family: monospace; white-space: pre-wrap; padding: 20px;">
                        <h2>错误消息</h2>
                        <p>${record.message}</p>
                        <h2>错误堆栈</h2>
                        <p>${record.errorStack || '无'}</p>
                      </body>
                    </html>
                  `);
                }
              }}
            >
              查看堆栈
            </a>
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

export default ServerLogsTable;
