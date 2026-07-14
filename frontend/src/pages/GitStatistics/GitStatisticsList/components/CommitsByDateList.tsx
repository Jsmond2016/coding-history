import React from 'react';
import { Collapse, Tag, Tooltip, Space, Typography, Tabs, Timeline } from 'antd';
import { ClockCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CommitsByDate, Commit, WorkStatus, WorkStatusMetricsConfig } from '../../../../types/gitStatistics';

const { Panel } = Collapse;
const { Text } = Typography;
const { TabPane } = Tabs;

// 工作状态显示文本（中文）
const workStatusLabels: Record<WorkStatus, string> = {
  relaxed: '轻松',
  normal: '正常',
  busy: '忙碌',
  crazy: '疯狂',
  overtime: '加班',
  superCrazyOvertime: '超级疯狂加班'
};

// 工作状态提示文本
const getWorkStatusTip = (
  status: WorkStatus,
  metricsConfig: WorkStatusMetricsConfig | null,
): string => {
  const thresholds = metricsConfig?.thresholds ?? {
    relaxed: 6,
    normal: 10,
    busy: 15,
    superCrazy: 20,
  };
  const overtimeHour = metricsConfig?.overtimeHour ?? 19;
  const tips: Record<WorkStatus, string> = {
    relaxed: `当日提交次数 < ${thresholds.relaxed} 次，且无加班记录`,
    normal: `当日提交次数 >= ${thresholds.relaxed} 次且 < ${thresholds.normal} 次，且无加班记录`,
    busy: `当日提交次数 >= ${thresholds.normal} 次且 < ${thresholds.busy} 次，且无加班记录`,
    crazy: `当日提交次数 >= ${thresholds.busy} 次，且无加班记录`,
    overtime: `当日有提交时间达到 ${overtimeHour}:00 的记录`,
    superCrazyOvertime: `当日提交次数 >= ${thresholds.superCrazy} 次，且有加班记录`,
  };
  return tips[status];
};

// 工作状态标签颜色
const workStatusColors: Record<WorkStatus, string> = {
  relaxed: 'green',
  normal: 'blue',
  busy: 'orange',
  crazy: 'red',
  overtime: 'red',
  superCrazyOvertime: 'magenta' // 使用紫色/洋红色来突出显示超级疯狂加班
};

interface CommitsByDateListProps {
  data: CommitsByDate[];
  loading: boolean;
  metricsConfig?: WorkStatusMetricsConfig | null;
}

const OVERVIEW_TAB_KEY = '__overview__';

/** 与日期折叠面板头部仓库 Tag 顺序一致（按当日 repositories 数组下标取色） */
const REPO_PRESET_COLORS = [
  'blue',
  'green',
  'orange',
  'cyan',
  'purple',
  'magenta',
  'red',
  'volcano',
  'gold',
  'lime',
] as const;

/** 与 antd Tag 预设色接近的左边框色 */
const REPO_BORDER_HEX: Record<(typeof REPO_PRESET_COLORS)[number], string> = {
  blue: '#1677ff',
  green: '#52c41a',
  orange: '#fa8c16',
  cyan: '#13c2c2',
  purple: '#722ed1',
  magenta: '#eb2f96',
  red: '#f5222d',
  volcano: '#fa541c',
  gold: '#faad14',
  lime: '#a0d911',
};

function getRepoColorForOverview(
  repoName: string,
  repositoriesOrdered: string[] | undefined,
  repoNamesInCommits: string[],
): { tagPreset: (typeof REPO_PRESET_COLORS)[number]; borderHex: string } {
  let idx = repositoriesOrdered?.indexOf(repoName) ?? -1;
  if (idx < 0) {
    const sorted = [...repoNamesInCommits].sort();
    idx = sorted.indexOf(repoName);
  }
  if (idx < 0) idx = 0;
  const tagPreset = REPO_PRESET_COLORS[idx % REPO_PRESET_COLORS.length];
  return { tagPreset, borderHex: REPO_BORDER_HEX[tagPreset] };
}

/** 与 Timeline 的 color 一致：节点与连线用色；支持 hex（见 antd Timeline items 示例） */
const DEFAULT_TIMELINE_COLOR = '#1890ff';

/**
 * 单条提交卡片内容（不含 Timeline 外壳）；布局仍为两行，首行左右分栏
 */
function renderCommitTimelineItemContent(
  commit: Commit,
  options?: {
    showRepo?: boolean;
    repoTagPreset?: (typeof REPO_PRESET_COLORS)[number];
    repoBorderHex?: string;
  },
) {
  const { showRepo, repoTagPreset, repoBorderHex } = options ?? {};
  const accent = repoBorderHex ?? DEFAULT_TIMELINE_COLOR;
  const timeClass =
    showRepo && repoBorderHex ? 'font-medium' : 'text-[#1890ff] font-medium';
  const timeStyle =
    showRepo && repoBorderHex ? { color: accent } : undefined;

  return (
    <div className="rounded bg-[#fafafa] px-2 py-2">
      <div className="flex w-full flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Space size={[8, 4]} wrap className="min-w-0 flex-1">
            {showRepo && (
              <Tag color={repoTagPreset ?? 'processing'}>{commit.repoName}</Tag>
            )}
            <Text code>{commit.commitHash?.substring(0, 7) || '-'}</Text>
            <Text className={timeClass} style={timeStyle}>
              {dayjs(commit.commitDate).format('HH:mm:ss')}
            </Text>
            {commit.branch && (
              <Tag color="geekblue">🌿 {commit.branch}</Tag>
            )}
            {commit.isOvertime && <Tag color="red">加班</Tag>}
          </Space>
          <div className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-4 gap-y-0.5 text-[14px]">
            <span className="whitespace-nowrap text-neutral-600">
              文件变更{' '}
              <span className="text-[#1677ff]!">{commit.filesChanged}</span>
            </span>
            <span className="whitespace-nowrap text-[#389e0d]!">
              +{commit.insertions}
            </span>
            <span className="whitespace-nowrap text-[#cf1322]!">
              -{commit.deletions}
            </span>
          </div>
        </div>
        <Text className="text-sm leading-snug">{commit.message}</Text>
      </div>
    </div>
  );
}

function buildCommitTimelineItem(
  commit: Commit,
  timelineColor: string,
  contentOptions?: Parameters<typeof renderCommitTimelineItemContent>[1],
) {
  return {
    key: commit.id,
    color: timelineColor,
    children: renderCommitTimelineItemContent(commit, contentOptions),
  };
}

export const CommitsByDateList: React.FC<CommitsByDateListProps> = ({ data, loading, metricsConfig = null }) => {
  if (loading) {
    return <div className="p-6 text-center">加载中...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="p-6 text-center">暂无数据</div>;
  }

  return (
    <Collapse 
      defaultActiveKey={[data[0]?.date]} 
      className="bg-white"
    >
      {data.map((dateGroup) => {
        const { date, commits, totalCommits, overtimeCount, latestOvertimeCommits, workStatus, hasRelease, repositories, branches } = dateGroup;
        
        // 按仓库分组（当前扫描口径下 branch 多为空，不再按分支分子 Tab）
        const commitsByRepo = commits.reduce((acc, commit) => {
          if (!acc[commit.repoName]) {
            acc[commit.repoName] = [];
          }
          acc[commit.repoName].push(commit);
          return acc;
        }, {} as Record<string, Commit[]>);

        Object.keys(commitsByRepo).forEach((repoName) => {
          commitsByRepo[repoName].sort((a, b) => b.commitDate - a.commitDate);
        });

        // 获取仓库列表（用于 Tabs）；首项为「当日全览」按时间线从早到晚
        const repoNames = Object.keys(commitsByRepo);
        const timelineCommits = [...commits].sort((a, b) => a.commitDate - b.commitDate);
        const defaultActiveKey = OVERVIEW_TAB_KEY;

        return (
          <Panel
            key={date}
            header={
              <Space size="large" wrap>
                <Text strong className="text-base">
                  {dayjs(date).format('YYYY年MM月DD日 dddd')}
                </Text>
                <Text type="secondary">
                  共 {totalCommits} 条提交
                </Text>
                {/* 工作状态标签 */}
                <Tooltip title={getWorkStatusTip(workStatus, metricsConfig)}>
                  <Tag color={metricsConfig?.colors[workStatus] ?? workStatusColors[workStatus]}>
                    {metricsConfig?.labels[workStatus] ?? workStatusLabels[workStatus]}
                    <QuestionCircleOutlined className="ml-1 text-[10px]" />
                  </Tag>
                </Tooltip>
                {hasRelease && (
                  <Tag color="purple">发版</Tag>
                )}
                {/* 显示当日修改的仓库标签 */}
                {repositories && repositories.length > 0 && (
                  <>
                    {repositories.map((repoName, idx) => (
                      <Tag
                        key={repoName}
                        color={REPO_PRESET_COLORS[idx % REPO_PRESET_COLORS.length]}
                      >
                        {repoName}
                      </Tag>
                    ))}
                  </>
                )}
                {/* 显示当日修改的分支标签 */}
                {branches && branches.length > 0 && (
                  <>
                    {branches.map((branch, idx) => {
                      // 使用不同颜色区分不同分支
                      const branchColors = ['geekblue', 'cyan', 'purple', 'magenta', 'volcano', 'gold'];
                      const colorIndex = idx % branchColors.length;
                      return (
                        <Tag key={branch} color={branchColors[colorIndex]}>
                          🌿 {branch}
                        </Tag>
                      );
                    })}
                  </>
                )}
                {overtimeCount > 0 && (
                  <Tooltip 
                    title={
                      <div>
                        <div className="mb-2 font-bold">加班提交时间：</div>
                        {latestOvertimeCommits && latestOvertimeCommits.length > 0 ? (
                          latestOvertimeCommits.map((time, idx) => (
                            <div key={idx} className="mb-1">• {time}</div>
                          ))
                        ) : (
                          <div>暂无数据</div>
                        )}
                      </div>
                    }
                  >
                    <Tag 
                      color="red" 
                      icon={<ClockCircleOutlined />}
                      className="cursor-pointer"
                    >
                      又加班 ({overtimeCount}次)
                    </Tag>
                  </Tooltip>
                )}
              </Space>
            }
          >
            {commits.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                该日期暂无提交记录
              </div>
            ) : (
              <Tabs defaultActiveKey={defaultActiveKey} type="card">
                <TabPane
                  tab={
                    <span>
                      当日全览
                      <Text type="secondary" className="ml-2 text-xs">
                        ({totalCommits})
                      </Text>
                    </span>
                  }
                  key={OVERVIEW_TAB_KEY}
                >
                  <div
                    className={
                      timelineCommits.length > 10
                        ? 'max-h-[500px] overflow-y-auto'
                        : ''
                    }
                  >
                    <Timeline
                      className="[&_.ant-timeline-item-last>.ant-timeline-item-content]:min-h-0"
                      items={timelineCommits.map((c) => {
                        const { tagPreset, borderHex } = getRepoColorForOverview(
                          c.repoName,
                          repositories,
                          repoNames,
                        );
                        return buildCommitTimelineItem(c, borderHex, {
                          showRepo: true,
                          repoTagPreset: tagPreset,
                          repoBorderHex: borderHex,
                        });
                      })}
                    />
                  </div>
                </TabPane>
                {repoNames.map((repoName) => {
                  const repoCommits = commitsByRepo[repoName];
                  const totalRepoCommits = repoCommits.length;
                  const shouldScroll = totalRepoCommits > 10;
                  const { borderHex: repoTabColor } = getRepoColorForOverview(
                    repoName,
                    repositories,
                    repoNames,
                  );

                  return (
                    <TabPane
                      tab={
                        <span>
                          {repoName}
                          <Text type="secondary" className="ml-2 text-xs">
                            ({totalRepoCommits})
                          </Text>
                        </span>
                      }
                      key={repoName}
                    >
                      <div
                        className={
                          shouldScroll ? 'mt-2 max-h-[500px] overflow-y-auto' : 'mt-2'
                        }
                      >
                        <Timeline
                          className="[&_.ant-timeline-item-last>.ant-timeline-item-content]:min-h-0"
                          items={repoCommits.map((commit) =>
                            buildCommitTimelineItem(commit, repoTabColor),
                          )}
                        />
                      </div>
                    </TabPane>
                  );
                })}
              </Tabs>
            )}
          </Panel>
        );
      })}
    </Collapse>
  );
};
