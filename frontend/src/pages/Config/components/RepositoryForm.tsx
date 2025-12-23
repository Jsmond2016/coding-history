import React from 'react';
import { Modal, Form, Input, Switch, message } from 'antd';
import {
  createRepository,
  updateRepository,
  type RepositoryConfig,
  type CreateRepositoryParams,
  type UpdateRepositoryParams
} from '../../../services/configApi';

interface RepositoryFormProps {
  open: boolean;
  repository?: RepositoryConfig;
  onClose: () => void;
  onSuccess: () => void;
}

const RepositoryForm: React.FC<RepositoryFormProps> = ({
  open,
  repository,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      if (repository) {
        form.setFieldsValue({
          id: repository.id,
          name: repository.name,
          path: repository.path,
          enabled: repository.enabled
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, repository, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (repository) {
        // 更新
        const updateParams: UpdateRepositoryParams = {
          name: values.name,
          path: values.path,
          enabled: values.enabled
        };
        await updateRepository(repository.id, updateParams);
        message.success('仓库更新成功');
      } else {
        // 创建
        const createParams: CreateRepositoryParams = {
          id: values.id,
          name: values.name,
          path: values.path,
          enabled: values.enabled !== undefined ? values.enabled : true
        };
        await createRepository(createParams);
        message.success('仓库创建成功');
      }

      onSuccess();
    } catch (error) {
      if (error?.errorFields) {
        // 表单验证错误
        return;
      }
      message.error(repository ? '更新仓库失败' : '创建仓库失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={repository ? '编辑仓库' : '添加仓库'}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={loading}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          enabled: true
        }}
      >
        <Form.Item
          name="id"
          label="仓库ID"
          rules={[
            { required: true, message: '请输入仓库ID' },
            { pattern: /^[a-zA-Z0-9_-]+$/, message: '仓库ID只能包含字母、数字、下划线和连字符' }
          ]}
          hidden={!!repository}
        >
          <Input placeholder="例如: my-repo" disabled={!!repository} />
        </Form.Item>

        <Form.Item
          name="name"
          label="仓库名称"
          rules={[{ required: true, message: '请输入仓库名称' }]}
        >
          <Input placeholder="例如: My Repository" />
        </Form.Item>

        <Form.Item
          name="path"
          label="仓库路径"
          rules={[{ required: true, message: '请输入仓库路径' }]}
        >
          <Input placeholder="例如: /Users/username/projects/my-repo" />
        </Form.Item>

        <Form.Item
          name="enabled"
          label="启用状态"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RepositoryForm;

