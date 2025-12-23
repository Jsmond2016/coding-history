import React from 'react';
import { Table, Button, Space, Popconfirm, message, Form, Input, Switch, Modal, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getAuthors,
  createAuthor,
  deleteAuthor,
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

  const handleAdd = () => {
    form.resetFields();
    setModalOpen(true);
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
    } catch (error) {
      if (error?.errorFields) {
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
      <div className="mb-4">
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          添加作者
        </Button>
      </div>

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
    </div>
  );
};

export default AuthorsManager;

