import React from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Card, Collapse, Modal, Typography, Flex, Tabs, Tooltip, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  FolderOpenOutlined,
  QuestionCircleOutlined,
  CloudUploadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
import {
  getRepositoriesConfig,
  deleteRepository,
  batchDeleteRepositories,
  backupDatabase,
  getBackupConfig,
  updateBackupDir,
  updateBackupCron,
  type RepositoryConfig,
  type CommitDateRange
} from '../../services/configApi';
import RepositoryForm from './components/RepositoryForm';
import AuthorsManager from './components/AuthorsManager';
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
  const [scanReposModalOpen, setScanReposModalOpen] = React.useState(false);
  const [editingRepoForAuthors, setEditingRepoForAuthors] = React.useState<RepositoryConfig | undefined>();
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<React.Key[]>([]);
  const [deleting, setDeleting] = React.useState(false);
  const [backingUp, setBackingUp] = React.useState(false);
  const [backupModalOpen, setBackupModalOpen] = React.useState(false);
  const [backupDir, setBackupDir] = React.useState('');
  const [backupCron, setBackupCron] = React.useState<string | null>(null);
  const [backupDirEditing, setBackupDirEditing] = React.useState('');
  const [loadingConfig, setLoadingConfig] = React.useState(false);
  const [savingDir, setSavingDir] = React.useState(false);
  const [backupCronEditing, setBackupCronEditing] = React.useState('');
  const [savingCron, setSavingCron] = React.useState(false);

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

  // 处理数据库备份
  const handleBackupDatabase = async () => {
    setBackingUp(true);
    try {
      const result = await backupDatabase();
      if (result.success) {
        message.success(`数据库备份成功：${result.destPath}`);
        setBackupModalOpen(false);
      } else {
        message.error(`备份失败：${result.error || '未知错误'}`);
      }
    } catch (error) {
      message.error('备份数据库失败');
      console.error(error);
    } finally {
      setBackingUp(false);
    }
  };

  // 打开备份配置弹窗
  const handleOpenBackupModal = async () => {
    setBackupModalOpen(true);
    setLoadingConfig(true);
    try {
      const config = await getBackupConfig();
      setBackupDir(config.backupDir);
      setBackupDirEditing(config.backupDir);
      setBackupCron(config.backupCron);
      setBackupCronEditing(config.backupCron || '');
    } catch {
      message.error('获取备份配置失败');
    } finally {
      setLoadingConfig(false);
    }
  };

  // 保存备份目录
  const handleSaveBackupDir = async () => {
    const trimmed = backupDirEditing.trim();
    if (!trimmed) {
      message.error('备份目录不能为空');
      return;
    }
    setSavingDir(true);
    try {
      const config = await updateBackupDir(trimmed);
      setBackupDir(config.backupDir);
      setBackupDirEditing(config.backupDir);
      message.success('备份目录已更新');
    } catch (error: any) {
      const msg = error?.response?.data?.error || '更新失败';
      message.error(msg);
    } finally {
      setSavingDir(false);
    }
  };

  // 保存备份定时
  const handleSaveBackupCron = async () => {
    setSavingCron(true);
    try {
      const config = await updateBackupCron(backupCronEditing.trim());
      setBackupCron(config.backupCron);
      setBackupCronEditing(config.backupCron || '');
      message.success('备份定时已更新');
    } catch (error: any) {
      const msg = error?.response?.data?.error || '更新失败';
      message.error(msg);
    } finally {
      setSavingCron(false);
    }
  };

  // 处理编辑作者
  const handleEditAuthors = (repo: RepositoryConfig) => {
    setEditingRepoForAuthors(repo);
    setAuthorsModalOpen(true);
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
      width: 200,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          {text}
        </Tooltip>
      )
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
      title: '提交总数',
      dataIndex: 'totalCommits',
      key: 'totalCommits',
      width: 100
    },
    {
      title: (
        <span>
          提交范围{' '}
          <Tooltip title="对应仓库已扫描入库 commit 的时间范围">
            <QuestionCircleOutlined className="text-gray-400" />
          </Tooltip>
        </span>
      ),
      dataIndex: 'commitDateRange',
      key: 'commitDateRange',
      width: 220,
      render: (range: CommitDateRange | null) => {
        if (!range) {
          return <span className="text-gray-400">暂无记录</span>;
        }
        const earliest = dayjs(range.earliest).format('YYYY-MM-DD');
        const latest = dayjs(range.latest).format('YYYY-MM-DD');
        if (earliest === latest) {
          return <span>{earliest}</span>;
        }
        return (
          <span>
            {earliest} ~ {latest}
          </span>
        );
      }
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
                icon={<CloudUploadOutlined />}
                loading={backingUp}
                onClick={handleOpenBackupModal}
              >
                备份数据库
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
            locale={{ emptyText: '暂无仓库配置，请点击"添加仓库"按钮添加' }}
            expandable={{
              expandedRowKeys: expandedKeys,
              onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
              expandedRowRender: (record: RepositoryConfig) => (
                <div className="py-4">
                  <Collapse defaultActiveKey={['authors']}>
                    <Panel header={`作者配置 (${record.authors.length})`} key="authors">
                      <AuthorsManager
                        repoId={record.id}
                        authors={record.authors}
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

      {/* 扫描仓库弹窗 */}
      <ScanReposModal
        open={scanReposModalOpen}
        onClose={() => setScanReposModalOpen(false)}
        onSuccess={loadRepositories}
      />

      {/* 备份数据库弹窗 */}
      <Modal
        title="备份数据库"
        open={backupModalOpen}
        onCancel={() => setBackupModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setBackupModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="backup"
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={backingUp}
            onClick={handleBackupDatabase}
          >
            立即备份
          </Button>,
        ]}
        width={520}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>备份目录</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={backupDirEditing}
              onChange={(e) => setBackupDirEditing(e.target.value)}
              placeholder="输入备份目录绝对路径"
            />
            <Button
              type="primary"
              loading={savingDir}
              disabled={backupDirEditing === backupDir}
              onClick={handleSaveBackupDir}
            >
              保存路径
            </Button>
          </Space.Compact>
          <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
            备份文件将保存到: {backupDir}/coding-history-backup-YYYY-MM-DD.db
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>定时备份</div>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space wrap size={4}>
              {[
                { label: '每天 19:00', value: '0 19 * * *' },
                { label: '工作日 19:00', value: '0 19 * * 1-5' },
                { label: '每周五 19:00', value: '0 19 * * 5' },
                { label: '关闭', value: 'off' },
              ].map((preset) => (
                <Tag
                  key={preset.value}
                  color={backupCronEditing === preset.value ? 'blue' : 'default'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setBackupCronEditing(preset.value)}
                >
                  {preset.label}
                </Tag>
              ))}
            </Space>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={backupCronEditing}
                onChange={(e) => setBackupCronEditing(e.target.value)}
                placeholder="自定义 cron 表达式，如 0 19 * * 5"
              />
              <Button
                type="primary"
                loading={savingCron}
                disabled={backupCronEditing === (backupCron || '')}
                onClick={handleSaveBackupCron}
              >
                保存
              </Button>
            </Space.Compact>
            <div style={{ fontSize: 12, color: '#999' }}>
              格式：分 时 日 月 周，如 0 19 * * 5 = 每周五 19:00；输入 off 关闭定时备份
            </div>
          </Space>
        </div>
        <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 6 }}>
          <div style={{ fontSize: 13, color: '#333' }}>
            点击「立即备份」将创建一个完整的数据库副本。
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ConfigList;
