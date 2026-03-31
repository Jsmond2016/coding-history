import React from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Card, Modal, Form, Select, DatePicker } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  StopOutlined,
  CalendarOutlined,
  HolderOutlined
} from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import { CronExpressionParser } from 'cron-parser';
import { tasksApi } from '../../services/tasksApi';
import type { ScanTask, ScanRangeType } from '../../types/tasks';
import CreateTaskModal from './components/CreateTaskModal';

const { RangePicker } = DatePicker;
const { Option } = Select;

const SCAN_RANGE_OPTIONS: { value: ScanRangeType; label: string }[] = [
  { value: '1day', label: '近1天' },
  { value: '3days', label: '近3天' },
  { value: '7days', label: '近7天' },
  { value: '2weeks', label: '近2周' },
  { value: '1month', label: '近1个月' },
  { value: '3months', label: '近3个月' },
  { value: '6months', label: '近6个月' },
  { value: 'custom', label: '自定义时间范围' }
];

/**
 * 获取 cron 表达式的下次执行时间（用于排序）
 */
const getNextExecutionTime = (cronExpression: string): number => {
  try {
    const interval = CronExpressionParser.parse(cronExpression);
    const next = interval.next();
    return next.getTime();
  } catch {
    return Infinity;
  }
};

/**
 * 默认排序逻辑（用于重置排序时计算）：
 * 1. scheduled 任务在前，manual 任务在后
 * 2. scheduled 任务按下次执行时间排序
 * 3. manual 任务按最后执行时间排序（未执行的排后面）
 */
const calculateDefaultSortOrder = (tasks: ScanTask[]): Array<{ id: number; sortOrder: number }> => {
  const sorted = [...tasks].sort((a, b) => {
    // 1. 按类型排序：scheduled 在前
    if (a.taskType !== b.taskType) {
      return a.taskType === 'scheduled' ? -1 : 1;
    }

    // 2. 同类型按时间排序
    if (a.taskType === 'scheduled') {
      // scheduled 按下次执行时间排序
      const aNext = a.cronExpression ? getNextExecutionTime(a.cronExpression) : Infinity;
      const bNext = b.cronExpression ? getNextExecutionTime(b.cronExpression) : Infinity;
      return aNext - bNext;
    } else {
      // manual 按最后执行时间排序（未执行的排后面）
      const aLast = a.lastExecuteTime || 0;
      const bLast = b.lastExecuteTime || 0;
      return bLast - aLast; // 最近执行的在前
    }
  });

  return sorted.map((task, index) => ({
    id: task.id,
    sortOrder: index
  }));
};

/**
 * 可拖拽的行组件
 */
interface SortableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

const SortableRow: React.FC<SortableRowProps> = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key']
  });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { background: '#fafafa', zIndex: 9999 } : {})
  };

  // 找到拖拽手柄列并添加拖拽监听器
  const childrenWithDragHandle = React.Children.map(props.children, (child) => {
    if (React.isValidElement(child)) {
      const childProps = child.props as { className?: string };
      if (childProps.className?.includes('drag-handle-cell')) {
        return React.cloneElement(child, {
          children: (
            <div {...listeners} className="cursor-grab active:cursor-grabbing">
              <HolderOutlined className="text-gray-400 hover:text-gray-600" />
            </div>
          )
        } as React.Attributes);
      }
    }
    return child;
  });

  return (
    <tr {...props} ref={setNodeRef} style={style} {...attributes}>
      {childrenWithDragHandle}
    </tr>
  );
};

const TasksList: React.FC = () => {
  const [tasks, setTasks] = React.useState<ScanTask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<ScanTask | undefined>();
  const [triggeringTaskId, setTriggeringTaskId] = React.useState<number | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<React.Key[]>([]);
  const [batchScanModalOpen, setBatchScanModalOpen] = React.useState(false);
  const [batchScanSubmitting, setBatchScanSubmitting] = React.useState(false);
  const [batchTriggering, setBatchTriggering] = React.useState(false);
  const [batchScanForm] = Form.useForm<{ scanRangeType: ScanRangeType; dateRange?: [dayjs.Dayjs, dayjs.Dayjs] }>();

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5 // 需要拖拽 5px 才开始
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // 加载任务列表（后端已按 sortOrder 排序）
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

  // 批量触发选中的任务（仅触发已启用的任务）
  const handleBatchTrigger = async () => {
    const ids = selectedRowKeys.map(Number).filter((id) => !Number.isNaN(id));
    const toTrigger = tasks.filter((t) => ids.includes(t.id) && t.enabled);
    if (toTrigger.length === 0) {
      message.warning('所选任务中无已启用的任务，无法触发');
      return;
    }
    setBatchTriggering(true);
    try {
      for (const task of toTrigger) {
        await tasksApi.triggerTask(task.id);
      }
      message.success(`已触发 ${toTrigger.length} 个任务，正在后台执行`);
      setTimeout(() => loadTasks(), 2000);
    } catch (e) {
      message.error('批量触发失败');
      console.error(e);
    } finally {
      setBatchTriggering(false);
    }
  };

  // 打开批量设置扫描范围弹窗
  const handleOpenBatchScanModal = () => {
    batchScanForm.setFieldsValue({ scanRangeType: '3days', dateRange: undefined });
    setBatchScanModalOpen(true);
  };

  // 批量设置扫描范围提交
  const handleBatchScanRangeSubmit = async () => {
    try {
      const values = await batchScanForm.validateFields();
      const { scanRangeType, dateRange } = values;
      const params: { scanRangeType: ScanRangeType; startDate?: number; endDate?: number } = {
        scanRangeType
      };
      if (scanRangeType === 'custom') {
        if (!dateRange?.[0] || !dateRange?.[1]) {
          message.error('请选择自定义时间范围');
          return;
        }
        const spanDays = dateRange[1].diff(dateRange[0], 'day');
        if (spanDays > 180) {
          message.error('时间跨度不能超过6个月（180天）');
          return;
        }
        params.startDate = dateRange[0].startOf('day').valueOf();
        params.endDate = dateRange[1].endOf('day').valueOf();
      }
      setBatchScanSubmitting(true);
      const ids = selectedRowKeys.map(Number).filter((id) => !Number.isNaN(id));
      for (const id of ids) {
        await tasksApi.updateTask(id, params);
      }
      message.success(`已为 ${ids.length} 个任务更新扫描范围`);
      setBatchScanModalOpen(false);
      setSelectedRowKeys([]);
      loadTasks();
    } catch (e) {
      if ((e as { errorFields?: unknown[] })?.errorFields) return;
      message.error('批量设置失败');
      console.error(e);
    } finally {
      setBatchScanSubmitting(false);
    }
  };

  // 处理拖拽结束
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((item) => String(item.id) === active.id);
      const newIndex = tasks.findIndex((item) => String(item.id) === over.id);
      const newTasks = arrayMove(tasks, oldIndex, newIndex);

      // 立即更新 UI
      setTasks(newTasks);

      // 保存排序到后端
      try {
        const sortOrders = newTasks.map((task, index) => ({
          id: task.id,
          sortOrder: index
        }));
        await tasksApi.batchUpdateSortOrder(sortOrders);
        message.success('排序已保存');
      } catch (error) {
        message.error('保存排序失败');
        console.error(error);
        // 失败时重新加载列表
        loadTasks();
      }
    }
  };

  // 重置为默认排序
  const handleResetSort = async () => {
    try {
      const sortOrders = calculateDefaultSortOrder(tasks);
      await tasksApi.batchUpdateSortOrder(sortOrders);

      // 重新按默认排序排列本地数据
      const sortedTasks = [...tasks].sort((a, b) => {
        const aOrder = sortOrders.find(s => s.id === a.id)?.sortOrder ?? 0;
        const bOrder = sortOrders.find(s => s.id === b.id)?.sortOrder ?? 0;
        return aOrder - bOrder;
      });
      setTasks(sortedTasks);

      message.success('已恢复默认排序');
    } catch (error) {
      message.error('恢复默认排序失败');
      console.error(error);
    }
  };

  // 获取扫描范围显示文本
  const getScanRangeText = (task: ScanTask) => {
    switch (task.scanRangeType) {
      case '1day':
        return '近1天';
      case '3days':
        return '近3天';
      case '7days':
        return '近7天';
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
      key: 'drag',
      width: 40,
      className: 'drag-handle-cell',
      render: () => null
    },
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

  // 表格配置
  const tableComponents: TableProps<ScanTask>['components'] = {
    body: {
      row: SortableRow
    }
  };

  return (
    <div className="p-3">
      <Card className="mb-4">
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            创建任务
          </Button>
          <Button
            icon={<CalendarOutlined />}
            onClick={handleOpenBatchScanModal}
            disabled={selectedRowKeys.length === 0}
          >
            批量设置扫描范围{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
          </Button>
          <Popconfirm
            title={`确定要触发选中的 ${selectedRowKeys.length} 个任务吗？`}
            description="仅会触发已启用的任务，禁用任务将自动跳过。"
            onConfirm={handleBatchTrigger}
            okText="确定触发"
            cancelText="取消"
          >
            <Button
              icon={<PlayCircleOutlined />}
              loading={batchTriggering}
              disabled={selectedRowKeys.length === 0}
            >
              批量触发{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
            </Button>
          </Popconfirm>
          <Button onClick={handleResetSort}>
            恢复默认排序
          </Button>
          <Button onClick={loadTasks}>
            刷新
          </Button>
        </Space>
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tasks.map((t) => String(t.id))}
          strategy={verticalListSortingStrategy}
        >
          <Table
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys)
            }}
            columns={columns}
            dataSource={tasks}
            loading={loading}
            rowKey={(record) => String(record.id)}
            scroll={{ x: 1200 }}
            pagination={{
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`
            }}
            components={tableComponents}
          />
        </SortableContext>
      </DndContext>

      <Modal
        title="批量设置扫描范围"
        open={batchScanModalOpen}
        onCancel={() => setBatchScanModalOpen(false)}
        onOk={handleBatchScanRangeSubmit}
        confirmLoading={batchScanSubmitting}
        okText="确定"
        cancelText="取消"
        destroyOnClose
        width={440}
      >
        <Form
          form={batchScanForm}
          layout="vertical"
          initialValues={{ scanRangeType: '3days' }}
        >
          <Form.Item
            name="scanRangeType"
            label="扫描范围"
            rules={[{ required: true, message: '请选择扫描范围' }]}
          >
            <Select>
              {SCAN_RANGE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.scanRangeType !== curr.scanRangeType}
          >
            {({ getFieldValue }) =>
              getFieldValue('scanRangeType') === 'custom' ? (
                <Form.Item
                  name="dateRange"
                  label="时间范围"
                  rules={[{ required: true, message: '请选择时间范围' }]}
                  extra="最大支持6个月（180天）跨度"
                >
                  <RangePicker
                    style={{ width: '100%' }}
                    format="YYYY-MM-DD"
                    disabledDate={(current) =>
                      current ? current > dayjs().endOf('day') : false
                    }
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
        <div className="text-neutral-500 text-sm mt-1">
          已选 {selectedRowKeys.length} 个任务，将统一修改为上述扫描范围。
        </div>
      </Modal>

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
