import React from 'react'
import { Alert, Descriptions, Modal, Radio, Space, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { Repository } from '../../../../types/gitStatistics'
import type { ScanTask } from '../../../../types/tasks'
import {
  SCAN_TIME_PRESET_OPTIONS,
  getPresetRange,
  type ScanTimePresetKey,
} from '../../../../utils/scanTimeRange'

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
  onConfirm: () => void
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
  const [startDate, endDate] = getPresetRange(preset, dateRange)
  const requestedIds = repositoryIds.length > 0
    ? repositoryIds
    : primaryTask?.repositoryIds ?? []
  const requestedNames = requestedIds.map((id) => (
    repositories.find((repository) => repository.id === id)?.name ?? id
  ))
  const outsidePrimaryCount = repositoryIds.length > 0 && primaryTask?.repositoryIds?.length
    ? repositoryIds.filter((id) => !primaryTask.repositoryIds?.includes(id)).length
    : 0

  return (
    <Modal
      title="同步 Git 数据"
      open={open}
      okText="开始同步"
      cancelText="取消"
      confirmLoading={loading}
      onOk={onConfirm}
      onCancel={onCancel}
      width={620}
      destroyOnClose
    >
      <Descriptions column={1} size="small" bordered className="mb-4">
        <Descriptions.Item label="仓库范围">
          <Space size={[4, 4]} wrap>
            {requestedNames.length > 0
              ? requestedNames.map((name) => <Tag key={name}>{name}</Tag>)
              : <Typography.Text type="secondary">全部启用仓库</Typography.Text>}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="范围来源">
          {repositoryIds.length > 0 ? '当前筛选仓库' : `主任务：${primaryTask?.name ?? '未配置主任务'}`}
        </Descriptions.Item>
        <Descriptions.Item label="日期范围">
          {dayjs(startDate).format('YYYY-MM-DD')} 至 {dayjs(endDate).format('YYYY-MM-DD')}
        </Descriptions.Item>
      </Descriptions>

      {outsidePrimaryCount > 0 ? (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message={`${outsidePrimaryCount} 个所选仓库不在主任务范围内，后端会自动忽略`}
        />
      ) : null}

      <Typography.Text strong>同步日期范围</Typography.Text>
      <Radio.Group
        className="mt-3 w-full"
        value={preset}
        onChange={(event) => onPresetChange(event.target.value as ScanTimePresetKey)}
      >
        <Space direction="vertical" size={10}>
          {SCAN_TIME_PRESET_OPTIONS.map((option) => (
            <Radio key={option.value} value={option.value}>{option.label}</Radio>
          ))}
        </Space>
      </Radio.Group>
    </Modal>
  )
}
