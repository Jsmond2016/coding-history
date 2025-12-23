import React from 'react';
import { Table, Button, Popconfirm, message, Form, Input, Modal, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getIgnoredBranches,
  createIgnoredBranch,
  deleteIgnoredBranch,
  type CreateIgnoredBranchParams,
  type IgnoredBranchItem
} from '../../../services/configApi';

interface IgnoredBranchesManagerProps {
  repoId: string;
  branches: string[];
  onUpdate: () => void;
}

const IgnoredBranchesManager: React.FC<IgnoredBranchesManagerProps> = ({
  repoId,
  onUpdate
}) => {
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [branchItems, setBranchItems] = React.useState<IgnoredBranchItem[]>([]);

  // 加载分支列表
  const loadBranches = React.useCallback(async () => {
    try {
      const data = await getIgnoredBranches(repoId);
      setBranchItems(data);
    } catch (error) {
      console.error('加载分支列表失败:', error);
    }
  }, [repoId]);

  React.useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleAdd = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const params: CreateIgnoredBranchParams = {
        branchName: values.branchName
      };

      await createIgnoredBranch(repoId, params);
      message.success('忽略分支添加成功');
      setModalOpen(false);
      loadBranches();
      onUpdate();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }
      message.error('添加忽略分支失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (branchId: number) => {
    try {
      await deleteIgnoredBranch(repoId, branchId);
      message.success('忽略分支删除成功');
      loadBranches();
      onUpdate();
    } catch (error) {
      message.error('删除忽略分支失败');
    }
  };

  const columns: ColumnsType<IgnoredBranchItem> = [
    {
      title: '分支名称',
      dataIndex: 'branchName',
      key: 'branchName',
      render: (name: string) => <Tag>{name}</Tag>
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: IgnoredBranchItem) => (
        <Popconfirm
          title="确定要删除这个忽略分支吗？"
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
      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          添加忽略分支
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={branchItems}
        rowKey="branchName"
        pagination={false}
        size="small"
      />

      <Modal
        title="添加忽略分支"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="branchName"
            label="分支名称"
            rules={[{ required: true, message: '请输入分支名称' }]}
          >
            <Input placeholder="例如: develop" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default IgnoredBranchesManager;

