import React from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { useMount } from "ahooks"
import { message, Empty, Spin, Layout, Button, ConfigProvider } from "antd"
import { ReloadOutlined } from "@ant-design/icons"
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
  authorsAtom,
} from "../../../biz/atoms/gitStatistics.atom"
import { gitStatisticsApi } from "../../../services/gitStatisticsApi"
import type { CommitsByDate } from "../../../types/gitStatistics"
import { ScanProvider } from "../../../biz/contexts/ScanContext"
import { useScan } from "../../../biz/hooks/useScan"

const { Header } = Layout

const GitStatisticsList: React.FC = () => {
  const filter = useAtomValue(filterAtom)
  const setStatistics = useSetAtom(statisticsAtom)
  const setRepositories = useSetAtom(repositoriesAtom)
  const setAuthors = useSetAtom(authorsAtom)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [commitsByDate, setCommitsByDate] = React.useState<CommitsByDate[]>([])
  const { scanning, handleScan } = useScan()

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
    const authorEmails =
      currentFilter.authorEmails.length > 0 ? currentFilter.authorEmails : undefined
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
          authorEmails,
          isOvertime,
        }),
        gitStatisticsApi.getStatistics({
          startDate,
          endDate,
          repositoryIds,
          authorEmails,
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

  // 加载仓库列表和作者列表
  useMount(async () => {
    try {
      const [repos, authors] = await Promise.all([
        gitStatisticsApi.getRepositories(),
        gitStatisticsApi.getAuthors()
      ])
      setRepositories(repos)
      setAuthors(authors)
      // 自动执行一次搜索
      await handleSearch()
    } catch (error) {
      message.error("加载初始数据失败")
    }
  })

  return (
    <ScanProvider onScanComplete={handleSearch}>
      <div className="h-full flex flex-col overflow-hidden">
        <Header 
          className="flex px-0 items-center justify-end shadow-sm sticky top-0 z-[1000] h-16 shrink-0"
          style={{ background: '#fff', paddingRight: '12px' }}
        >
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: '#ff9800',
                colorPrimaryHover: '#f57c00',
                colorPrimaryActive: '#e65100',
              },
            }}
          >
            <Button 
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleScan}
              loading={scanning}
              disabled={scanning}
            >
              手动扫描
            </Button>
          </ConfigProvider>
        </Header>
        <div className="flex-1 overflow-auto py-3 mt-3">
          <Card className="mb-6">
            <StatisticsFilter onSearch={handleSearch} />
          </Card>

      {hasSearched ? (
        <div className='my-3'>
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
        </div>
      ) : (
        <Card>
          <Empty description="请选择时间范围和仓库，然后点击搜索按钮查看统计数据" />
        </Card>
      )}
        </div>
      </div>
    </ScanProvider>
  )
}

export default GitStatisticsList
