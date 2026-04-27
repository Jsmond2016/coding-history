import React from "react"
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  message,
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
  DatabaseOutlined,
  FireOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  TeamOutlined,
} from "@ant-design/icons"
import { useMount } from "ahooks"
import dayjs, { type Dayjs } from "dayjs"
import { gitStatisticsApi } from "../../services/gitStatisticsApi"
import { CommitsByDateList } from "../GitStatistics/GitStatisticsList/components/CommitsByDateList"
import type {
  Author,
  CommitsByDate,
  DataOverviewResponse,
} from "../../types/gitStatistics"

const { RangePicker } = DatePicker

type DrilldownKey =
  | "totalCommits"
  | "overtimeCommits"
  | "activeRepositories"
  | "activeMonths"
  | "topCommitRepository"
  | "topCommitMonth"
  | "topOvertimeRepository"
  | "topOvertimeMonth"

interface OverviewFilter {
  dateRange: [Dayjs, Dayjs]
  authorEmails: string[]
}

const rangePresets: Array<{ label: string; value: [Dayjs, Dayjs] }> = [
  { label: "近一个月", value: [dayjs().subtract(1, "month"), dayjs()] },
  { label: "近 3 个月", value: [dayjs().subtract(3, "month"), dayjs()] },
  { label: "近 6 个月", value: [dayjs().subtract(6, "month"), dayjs()] },
  { label: "近 1 年", value: [dayjs().subtract(1, "year"), dayjs()] },
  { label: "2026 年", value: [dayjs("2026-01-01"), dayjs("2026-12-31")] },
  { label: "2025 年", value: [dayjs("2025-01-01"), dayjs("2025-12-31")] },
]

const getQueryRange = (range: [Dayjs, Dayjs]) => ({
  startDate: range[0].startOf("day").valueOf(),
  endDate: range[1].endOf("day").valueOf(),
})

const getMonthRange = (month: string): [Dayjs, Dayjs] => {
  const start = dayjs(`${month}-01`)
  return [start.startOf("month"), start.endOf("month")]
}

const metricNumber = (value?: number | null) =>
  typeof value === "number" ? value.toLocaleString() : "-"

const keepOnlyOvertimeCommits = (data: CommitsByDate[]): CommitsByDate[] =>
  data
    .map((item) => {
      const commits = item.commits
        .filter((commit) => commit.isOvertime)
        .sort((a, b) => b.commitDate - a.commitDate)
      const latestOvertimeCommits = commits
        .map((commit) => ({
          time: dayjs(commit.commitDate).format("HH:mm"),
          timestamp: commit.commitDate,
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5)
        .map((item) => item.time)

      return {
        ...item,
        commits,
        totalCommits: commits.length,
        overtimeCount: commits.length,
        latestOvertimeCommits,
        hasRelease: commits.some((commit) => {
          const message = commit.message.toLowerCase()
          return message.includes("chore(release)") || message.includes("chore: release")
        }),
        repositories: Array.from(new Set(commits.map((commit) => commit.repoName))),
        branches: Array.from(
          new Set(commits.map((commit) => commit.branch).filter((branch): branch is string => Boolean(branch))),
        ).sort(),
      }
    })
    .filter((item) => item.commits.length > 0)

const DataOverview: React.FC = () => {
  const [filter, setFilter] = React.useState<OverviewFilter>({
    dateRange: [dayjs().subtract(1, "month"), dayjs()],
    authorEmails: [],
  })
  const [authors, setAuthors] = React.useState<Author[]>([])
  const [overview, setOverview] = React.useState<DataOverviewResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [activeCard, setActiveCard] = React.useState<DrilldownKey | null>(null)
  const [detailGroups, setDetailGroups] = React.useState<CommitsByDate[]>([])
  const [detailTitle, setDetailTitle] = React.useState("点击上方指标块查看明细")

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates?.[0] || !dates?.[1]) return
    const [start, end] = dates as [Dayjs, Dayjs]

    if (end.diff(start, "year", true) > 3) {
      message.error("自定义时间周期不能超过 3 年")
      return
    }

    setFilter((current) => ({
      ...current,
      dateRange: [start, end],
    }))
  }

  const loadOverview = React.useCallback(async () => {
    const { startDate, endDate } = getQueryRange(filter.dateRange)
    setLoading(true)
    setActiveCard(null)
    setDetailGroups([])
    setDetailTitle("点击上方指标块查看明细")

    try {
      const result = await gitStatisticsApi.getDataOverview({
        startDate,
        endDate,
        authorEmails: filter.authorEmails.length > 0 ? filter.authorEmails : undefined,
      })
      setOverview(result)
    } catch (error) {
      console.error("[DataOverview] Load overview error:", error)
      message.error("加载数据总览失败")
    } finally {
      setLoading(false)
    }
  }, [filter])

  const loadDetail = React.useCallback(
    async (key: DrilldownKey) => {
      if (!overview) return

      let range = filter.dateRange
      let repositoryIds: string[] | undefined
      let title = "提交总数：当前筛选范围"
      const isOvertimeCard = key === "overtimeCommits" || key === "topOvertimeRepository" || key === "topOvertimeMonth"

      if (key === "overtimeCommits") {
        title = "加班提交：当前筛选范围"
      }

      if (key === "activeRepositories") {
        title = "活跃仓库：当前筛选范围内有提交的仓库"
      }

      if (key === "activeMonths") {
        title = "活跃月份数量：当前筛选范围内有提交的月份"
      }

      if (key === "topCommitRepository") {
        if (!overview.topCommitRepository) return
        repositoryIds = [overview.topCommitRepository.repoId]
        title = `提交最多仓库：${overview.topCommitRepository.repoName}`
      }

      if (key === "topCommitMonth") {
        if (!overview.topCommitMonth) return
        range = getMonthRange(overview.topCommitMonth.month)
        title = `提交最多月份：${overview.topCommitMonth.month}`
      }

      if (key === "topOvertimeRepository") {
        if (!overview.topOvertimeRepository) return
        repositoryIds = [overview.topOvertimeRepository.repoId]
        title = `加班最多仓库：${overview.topOvertimeRepository.repoName}`
      }

      if (key === "topOvertimeMonth") {
        if (!overview.topOvertimeMonth) return
        range = getMonthRange(overview.topOvertimeMonth.month)
        title = `加班最多月份：${overview.topOvertimeMonth.month}`
      }

      setActiveCard(key)
      setDetailTitle(title)
      setDetailLoading(true)

      try {
        const { startDate, endDate } = getQueryRange(range)
        const result = await gitStatisticsApi.getCommitsByDate({
          startDate,
          endDate,
          repositoryIds,
          authorEmails: filter.authorEmails.length > 0 ? filter.authorEmails : undefined,
          isOvertime: isOvertimeCard ? true : undefined,
        })
        setDetailGroups(
          isOvertimeCard
            ? keepOnlyOvertimeCommits(result.data ?? [])
            : result.data ?? [],
        )
      } catch (error) {
        console.error("[DataOverview] Load detail error:", error)
        message.error("加载明细失败")
      } finally {
        setDetailLoading(false)
      }
    },
    [filter, overview],
  )

  const summaryCards = [
    {
      key: "totalCommits" as const,
      title: "提交总数",
      value: overview?.totals.commits ?? 0,
      icon: <CodeOutlined />,
      tone: "border-l-[#1677ff]",
    },
    {
      key: "overtimeCommits" as const,
      title: "加班提交",
      value: overview?.totals.overtimeCommits ?? 0,
      icon: <FireOutlined />,
      tone: "border-l-[#ff4d4f]",
      tip: "当前筛选范围内，提交时间达到加班阈值的提交记录数量。",
    },
    {
      key: "activeRepositories" as const,
      title: "活跃仓库",
      value: overview?.totals.repositories ?? 0,
      icon: <DatabaseOutlined />,
      tone: "border-l-[#52c41a]",
      tip: "当前筛选范围内，至少有 1 条提交记录的仓库数量。",
    },
    {
      key: "activeMonths" as const,
      title: "活跃月份数量",
      value: overview?.totals.activeMonths ?? 0,
      icon: <CalendarOutlined />,
      tone: "border-l-[#fa8c16]",
      tip: "当前筛选范围内，至少有 1 条提交记录的自然月份数量。",
    },
  ]

  useMount(async () => {
    try {
      const authorResult = await gitStatisticsApi.getAuthors().catch(() => [])
      setAuthors(Array.isArray(authorResult) ? authorResult : [])
      await loadOverview()
    } catch {
      message.error("加载数据总览初始数据失败")
    }
  })

  const cards = [
    {
      key: "topCommitRepository" as const,
      title: "提交记录最多的仓库",
      icon: <DatabaseOutlined />,
      tone: "border-l-[#1677ff]",
      name: overview?.topCommitRepository?.repoName,
      value: overview?.topCommitRepository?.count,
      meta: overview?.topCommitRepository
        ? `+${metricNumber(overview.topCommitRepository.insertions)} / -${metricNumber(overview.topCommitRepository.deletions)}`
        : "暂无数据",
    },
    {
      key: "topCommitMonth" as const,
      title: "提交记录最多的月份",
      icon: <CalendarOutlined />,
      tone: "border-l-[#52c41a]",
      name: overview?.topCommitMonth?.month,
      value: overview?.topCommitMonth?.count,
      meta: overview?.topCommitMonth
        ? `${metricNumber(overview.topCommitMonth.filesChanged)} 个文件变更`
        : "暂无数据",
    },
    {
      key: "topOvertimeRepository" as const,
      title: "加班次数最多的仓库",
      icon: <FireOutlined />,
      tone: "border-l-[#ff4d4f]",
      name: overview?.topOvertimeRepository?.repoName,
      value: overview?.topOvertimeRepository?.count,
      meta: overview?.topOvertimeRepository?.latestCommitDate
        ? `最近 ${dayjs(overview.topOvertimeRepository.latestCommitDate).format("MM-DD HH:mm")}`
        : "暂无数据",
    },
    {
      key: "topOvertimeMonth" as const,
      title: "加班次数最多的月份",
      icon: <ClockCircleOutlined />,
      tone: "border-l-[#fa8c16]",
      name: overview?.topOvertimeMonth?.month,
      value: overview?.topOvertimeMonth?.count,
      unit: "天",
      meta: overview?.topOvertimeMonth?.latestCommitDate
        ? `最近 ${dayjs(overview.topOvertimeMonth.latestCommitDate).format("MM-DD HH:mm")}`
        : "暂无数据",
    },
  ]

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f7f8fa]">
      <header role="banner" className="sticky top-0 z-[1000] h-12 w-full min-w-0 shrink-0" />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <Card className="border-0 shadow-sm [&_.ant-card-body]:p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Typography.Title level={3} className="!mb-1">
                  数据总览
                </Typography.Title>
                <Typography.Text className="text-neutral-500">
                  按时间和作者聚合仓库提交与加班峰值
                </Typography.Text>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <RangePicker
                value={filter.dateRange}
                onChange={handleDateChange}
                allowClear={false}
                format="YYYY-MM-DD"
                presets={rangePresets}
                style={{ width: 300 }}
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
              >
                {authors.map((author) => (
                  <Select.Option key={author.email} value={author.email}>
                    {author.name}（{author.email}）
                  </Select.Option>
                ))}
              </Select>
              <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={loadOverview}>
                搜索
              </Button>
            </div>
          </Card>

          <Spin spinning={loading}>
            <Row gutter={[16, 16]}>
              {summaryCards.map((card) => (
                <Col xs={24} sm={12} xl={6} key={card.key}>
                  <button
                    type="button"
                    className={`h-full w-full cursor-pointer rounded-lg border-0 border-l-4 bg-white p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone} ${
                      activeCard === card.key ? "ring-2 ring-[#1677ff]/35" : ""
                    }`}
                    onClick={() => loadDetail(card.key)}
                    disabled={card.value <= 0}
                  >
                    <div className="p-4">
                      <Statistic
                        title={
                          <span className="inline-flex items-center gap-1">
                            {card.title}
                            {card.tip ? (
                              <Tooltip title={card.tip}>
                                <QuestionCircleOutlined
                                  className="text-xs text-neutral-400 hover:text-neutral-600"
                                  onClick={(event) => event.stopPropagation()}
                                />
                              </Tooltip>
                            ) : null}
                          </span>
                        }
                        value={card.value}
                        prefix={card.icon}
                      />
                    </div>
                  </button>
                </Col>
              ))}
            </Row>

            <Row gutter={[16, 16]} className="mt-4">
              {cards.map((card) => (
                <Col xs={24} lg={12} xl={6} key={card.key}>
                  <button
                    type="button"
                    className={`h-full w-full cursor-pointer rounded-lg border-0 border-l-4 bg-white p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone} ${activeCard === card.key ? "ring-2 ring-[#1677ff]/35" : ""
                      }`}
                    onClick={() => loadDetail(card.key)}
                    disabled={!card.name}
                  >
                    <div className="flex h-full min-h-[154px] flex-col justify-between p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-neutral-500">{card.title}</div>
                          <div className="mt-2 line-clamp-2 text-xl font-semibold text-neutral-900">
                            {card.name ?? "暂无数据"}
                          </div>
                        </div>
                        <div className="flex h-9 w-9 items-center justify-center rounded bg-neutral-100 text-lg text-neutral-700">
                          {card.icon}
                        </div>
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <span className="text-3xl font-semibold text-neutral-950">
                            {metricNumber(card.value)}
                          </span>
                          <span className="ml-1 text-sm text-neutral-500">{card.unit ?? "次"}</span>
                        </div>
                        <div className="max-w-[48%] truncate text-right text-xs text-neutral-500">{card.meta}</div>
                      </div>
                    </div>
                  </button>
                </Col>
              ))}
            </Row>
          </Spin>

          <Card
            title={detailTitle}
            styles={{ body: { padding: 12 } }}
            className="border-0 shadow-sm"
            extra={activeCard ? <Tag color="blue">下钻明细</Tag> : null}
          >
            {activeCard ? (
              <div>
                <CommitsByDateList data={detailGroups} loading={detailLoading} />
              </div>
            ) : (
              <div className="py-12">
                <Empty description="点击上方任一指标块查看具体提交记录" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DataOverview
