import React from 'react';
import { useRequest } from 'ahooks';
import {
  Alert,
  Button,
  Drawer,
  Flex,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { CronExpressionParser } from 'cron-parser';
import { tasksApi } from '../../services/tasksApi';
import { scanRunsApi } from '../../services/scanRunsApi';
import { getRepositoriesConfig } from '../../services/configApi';
import type { ScanRun, ScanRunStatus, ScanTask } from '../../types/tasks';
import CreateTaskModal from './components/CreateTaskModal';

const { Title, Text } = Typography;

const scanRangeLabels: Record<string, string> = {
  '1day': '近 1 天',
  '3days': '近 3 天',
  '7days': '近 7 天',
  '2weeks': '近 2 周',
  '1month': '近 1 个月',
  '3months': '近 3 个月',
  '6months': '近 6 个月'
};

const cronLabels: Record<string, string> = {
  '30 9 * * 1-5': '工作日 09:30',
  '0 9 * * *': '每天 09:00',
  '0 19 * * 1-5': '工作日 19:00'
};

const statusMeta: Record<ScanRunStatus, { color: string; label: string }> = {
  queued: { color: 'default', label: '排队中' },
  running: { color: 'processing', label: '执行中' },
  success: { color: 'success', label: '成功' },
  partial: { color: 'warning', label: '部分成功' },
  failed: { color: 'error', label: '失败' }
};

const getNextExecutionTime = (cronExpression?: string): number | undefined => {
  if (!cronExpression) return undefined;
  try {
    return CronExpressionParser.parse(cronExpression, { tz: 'Asia/Shanghai' }).next().getTime();
  } catch {
    return undefined;
  }
};

const getErrorMessage = (error: any, fallback: string): string =>
  error?.response?.data?.error || fallback;

const TasksList: React.FC = () => {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState<ScanTask>();
  const [selectedRun, setSelectedRun] = React.useState<ScanRun>();
  const [triggeringPlanId, setTriggeringPlanId] = React.useState<number>();
  const [settingPrimaryId, setSettingPrimaryId] = React.useState<number>();

  const { data: plans = [], loading: plansLoading, refresh: refreshPlans } = useRequest(tasksApi.getTasks);
  const { data: repositories = [] } = useRequest(getRepositoriesConfig);
  const {
    data: runs = [],
    loading: runsLoading,
    refresh: refreshRuns
  } = useRequest(() => scanRunsApi.list({ limit: 30 }), { pollingInterval: 3000 });

  const repositoryNames = React.useMemo(
    () => new Map(repositories.map((repository) => [repository.id, repository.name])),
    [repositories]
  );

  const latestRunsByPlan = React.useMemo(() => {
    const result = new Map<number, ScanRun>();
    runs.forEach((run) => {
      if (run.planId && !result.has(run.planId)) result.set(run.planId, run);
    });
    return result;
  }, [runs]);

  const refreshAll = () => {
    refreshPlans();
    refreshRuns();
  };

  const handleTrigger = async (plan: ScanTask) => {
    setTriggeringPlanId(plan.id);
    try {
      const result = await tasksApi.triggerTask(plan.id);
      message.success(`已创建扫描执行 #${result.runId}`);
      refreshAll();
    } catch (error) {
      message.error(getErrorMessage(error, '启动扫描失败'));
    } finally {
      setTriggeringPlanId(undefined);
    }
  };

  const handleToggle = async (plan: ScanTask, enabled: boolean) => {
    try {
      await (enabled ? tasksApi.enableTask(plan.id) : tasksApi.disableTask(plan.id));
      message.success(enabled ? '计划已启用' : '计划已停用');
      refreshPlans();
    } catch (error) {
      message.error(getErrorMessage(error, '更新计划状态失败'));
    }
  };

  const handleSetPrimary = async (plan: ScanTask) => {
    setSettingPrimaryId(plan.id);
    try {
      await tasksApi.setPrimaryTask(plan.id);
      message.success(`“${plan.name}”已设为默认计划`);
      refreshPlans();
    } catch (error) {
      message.error(getErrorMessage(error, '设置默认计划失败'));
    } finally {
      setSettingPrimaryId(undefined);
    }
  };

  const handleDelete = async (plan: ScanTask) => {
    try {
      await tasksApi.deleteTask(plan.id);
      message.success('扫描计划已删除');
      refreshPlans();
    } catch (error) {
      message.error(getErrorMessage(error, '删除扫描计划失败'));
    }
  };

  const planColumns: ColumnsType<ScanTask> = [
    {
      title: '计划',
      dataIndex: 'name',
      width: 220,
      render: (name: string, plan) => (
        <Space size={6} wrap>
          <Text strong>{name}</Text>
          {plan.isPrimary ? <Tag color="gold" icon={<StarFilled />}>默认</Tag> : null}
        </Space>
      )
    },
    {
      title: '执行时间',
      dataIndex: 'cronExpression',
      width: 190,
      render: (cron?: string) => (
        <div>
          <div>{cronLabels[cron ?? ''] || cron || '-'}</div>
          <Text type="secondary" className="text-xs">Asia/Shanghai</Text>
        </div>
      )
    },
    {
      title: '扫描范围',
      dataIndex: 'scanRangeType',
      width: 120,
      render: (value: string) => scanRangeLabels[value] || value
    },
    {
      title: '数据源',
      dataIndex: 'repositoryIds',
      width: 260,
      render: (ids?: string[]) => {
        const names = (ids ?? []).map((id) => repositoryNames.get(id) || id);
        return names.length > 0 ? (
          <Tooltip title={names.join('、')}>
            <Text ellipsis className="block max-w-[240px]">{names.join('、')}</Text>
          </Tooltip>
        ) : <Text type="secondary">全部启用数据源</Text>;
      }
    },
    {
      title: '下次执行',
      width: 170,
      render: (_, plan) => {
        if (!plan.enabled) return <Text type="secondary">已停用</Text>;
        const nextTime = getNextExecutionTime(plan.cronExpression);
        return nextTime ? dayjs(nextTime).format('YYYY-MM-DD HH:mm') : <Text type="danger">Cron 无效</Text>;
      }
    },
    {
      title: '最近结果',
      width: 140,
      render: (_, plan) => {
        const run = latestRunsByPlan.get(plan.id);
        if (!run) return '-';
        const meta = statusMeta[run.status];
        return <Tag color={meta.color}>{meta.label} · +{run.insertedCommits}</Tag>;
      }
    },
    {
      title: '启用',
      width: 80,
      render: (_, plan) => (
        <Tooltip title={plan.isPrimary ? '默认计划必须保持启用' : undefined}>
          <Switch
            size="small"
            checked={plan.enabled}
            disabled={plan.isPrimary}
            onChange={(checked) => handleToggle(plan, checked)}
          />
        </Tooltip>
      )
    },
    {
      title: '操作',
      fixed: 'right',
      width: 190,
      render: (_, plan) => (
        <Space size={2}>
          <Tooltip title="立即执行">
            <Button
              type="text"
              icon={<PlayCircleOutlined />}
              loading={triggeringPlanId === plan.id}
              onClick={() => handleTrigger(plan)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" icon={<EditOutlined />} onClick={() => {
              setEditingPlan(plan);
              setModalOpen(true);
            }} />
          </Tooltip>
          {!plan.isPrimary ? (
            <Tooltip title="设为默认计划">
              <Button
                type="text"
                icon={<StarOutlined />}
                loading={settingPrimaryId === plan.id}
                onClick={() => handleSetPrimary(plan)}
              />
            </Tooltip>
          ) : null}
          <Popconfirm
            title="删除扫描计划？"
            description="历史执行记录会保留。"
            disabled={plan.isPrimary}
            onConfirm={() => handleDelete(plan)}
          >
            <Tooltip title={plan.isPrimary ? '默认计划不能删除' : '删除'}>
              <Button type="text" danger disabled={plan.isPrimary} icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const runColumns: ColumnsType<ScanRun> = [
    { title: '执行 ID', dataIndex: 'id', width: 90, render: (id: number) => `#${id}` },
    {
      title: '触发方式',
      dataIndex: 'triggerSource',
      width: 110,
      render: (source: ScanRun['triggerSource'], run) => source === 'scheduled'
        ? '定时触发'
        : run.planId ? '计划手动执行' : '手动同步'
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: ScanRunStatus) => <Tag color={statusMeta[status].color}>{statusMeta[status].label}</Tag>
    },
    {
      title: '扫描日期',
      width: 220,
      render: (_, run) => `${dayjs(run.rangeStart).format('YYYY-MM-DD')} 至 ${dayjs(run.rangeEnd).format('YYYY-MM-DD')}`
    },
    { title: '数据源', dataIndex: 'requestedRepositoryIds', width: 90, render: (ids: string[]) => `${ids.length} 个` },
    { title: '新增', dataIndex: 'insertedCommits', width: 90, render: (value: number) => `+${value}` },
    { title: '去重跳过', dataIndex: 'skippedCommits', width: 100 },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      width: 170,
      render: (value?: number) => value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '耗时',
      width: 100,
      render: (_, run) => run.startedAt && run.finishedAt
        ? `${Math.max(1, Math.round((run.finishedAt - run.startedAt) / 1000))} 秒`
        : '-'
    }
  ];

  return (
    <div className="p-3">
      <Flex justify="space-between" align="center" wrap gap={12} className="mb-4">
        <div>
          <Title level={3} className="m-0">扫描计划</Title>
          <Text type="secondary">管理自动同步时间、扫描范围与数据源，所有时间按中国上海时区执行。</Text>
        </div>
        <Space>
          <Tooltip title="刷新">
            <Button icon={<ReloadOutlined />} onClick={refreshAll} />
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditingPlan(undefined);
            setModalOpen(true);
          }}>新建计划</Button>
        </Space>
      </Flex>

      <Alert
        className="mb-3"
        type="info"
        showIcon
        message="手动同步不会创建计划；首次接入数据源默认回溯 1 个月，日常同步默认使用较短时间范围。"
      />

      <Table
        columns={planColumns}
        dataSource={plans}
        loading={plansLoading}
        rowKey="id"
        pagination={false}
        scroll={{ x: 1320 }}
        locale={{ emptyText: '暂无定时扫描计划' }}
      />

      <Flex justify="space-between" align="center" className="mb-3 mt-16">
        <Title level={4} className="m-0">最近执行</Title>
        <Text type="secondary">点击一行查看逐数据源结果</Text>
      </Flex>
      <Table
        columns={runColumns}
        dataSource={runs}
        loading={runsLoading}
        rowKey="id"
        size="middle"
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        onRow={(run) => ({ onClick: () => setSelectedRun(run), style: { cursor: 'pointer' } })}
        locale={{ emptyText: '暂无扫描执行记录' }}
      />

      <CreateTaskModal
        open={modalOpen}
        initialValues={editingPlan}
        onCancel={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          refreshPlans();
        }}
      />

      <Drawer
        title={selectedRun ? `扫描执行 #${selectedRun.id}` : '扫描执行详情'}
        open={Boolean(selectedRun)}
        width={760}
        onClose={() => setSelectedRun(undefined)}
      >
        {selectedRun ? (
          <>
            {selectedRun.errorMessage ? <Alert type="error" showIcon message={selectedRun.errorMessage} className="mb-4" /> : null}
            <Table
              rowKey="id"
              pagination={false}
              dataSource={selectedRun.results}
              columns={[
                { title: '数据源', dataIndex: 'repoName' },
                {
                  title: '结果',
                  dataIndex: 'status',
                  width: 100,
                  render: (status: string) => <Tag color={status === 'success' ? 'success' : status === 'failed' ? 'error' : 'warning'}>{status === 'success' ? '成功' : status === 'failed' ? '失败' : '跳过'}</Tag>
                },
                { title: '新增', dataIndex: 'insertedCommits', width: 80 },
                { title: '去重', dataIndex: 'skippedCommits', width: 80 },
                { title: '错误', dataIndex: 'errorMessage', ellipsis: true, render: (value?: string) => value || '-' }
              ]}
            />
          </>
        ) : null}
      </Drawer>
    </div>
  );
};

export default TasksList;
