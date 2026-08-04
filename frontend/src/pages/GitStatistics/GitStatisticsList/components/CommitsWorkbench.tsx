import React from 'react'
import { Collapse, Empty, Space, Tag, Timeline, Tooltip, Typography } from 'antd'
import { ClockCircleOutlined, CopyOutlined } from '@ant-design/icons'
import { useUpdateEffect } from 'ahooks'
import type { Commit, CommitsByDate, WorkStatusMetricsConfig } from '../../../../types/gitStatistics'

const { Text } = Typography

interface CommitsWorkbenchProps {
  data: CommitsByDate[]
  metricsConfig: WorkStatusMetricsConfig | null
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00+08:00`))
}

function renderCommit(commit: Commit) {
  return (
    <div className="min-w-0 rounded border border-neutral-200 bg-white px-3 py-2 [content-visibility:auto]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Space size={[6, 4]} wrap className="min-w-0">
          <Tag color="blue">{commit.repoName}</Tag>
          <Tag>{commit.authorName}</Tag>
          <Text
            code
            copyable={{ text: commit.commitHash, icon: <CopyOutlined aria-label="复制 Commit Hash" /> }}
          >
            {commit.commitHash.slice(0, 7)}
          </Text>
          <Text className="font-medium text-[#1677ff]">
            {timeFormatter.format(new Date(commit.commitDate))}
          </Text>
          {commit.branch ? <Tag color="geekblue">{commit.branch}</Tag> : null}
          {commit.isOvertime ? <Tag color="red">加班</Tag> : null}
        </Space>
        <Space size={12} wrap className="text-sm">
          <Text type="secondary">文件 {commit.filesChanged}</Text>
          <Text className="text-green-700">+{commit.insertions}</Text>
          <Text className="text-red-700">-{commit.deletions}</Text>
        </Space>
      </div>
      <div className="mt-2 break-words text-sm text-neutral-800">{commit.message}</div>
    </div>
  )
}

export const CommitsWorkbench: React.FC<CommitsWorkbenchProps> = ({ data, metricsConfig }) => {
  const [activeDates, setActiveDates] = React.useState<string[]>(() => (
    data[0]?.date ? [data[0].date] : []
  ))

  useUpdateEffect(() => {
    setActiveDates(data[0]?.date ? [data[0].date] : [])
  }, [data])

  if (data.length === 0) {
    return <Empty description="当前筛选条件下没有匹配的提交" />
  }

  return (
    <Collapse
      activeKey={activeDates}
      onChange={(keys) => setActiveDates((Array.isArray(keys) ? keys : [keys]).map(String))}
      className="border-x-0 border-b-0"
      items={data.map((group) => ({
        key: group.date,
        label: (
          <Space size={[8, 8]} wrap>
            <Text strong>{formatDate(group.date)}</Text>
            <Text type="secondary">共 {group.totalCommits} 条提交</Text>
            <Tag color={metricsConfig?.colors[group.workStatus] ?? 'default'}>
              {metricsConfig?.labels[group.workStatus] ?? group.workStatus}
            </Tag>
            {group.hasRelease ? <Tag color="purple">发版</Tag> : null}
            {group.overtimeCount > 0 ? (
              <Tooltip title={group.latestOvertimeCommits.join('、')}>
                <Tag color="red" icon={<ClockCircleOutlined />}>加班 {group.overtimeCount}</Tag>
              </Tooltip>
            ) : null}
            {group.repositories.map((repository) => <Tag key={repository} color="blue">{repository}</Tag>)}
          </Space>
        ),
        children: (
          <div className="px-1 py-2">
            <Text type="secondary" className="mb-3 block">
              按上海时间从早到晚，共 {group.commits.length} 条提交
            </Text>
            <Timeline
              items={[...group.commits]
                .sort((a, b) => a.commitDate - b.commitDate)
                .map((commit) => ({
                  key: commit.id,
                  color: commit.isOvertime ? 'red' : 'blue',
                  children: renderCommit(commit),
                }))}
            />
          </div>
        ),
      }))}
    />
  )
}
