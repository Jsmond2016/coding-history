import React from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAtom, useAtomValue } from 'jotai';
import dayjs from 'dayjs';
import { commitsTableAtom, filterAtom } from '../../../../biz/atoms/gitStatistics.atom';
import type { Commit } from '../../../../types/gitStatistics';

const columns: ColumnsType<Commit> = [
  {
    title: '仓库',
    dataIndex: 'repoName',
    width: 120,
    fixed: 'left'
  },
  {
    title: '分支',
    dataIndex: 'branch',
    width: 120,
    render: (branch: string) => branch ? <span style={{ color: '#1890ff' }}>{branch}</span> : '-'
  },
  {
    title: '提交Hash',
    dataIndex: 'commitHash',
    width: 100,
    render: (hash: string) => hash?.substring(0, 7) || '-'
  },
  {
    title: '提交时间',
    dataIndex: 'commitDate',
    width: 180,
    sorter: true,
    render: (date: number) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
  },
  {
    title: '提交信息',
    dataIndex: 'message',
    ellipsis: true,
    width: 300
  },
  {
    title: '文件变更',
    dataIndex: 'filesChanged',
    width: 100,
    align: 'right'
  },
  {
    title: '新增行数',
    dataIndex: 'insertions',
    width: 100,
    align: 'right',
    render: (val: number) => <span style={{ color: '#52c41a' }}>+{val}</span>
  },
  {
    title: '删除行数',
    dataIndex: 'deletions',
    width: 100,
    align: 'right',
    render: (val: number) => <span style={{ color: '#ff4d4f' }}>-{val}</span>
  }
];

interface CommitsTableProps {
  onPageChange?: (page: number, pageSize: number) => void;
}

export const CommitsTable: React.FC<CommitsTableProps> = ({ onPageChange }) => {
  const [tableState] = useAtom(commitsTableAtom);

  const handleTableChange = (pagination: any) => {
    const page = pagination.current || 1;
    const pageSize = pagination.pageSize || 20;
    onPageChange?.(page, pageSize);
  };

  return (
    <Table
      columns={columns}
      dataSource={tableState.data}
      loading={tableState.loading}
      rowKey="id"
      scroll={{ x: 'max-content' }}
      pagination={{
        current: tableState.pagination.current,
        pageSize: tableState.pagination.pageSize,
        total: tableState.pagination.total,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条记录`
      }}
      onChange={handleTableChange}
    />
  );
};

