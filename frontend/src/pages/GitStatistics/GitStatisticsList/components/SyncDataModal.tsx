import React from 'react'
import { Alert, DatePicker, Descriptions, Modal, Radio, Select, Space, Tag, Typography } from 'antd'
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
    : primaryTask?.repositoryIds ?? []
  const [selectedRepositoryIds, setSelectedRepositoryIds] = React.useState(defaultRepositoryIds)
  const [selectedDateRange, setSelectedDateRange] = React.useState<[Dayjs, Dayjs]>(() => {
    const [start, end] = getPresetRange(preset, dateRange)
    return [dayjs(start), dayjs(end)]
  })
  const [customDateRange, setCustomDateRange] = React.useState(false)

  useUpdateEffect(() => {
    if (!open) return
    const [start, end] = getPresetRange(preset, dateRange)
    setSelectedRepositoryIds(defaultRepositoryIds)
    setSelectedDateRange([dayjs(start), dayjs(end)])
    setCustomDateRange(false)
  }, [open])

  const requestedNames = selectedRepositoryIds.map((id) => (
    repositories.find((repository) => repository.id === id)?.name ?? id
  ))
  const outsidePrimaryCount = selectedRepositoryIds.length > 0 && primaryTask?.repositoryIds?.length
    ? selectedRepositoryIds.filter((id) => !primaryTask.repositoryIds?.includes(id)).length
    : 0

  const handlePresetChange = (nextPreset: ScanTimePresetKey) => {
    onPresetChange(nextPreset)
    const [start, end] = getPresetRange(nextPreset, dateRange)
    setSelectedDateRange([dayjs(start), dayjs(end)])
    setCustomDateRange(false)
  }

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates?.[0] || !dates[1]) return
    setSelectedDateRange([dates[0], dates[1]])
    setCustomDateRange(true)
  }

  return (
    <Modal
      title="同步 Git 数据"
      open={open}
      okText="开始同步"
      cancelText="取消"
      confirmLoading={loading}
      onOk={() => onConfirm(selectedRepositoryIds, selectedDateRange)}
      onCancel={onCancel}
      width={820}
      destroyOnClose
    >
      <Space direction="vertical" size={16} className="w-full">
        <div>
          <Typography.Text strong>仓库范围</Typography.Text>
          <Select
            className="mt-2 w-full"
            mode="multiple"
            value={selectedRepositoryIds}
            onChange={setSelectedRepositoryIds}
            options={repositories.map((repository) => ({ label: repository.name, value: repository.id }))}
            placeholder="请选择仓库，留空表示全部启用仓库"
            allowClear
            maxTagCount="responsive"
          />
        </div>

        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="当前仓库">
            {requestedNames.length > 0
              ? <Space size={[4, 4]} wrap>{requestedNames.map((name) => <Tag key={name}>{name}</Tag>)}</Space>
              : <Typography.Text type="secondary">全部启用仓库</Typography.Text>}
          </Descriptions.Item>
          <Descriptions.Item label="范围来源">
            {selectedRepositoryIds.length > 0 ? '手动选择' : `主任务：${primaryTask?.name ?? '全部启用仓库'}`}
          </Descriptions.Item>
          <Descriptions.Item label="日期范围">
            {selectedDateRange[0].format('YYYY-MM-DD')} 至 {selectedDateRange[1].format('YYYY-MM-DD')}
          </Descriptions.Item>
        </Descriptions>

        {outsidePrimaryCount > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`${outsidePrimaryCount} 个所选仓库不在主任务范围内，后端会自动忽略`}
          />
        ) : null}

        <div>
          <Typography.Text strong>日期范围</Typography.Text>
          <RangePicker
            className="mt-2 w-full"
            value={selectedDateRange}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            allowClear={false}
            placeholder={['开始日期', '结束日期']}
          />
        </div>

        {!customDateRange ? (
          <div>
            <Typography.Text strong>同步日期范围</Typography.Text>
            <Radio.Group
              className="mt-3 w-full"
              value={preset}
              onChange={(event) => handlePresetChange(event.target.value as ScanTimePresetKey)}
            >
              <Space direction="vertical" size={10}>
                {SCAN_TIME_PRESET_OPTIONS.map((option) => (
                  <Radio key={option.value} value={option.value}>{option.label}</Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
        ) : null}
      </Space>
    </Modal>
  )
}
