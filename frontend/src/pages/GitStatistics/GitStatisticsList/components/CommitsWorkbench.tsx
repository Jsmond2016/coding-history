import React from 'react'
import { Empty, Segmented, Space, Tag, Timeline, Tooltip, Typography } from 'antd'
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
  const [selectedDate, setSelectedDate] = React.useState(data[0]?.date ?? '')
  const [selectedRepository, setSelectedRepository] = React.useState('all')

  useUpdateEffect(() => {
    setSelectedDate(data[0]?.date ?? '')
    setSelectedRepository('all')
  }, [data])

  const selectedGroup = data.find((group) => group.date === selectedDate) ?? data[0]
  const repositoryOptions = React.useMemo(() => [
    { label: `全部 (${selectedGroup?.totalCommits ?? 0})`, value: 'all' },
    ...(selectedGroup?.repositories ?? []).map((repository) => ({
      label: repository,
      value: repository,
    })),
  ], [selectedGroup])
  const commits = React.useMemo(() => (
    (selectedGroup?.commits ?? [])
      .filter((commit) => selectedRepository === 'all' || commit.repoName === selectedRepository)
      .sort((a, b) => a.commitDate - b.commitDate)
  ), [selectedGroup, selectedRepository])

  useUpdateEffect(() => {
    setSelectedRepository('all')
  }, [selectedDate])

  if (data.length === 0) {
    return <Empty description="当前筛选条件下没有匹配的提交" />
  }

  return (
    <div className="grid min-h-[560px] grid-cols-1 border border-neutral-200 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="max-h-[680px] overflow-y-auto border-b border-neutral-200 bg-neutral-50 lg:border-b-0 lg:border-r">
        {data.map((group) => {
          const active = group.date === selectedGroup?.date
          const summary = group.commits.find((commit) => !commit.message.toLowerCase().startsWith('merge '))?.message
            ?? group.commits[0]?.message
          return (
            <button
              key={group.date}
              type="button"
              onClick={() => setSelectedDate(group.date)}
              className={`w-full border-0 border-b border-neutral-200 px-3 py-3 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1677ff] ${active ? 'bg-white shadow-[inset_3px_0_0_#1677ff]' : 'bg-transparent hover:bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-neutral-900">{formatDate(group.date)}</span>
                <span className="tabular-nums text-sm text-neutral-500">{group.totalCommits} 条</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {group.overtimeCount > 0 ? (
                  <Tooltip title={group.latestOvertimeCommits.join('、')}>
                    <Tag color="red" icon={<ClockCircleOutlined />}>{group.overtimeCount}</Tag>
                  </Tooltip>
                ) : null}
                {group.hasRelease ? <Tag color="purple">发版</Tag> : null}
                <Tag color={metricsConfig?.colors[group.workStatus] ?? 'default'}>
                  {metricsConfig?.labels[group.workStatus] ?? group.workStatus}
                </Tag>
              </div>
              <div className="mt-2 line-clamp-2 break-words text-xs leading-5 text-neutral-500">{summary}</div>
            </button>
          )
        })}
      </aside>

      <section className="min-w-0 bg-white">
        <div className="border-b border-neutral-200 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Typography.Title level={4} className="!mb-1">
                {selectedGroup ? formatDate(selectedGroup.date) : ''}
              </Typography.Title>
              <Typography.Text type="secondary">
                按上海时间从早到晚，共 {commits.length} 条提交
              </Typography.Text>
            </div>
            <Segmented
              value={selectedRepository}
              onChange={(value) => setSelectedRepository(String(value))}
              options={repositoryOptions}
              aria-label="按仓库查看当天提交"
              className="max-w-full overflow-x-auto"
            />
          </div>
        </div>
        <div className="max-h-[610px] overflow-y-auto px-4 py-4">
          <Timeline
            items={commits.map((commit) => ({
              key: commit.id,
              color: commit.isOvertime ? 'red' : 'blue',
              children: renderCommit(commit),
            }))}
          />
        </div>
      </section>
    </div>
  )
}
