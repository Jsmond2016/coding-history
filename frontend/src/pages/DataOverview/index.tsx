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
import dayjs, { type Dayjs } from "dayjs"
import { gitStatisticsApi } from "../../services/gitStatisticsApi"
import { CommitsByDateList } from "../GitStatistics/GitStatisticsList/components/CommitsByDateList"
import type {
  Author,
  CommitsByDate,
  DataOverviewResponse,
  OvertimeMode,
} from "../../types/gitStatistics"

const { RangePicker } = DatePicker

type DrilldownKey =
  | "totalCommits"
  | "activeDays"
  | "overtimeDays"
  | "overtimeCommits"
  | "topOvertimeMonth"
  | `repository:${string}`

interface OverviewFilter {
  dateRange: [Dayjs, Dayjs]
  authorEmails: string[]
}

const currentYear = dayjs().year()
const rangePresets: Array<{ label: string; value: [Dayjs, Dayjs] }> = [
  { label: "近一个月", value: [dayjs().subtract(1, "month"), dayjs()] },
  { label: "近 3 个月", value: [dayjs().subtract(3, "month"), dayjs()] },
  { label: "近 6 个月", value: [dayjs().subtract(6, "month"), dayjs()] },
  { label: "近 1 年", value: [dayjs().subtract(1, "year"), dayjs()] },
  { label: `${currentYear} 年`, value: [dayjs(`${currentYear}-01-01`), dayjs(`${currentYear}-12-31`)] },
]

const getQueryRange = (range: [Dayjs, Dayjs]) => ({
  startDate: range[0].startOf("day").valueOf(),
  endDate: range[1].endOf("day").valueOf(),
})

const metricNumber = (value?: number | null) =>
  typeof value === "number" ? value.toLocaleString() : "-"

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
  const [detailTitle, setDetailTitle] = React.useState("选择指标或仓库查看提交明细")

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates?.[0] || !dates?.[1]) return
    const [start, end] = dates as [Dayjs, Dayjs]

    if (end.diff(start, "year", true) > 3) {
      message.error("自定义时间周期不能超过 3 年")
      return
    }

    setFilter((current) => ({ ...current, dateRange: [start, end] }))
  }

  const loadOverview = React.useCallback(async () => {
    const { startDate, endDate } = getQueryRange(filter.dateRange)
    setLoading(true)
    setActiveCard(null)
    setDetailGroups([])
    setDetailTitle("选择指标或仓库查看提交明细")

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

  const loadDetail = React.useCallback(async (key: DrilldownKey) => {
    if (!overview) return

    let range = filter.dateRange
    let repositoryIds: string[] | undefined
    let overtimeMode: OvertimeMode = "all"
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
        monthStart.isBefore(filter.dateRange[0]) ? filter.dateRange[0] : monthStart,
        monthEnd.isAfter(filter.dateRange[1]) ? filter.dateRange[1] : monthEnd,
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
        overtimeMode,
      })
      setDetailGroups(result.data ?? [])
    } catch (error) {
      console.error("[DataOverview] Load detail error:", error)
      message.error("加载明细失败")
    } finally {
      setDetailLoading(false)
    }
  }, [filter, overview])

  useMount(async () => {
    try {
      const authorResult = await gitStatisticsApi.getAuthors().catch(() => [])
      setAuthors(Array.isArray(authorResult) ? authorResult : [])
      await loadOverview()
    } catch {
      message.error("加载数据总览初始数据失败")
    }
  })

  const overtimeDayRate = overview?.totals.activeDays
    ? (overview.totals.overtimeDays / overview.totals.activeDays) * 100
    : 0

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
                options={authors.map((author) => ({
                  value: author.email,
                  label: `${author.name}（${author.email}）`,
                }))}
              />
              <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={loadOverview}>
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
              <Col xs={24} xl={16}>
                <Card
                  title="仓库活动分布"
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
                          <button
                            key={repository.repoId}
                            type="button"
                            className={`w-full border-0 bg-transparent p-0 text-left ${activeCard === key ? "rounded ring-2 ring-[#1677ff]/25" : ""}`}
                            onClick={() => loadDetail(key)}
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
                        )
                      })}
                    </div>
                  ) : <Empty description="当前范围暂无仓库活动" />}
                </Card>
              </Col>

              <Col xs={24} xl={8}>
                <button
                  type="button"
                  className={`h-full w-full border-0 bg-transparent p-0 text-left ${activeCard === "topOvertimeMonth" ? "rounded ring-2 ring-[#1677ff]/25" : ""}`}
                  onClick={() => overview?.topOvertimeMonth && loadDetail("topOvertimeMonth")}
                  disabled={!overview?.topOvertimeMonth}
                >
                  <Card title="加班天数最多的月份" className="h-full border-0 shadow-sm">
                    {overview?.topOvertimeMonth ? (
                      <div className="flex h-full min-h-[220px] flex-col justify-between">
                        <div>
                          <div className="text-3xl font-semibold text-neutral-950">{overview.topOvertimeMonth.month}</div>
                          <div className="mt-2 text-sm text-neutral-500">按加班自然日去重统计</div>
                        </div>
                        <div>
                          <Statistic
                            title="加班天数"
                            value={overview.topOvertimeMonth.overtimeDays}
                            suffix="天"
                            prefix={<FireOutlined />}
                          />
                          <div className="mt-3 text-sm text-neutral-600">
                            该月活跃 {overview.topOvertimeMonth.activeDays} 天，加班日占比 {(
                              overview.topOvertimeMonth.overtimeDays / overview.topOvertimeMonth.activeDays * 100
                            ).toFixed(1)}%
                          </div>
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
                <Empty description="选择上方指标、仓库或月份查看具体提交记录" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DataOverview
