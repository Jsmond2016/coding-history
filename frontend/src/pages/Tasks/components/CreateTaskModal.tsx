import React from 'react';
import { useRequest, useUpdateEffect } from 'ahooks';
import { Checkbox, Form, Input, Modal, Radio, Select, Switch, message } from 'antd';
import type { CreateTaskParams, ScanTask, ScanRangeType } from '../../../types/tasks';
import { getRepositoriesConfig } from '../../../services/configApi';
import { tasksApi } from '../../../services/tasksApi';

const { TextArea } = Input;

interface CreateTaskModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  initialValues?: ScanTask;
}

const schedulePresets = [
  { label: '工作日 09:30', value: '30 9 * * 1-5' },
  { label: '每天 09:00', value: '0 9 * * *' },
  { label: '工作日 19:00', value: '0 19 * * 1-5' },
  { label: '高级设置', value: 'custom' }
];

const rangeOptions: Array<{ label: string; value: Exclude<ScanRangeType, 'custom'> }> = [
  { label: '近 1 天', value: '1day' },
  { label: '近 3 天', value: '3days' },
  { label: '近 7 天', value: '7days' },
  { label: '近 2 周', value: '2weeks' },
  { label: '近 1 个月', value: '1month' },
  { label: '近 3 个月', value: '3months' },
  { label: '近 6 个月', value: '6months' }
];

const resolveSchedulePreset = (cronExpression?: string): string =>
  schedulePresets.some((item) => item.value === cronExpression) ? cronExpression! : 'custom';

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  open,
  onCancel,
  onSuccess,
  initialValues
}) => {
  const [form] = Form.useForm();
  const schedulePreset = Form.useWatch('schedulePreset', form);
  const { data: repositories = [] } = useRequest(getRepositoriesConfig, { ready: open });
  const { runAsync: saveTask, loading } = useRequest(
    async (params: CreateTaskParams) => initialValues
      ? tasksApi.updateTask(initialValues.id, params)
      : tasksApi.createTask(params),
    { manual: true }
  );

  useUpdateEffect(() => {
    if (!open) return;
    const cronExpression = initialValues?.cronExpression ?? '30 9 * * 1-5';
    form.setFieldsValue(initialValues ? {
      name: initialValues.name,
      description: initialValues.description,
      schedulePreset: resolveSchedulePreset(cronExpression),
      cronExpression,
      scanRangeType: initialValues.scanRangeType,
      repositoryIds: initialValues.repositoryIds,
      enabled: initialValues.enabled
    } : {
      name: '工作日自动同步',
      description: undefined,
      schedulePreset: '30 9 * * 1-5',
      cronExpression: '30 9 * * 1-5',
      scanRangeType: '3days',
      repositoryIds: repositories.filter((repo) => repo.enabled).map((repo) => repo.id),
      enabled: true
    });
  }, [open, initialValues, repositories]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const cronExpression = values.schedulePreset === 'custom'
        ? values.cronExpression?.trim()
        : values.schedulePreset;
      await saveTask({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        taskType: 'scheduled',
        scanRangeType: values.scanRangeType,
        cronExpression,
        repositoryIds: values.repositoryIds,
        enabled: values.enabled
      });
      message.success(initialValues ? '扫描计划已更新' : '扫描计划已创建');
      onSuccess();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.error || '保存扫描计划失败');
    }
  };

  return (
    <Modal
      title={initialValues ? '编辑扫描计划' : '新建扫描计划'}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="保存"
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="计划名称" rules={[{ required: true, message: '请输入计划名称' }]}>
          <Input placeholder="例如：工作日自动同步" />
        </Form.Item>

        <Form.Item name="schedulePreset" label="执行时间" rules={[{ required: true }]}>
          <Radio.Group options={schedulePresets} optionType="button" buttonStyle="solid" />
        </Form.Item>

        {schedulePreset === 'custom' ? (
          <Form.Item
            name="cronExpression"
            label="Cron 表达式"
            rules={[{ required: true, message: '请输入 Cron 表达式' }]}
            extra="按中国上海时区执行，格式为：分 时 日 月 周"
          >
            <Input placeholder="30 9 * * 1-5" />
          </Form.Item>
        ) : null}

        <Form.Item name="scanRangeType" label="每次扫描范围" rules={[{ required: true }]}>
          <Select options={rangeOptions} />
        </Form.Item>

        <Form.Item
          name="repositoryIds"
          label="数据源范围"
          rules={[{ required: true, type: 'array', min: 1, message: '至少选择一个数据源' }]}
        >
          <Select
            mode="multiple"
            optionFilterProp="label"
            options={repositories.filter((repo) => repo.enabled).map((repo) => ({
              label: repo.name,
              value: repo.id
            }))}
            placeholder="选择需要定时扫描的数据源"
          />
        </Form.Item>

        <Form.Item name="description" label="备注">
          <TextArea rows={2} placeholder="可选" />
        </Form.Item>

        <Form.Item name="enabled" valuePropName="checked">
          {initialValues?.isPrimary ? (
            <Checkbox checked disabled>默认计划必须保持启用</Checkbox>
          ) : (
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateTaskModal;
