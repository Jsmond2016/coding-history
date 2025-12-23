import React from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Card, Collapse, Switch } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getRepositoriesConfig,
  createRepository,
  updateRepository,
  deleteRepository,
  type RepositoryConfig,
  type CreateRepositoryParams
} from '../../services/configApi';
import RepositoryForm from './components/RepositoryForm';
import AuthorsManager from './components/AuthorsManager';
import IgnoredBranchesManager from './components/IgnoredBranchesManager';

const { Panel } = Collapse;

const ConfigList: React.FC = () => {
  const [repositories, setRepositories] = React.useState<RepositoryConfig[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [editingRepo, setEditingRepo] = React.useState<RepositoryConfig | undefined>();
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([]);

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

  // 处理启用/禁用仓库
  const handleToggleEnabled = async (repo: RepositoryConfig) => {
    try {
      await updateRepository(repo.id, { enabled: !repo.enabled });
      message.success(`仓库已${repo.enabled ? '禁用' : '启用'}`);
      loadRepositories();
    } catch (error) {
      message.error('操作失败');
    }
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
      title: '作者数量',
      key: 'authorsCount',
      width: 100,
      render: (_: any, record: RepositoryConfig) => record.authors.length
    },
    {
      title: '忽略分支',
      key: 'ignoredBranchesCount',
      width: 120,
      render: (_: any, record: RepositoryConfig) => record.ignoredBranches.length
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
      width: 200,
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
          <Switch
            checked={record.enabled}
            size="small"
            onChange={() => handleToggleEnabled(record)}
          />
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

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>配置管理</h2>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            添加仓库
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={repositories}
          loading={loading}
          rowKey="id"
          pagination={false}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
            expandedRowRender: (record: RepositoryConfig) => (
              <div style={{ padding: '16px 0' }}>
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
    </div>
  );
};

export default ConfigList;

