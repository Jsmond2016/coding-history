import React from 'react'
import { DatePicker, Form, Modal, Select, Space, Typography, message } from 'antd'
import { useUpdateEffect } from 'ahooks'
import dayjs, { type Dayjs } from 'dayjs'
import type { Repository } from '../../../../types/gitStatistics'
import type { ScanTask } from '../../../../types/tasks'
import {
  SCAN_TIME_PRESET_OPTIONS,
  getPresetRange,
  type ScanTimePresetKey,
} from '../../../../utils/scanTimeRange'

const { RangePicker } = DatePicker

interface SyncDataModalProps {
  open: boolean
  loading: boolean
  preset: ScanTimePresetKey
  dateRange: [Dayjs, Dayjs]
  repositoryIds: string[]
  repositories: Repository[]
  primaryTask: ScanTask | null
  onPresetChange: (preset: ScanTimePresetKey) => void
  onCancel: () => void
  onConfirm: (repositoryIds: string[], dateRange: [Dayjs, Dayjs]) => void
}

export const SyncDataModal: React.FC<SyncDataModalProps> = ({
  open,
  loading,
  preset,
  dateRange,
  repositoryIds,
  repositories,
  primaryTask,
  onPresetChange,
  onCancel,
  onConfirm,
}) => {
  const defaultRepositoryIds = repositoryIds.length > 0
    ? repositoryIds
    : primaryTask?.repositoryIds?.length
      ? primaryTask.repositoryIds
      : repositories.map((repository) => repository.id)
  const [selectedRepositoryIds, setSelectedRepositoryIds] = React.useState(defaultRepositoryIds)
  const [selectedDateRange, setSelectedDateRange] = React.useState<[Dayjs, Dayjs] | null>(() => {
    const [start, end] = getPresetRange(preset, dateRange)
    return [dayjs(start), dayjs(end)]
  })
  useUpdateEffect(() => {
    if (!open) return
    const [start, end] = getPresetRange(preset, dateRange)
    setSelectedRepositoryIds(defaultRepositoryIds)
    setSelectedDateRange([dayjs(start), dayjs(end)])
  }, [open, repositories, primaryTask, preset, dateRange])

  const handlePresetChange = (nextPreset: ScanTimePresetKey) => {
    onPresetChange(nextPreset)
    const [start, end] = getPresetRange(nextPreset, dateRange)
    setSelectedDateRange([dayjs(start), dayjs(end)])
  }

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    setSelectedDateRange(dates?.[0] && dates[1] ? [dates[0], dates[1]] : null)
  }

  const handleConfirm = () => {
    if (selectedRepositoryIds.length === 0) {
      message.error('请选择至少一个仓库')
      return
    }
    if (!selectedDateRange) {
      message.error('请选择日期范围')
      return
    }
    if (selectedDateRange[0].isAfter(selectedDateRange[1], 'day')) {
      message.error('开始日期不能晚于结束日期')
      return
    }
    const start = selectedDateRange[0]
    const end = selectedDateRange[1]
    if (end.isAfter(start.add(6, 'month').endOf('day'))) {
      Modal.confirm({
        title: '确认扫描长时间范围？',
        content: '当前日期范围超过 6 个月，扫描可能耗时较长或执行失败。若失败，可拆分为更短的时间范围后重新扫描。',
        okText: '确认扫描',
        cancelText: '返回修改',
        onOk: () => onConfirm(selectedRepositoryIds, [start, end]),
      })
      return
    }
    onConfirm(selectedRepositoryIds, [start, end])
  }

  return (
    <Modal
      title="同步 Git 数据"
      open={open}
      okText="开始同步"
      cancelText="取消"
      confirmLoading={loading}
      onOk={handleConfirm}
      onCancel={onCancel}
      width={820}
      destroyOnClose
    >
      <Form layout="vertical" className="w-full">
        <Space direction="vertical" size={16} className="w-full">
          <Form.Item
            label="仓库信息"
            required
            className="!mb-0"
          >
          <Select
            className="w-full"
            mode="multiple"
            value={selectedRepositoryIds}
            onChange={setSelectedRepositoryIds}
            options={repositories.map((repository) => ({ label: repository.name, value: repository.id }))}
            placeholder="请选择仓库"
            allowClear
            maxTagCount="responsive"
          />
          </Form.Item>

          <Form.Item label="日期范围" required className="!mb-0">
          <RangePicker
            className="w-full"
            value={selectedDateRange}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            allowClear
            placeholder={['开始日期', '结束日期']}
            presets={SCAN_TIME_PRESET_OPTIONS.map((option) => ({
              label: option.label,
              value: getPresetRange(option.value, dateRange).map((value) => dayjs(value)) as [Dayjs, Dayjs],
              onClick: () => handlePresetChange(option.value),
            }))}
          />
          </Form.Item>

          <Typography.Text type="secondary">
            可直接选择快捷范围，也可以手动选择日期；超过 6 个月时需确认，扫描可能耗时较长或失败。
          </Typography.Text>
        </Space>
      </Form>
    </Modal>
  )
}
