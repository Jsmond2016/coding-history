import React from 'react'
import { Alert, Button, Collapse, Empty, message, Modal, Space, Spin, Tabs, Tag, Timeline, Tooltip, Typography } from 'antd'
import { ClockCircleOutlined, CopyOutlined, DownloadOutlined, DownOutlined, EyeOutlined } from '@ant-design/icons'
import { useUpdateEffect } from 'ahooks'
import type { Commit, CommitsByDate, WorkStatusMetricsConfig } from '../../../../types/gitStatistics'
import { createCommitDayPosterBlob, downloadCommitDayPosterBlob } from './commitDayPoster'

const { Text } = Typography
const INITIAL_DATE_COUNT = 30
const DATE_BATCH_SIZE = 60
const weekDayLabels = ['日', '一', '二', '三', '四', '五', '六']

interface CommitsWorkbenchProps {
  data: CommitsByDate[]
  metricsConfig: WorkStatusMetricsConfig | null
}

interface PosterPreviewState {
  open: boolean
  date: string | null
  filename: string | null
  blob: Blob | null
  loading: boolean
  error: string | null
}

const emptyPosterPreview: PosterPreviewState = {
  open: false,
  date: null,
  filename: null,
  blob: null,
  loading: false,
  error: null,
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function formatDate(date: string): string {
  const [year, month, day] = date.split('-')
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
  return `${year}/${month}/${day} 周${weekDayLabels[weekday]}`
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

interface CommitTimelineProps {
  commits: Commit[]
}

const CommitTimeline: React.FC<CommitTimelineProps> = ({ commits }) => (
  <Timeline
    items={[...commits]
      .sort((a, b) => a.commitDate - b.commitDate)
      .map((commit) => ({
        key: commit.id,
        color: commit.isOvertime ? 'red' : 'blue',
        children: renderCommit(commit),
      }))}
  />
)

interface CommitDetailsProps {
  group: CommitsByDate
}

/**
 * 日期面板明细：只有日期面板展开后才会挂载，因此不会为折叠日期创建提交卡片。
 */
const CommitDetails: React.FC<CommitDetailsProps> = ({ group }) => {
  const commitsByRepository = React.useMemo(() => group.commits.reduce<Record<string, Commit[]>>((result, commit) => {
    if (!result[commit.repoName]) result[commit.repoName] = []
    result[commit.repoName].push(commit)
    return result
  }, {}), [group.commits])
  const [activeRepository, setActiveRepository] = React.useState('__all__')
  const repositoryNames = [
    ...group.repositories,
    ...Object.keys(commitsByRepository).filter((name) => !group.repositories.includes(name)),
  ]

  if (repositoryNames.length <= 1) {
    return <CommitTimeline commits={group.commits} />
  }

  return (
    <Tabs
      type="card"
      activeKey={activeRepository}
      onChange={setActiveRepository}
      items={[
        {
          key: '__all__',
          label: `当日全览 (${group.commits.length})`,
          children: activeRepository === '__all__' ? <CommitTimeline commits={group.commits} /> : null,
        },
        ...repositoryNames.map((repository) => ({
          key: repository,
          label: `${repository} (${commitsByRepository[repository]?.length ?? 0})`,
          children: activeRepository === repository
            ? <CommitTimeline commits={commitsByRepository[repository] ?? []} />
            : null,
        })),
      ]}
    />
  )
}

export const CommitsWorkbench: React.FC<CommitsWorkbenchProps> = ({ data, metricsConfig }) => {
  const [activeDates, setActiveDates] = React.useState<string[]>(() => (
    []
  ))
  const [visibleDateCount, setVisibleDateCount] = React.useState(INITIAL_DATE_COUNT)
  const [previewingDate, setPreviewingDate] = React.useState<string | null>(null)
  const [posterPreview, setPosterPreview] = React.useState<PosterPreviewState>(emptyPosterPreview)
  const [posterPreviewUrl, setPosterPreviewUrl] = React.useState<string | null>(null)
  const previewRequestIdRef = React.useRef(0)
  const activeDateSet = React.useMemo(() => new Set(activeDates), [activeDates])

  React.useEffect(() => {
    if (!posterPreview.blob) {
      setPosterPreviewUrl(null)
      return undefined
    }

    const objectUrl = URL.createObjectURL(posterPreview.blob)
    setPosterPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [posterPreview.blob])

  useUpdateEffect(() => {
    setActiveDates([])
    setVisibleDateCount(INITIAL_DATE_COUNT)
  }, [data])

  const visibleGroups = React.useMemo(
    () => data.slice(0, visibleDateCount),
    [data, visibleDateCount],
  )
  const nextBatchSize = Math.min(DATE_BATCH_SIZE, data.length - visibleGroups.length)

  const handleClosePosterPreview = React.useCallback(() => {
    previewRequestIdRef.current += 1
    setPreviewingDate(null)
    setPosterPreview(emptyPosterPreview)
  }, [])

  const handlePreviewPoster = React.useCallback(async (group: CommitsByDate) => {
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId
    setPreviewingDate(group.date)
    setPosterPreview({
      ...emptyPosterPreview,
      open: true,
      date: group.date,
      loading: true,
    })

    try {
      const { blob, filename } = await createCommitDayPosterBlob(group, metricsConfig)
      if (requestId !== previewRequestIdRef.current) return
      setPosterPreview({
        open: true,
        date: group.date,
        filename,
        blob,
        loading: false,
        error: null,
      })
    } catch (error) {
      if (requestId !== previewRequestIdRef.current) return
      const err = error instanceof Error ? error.message : '导出失败'
      setPosterPreview((current) => ({
        ...current,
        loading: false,
        error: err,
      }))
      message.error(err)
    } finally {
      if (requestId === previewRequestIdRef.current) {
        setPreviewingDate((current) => (current === group.date ? null : current))
      }
    }
  }, [metricsConfig])

  const handleConfirmPoster = React.useCallback(() => {
    if (!posterPreview.blob || !posterPreview.filename) return
    downloadCommitDayPosterBlob(posterPreview.blob, posterPreview.filename)
    message.success(`已生成 ${posterPreview.filename}`)
    handleClosePosterPreview()
  }, [handleClosePosterPreview, posterPreview.blob, posterPreview.filename])

  if (data.length === 0) {
    return <Empty description="当前筛选条件下没有匹配的提交" />
  }

  return (
    <>
      <Collapse
        activeKey={activeDates}
        onChange={(keys) => setActiveDates((Array.isArray(keys) ? keys : [keys]).map(String))}
        className="border-x-0 border-b-0"
        items={visibleGroups.map((group) => ({
          key: group.date,
          label: (
            <div className="flex w-full items-start justify-between gap-3 pr-2">
              <Space size={[8, 8]} wrap className="min-w-0 flex-1">
                <Text strong>{formatDate(group.date)}</Text>
                <Text type="secondary">共 {group.totalCommits} 条提交</Text>
                <Tag color={metricsConfig?.colors[group.workStatus] ?? 'default'}>
                  {metricsConfig?.labels[group.workStatus] ?? group.workStatus}
                </Tag>
                {group.hasRelease ? <Tag color="purple">发版</Tag> : null}
                {group.overtimeCount > 0 ? (
                  <Tooltip
                    title={(
                      <div>
                        <div className="mb-1 font-medium">加班提交时间</div>
                        {group.latestOvertimeCommits.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {group.latestOvertimeCommits.map((time) => <div key={time}>{time}</div>)}
                          </div>
                        ) : '暂无数据'}
                      </div>
                    )}
                  >
                    <Tag color="red" icon={<ClockCircleOutlined />}>加班 {group.overtimeCount}</Tag>
                  </Tooltip>
                ) : null}
                {group.repositories.map((repository) => <Tag key={repository} color="blue">{repository}</Tag>)}
              </Space>
              <Tooltip title="预览当日记录图片">
                <Button
                  type="text"
                  size="small"
                  className="shrink-0"
                  icon={<EyeOutlined />}
                  loading={previewingDate === group.date}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handlePreviewPoster(group)
                  }}
                />
              </Tooltip>
            </div>
          ),
          children: (
            activeDateSet.has(group.date) ? (
              <div className="px-1 py-2">
                <CommitDetails group={group} />
              </div>
            ) : null
          ),
        }))}
      />

      {nextBatchSize > 0 ? (
        <div className="flex justify-center border-t border-neutral-100 py-3">
          <Space size="middle">
            <Button
              type="link"
              icon={<DownOutlined />}
              onClick={() => setVisibleDateCount((count) => Math.min(count + DATE_BATCH_SIZE, data.length))}
            >
              展开后续 {nextBatchSize} 天
            </Button>
            <Button type="link" onClick={() => setVisibleDateCount(data.length)}>
              展开所有（剩余 {data.length - visibleGroups.length} 天）
            </Button>
          </Space>
        </div>
      ) : null}

      <Modal
        title={posterPreview.date ? `${posterPreview.date} 提交记录图片预览` : '提交记录图片预览'}
        open={posterPreview.open}
        width={1120}
        centered
        destroyOnClose
        onCancel={handleClosePosterPreview}
        footer={[
          <Button key="cancel" onClick={handleClosePosterPreview}>
            取消
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            disabled={!posterPreview.blob || !posterPreview.filename || posterPreview.loading}
            onClick={handleConfirmPoster}
          >
            确认生成
          </Button>,
        ]}
      >
        {posterPreview.error ? (
          <Alert type="error" showIcon message={posterPreview.error} />
        ) : null}
        <Spin spinning={posterPreview.loading} tip="正在生成预览...">
          {posterPreviewUrl ? (
            <div className="max-h-[68vh] overflow-auto rounded border border-neutral-200 bg-[#f2eee7] p-3">
              <img
                src={posterPreviewUrl}
                alt={posterPreview.filename ?? '提交记录图片预览'}
                className="mx-auto block h-auto max-w-full rounded bg-white shadow-sm"
              />
            </div>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded border border-dashed border-neutral-200 bg-neutral-50 text-neutral-500">
              {posterPreview.loading ? '正在准备预览' : '暂无预览'}
            </div>
          )}
        </Spin>
      </Modal>
    </>
  )
}
