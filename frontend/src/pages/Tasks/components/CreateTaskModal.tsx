import React from 'react';
import { Modal, Form, Input, Select, DatePicker, Checkbox, message } from 'antd';
import dayjs from 'dayjs';
import type { CreateTaskParams, ScanTask } from '../../../types/tasks';
import { gitStatisticsApi } from '../../../services/gitStatisticsApi';
import { tasksApi } from '../../../services/tasksApi';
import type { Repository } from '../../../types/gitStatistics';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TextArea } = Input;

interface CreateTaskModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  initialValues?: CreateTaskParams;
  isEdit?: boolean;
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  open,
  onCancel,
  onSuccess,
  initialValues,
  isEdit = false
}) => {
  const [form] = Form.useForm();
  const [repositories, setRepositories] = React.useState<Repository[]>([]);
  const [loading, setLoading] = React.useState(false);
  const taskType = Form.useWatch('taskType', form);
  const scanRangeType = Form.useWatch('scanRangeType', form);

  // 加载仓库列表
  React.useEffect(() => {
    if (open) {
      gitStatisticsApi.getRepositories().then(setRepositories).catch(() => {
        message.error('加载仓库列表失败');
      });
    }
  }, [open]);

  // 设置初始值
  React.useEffect(() => {
    if (open && initialValues) {
      form.setFieldsValue({
        name: initialValues.name,
        description: initialValues.description,
        taskType: initialValues.taskType,
        scanRangeType: initialValues.scanRangeType,
        cronExpression: initialValues.cronExpression,
        repositoryIds: initialValues.repositoryIds,
        enabled: initialValues.enabled ?? true,
        dateRange: initialValues.startDate && initialValues.endDate
          ? [dayjs(initialValues.startDate), dayjs(initialValues.endDate)]
          : undefined
      });
    } else if (open && !isEdit) {
      form.resetFields();
      form.setFieldsValue({
        taskType: 'manual',
        scanRangeType: '2weeks',
        enabled: true
      });
    }
  }, [open, initialValues, isEdit, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const params: CreateTaskParams = {
        name: values.name,
        description: values.description,
        taskType: values.taskType,
        scanRangeType: values.scanRangeType,
        cronExpression: values.taskType === 'scheduled' ? values.cronExpression : undefined,
        repositoryIds: values.repositoryIds && values.repositoryIds.length > 0 ? values.repositoryIds : undefined,
        enabled: values.enabled ?? true
      };

      // 处理自定义时间范围
      if (values.scanRangeType === 'custom') {
        if (!values.dateRange || !values.dateRange[0] || !values.dateRange[1]) {
          message.error('自定义时间范围必须选择开始和结束时间');
          setLoading(false);
          return;
        }

        const startDate = values.dateRange[0].startOf('day').valueOf();
        const endDate = values.dateRange[1].endOf('day').valueOf();

        // 验证6个月跨度
        const spanDays = values.dateRange[1].diff(values.dateRange[0], 'day');
        if (spanDays > 180) {
          message.error('时间跨度不能超过6个月（180天）');
          setLoading(false);
          return;
        }

        params.startDate = startDate;
        params.endDate = endDate;
      }

      if (isEdit && initialValues && 'id' in initialValues) {
        // 更新任务
        const taskId = (initialValues as ScanTask).id;
        await tasksApi.updateTask(taskId, params);
        message.success('任务更新成功');
      } else {
        // 创建任务
        await tasksApi.createTask(params);
        message.success('任务创建成功');
      }

      form.resetFields();
      onSuccess();
    } catch (error: any) {
      if (error?.errorFields) {
        // 表单验证错误
        return;
      }
      const errorMessage = error instanceof Error ? error.message : '操作失败';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? '编辑任务' : '创建任务'}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          taskType: 'manual',
          scanRangeType: '2weeks',
          enabled: true
        }}
      >
        <Form.Item
          name="name"
          label="任务名称"
          rules={[{ required: true, message: '请输入任务名称' }]}
        >
          <Input placeholder="请输入任务名称" />
        </Form.Item>

        <Form.Item
          name="description"
          label="任务描述"
        >
          <TextArea rows={3} placeholder="请输入任务描述（可选）" />
        </Form.Item>

        <Form.Item
          name="taskType"
          label="任务类型"
          rules={[{ required: true, message: '请选择任务类型' }]}
        >
          <Select>
            <Option value="manual">手动任务</Option>
            <Option value="scheduled">定时任务</Option>
          </Select>
        </Form.Item>

        {taskType === 'scheduled' && (
          <Form.Item
            name="cronExpression"
            label="Cron 表达式"
            rules={[{ required: true, message: '请输入 Cron 表达式' }]}
            extra="例如：0 10 * * * 表示每天上午10点执行"
          >
            <Input placeholder="0 10 * * *" />
          </Form.Item>
        )}

        <Form.Item
          name="scanRangeType"
          label="扫描范围"
          rules={[{ required: true, message: '请选择扫描范围' }]}
        >
          <Select>
            <Option value="2weeks">近2周</Option>
            <Option value="1month">近1个月</Option>
            <Option value="3months">近3个月</Option>
            <Option value="6months">近6个月</Option>
            <Option value="custom">自定义时间范围</Option>
          </Select>
        </Form.Item>

        {scanRangeType === 'custom' && (
          <Form.Item
            name="dateRange"
            label="时间范围"
            rules={[{ required: true, message: '请选择时间范围' }]}
            extra="最大支持6个月（180天）跨度"
          >
            <RangePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              disabledDate={(current) => {
                // 禁用未来日期
                if (current && current > dayjs().endOf('day')) {
                  return true;
                }
                return false;
              }}
            />
          </Form.Item>
        )}

        <Form.Item
          name="repositoryIds"
          label="仓库选择"
          extra="不选择则扫描所有启用的仓库"
        >
          <Select
            mode="multiple"
            placeholder="选择要扫描的仓库（可选）"
            allowClear
          >
            {repositories.map(repo => (
              <Option key={repo.id} value={repo.id}>
                {repo.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="enabled"
          valuePropName="checked"
        >
          <Checkbox>启用任务</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateTaskModal;

