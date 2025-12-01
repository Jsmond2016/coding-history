import React from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { useMount } from "ahooks"
import { message, Empty, Spin } from "antd"
import { Card } from "antd"
import { StatisticsFilter } from "./components/StatisticsFilter"
import { StatisticsCards } from "./components/StatisticsCards"
import {
  WorkStatusReport,
  WorkStatusCards,
} from "./components/WorkStatusReport"
import { CommitsByDateList } from "./components/CommitsByDateList"
import { Row, Col } from "antd"
import {
  filterAtom,
  statisticsAtom,
  repositoriesAtom,
} from "../../../biz/atoms/gitStatistics.atom"
import { gitStatisticsApi } from "../../../services/gitStatisticsApi"
import type { CommitsByDate } from "../../../types/gitStatistics"

const GitStatisticsList: React.FC = () => {
  const filter = useAtomValue(filterAtom)
  const setStatistics = useSetAtom(statisticsAtom)
  const setRepositories = useSetAtom(repositoriesAtom)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [commitsByDate, setCommitsByDate] = React.useState<CommitsByDate[]>([])

  // 加载数据
  const handleSearch = React.useCallback(async (customFilter?: typeof filter) => {
    // 使用传入的 filter 或当前的 filter
    const currentFilter = customFilter || filter;
    // 开始时间设为当天的 0:00:00.000，结束时间设为当天的 23:59:59.999
    // dayjs 的 startOf/endOf 使用本地时间，valueOf() 返回 UTC 时间戳
    const startDate = currentFilter.dateRange[0].startOf("day").valueOf()
    const endDate = currentFilter.dateRange[1].endOf("day").valueOf()
    const repositoryIds =
      currentFilter.repositoryIds.length > 0 ? currentFilter.repositoryIds : undefined
    const isOvertime = currentFilter.isOvertime

    setLoading(true)
    setHasSearched(true)

    try {
      // 并行加载提交记录和统计数据
      const [commitsByDateResult, statisticsResult] = await Promise.all([
        gitStatisticsApi.getCommitsByDate({
          startDate,
          endDate,
          repositoryIds,
          isOvertime,
        }),
        gitStatisticsApi.getStatistics({
          startDate,
          endDate,
          repositoryIds,
        }),
      ])

      setCommitsByDate(commitsByDateResult.data)
      setStatistics(statisticsResult)
    } catch (error) {
      console.error("[Frontend] Search error:", error)
      message.error("加载数据失败")
    } finally {
      setLoading(false)
    }
  }, [filter, setStatistics])

  // 加载仓库列表
  useMount(async () => {
    try {
      const repos = await gitStatisticsApi.getRepositories()
      setRepositories(repos)
      // 自动执行一次搜索
      await handleSearch()
    } catch (error) {
      message.error("加载仓库列表失败")
    }
  })

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 24 }}>
        <StatisticsFilter onSearch={handleSearch} />
      </Card>

      {hasSearched ? (
        <>
          {/* 第一行：代码提交数据（左）和工作状态统计（右） */}
          <Row gutter={16}>
            <Col span={12}>
              <StatisticsCards />
            </Col>
            <Col span={12}>
              <WorkStatusCards data={commitsByDate} />
            </Col>
          </Row>

          {/* 提交次数趋势图 */}
          <WorkStatusReport data={commitsByDate} />

          {/* 提交记录列表 */}
          <Card title="提交记录（按日期分组）">
            <Spin spinning={loading}>
              <CommitsByDateList data={commitsByDate} loading={loading} />
            </Spin>
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="请选择时间范围和仓库，然后点击搜索按钮查看统计数据" />
        </Card>
      )}
    </div>
  )
}

export default GitStatisticsList
