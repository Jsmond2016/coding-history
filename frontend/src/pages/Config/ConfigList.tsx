import React from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Card, Collapse, Modal, Typography, Flex, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  FolderOpenOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
import {
  getRepositoriesConfig,
  deleteRepository,
  batchDeleteRepositories,
  type RepositoryConfig
} from '../../services/configApi';
import RepositoryForm from './components/RepositoryForm';
import AuthorsManager from './components/AuthorsManager';
import IgnoredBranchesManager from './components/IgnoredBranchesManager';
import DataMetricsConfig from './components/DataMetricsConfig';

import ScanReposModal from './components/ScanReposModal';

const { Panel } = Collapse;

const ConfigList: React.FC = () => {
  const [repositories, setRepositories] = React.useState<RepositoryConfig[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [editingRepo, setEditingRepo] = React.useState<RepositoryConfig | undefined>();
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([]);
  const [authorsModalOpen, setAuthorsModalOpen] = React.useState(false);
  const [branchesModalOpen, setBranchesModalOpen] = React.useState(false);
  const [scanReposModalOpen, setScanReposModalOpen] = React.useState(false);
  const [editingRepoForAuthors, setEditingRepoForAuthors] = React.useState<RepositoryConfig | undefined>();
  const [editingRepoForBranches, setEditingRepoForBranches] = React.useState<RepositoryConfig | undefined>();
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<React.Key[]>([]);
  const [deleting, setDeleting] = React.useState(false);

  // 加载仓库配置列表
  const loadRepositories = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRepositoriesConfig();
      setRepositories(data);
    } catch (error) {
      message.error('加载仓库配置失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadRepositories();
  }, [loadRepositories]);

  // 处理创建仓库
  const handleCreate = () => {
    setEditingRepo(undefined);
    setFormModalOpen(true);
  };

  // 处理编辑仓库
  const handleEdit = (repo: RepositoryConfig) => {
    setEditingRepo(repo);
    setFormModalOpen(true);
  };

  // 处理删除仓库
  const handleDelete = async (id: string) => {
    try {
      await deleteRepository(id);
      message.success('仓库删除成功');
      loadRepositories();
    } catch (error) {
      message.error('删除仓库失败');
    }
  };

  // 批量删除选中的仓库
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    setDeleting(true);
    try {
      const ids = selectedRowKeys.map((k) => String(k));
      await batchDeleteRepositories(ids);
      message.success(`已删除 ${ids.length} 个仓库`);
      setSelectedRowKeys([]);
      loadRepositories();
    } catch (error) {
      message.error('批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  

  // 处理编辑作者
  const handleEditAuthors = (repo: RepositoryConfig) => {
    setEditingRepoForAuthors(repo);
    setAuthorsModalOpen(true);
  };

  // 处理编辑忽略分支
  const handleEditBranches = (repo: RepositoryConfig) => {
    setEditingRepoForBranches(repo);
    setBranchesModalOpen(true);
  };

  

  // 表格列定义
  const columns: ColumnsType<RepositoryConfig> = [
    {
      title: '仓库名称',
      dataIndex: 'name',
      key: 'name',
      width: 200
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '作者信息',
      key: 'authors',
      width: 250,
      render: (_: any, record: RepositoryConfig) => (
        <Flex align="flex-start" justify="space-between" gap={8} className="w-full">
          <div className="flex-1">
            {record.authors.length > 0 ? (
              <Space direction="vertical" size={4} className="w-full">
                {record.authors.map((author, index) => (
                  <div key={index} className="text-xs">
                    <Tag color={author.isDefault ? 'blue' : 'default'} className="m-0">
                      {author.name}
                    </Tag>
                    <span className="ml-1 text-gray-600">{author.email}</span>
                  </div>
                ))}
              </Space>
            ) : (
              <span className="text-xs text-gray-400">未配置</span>
            )}
          </div>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditAuthors(record)}
            className="p-0 h-auto flex-shrink-0"
          />
        </Flex>
      )
    },
    {
      title: '忽略分支',
      key: 'ignoredBranches',
      width: 200,
      render: (_: any, record: RepositoryConfig) => (
        <Flex align="flex-start" justify="space-between" gap={8} className="w-full">
          <div className="flex-1">
            {record.ignoredBranches.length > 0 ? (
              <Space direction="vertical" size={4} className="w-full">
                {record.ignoredBranches.map((branch, index) => (
                  <Tag key={index} className="m-0">
                    {branch}
                  </Tag>
                ))}
              </Space>
            ) : (
              <span className="text-xs text-gray-400">未配置</span>
            )}
          </div>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditBranches(record)}
            className="p-0 h-auto flex-shrink-0"
          />
        </Flex>
      )
    },
    {
      title: '提交总数',
      dataIndex: 'totalCommits',
      key: 'totalCommits',
      width: 100
    },
    {
      title: '最后扫描',
      dataIndex: 'lastScanTime',
      key: 'lastScanTime',
      width: 180,
      render: (time: number | null) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_: any, record: RepositoryConfig) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个仓库吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const tabItems = [
    {
      key: 'repositories',
      label: (
        <span>
          <DatabaseOutlined />
          仓库配置
        </span>
      ),
      children: (
        <div>
          <Flex justify="space-between" align="center" className="mb-4">
            <Title level={4} className="m-0">
              仓库配置
            </Title>
            <Space>
              <Popconfirm
                title={`确定要删除选中的 ${selectedRowKeys.length} 个仓库吗？`}
                description="删除后相关提交记录仍保留在数据库中，仅移除仓库配置。"
                onConfirm={handleBatchDelete}
                okText="确定删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleting}
                  disabled={selectedRowKeys.length === 0}
                >
                  删除仓库{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                </Button>
              </Popconfirm>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadRepositories}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                icon={<FolderOpenOutlined />}
                onClick={() => setScanReposModalOpen(true)}
              >
                扫描仓库
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                添加仓库
              </Button>
            </Space>
          </Flex>

          <Table
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys)
            }}
            columns={columns}
            dataSource={repositories}
            loading={loading}
            rowKey="id"
            pagination={false}
            expandable={{
              expandedRowKeys: expandedKeys,
              onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
              expandedRowRender: (record: RepositoryConfig) => (
                <div className="py-4">
                  <Collapse defaultActiveKey={['authors', 'branches']}>
                    <Panel header={`作者配置 (${record.authors.length})`} key="authors">
                      <AuthorsManager
                        repoId={record.id}
                        authors={record.authors}
                        onUpdate={loadRepositories}
                      />
                    </Panel>
                    <Panel header={`忽略分支配置 (${record.ignoredBranches.length})`} key="branches">
                      <IgnoredBranchesManager
                        repoId={record.id}
                        branches={record.ignoredBranches}
                        onUpdate={loadRepositories}
                      />
                    </Panel>
                  </Collapse>
                </div>
              )
            }}
          />
        </div>
      )
    },
    {
      key: 'data-metrics',
      label: (
        <span>
          <BarChartOutlined />
          数据指标配置
        </span>
      ),
      children: <DataMetricsConfig />
    }
  ];

  return (
    <div>
      <Card>
        <Title level={2} className="mb-4">
          配置管理
        </Title>
        <Tabs items={tabItems} />
      </Card>

      <RepositoryForm
        open={formModalOpen}
        repository={editingRepo}
        onClose={() => setFormModalOpen(false)}
        onSuccess={() => {
          setFormModalOpen(false);
          loadRepositories();
        }}
      />

      {/* 作者编辑弹窗 */}
      <Modal
        title={`编辑作者 - ${editingRepoForAuthors?.name || ''}`}
        open={authorsModalOpen}
        onCancel={() => {
          setAuthorsModalOpen(false);
          setEditingRepoForAuthors(undefined);
        }}
        footer={null}
        width={800}
      >
        {editingRepoForAuthors && (
          <AuthorsManager
            repoId={editingRepoForAuthors.id}
            authors={editingRepoForAuthors.authors}
            onUpdate={() => {
              loadRepositories();
            }}
          />
        )}
      </Modal>

      {/* 忽略分支编辑弹窗 */}
      <Modal
        title={`编辑忽略分支 - ${editingRepoForBranches?.name || ''}`}
        open={branchesModalOpen}
        onCancel={() => {
          setBranchesModalOpen(false);
          setEditingRepoForBranches(undefined);
        }}
        footer={null}
        width={800}
      >
        {editingRepoForBranches && (
          <IgnoredBranchesManager
            repoId={editingRepoForBranches.id}
            branches={editingRepoForBranches.ignoredBranches}
            onUpdate={() => {
              loadRepositories();
            }}
          />
        )}
      </Modal>

      

      {/* 扫描仓库弹窗 */}
      <ScanReposModal
        open={scanReposModalOpen}
        onClose={() => setScanReposModalOpen(false)}
        onSuccess={loadRepositories}
      />
    </div>
  );
};

export default ConfigList;

