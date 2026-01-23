import React from 'react';
import { Modal, Form, Select, message } from 'antd';
import { tasksApi } from '../../../services/tasksApi';
import type { CreateTaskParams } from '../../../types/tasks';

const { Option } = Select;

interface ManualSyncModalProps {
  open: boolean;
  repositoryId: string;
  repositoryName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const ManualSyncModal: React.FC<ManualSyncModalProps> = ({
  open,
  repositoryId,
  repositoryName,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        scanRangeType: '3days' // 默认3天
      });
    }
  }, [open, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // 创建手动任务
      const taskParams: CreateTaskParams = {
        name: `手动同步 - ${repositoryName}`,
        description: `手动同步仓库 ${repositoryName} 的提交记录`,
        taskType: 'manual',
        scanRangeType: values.scanRangeType,
        repositoryIds: [repositoryId],
        enabled: true
      };

      const task = await tasksApi.createTask(taskParams);

      // 立即触发任务执行
      await tasksApi.triggerTask(task.id, { repositoryIds: [repositoryId] });

      message.success('手动同步任务已创建并开始执行');
      onSuccess?.();
      onClose();
    } catch (error) {
      if (error?.errorFields) {
        // 表单验证错误
        return;
      }
      const errorMessage = error instanceof Error ? error.message : '操作失败';
      message.error(`手动同步失败: ${errorMessage}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`手动同步 - ${repositoryName}`}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={loading}
      width={500}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          scanRangeType: '3days'
        }}
      >
        <Form.Item
          name="scanRangeType"
          label="同步时间范围"
          rules={[{ required: true, message: '请选择同步时间范围' }]}
          extra="选择要同步的提交记录时间范围"
        >
          <Select>
            <Option value="1day">近1天</Option>
            <Option value="3days">近3天</Option>
            <Option value="7days">近7天</Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ManualSyncModal;
