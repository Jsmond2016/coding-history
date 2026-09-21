import React from 'react';
import { Card, Form, InputNumber, Input, Button, Space, Tag, message, Row, Col, Typography, DatePicker } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getDataMetricsConfig,
  updateDataMetricsConfig,
  type DataMetricsConfig,
  type UpdateDataMetricsConfigParams
} from '../../../services/configApi';
import type { WorkStatus } from '../../../types/gitStatistics';

const { Title, Text } = Typography;

const workStatusKeys: WorkStatus[] = ['relaxed', 'normal', 'busy', 'crazy', 'overtime', 'superCrazyOvertime'];

const validColors = [
  'default',
  'processing',
  'success',
  'error',
  'warning',
  'magenta',
  'red',
  'volcano',
  'orange',
  'gold',
  'lime',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple'
];

const DataMetricsConfig: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState<DataMetricsConfig | null>(null);

  // 加载配置
  const loadConfig = React.useCallback(async () => {
    try {
      const data = await getDataMetricsConfig();
      setConfig(data);
      form.setFieldsValue({
        thresholds: data.thresholds,
        overtimeHour: data.overtimeHour,
        labels: data.labels,
        colors: data.colors,
        hireDate: data.hireDate ? dayjs(data.hireDate) : null
      });
    } catch (error) {
      message.error('加载数据指标配置失败');
      console.error(error);
    }
  }, [form]);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 处理保存
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const params: UpdateDataMetricsConfigParams = {
        thresholds: values.thresholds,
        overtimeHour: values.overtimeHour,
        labels: values.labels,
        colors: values.colors,
        hireDate: values.hireDate ? values.hireDate.startOf('day').valueOf() : null
      };

      await updateDataMetricsConfig(params);
      message.success('数据指标配置更新成功');
      loadConfig();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      const errorMessage = error?.response?.data?.error || error?.message || '更新数据指标配置失败';
      message.error(errorMessage);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 获取当前表单值用于预览
  const getFormValues = () => {
    try {
      return form.getFieldsValue();
    } catch {
      return null;
    }
  };

  return (
    <div>
      <Card>
        <div className="mb-6">
          <Title level={4} className="m-0">
            数据指标配置
          </Title>
          <Text type="secondary" className="text-sm">
            配置工作状态判断的阈值、标签文本和颜色
          </Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          {/* 阈值配置 */}
          <Card title="提交次数阈值配置" className="mb-1" size="small">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name={['thresholds', 'relaxed']}
                  label="轻松阈值"
                  rules={[
                    { required: true, message: '请输入轻松阈值' },
                    { type: 'number', min: 0, message: '阈值必须 >= 0' }
                  ]}
                  tooltip="提交次数 < 此值：轻松"
                >
                  <InputNumber min={0} className="w-full" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name={['thresholds', 'normal']}
                  label="正常阈值"
                  rules={[
                    { required: true, message: '请输入正常阈值' },
                    { type: 'number', min: 0, message: '阈值必须 >= 0' }
                  ]}
                  tooltip="提交次数 >= 轻松阈值 且 < 此值：正常"
                >
                  <InputNumber min={0} className="w-full" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name={['thresholds', 'busy']}
                  label="忙碌阈值"
                  rules={[
                    { required: true, message: '请输入忙碌阈值' },
                    { type: 'number', min: 0, message: '阈值必须 >= 0' }
                  ]}
                  tooltip="提交次数 >= 正常阈值 且 < 此值：忙碌"
                >
                  <InputNumber min={0} className="w-full" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name={['thresholds', 'superCrazy']}
                  label="疯狂阈值"
                  rules={[
                    { required: true, message: '请输入疯狂阈值' },
                    { type: 'number', min: 0, message: '阈值必须 >= 0' }
                  ]}
                  tooltip="提交次数 >= 忙碌阈值 且 < 此值：疯狂，>= 此值：超级疯狂"
                >
                  <InputNumber min={0} className="w-full" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* 加班时间阈值 */}
          <Card title="加班时间阈值" className="mb-1" size="small">
            <Form.Item
              name="overtimeHour"
              label="加班时间（小时）"
              rules={[
                { required: true, message: '请输入加班时间阈值' },
                { type: 'number', min: 0, max: 23, message: '时间必须在 0-23 之间' }
              ]}
              tooltip="提交时间 >= 此时间：判定为加班"
            >
              <InputNumber min={0} max={23} className="w-full" />
            </Form.Item>
          </Card>

          <Card title="入职时间" className="mb-1" size="small">
            <Form.Item
              name="hireDate"
              label="入职日期"
              tooltip="用于数据看板的全部时间起点和在职天数计算"
            >
              <DatePicker format="YYYY-MM-DD" className="w-full" disabledDate={(date) => date.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </Card>

          {/* 标签文本配置 */}
          <Card title="工作状态标签文本" className="mb-1" size="small">
            <Row gutter={16}>
              {workStatusKeys.map((status) => (
                <Col span={12} key={status}>
                  <Form.Item
                    name={['labels', status]}
                    label={status}
                    rules={[{ required: true, message: `请输入${status}的标签文本` }]}
                  >
                    <Input placeholder="例如: 轻松" />
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </Card>

          {/* 标签颜色配置 */}
          <Card title="工作状态标签颜色" className="mb-1" size="small">
            <Row gutter={16}>
              {workStatusKeys.map((status) => (
                <Col span={12} key={status}>
                  <Form.Item
                    name={['colors', status]}
                    label={status}
                    rules={[
                      { required: true, message: `请选择${status}的标签颜色` },
                      {
                        validator: (_, value) => {
                          if (!value) {
                            return Promise.reject(new Error('请选择颜色'));
                          }
                          if (!validColors.includes(value)) {
                            return Promise.reject(new Error(`无效的颜色值，可选值: ${validColors.join(', ')}`));
                          }
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    <Input placeholder="例如: green" />
                  </Form.Item>
                  <div className="mb-4">
                    <Text type="secondary" className="text-xs">
                      可选颜色: {validColors.join(', ')}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>

          {/* 预览 */}
          <Card title="预览效果" className="mb-1" size="small">
            <Space direction="vertical" className="w-full">
              {workStatusKeys.map((status) => {
                const values = getFormValues();
                const label = values?.labels?.[status] || config?.labels[status] || status;
                const color = values?.colors?.[status] || config?.colors[status] || 'default';
                return (
                  <div key={status} className="flex items-center gap-2">
                    <Text className="w-32">{status}:</Text>
                    <Tag color={color}>{label}</Tag>
                  </div>
                );
              })}
            </Space>
          </Card>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={loading}
              size="large"
            >
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default DataMetricsConfig;
