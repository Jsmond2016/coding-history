import React from 'react';
import { Table, Button, Popconfirm, message, Form, Input, Switch, Modal, Tag, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import {
  createAuthor,
  deleteAuthor,
  discoverAuthors,
  type AuthorCandidate,
  type AuthorConfig,
  type CreateAuthorParams
} from '../../../services/configApi';

interface AuthorsManagerProps {
  repoId: string;
  authors: AuthorConfig[];
  onUpdate: () => void;
}

const AuthorsManager: React.FC<AuthorsManagerProps> = ({
  repoId,
  authors,
  onUpdate
}) => {
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [discoveryOpen, setDiscoveryOpen] = React.useState(false);
  const [discovering, setDiscovering] = React.useState(false);
  const [savingCandidates, setSavingCandidates] = React.useState(false);
  const [candidates, setCandidates] = React.useState<AuthorCandidate[]>([]);
  const [selectedCandidateEmails, setSelectedCandidateEmails] = React.useState<React.Key[]>([]);
  const [inspectedCommits, setInspectedCommits] = React.useState(0);

  const handleAdd = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discoverAuthors(repoId);
      const existingEmails = new Set(authors.map((author) => author.email.toLowerCase()));
      const available = result.candidates.filter((candidate) => !existingEmails.has(candidate.email.toLowerCase()));
      setCandidates(available);
      setInspectedCommits(result.inspectedCommits);
      setSelectedCandidateEmails(available.slice(0, 1).map((candidate) => candidate.email));
      setDiscoveryOpen(true);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '作者发现失败');
    } finally {
      setDiscovering(false);
    }
  };

  const handleSaveCandidates = async () => {
    const selected = candidates.filter((candidate) => selectedCandidateEmails.includes(candidate.email));
    if (selected.length === 0) return;
    setSavingCandidates(true);
    try {
      for (const candidate of selected) {
        await createAuthor(repoId, {
          name: candidate.name,
          email: candidate.email,
          isDefault: authors.length === 0 && candidate === selected[0]
        });
      }
      message.success(`已添加 ${selected.length} 个作者`);
      setDiscoveryOpen(false);
      onUpdate();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '保存作者失败');
    } finally {
      setSavingCandidates(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const params: CreateAuthorParams = {
        name: values.name,
        email: values.email,
        isDefault: values.isDefault || false
      };

      await createAuthor(repoId, params);
      message.success('作者添加成功');
      setModalOpen(false);
      onUpdate();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error('添加作者失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (authorId: number) => {
    try {
      await deleteAuthor(repoId, authorId);
      message.success('作者删除成功');
      onUpdate();
    } catch (error) {
      message.error('删除作者失败');
    }
  };

  const columns: ColumnsType<AuthorConfig> = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '默认',
      dataIndex: 'isDefault',
      key: 'isDefault',
      width: 80,
      render: (isDefault: boolean) => (
        isDefault ? <Tag color="blue">是</Tag> : <Tag>否</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: AuthorConfig) => (
        <Popconfirm
          title="确定要删除这个作者吗？"
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
      )
    }
  ];

  return (
    <div>
      <Space className="mb-4">
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          添加作者
        </Button>
        <Button icon={<SearchOutlined />} loading={discovering} onClick={handleDiscover}>
          从 Git 历史发现
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={authors}
        rowKey="id"
        pagination={false}
        size="small"
      />

      <Modal
        title="添加作者"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="例如: John Doe" />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="例如: john@example.com" />
          </Form.Item>

          <Form.Item
            name="isDefault"
            label="设为默认"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="从 Git 历史选择作者"
        open={discoveryOpen}
        onCancel={() => setDiscoveryOpen(false)}
        onOk={handleSaveCandidates}
        okText="添加所选作者"
        confirmLoading={savingCandidates}
        okButtonProps={{ disabled: selectedCandidateEmails.length === 0 }}
        width={680}
      >
        <Typography.Paragraph type="secondary">
          已检查最近 {inspectedCommits} 条提交，已配置的邮箱不会重复显示。
        </Typography.Paragraph>
        <Table
          size="small"
          rowKey="email"
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          dataSource={candidates}
          rowSelection={{ selectedRowKeys: selectedCandidateEmails, onChange: setSelectedCandidateEmails }}
          columns={[
            { title: '作者', dataIndex: 'name' },
            { title: '邮箱', dataIndex: 'email' },
            { title: '最近提交', dataIndex: 'commitCount', width: 100 }
          ]}
          locale={{ emptyText: '没有新的作者候选' }}
        />
      </Modal>
    </div>
  );
};

export default AuthorsManager;
