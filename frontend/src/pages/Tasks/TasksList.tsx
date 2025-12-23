import React from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  StopOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { tasksApi } from '../../services/tasksApi';
import type { ScanTask, CreateTaskParams } from '../../types/tasks';
import CreateTaskModal from './components/CreateTaskModal';

const TasksList: React.FC = () => {
  const [tasks, setTasks] = React.useState<ScanTask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<ScanTask | undefined>();
  const [triggeringTaskId, setTriggeringTaskId] = React.useState<number | null>(null);

  // 加载任务列表
  const loadTasks = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await tasksApi.getTasks();
      setTasks(data);
    } catch (error) {
      message.error('加载任务列表失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 处理创建任务
  const handleCreate = () => {
    setEditingTask(undefined);
    setCreateModalOpen(true);
  };

  // 处理编辑任务
  const handleEdit = (task: ScanTask) => {
    setEditingTask(task);
    setCreateModalOpen(true);
  };

  // 处理删除任务
  const handleDelete = async (id: number) => {
    try {
      await tasksApi.deleteTask(id);
      message.success('任务删除成功');
      loadTasks();
    } catch (error) {
      message.error('删除任务失败');
    }
  };

  // 处理启用/禁用任务
  const handleToggleEnabled = async (task: ScanTask) => {
    try {
      if (task.enabled) {
        await tasksApi.disableTask(task.id);
        message.success('任务已禁用');
      } else {
        await tasksApi.enableTask(task.id);
        message.success('任务已启用');
      }
      loadTasks();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 处理触发任务
  const handleTrigger = async (task: ScanTask) => {
    try {
      setTriggeringTaskId(task.id);
      await tasksApi.triggerTask(task.id);
      message.success(`任务 "${task.name}" 已触发，正在后台执行`);
      // 延迟刷新列表以更新最后执行时间
      setTimeout(() => {
        loadTasks();
      }, 2000);
    } catch (error) {
      message.error('触发任务失败');
    } finally {
      setTriggeringTaskId(null);
    }
  };

  // 获取扫描范围显示文本
  const getScanRangeText = (task: ScanTask) => {
    switch (task.scanRangeType) {
      case '2weeks':
        return '近2周';
      case '1month':
        return '近1个月';
      case '3months':
        return '近3个月';
      case '6months':
        return '近6个月';
      case 'custom':
        return task.startDate && task.endDate
          ? `${dayjs(task.startDate).format('YYYY-MM-DD')} 至 ${dayjs(task.endDate).format('YYYY-MM-DD')}`
          : '自定义';
      default:
        return task.scanRangeType;
    }
  };

  const columns: ColumnsType<ScanTask> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      ellipsis: true
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '类型',
      dataIndex: 'taskType',
      key: 'taskType',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'scheduled' ? 'blue' : 'green'}>
          {type === 'scheduled' ? '定时任务' : '手动任务'}
        </Tag>
      )
    },
    {
      title: '扫描范围',
      key: 'scanRange',
      width: 200,
      render: (_, task) => getScanRangeText(task)
    },
    {
      title: 'Cron 表达式',
      dataIndex: 'cronExpression',
      key: 'cronExpression',
      width: 150,
      render: (cron: string) => cron || '-'
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'success' : 'default'}>
          {enabled ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '最后执行时间',
      dataIndex: 'lastExecuteTime',
      key: 'lastExecuteTime',
      width: 180,
      render: (time: number) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_, task) => (
        <Space size="small">
          <Button
            type="link"
            icon={<PlayCircleOutlined />}
            onClick={() => handleTrigger(task)}
            loading={triggeringTaskId === task.id}
            disabled={!task.enabled}
          >
            触发
          </Button>
          <Button
            type="link"
            icon={task.enabled ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => handleToggleEnabled(task)}
          >
            {task.enabled ? '禁用' : '启用'}
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(task)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个任务吗？"
            onConfirm={() => handleDelete(task.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
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
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            创建任务
          </Button>
          <Button onClick={loadTasks}>
            刷新
          </Button>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={tasks}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1200 }}
        pagination={{
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`
        }}
      />

      <CreateTaskModal
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          setEditingTask(undefined);
        }}
        onSuccess={() => {
          setCreateModalOpen(false);
          setEditingTask(undefined);
          loadTasks();
        }}
        initialValues={editingTask}
        isEdit={!!editingTask}
      />
    </div>
  );
};

export default TasksList;

