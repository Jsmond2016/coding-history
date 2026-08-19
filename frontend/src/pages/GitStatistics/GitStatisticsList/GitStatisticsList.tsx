import React from 'react'
import { Alert, Button, Card, Col, Empty, Row, Space, Spin, Tag, Typography, message } from 'antd'
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons'
import { useAtom, useSetAtom } from 'jotai'
import { useMount } from 'ahooks'
import { useSearchParams } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import { StatisticsFilter } from './components/StatisticsFilter'
import { StatisticsCards } from './components/StatisticsCards'
import { WorkStatusCards, WorkStatusReport } from './components/WorkStatusReport'
import { CommitsWorkbench } from './components/CommitsWorkbench'
import { SyncDataModal } from './components/SyncDataModal'
import {
  defaultFilterState,
  filterAtom,
  statisticsAtom,
  repositoriesAtom,
  authorsAtom,
  type FilterState,
} from '../../../biz/atoms/gitStatistics.atom'
import { gitStatisticsApi } from '../../../services/gitStatisticsApi'
import { tasksApi } from '../../../services/tasksApi'
import type {
  CommitType,
  CommitsByDate,
  OvertimeMode,
  WorkStatusMetricsConfig,
} from '../../../types/gitStatistics'
import type { ScanTask } from '../../../types/tasks'
import { useScan } from '../../../biz/hooks/useScan'
import { filterCommitGroups } from '../../../utils/commitFilters'
import {
  type ScanTimePresetKey,
} from '../../../utils/scanTimeRange'

const VALID_OVERTIME_MODES = new Set<OvertimeMode>([
  'all',
  'overtime_days',
  'overtime_commits',
  'non_overtime_days',
])
const VALID_COMMIT_TYPES = new Set<CommitType>([
  'feat', 'fix', 'refactor', 'docs', 'merge', 'release', 'chore', 'other',
])

function cloneFilter(filter: FilterState): FilterState {
  return {
    ...filter,
    dateRange: [filter.dateRange[0], filter.dateRange[1]],
    repositoryIds: [...filter.repositoryIds],
    authorEmails: [...filter.authorEmails],
    commitTypes: [...filter.commitTypes],
  }
}

function filterSignature(filter: FilterState): string {
  return JSON.stringify({
    start: filter.dateRange[0].format('YYYY-MM-DD'),
    end: filter.dateRange[1].format('YYYY-MM-DD'),
    repos: [...filter.repositoryIds].sort(),
    authors: [...filter.authorEmails].sort(),
    overtimeMode: filter.overtimeMode,
    keyword: filter.keyword.trim(),
    commitTypes: [...filter.commitTypes].sort(),
  })
}

function parseFilter(searchParams: URLSearchParams): FilterState {
  const start = dayjs(searchParams.get('start'))
  const end = dayjs(searchParams.get('end'))
  const overtime = searchParams.get('overtime') as OvertimeMode | null
  const commitTypes = (searchParams.get('types')?.split(',') ?? [])
    .filter((value): value is CommitType => VALID_COMMIT_TYPES.has(value as CommitType))

  return {
    dateRange: start.isValid() && end.isValid() && !end.isBefore(start)
      ? [start, end]
      : defaultFilterState.dateRange,
    repositoryIds: searchParams.get('repos')?.split(',').filter(Boolean) ?? [],
    authorEmails: searchParams.get('authors')?.split(',').filter(Boolean) ?? [],
    overtimeMode: overtime && VALID_OVERTIME_MODES.has(overtime) ? overtime : 'all',
    keyword: searchParams.get('q') ?? '',
    commitTypes,
  }
}

function toSearchParams(filter: FilterState): URLSearchParams {
  const params = new URLSearchParams({
    start: filter.dateRange[0].format('YYYY-MM-DD'),
    end: filter.dateRange[1].format('YYYY-MM-DD'),
  })
  if (filter.repositoryIds.length) params.set('repos', filter.repositoryIds.join(','))
  if (filter.authorEmails.length) params.set('authors', filter.authorEmails.join(','))
  if (filter.overtimeMode !== 'all') params.set('overtime', filter.overtimeMode)
  if (filter.keyword.trim()) params.set('q', filter.keyword.trim())
  if (filter.commitTypes.length) params.set('types', filter.commitTypes.join(','))
  return params
}

function buildStatistics(groups: CommitsByDate[]) {
  const commits = groups.flatMap((group) => group.commits)
  const byRepositoryMap = new Map<string, {
    repoId: string
    repoName: string
    commits: number
    insertions: number
    deletions: number
  }>()

  commits.forEach((commit) => {
    const current = byRepositoryMap.get(commit.repoId) ?? {
      repoId: commit.repoId,
      repoName: commit.repoName,
      commits: 0,
      insertions: 0,
      deletions: 0,
    }
    current.commits += 1
    current.insertions += commit.insertions
    current.deletions += commit.deletions
    byRepositoryMap.set(commit.repoId, current)
  })

  return {
    totalCommits: commits.length,
    totalInsertions: commits.reduce((sum, commit) => sum + commit.insertions, 0),
    totalDeletions: commits.reduce((sum, commit) => sum + commit.deletions, 0),
    totalFilesChanged: commits.reduce((sum, commit) => sum + commit.filesChanged, 0),
    byRepository: Array.from(byRepositoryMap.values()),
    byDate: groups.map((group) => ({
      date: group.date,
      commits: group.totalCommits,
      insertions: group.commits.reduce((sum, commit) => sum + commit.insertions, 0),
      deletions: group.commits.reduce((sum, commit) => sum + commit.deletions, 0),
    })),
  }
}

const GitStatisticsList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = React.useMemo(() => parseFilter(searchParams), [])
  const [filter, setFilter] = useAtom(filterAtom)
  const setStatistics = useSetAtom(statisticsAtom)
  const [repositories, setRepositories] = useAtom(repositoriesAtom)
  const setAuthors = useSetAtom(authorsAtom)
  const [appliedFilter, setAppliedFilter] = React.useState<FilterState>(() => cloneFilter(initialFilter))
  const [commitsByDate, setCommitsByDate] = React.useState<CommitsByDate[]>([])
  const [workStatusGroups, setWorkStatusGroups] = React.useState<CommitsByDate[]>([])
  const [metricsConfig, setMetricsConfig] = React.useState<WorkStatusMetricsConfig | null>(null)
  const [primaryTask, setPrimaryTask] = React.useState<ScanTask | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<number | null>(null)
  const [syncModalOpen, setSyncModalOpen] = React.useState(false)
  const [scanTimePreset, setScanTimePreset] = React.useState<ScanTimePresetKey>('three_days')
  const requestIdRef = React.useRef(0)
  const { scanning, handleScan } = useScan()

  const isDirty = filterSignature(filter) !== filterSignature(appliedFilter)

  const handleSearch = React.useCallback(async (customFilter?: FilterState) => {
    const nextFilter = cloneFilter(customFilter ?? filter)
    const requestId = ++requestIdRef.current
    const startDate = nextFilter.dateRange[0].startOf('day').valueOf()
    const endDate = nextFilter.dateRange[1].endOf('day').valueOf()
    const repositoryIds = nextFilter.repositoryIds.length ? nextFilter.repositoryIds : undefined
    const authorEmails = nextFilter.authorEmails.length ? nextFilter.authorEmails : undefined

    setAppliedFilter(nextFilter)
    setSearchParams(toSearchParams(nextFilter), { replace: true })
    setLoading(true)
    setLoadError(null)

    try {
      const visibleRequest = gitStatisticsApi.getCommitsByDate({
        startDate,
        endDate,
        repositoryIds,
        authorEmails,
        overtimeMode: nextFilter.overtimeMode,
      })
      const fullRequest = nextFilter.overtimeMode === 'all'
        ? visibleRequest
        : gitStatisticsApi.getCommitsByDate({
            startDate,
            endDate,
            repositoryIds,
            authorEmails,
            overtimeMode: 'all',
          })
      const [visibleResult, fullResult] = await Promise.all([visibleRequest, fullRequest])
      if (requestId !== requestIdRef.current) return

      const visibleGroups = filterCommitGroups(
        visibleResult.data ?? [],
        nextFilter.keyword,
        nextFilter.commitTypes,
      )
      const fullGroupMap = new Map((fullResult.data ?? []).map((group) => [group.date, group]))
      setCommitsByDate(visibleGroups.map((group) => ({
        ...group,
        workStatus: fullGroupMap.get(group.date)?.workStatus ?? group.workStatus,
      })))
      setWorkStatusGroups(fullResult.data ?? [])
      setMetricsConfig(fullResult.metricsConfig)
      setStatistics(buildStatistics(visibleGroups))
      setLastUpdatedAt(Date.now())
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error('[GitStatistics] Search error:', error)
      setLoadError('提交数据加载失败，请检查服务状态后重新查询。')
      message.error('提交数据加载失败')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [filter, setSearchParams, setStatistics])

  useMount(async () => {
    setFilter(initialFilter)
    const [repos, authors, task] = await Promise.all([
      gitStatisticsApi.getRepositories().catch(() => null),
      gitStatisticsApi.getAuthors().catch(() => null),
      tasksApi.getPrimaryTask().catch(() => null),
    ])
    if (repos) setRepositories(repos)
    else message.warning('仓库列表加载失败，仓库筛选暂不可用')
    if (authors) setAuthors(authors)
    else message.warning('作者列表加载失败，作者筛选暂不可用')
    setPrimaryTask(task)
    await handleSearch(initialFilter)
  })

  const handleSyncConfirm = React.useCallback(async (
    repositoryIds: string[],
    selectedDateRange: [Dayjs, Dayjs],
  ) => {
    const startDate = selectedDateRange[0].startOf('day').valueOf()
    const endDate = selectedDateRange[1].endOf('day').valueOf()
    if (
      startDate >= endDate
      || selectedDateRange[1].isAfter(selectedDateRange[0].add(6, 'month').endOf('day'))
    ) {
      message.error('同步日期范围无效或超过 6 个月，请拆分时间段后再同步')
      return
    }
    const success = await handleScan({
      startDate,
      endDate,
      repositoryIds: repositoryIds.length ? repositoryIds : undefined,
    })
    if (success) {
      setSyncModalOpen(false)
      await handleSearch(appliedFilter)
    }
  }, [appliedFilter, handleScan, handleSearch])

  const handleResetAndSearch = React.useCallback(() => {
    const resetFilter = cloneFilter(defaultFilterState)
    setFilter(resetFilter)
    void handleSearch(resetFilter)
  }, [handleSearch, setFilter])

  return (
      <div className="h-full min-h-0 overflow-auto bg-[#f7f8fa] p-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Typography.Title level={1} className="!mb-1 !text-2xl">提交记录工作台</Typography.Title>
              <Typography.Text type="secondary">
                按条件定位提交，查看代码活动趋势并复盘单日开发时间线
              </Typography.Text>
              {lastUpdatedAt ? (
                <div className="mt-2 text-xs text-neutral-500">
                  最近查询：{dayjs(lastUpdatedAt).format('YYYY-MM-DD HH:mm:ss')}
                </div>
              ) : null}
            </div>
            <Button icon={<SyncOutlined />} onClick={() => setSyncModalOpen(true)}>
              同步数据
            </Button>
          </div>

          <Card className="[&_.ant-card-body]:p-4">
            <StatisticsFilter onSearch={handleSearch} isDirty={isDirty} />
          </Card>

          {loadError ? (
            <Alert
              type="error"
              showIcon
              message={loadError}
              action={<Button size="small" icon={<ReloadOutlined />} onClick={() => handleSearch(appliedFilter)}>重新查询</Button>}
            />
          ) : null}

          <Spin spinning={loading}>
            {!loading && !loadError && commitsByDate.length === 0 ? (
              <Card>
                <Empty
                  description="当前已应用筛选下没有匹配的提交"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  <Button onClick={handleResetAndSearch}>重置并查询</Button>
                </Empty>
              </Card>
            ) : (
              <Space direction="vertical" size={16} className="w-full">
                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={12}><StatisticsCards /></Col>
                  <Col xs={24} xl={12}>
                    <WorkStatusCards data={workStatusGroups} metricsConfig={metricsConfig} />
                  </Col>
                </Row>

                <WorkStatusReport
                  data={commitsByDate}
                  dateRange={appliedFilter.dateRange}
                  overtimeMode={appliedFilter.overtimeMode}
                />

                <Card
                  title="提交明细"
                  extra={isDirty ? <Tag color="warning">结果仍对应上一次已应用筛选</Tag> : null}
                  className="[&_.ant-card-body]:p-0"
                >
                  <CommitsWorkbench data={commitsByDate} metricsConfig={metricsConfig} />
                </Card>
              </Space>
            )}
          </Spin>

          <SyncDataModal
            open={syncModalOpen}
            loading={scanning}
            preset={scanTimePreset}
            dateRange={filter.dateRange}
            repositoryIds={filter.repositoryIds}
            repositories={repositories}
            primaryTask={primaryTask}
            onPresetChange={setScanTimePreset}
            onCancel={() => setSyncModalOpen(false)}
            onConfirm={handleSyncConfirm}
          />
        </div>
      </div>
  )
}

export default GitStatisticsList
