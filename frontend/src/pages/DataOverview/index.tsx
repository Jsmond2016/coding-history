import React from "react"
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  message,
  Progress,
  Row,
  Select,
  Spin,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from "antd"
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  FireOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  TeamOutlined,
} from "@ant-design/icons"
import { useMount } from "ahooks"
import { useAtom } from "jotai"
import { useSearchParams } from "react-router-dom"
import dayjs, { type Dayjs } from "dayjs"
import {
  dataOverviewAppliedFilterAtom,
  dataOverviewFilterAtom,
  dataOverviewHydratedAtom,
  dataOverviewViewAtom,
  defaultOverviewFilter,
  type OverviewDrilldownKey,
  type OverviewFilter,
} from "../../biz/atoms/analytics.atom"
import { gitStatisticsApi } from "../../services/gitStatisticsApi"
import { getDataMetricsConfig } from "../../services/configApi"
import { createCommitDateRangePresets } from "../../utils/commitDateRange"
import { CommitsByDateList } from "../GitStatistics/GitStatisticsList/components/CommitsByDateList"
import {
  OverviewPieChart,
  type OverviewPieDatum,
} from "./components/OverviewPieChart"
import type {
  Author,
  DataOverviewResponse,
  OvertimeMode,
  Repository,
  WorkIntensity,
} from "../../types/gitStatistics"

const { RangePicker } = DatePicker

const getQueryRange = (range: [Dayjs, Dayjs]) => ({
  startDate: range[0].startOf("day").valueOf(),
  endDate: range[1].endOf("day").valueOf(),
})

const cloneOverviewFilter = (filter: OverviewFilter): OverviewFilter => ({
  dateRange: [filter.dateRange[0], filter.dateRange[1]],
  repositoryIds: [...filter.repositoryIds],
  authorEmails: [...filter.authorEmails],
})

const hasOverviewSearchParams = (searchParams: URLSearchParams) => (
  ["start", "end", "repos", "authors"].some((key) => searchParams.has(key))
)

const parseOverviewFilter = (searchParams: URLSearchParams): OverviewFilter => {
  const start = dayjs(searchParams.get("start"))
  const end = dayjs(searchParams.get("end"))
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return cloneOverviewFilter(defaultOverviewFilter)
  }
  return {
    dateRange: [start, end],
    repositoryIds: searchParams.get("repos")?.split(",").filter(Boolean) ?? [],
    authorEmails: searchParams.get("authors")?.split(",").filter(Boolean) ?? [],
  }
}

const toOverviewSearchParams = (filter: OverviewFilter) => {
  const params = new URLSearchParams({
    start: filter.dateRange[0].format("YYYY-MM-DD"),
    end: filter.dateRange[1].format("YYYY-MM-DD"),
  })
  if (filter.repositoryIds.length) params.set("repos", filter.repositoryIds.join(","))
  if (filter.authorEmails.length) params.set("authors", filter.authorEmails.join(","))
  return params
}

const metricNumber = (value?: number | null) =>
  typeof value === "number" ? value.toLocaleString() : "-"

const repositoryChartColors = [
  "#1677ff", "#52c41a", "#fa8c16", "#f5222d", "#722ed1", "#13c2c2",
  "#eb2f96", "#2f54eb", "#a0d911", "#faad14", "#fa541c", "#8c8c8c",
]

const intensityChartColors: Record<WorkIntensity, string> = {
  relaxed: "#52c41a",
  normal: "#1677ff",
  busy: "#fa8c16",
  crazy: "#f5222d",
}

const intensityOrder: WorkIntensity[] = ["relaxed", "normal", "busy", "crazy"]

const getTenureDays = (hireDate: number | null) => (
  hireDate === null ? null : dayjs().startOf("day").diff(dayjs(hireDate).startOf("day"), "day") + 1
)

const matchesIntensity = (
  commits: number,
  status: WorkIntensity,
  thresholds: DataOverviewResponse["metricsConfig"]["thresholds"],
) => {
  if (status === "relaxed") return commits < thresholds.relaxed
  if (status === "normal") return commits >= thresholds.relaxed && commits < thresholds.normal
  if (status === "busy") return commits >= thresholds.normal && commits < thresholds.busy
  return commits >= thresholds.busy
}

const DataOverview: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = React.useMemo(() => parseOverviewFilter(searchParams), [searchParams])
  const [filter, setFilter] = useAtom(dataOverviewFilterAtom)
  const [appliedFilter, setAppliedFilter] = useAtom(dataOverviewAppliedFilterAtom)
  const [hydrated, setHydrated] = useAtom(dataOverviewHydratedAtom)
  const [view, setView] = useAtom(dataOverviewViewAtom)
  const [repositories, setRepositories] = React.useState<Repository[]>([])
  const [authors, setAuthors] = React.useState<Author[]>([])
  const [allTimeRange, setAllTimeRange] = React.useState<[Dayjs, Dayjs] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const { overview, activeCard, detailGroups, detailTitle } = view

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates?.[0] || !dates?.[1]) return
    const dateRange: [Dayjs, Dayjs] = [dates[0], dates[1]]
    setFilter((current) => ({ ...current, dateRange }))
  }

  const loadOverview = React.useCallback(async (customFilter?: OverviewFilter) => {
    const nextFilter = cloneOverviewFilter(customFilter ?? filter)
    const { startDate, endDate } = getQueryRange(nextFilter.dateRange)
    setLoading(true)
    setView((current) => ({
      ...current,
      activeCard: null,
      detailGroups: [],
      detailTitle: "选择指标或仓库查看提交明细",
    }))

    try {
      const result = await gitStatisticsApi.getDataOverview({
        startDate,
        endDate,
        repositoryIds: nextFilter.repositoryIds.length > 0 ? nextFilter.repositoryIds : undefined,
        authorEmails: nextFilter.authorEmails.length > 0 ? nextFilter.authorEmails : undefined,
      })
      setAppliedFilter(nextFilter)
      setView((current) => ({ ...current, overview: result }))
      setSearchParams(toOverviewSearchParams(nextFilter), { replace: true })
    } catch (error) {
      console.error("[DataOverview] Load overview error:", error)
      message.error("加载数据总览失败")
    } finally {
      setLoading(false)
    }
  }, [filter, setAppliedFilter, setSearchParams, setView])

  const loadDetail = React.useCallback(async (key: OverviewDrilldownKey) => {
    if (!overview) return

    let range = appliedFilter.dateRange
    let repositoryIds = appliedFilter.repositoryIds.length > 0
      ? appliedFilter.repositoryIds
      : undefined
    let overtimeMode: OvertimeMode = "all"
    let intensity: WorkIntensity | undefined
    let title = "提交总数：当前筛选范围"

    if (key === "activeDays") title = "活跃日期：当前筛选范围"
    if (key === "overtimeDays") {
      title = "加班日期：展示加班当天的全部提交"
      overtimeMode = "overtime_days"
    }
    if (key === "overtimeCommits") {
      title = `加班提交：${overview.metricsConfig.overtimeHour}:00 后的提交`
      overtimeMode = "overtime_commits"
    }
    if (key === "topOvertimeMonth" && overview.topOvertimeMonth) {
      const monthStart = dayjs(`${overview.topOvertimeMonth.month}-01`).startOf("month")
      const monthEnd = monthStart.endOf("month")
      range = [
        monthStart.isBefore(appliedFilter.dateRange[0]) ? appliedFilter.dateRange[0] : monthStart,
        monthEnd.isAfter(appliedFilter.dateRange[1]) ? appliedFilter.dateRange[1] : monthEnd,
      ]
      title = `${overview.topOvertimeMonth.month} 加班日期：展示每天全部提交`
      overtimeMode = "overtime_days"
    }
    if (key.startsWith("repository:")) {
      const repoId = key.slice("repository:".length)
      const repository = overview.repositoryDistribution.find((item) => item.repoId === repoId)
      repositoryIds = [repoId]
      title = `仓库活动：${repository?.repoName ?? repoId}`
    }
    if (key.startsWith("intensity:")) {
      intensity = key.slice("intensity:".length) as WorkIntensity
      title = `工作强度：${overview.metricsConfig.labels[intensity]}`
    }

    setView((current) => ({ ...current, activeCard: key, detailTitle: title }))
    setDetailLoading(true)

    try {
      const { startDate, endDate } = getQueryRange(range)
      const result = await gitStatisticsApi.getCommitsByDate({
        startDate,
        endDate,
        repositoryIds,
        authorEmails: appliedFilter.authorEmails.length > 0 ? appliedFilter.authorEmails : undefined,
        overtimeMode,
      })
      const groups = result.data ?? []
      setView((current) => ({
        ...current,
        detailGroups: intensity
          ? groups.filter((group) => matchesIntensity(
              group.totalCommits,
              intensity,
              overview.metricsConfig.thresholds,
            ))
          : groups,
      }))
    } catch (error) {
      console.error("[DataOverview] Load detail error:", error)
      message.error("加载明细失败")
    } finally {
      setDetailLoading(false)
    }
  }, [appliedFilter, overview, setView])

  useMount(async () => {
    try {
      const shouldHydrateFromUrl = !hydrated
      const nextFilter = shouldHydrateFromUrl && hasOverviewSearchParams(searchParams)
        ? initialFilter
        : shouldHydrateFromUrl ? filter : appliedFilter
      if (shouldHydrateFromUrl) {
        setFilter(nextFilter)
        setAppliedFilter(nextFilter)
        setHydrated(true)
      } else {
        setSearchParams(toOverviewSearchParams(appliedFilter), { replace: true })
      }

      const [repositoryResult, authorResult, commitDateRange, metricsConfig] = await Promise.all([
        gitStatisticsApi.getRepositories().catch(() => []),
        gitStatisticsApi.getAuthors().catch(() => []),
        gitStatisticsApi.getCommitDateRange().catch(() => null),
        getDataMetricsConfig().catch(() => null),
      ])
      setRepositories(Array.isArray(repositoryResult) ? repositoryResult : [])
      setAuthors(Array.isArray(authorResult) ? authorResult : [])
      const allTimeStart = metricsConfig?.hireDate ?? commitDateRange?.earliest
      if (allTimeStart) {
        setAllTimeRange([
          dayjs(allTimeStart).startOf("day"),
          dayjs().endOf("day"),
        ])
      }
      if (!view.overview) {
        await loadOverview(nextFilter)
      }
    } catch {
      message.error("加载数据总览初始数据失败")
    }
  })

  const overtimeDayRate = overview?.totals.activeDays
    ? (overview.totals.overtimeDays / overview.totals.activeDays) * 100
    : 0
  const rangePresets = React.useMemo(
    () => createCommitDateRangePresets(allTimeRange),
    [allTimeRange],
  )
  const repositoryPieData = React.useMemo<OverviewPieDatum[]>(() => (
    overview?.repositoryDistribution.map((repository, index) => ({
      key: repository.repoId,
      name: repository.repoName,
      value: repository.count,
      color: repositoryChartColors[index % repositoryChartColors.length],
    })) ?? []
  ), [overview])
  const intensityPieData = React.useMemo<OverviewPieDatum[]>(() => {
    if (!overview) return []
    const daysByStatus = new Map(
      (overview.workIntensityDistribution ?? []).map((item) => [item.status, item.days]),
    )
    return intensityOrder.map((status) => ({
      key: status,
      name: overview.metricsConfig.labels[status],
      value: daysByStatus.get(status) ?? 0,
      color: intensityChartColors[status],
    }))
  }, [overview])
  const hireDate = overview?.metricsConfig.hireDate ?? null
  const tenureDays = getTenureDays(hireDate)
  const appliedDateRangeLabel = `${appliedFilter.dateRange[0].format("YYYY-MM-DD")} 至 ${appliedFilter.dateRange[1].format("YYYY-MM-DD")}`

  const summaryCards = [
    {
      key: "totalCommits" as const,
      title: "提交总数",
      value: overview?.totals.commits ?? 0,
      icon: <CodeOutlined />,
      tone: "border-l-[#1677ff]",
      tip: "包含普通提交、Merge Commit 和 Release Commit。",
    },
    {
      key: "activeDays" as const,
      title: "活跃天数",
      value: overview?.totals.activeDays ?? 0,
      icon: <CalendarOutlined />,
      tone: "border-l-[#52c41a]",
      tip: "按 Asia/Shanghai 自然日统计，至少有 1 条提交即为活跃日。",
    },
    {
      key: "overtimeDays" as const,
      title: "加班天数",
      value: overview?.totals.overtimeDays ?? 0,
      icon: <FireOutlined />,
      tone: "border-l-[#ff4d4f]",
      suffix: `占活跃日 ${overtimeDayRate.toFixed(1)}%`,
      tip: `同一自然日存在一条或多条 ${overview?.metricsConfig.overtimeHour ?? 19}:00 后提交，只计 1 个加班日。`,
    },
    {
      key: "overtimeCommits" as const,
      title: "加班提交数",
      value: overview?.totals.overtimeCommits ?? 0,
      icon: <ClockCircleOutlined />,
      tone: "border-l-[#fa8c16]",
      tip: `提交时间达到 ${overview?.metricsConfig.overtimeHour ?? 19}:00 的 Commit 数量。`,
    },
  ]

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f7f8fa]">
      <header role="banner" className="sticky top-0 z-[1000] h-12 w-full min-w-0 shrink-0" />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <Card className="border-0 shadow-sm [&_.ant-card-body]:p-4">
            <Typography.Title level={3} className="!mb-1">数据总览</Typography.Title>
            <Typography.Text className="text-neutral-500">
              回顾代码活动、仓库投入和加班日期，所有时间统一按 Asia/Shanghai 统计
            </Typography.Text>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <RangePicker
                value={filter.dateRange}
                onChange={handleDateChange}
                allowClear={false}
                format="YYYY-MM-DD"
                presets={rangePresets}
                style={{ width: 260 }}
                aria-label="日期范围"
              />
              <Select
                mode="multiple"
                placeholder="仓库"
                value={filter.repositoryIds}
                onChange={(repositoryIds) => setFilter((current) => ({ ...current, repositoryIds }))}
                allowClear
                maxTagCount={1}
                style={{ width: 180 }}
                aria-label="仓库"
                options={repositories.map((repository) => ({
                  value: repository.id,
                  label: repository.name,
                }))}
              />
              <Select
                mode="multiple"
                placeholder="作者"
                value={filter.authorEmails}
                onChange={(authorEmails) => setFilter((current) => ({ ...current, authorEmails }))}
                allowClear
                maxTagCount={1}
                style={{ width: 240 }}
                suffixIcon={<TeamOutlined />}
                aria-label="作者"
                options={authors.map((author) => ({
                  value: author.email,
                  label: `${author.name}（${author.email}）`,
                }))}
              />
              <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => loadOverview()}>
                查询
              </Button>
            </div>
          </Card>

          <Spin spinning={loading}>
            <Row gutter={[16, 16]}>
              {summaryCards.map((card) => (
                <Col xs={24} sm={12} xl={6} key={card.key}>
                  <button
                    type="button"
                    className={`h-full w-full cursor-pointer rounded-lg border-0 border-l-4 bg-white p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone} ${activeCard === card.key ? "ring-2 ring-[#1677ff]/35" : ""}`}
                    onClick={() => loadDetail(card.key)}
                    disabled={card.value <= 0}
                  >
                    <div className="p-4">
                      <Statistic
                        title={
                          <span className="inline-flex items-center gap-1">
                            {card.title}
                            <Tooltip title={card.tip}>
                              <QuestionCircleOutlined className="text-xs text-neutral-400" />
                            </Tooltip>
                          </span>
                        }
                        value={card.value}
                        prefix={card.icon}
                      />
                      {card.suffix ? <div className="mt-2 text-xs text-neutral-500">{card.suffix}</div> : null}
                    </div>
                  </button>
                </Col>
              ))}
            </Row>

            <Row gutter={[16, 16]} className="mt-4" align="stretch">
              <Col xs={24} xl={12}>
                <OverviewPieChart
                  title="仓库提交次数占比"
                  data={repositoryPieData}
                  unit="次提交"
                  selectedKey={activeCard?.startsWith("repository:")
                    ? activeCard.slice("repository:".length)
                    : undefined}
                  onSelect={(datum) => loadDetail(`repository:${datum.key}`)}
                />
              </Col>
              <Col xs={24} xl={12}>
                <OverviewPieChart
                  title="工作强度占比"
                  data={intensityPieData}
                  unit="个活跃日"
                  extraContent={(
                    <span className="flex flex-wrap items-center justify-end gap-2 text-xs text-neutral-500">
                      <span>入职时间：{hireDate ? dayjs(hireDate).format("YYYY.MM.DD") : "未配置"}</span>
                      <span>在职天数：{tenureDays === null ? "-" : `${tenureDays} 天`}</span>
                      <Tag>{intensityPieData.reduce((sum, item) => sum + item.value, 0).toLocaleString()} 个活跃日</Tag>
                    </span>
                  )}
                  selectedKey={activeCard?.startsWith("intensity:")
                    ? activeCard.slice("intensity:".length)
                    : undefined}
                  onSelect={(datum) => loadDetail(`intensity:${datum.key as WorkIntensity}`)}
                />
              </Col>
            </Row>

            <Row gutter={[16, 16]} className="mt-4" align="top">
              <Col xs={24} xl={16}>
                <Card
                  title={(
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span>仓库活动分布</span>
                      <Typography.Text type="secondary" className="text-xs font-normal">
                        时间范围：{appliedDateRangeLabel}
                      </Typography.Text>
                    </div>
                  )}
                  extra={<Tag color="blue">{overview?.totals.repositories ?? 0} 个活跃仓库</Tag>}
                  className="h-full border-0 shadow-sm"
                >
                  {overview?.repositoryDistribution.length ? (
                    <div className="flex flex-col gap-5">
                      {overview.repositoryDistribution.map((repository) => {
                        const share = overview.totals.commits > 0
                          ? (repository.count / overview.totals.commits) * 100
                          : 0
                        const key = `repository:${repository.repoId}` as const
                        return (
                          <Tooltip key={repository.repoId} title="点击可筛选该仓库的提交历史">
                            <button
                              type="button"
                              className={`w-full cursor-pointer border-0 bg-transparent p-0 text-left transition-colors hover:bg-neutral-50 ${activeCard === key ? "rounded ring-2 ring-[#1677ff]/25" : ""}`}
                              onClick={() => loadDetail(key)}
                              aria-label={`查看 ${repository.repoName} 的提交历史`}
                            >
                              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                <span className="min-w-0 truncate font-medium text-neutral-900">{repository.repoName}</span>
                                <span className="text-sm text-neutral-600">
                                  {metricNumber(repository.count)} 次 · {share.toFixed(1)}%
                                </span>
                              </div>
                              <Progress percent={Number(share.toFixed(1))} showInfo={false} strokeColor="#1677ff" />
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                                <span>{metricNumber(repository.filesChanged)} 个文件变化</span>
                                <span className="text-green-700">+{metricNumber(repository.insertions)}</span>
                                <span className="text-red-700">-{metricNumber(repository.deletions)}</span>
                              </div>
                            </button>
                          </Tooltip>
                        )
                      })}
                    </div>
                  ) : <Empty description="当前范围暂无仓库活动" />}
                </Card>
              </Col>

              <Col xs={24} xl={8}>
                <button
                  type="button"
                  className={`w-full cursor-pointer border-0 bg-transparent p-0 text-left ${activeCard === "topOvertimeMonth" ? "rounded ring-2 ring-[#1677ff]/25" : ""}`}
                  onClick={() => overview?.topOvertimeMonth && loadDetail("topOvertimeMonth")}
                  disabled={!overview?.topOvertimeMonth}
                >
                  <Card title="加班天数最多的月份" className="border-0 shadow-sm" styles={{ body: { padding: 16 } }}>
                    {overview?.topOvertimeMonth ? (
                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                          <div className="text-2xl font-semibold text-neutral-950">{overview.topOvertimeMonth.month}</div>
                          <div className="mt-1 text-xs text-neutral-500">按加班自然日去重统计</div>
                        </div>
                        <Statistic
                          title="加班天数"
                          value={overview.topOvertimeMonth.overtimeDays}
                          suffix="天"
                          prefix={<FireOutlined />}
                        />
                        <div className="w-full border-t border-neutral-100 pt-3 text-sm text-neutral-600">
                          该月活跃 {overview.topOvertimeMonth.activeDays} 天，加班日占比 {(
                            overview.topOvertimeMonth.overtimeDays / overview.topOvertimeMonth.activeDays * 100
                          ).toFixed(1)}%
                        </div>
                      </div>
                    ) : <Empty description="当前范围没有加班日期" />}
                  </Card>
                </button>
              </Col>
            </Row>

          </Spin>

          <Card
            title={detailTitle}
            styles={{ body: { padding: 12 } }}
            className="border-0 shadow-sm"
            extra={activeCard ? <Tag color="blue">下钻明细</Tag> : null}
          >
            {activeCard ? (
              <CommitsByDateList
                data={detailGroups}
                loading={detailLoading}
                metricsConfig={overview?.metricsConfig}
              />
            ) : (
              <div className="py-12">
                <Empty description="选择上方指标、仓库、工作强度或月份查看具体提交记录" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DataOverview
