import React from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { useMount } from "ahooks"
import {
  message,
  Empty,
  Spin,
  Layout,
  Button,
  ConfigProvider,
  Card,
  Row,
  Col,
  Dropdown,
  Modal,
  Radio,
  Space
} from "antd"
import type { MenuProps } from "antd"
import { ReloadOutlined, DownOutlined, CalendarOutlined } from "@ant-design/icons"
import { StatisticsFilter } from "./components/StatisticsFilter"
import { StatisticsCards } from "./components/StatisticsCards"
import {
  WorkStatusReport,
  WorkStatusCards,
} from "./components/WorkStatusReport"
import { CommitsByDateList } from "./components/CommitsByDateList"
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
import {
  type ScanTimePresetKey,
  SCAN_TIME_PRESET_OPTIONS,
  getPresetRange,
  getScanPresetLabel,
  MAX_SCAN_SPAN_MS
} from "../../../utils/scanTimeRange"

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
  const [scanTimePreset, setScanTimePreset] =
    React.useState<ScanTimePresetKey>("two_weeks")
  const [scanConfigOpen, setScanConfigOpen] = React.useState(false)
  const [draftPreset, setDraftPreset] =
    React.useState<ScanTimePresetKey>("two_weeks")

  const scanButtonLabel = `手动扫描-${getScanPresetLabel(scanTimePreset)}`

  const openScanConfigModal = React.useCallback(() => {
    setDraftPreset(scanTimePreset)
    setScanConfigOpen(true)
  }, [scanTimePreset])

  const saveScanConfig = React.useCallback(() => {
    setScanTimePreset(draftPreset)
    setScanConfigOpen(false)
    message.success("扫描时间范围已保存")
  }, [draftPreset])

  const scanMenuItems: MenuProps["items"] = [
    {
      key: "config",
      label: "配置扫描时间范围",
      icon: <CalendarOutlined />
    }
  ]

  const handleScanMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "config") openScanConfigModal()
  }

  const handleManualScan = React.useCallback(() => {
    const [startDate, endDate] = getPresetRange(scanTimePreset, filter.dateRange)

    if (startDate >= endDate) {
      message.error("当前扫描时间范围无效，请检查所选预设或筛选日期")
      return
    }
    if (endDate - startDate > MAX_SCAN_SPAN_MS) {
      message.error(
        "所选范围超过 186 天，请换更短预设或缩小筛选日期后再扫描"
      )
      return
    }

    const repositoryIds =
      filter.repositoryIds.length > 0 ? filter.repositoryIds : undefined
    void handleScan({ startDate, endDate, repositoryIds })
  }, [scanTimePreset, filter.dateRange, filter.repositoryIds, handleScan])

  // 加载数据
  const handleSearch = React.useCallback(
    async (customFilter?: typeof filter) => {
      // 使用传入的 filter 或当前的 filter
      const currentFilter = customFilter || filter
      // 开始时间设为当天的 0:00:00.000，结束时间设为当天的 23:59:59.999
      // dayjs 的 startOf/endOf 使用本地时间，valueOf() 返回 UTC 时间戳
      const startDate = currentFilter.dateRange[0].startOf("day").valueOf()
      const endDate = currentFilter.dateRange[1].endOf("day").valueOf()
      const repositoryIds =
        currentFilter.repositoryIds.length > 0
          ? currentFilter.repositoryIds
          : undefined
      const authorEmails =
        currentFilter.authorEmails.length > 0
          ? currentFilter.authorEmails
          : undefined
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
    },
    [filter, setStatistics]
  )

  // 加载仓库列表和作者列表
  useMount(async () => {
    try {
      const [repos, authors] = await Promise.all([
        gitStatisticsApi.getRepositories(),
        gitStatisticsApi.getAuthors(),
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
          className="flex w-full min-w-0 items-center justify-end shadow-sm sticky top-0 z-[1000] h-16 shrink-0 bg-white px-3"
        >
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: "#ff9800",
                colorPrimaryHover: "#f57c00",
                colorPrimaryActive: "#e65100",
              },
            }}
          >
            <Dropdown.Button
              type="primary"
              icon={<DownOutlined />}
              loading={scanning}
              disabled={scanning}
              menu={{ items: scanMenuItems, onClick: handleScanMenuClick }}
              onClick={handleManualScan}
              className="[&_.ant-btn.ant-btn-loading]:!bg-[#ff9800] [&_.ant-btn.ant-btn-loading]:!border-[#ff9800] [&_.ant-btn.ant-btn-loading]:!opacity-100"
            >
              <span className="inline-flex items-center gap-1.5">
                <ReloadOutlined />
                {scanButtonLabel}
              </span>
            </Dropdown.Button>
          </ConfigProvider>
        </Header>
        <Modal
          title="筛选扫描时间范围"
          open={scanConfigOpen}
          onCancel={() => setScanConfigOpen(false)}
          footer={[
            <Button key="cancel" onClick={() => setScanConfigOpen(false)}>
              取消
            </Button>,
            <Button key="ok" type="primary" onClick={saveScanConfig}>
              保存
            </Button>
          ]}
          destroyOnClose
          width={420}
        >
          <p className="text-neutral-500 text-sm mb-3">
            单选一项作为手动扫描的时间窗口；保存后主按钮会显示「手动扫描-」加选项名称（如
            2 周内）。跨度不能超过 186 天（选「当前筛选日期」时请留意筛选区间）。
          </p>
          <Radio.Group
            value={draftPreset}
            onChange={(e) =>
              setDraftPreset(e.target.value as ScanTimePresetKey)
            }
          >
            <Space direction="vertical" size={10} className="w-full">
              {SCAN_TIME_PRESET_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value} className="!mr-0">
                  {opt.label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Modal>
        <div className="flex-1 overflow-auto p-3 mt-3">
          <Card className="mb-6">
            <StatisticsFilter onSearch={handleSearch} />
          </Card>

          {hasSearched ? (
            <div className="my-3">
              {/* 第一行：代码提交数据（左）和工作状态统计（右） */}
              <Row gutter={16} className="mb-3 !mx-0">
                <Col span={12} className='!pl-0'>
                  <StatisticsCards />
                </Col>
                <Col span={12} className='!pr-0'>
                  <WorkStatusCards data={commitsByDate} />
                </Col>
              </Row>

              {/* 提交次数趋势图 */}
              <WorkStatusReport data={commitsByDate} />

              {/* 提交记录列表 */}
              <Card
                title="提交记录（按日期分组）"
                className="[&_.ant-card-body]:p-3"
              >
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
