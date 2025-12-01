import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { Line } from '@ant-design/charts';
import dayjs from 'dayjs';
import type { CommitsByDate, WorkStatus } from '../../../../types/gitStatistics';
import { isRelaxedStatus, isBusyStatus, isOvertimeStatus } from '../../../../utils/workStatus';

interface WorkStatusReportProps {
  data: CommitsByDate[];
}

export const WorkStatusReport: React.FC<WorkStatusReportProps> = ({ data }) => {
  // 如果没有数据，显示空状态
  if (!data || data.length === 0) {
    return (
      <Card title="工作状态统计报表" style={{ marginBottom: 24 }}>
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          暂无数据
        </div>
      </Card>
    );
  }

  // 统计天数
  const totalDays = data.length; // 工作总天数（提交代码的天数）
  const relaxedDays = data.filter(item => isRelaxedStatus(item.workStatus)).length;
  const busyDays = data.filter(item => isBusyStatus(item.workStatus)).length;
  const overtimeDays = data.filter(item => isOvertimeStatus(item.workStatus)).length;
  
  // 计算占比
  const relaxedPercentage = totalDays > 0 ? ((relaxedDays / totalDays) * 100).toFixed(1) : '0.0';
  const busyPercentage = totalDays > 0 ? ((busyDays / totalDays) * 100).toFixed(1) : '0.0';
  const overtimePercentage = totalDays > 0 ? ((overtimeDays / totalDays) * 100).toFixed(1) : '0.0';

  // 工作状态到 Y 轴位置的映射（用于折线图）
  // 顺序：轻松(1) -> 正常(2) -> 忙碌(3) -> 加班(4) -> 疯狂(5)
  const statusToYValue: Record<WorkStatus, number> = {
    relaxed: 1,
    normal: 2,
    busy: 3,
    overtime: 4,
    crazy: 5,
    superCrazyOvertime: 5 // 超级疯狂加班也映射为 5（疯狂）
  };

  // Y 轴标签映射
  const yAxisLabels: Record<number, string> = {
    1: '轻松',
    2: '正常',
    3: '忙碌',
    4: '加班',
    5: '疯狂'
  };

  // 工作状态标签映射
  const statusLabels: Record<WorkStatus, string> = {
    relaxed: '悠闲',
    normal: '正常',
    busy: '忙碌',
    crazy: '疯狂',
    overtime: '加班',
    superCrazyOvertime: '超级疯狂加班'
  };

  // 准备折线图数据：按日期排序（从左往右）
  const chartData = data
    .map(item => ({
      date: item.date,
      dateLabel: dayjs(item.date).format('MM-DD'),
      workStatusValue: statusToYValue[item.workStatus] || 1,
      workStatus: item.workStatus,
      workStatusLabel: statusLabels[item.workStatus],
      totalCommits: item.totalCommits,
      overtimeCount: item.overtimeCount
    }))
    .sort((a, b) => a.date.localeCompare(b.date)); // 按日期从左往右排序

  // 折线图配置
  const lineConfig = {
    data: chartData,
    xField: 'dateLabel',
    yField: 'workStatusValue',
    point: {
      size: 5,
      shape: 'circle',
    },
    smooth: true,
    color: '#1890ff',
    tooltip: {
      formatter: (datum: any) => {
        const dataItem = chartData.find(d => d.dateLabel === datum.dateLabel);
        if (!dataItem) {
          return { name: '', value: '' };
        }
        
        const overtimeText = dataItem.overtimeCount > 0 
          ? `，加班 ${dataItem.overtimeCount} 次` 
          : '';
        
        return {
          name: dayjs(dataItem.date).format('YYYY年MM月DD日'),
          value: `工作状态：${dataItem.workStatusLabel}，总提交 ${dataItem.totalCommits} 次${overtimeText}`
        };
      },
    },
    yAxis: {
      label: {
        formatter: (value: number) => {
          return yAxisLabels[value] || '';
        },
      },
      min: 0.5,
      max: 5.5,
      tickCount: 5, // 显示 5 个刻度点
    },
    xAxis: {
      label: {
        autoRotate: false,
        autoHide: true,
      },
    },
  };

  // 准备提交次数折线图数据
  const commitsChartData = data
    .map(item => ({
      date: item.date,
      dateLabel: dayjs(item.date).format('MM-DD'),
      totalCommits: item.totalCommits
    }))
    .sort((a, b) => a.date.localeCompare(b.date)); // 按日期从左往右排序

  // 提交次数折线图配置
  const commitsLineConfig = {
    data: commitsChartData,
    xField: 'dateLabel',
    yField: 'totalCommits',
    point: {
      size: 5,
      shape: 'circle',
    },
    smooth: true,
    color: '#1890ff',
    tooltip: {
      formatter: (datum: any) => {
        const dataItem = commitsChartData.find(d => d.dateLabel === datum.dateLabel);
        if (!dataItem) {
          return { name: '', value: '' };
        }
        
        return {
          name: dayjs(dataItem.date).format('YYYY年MM月DD日'),
          value: `提交次数：${dataItem.totalCommits} 次`
        };
      },
    },
    yAxis: {
      title: {
        text: '提交次数',
      },
    },
    xAxis: {
      label: {
        autoRotate: false,
        autoHide: true,
      },
    },
  };

  return (
    <>
      {/* 工作状态统计卡片 */}
      <Card title="工作状态统计" style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="工作总天数"
              value={totalDays}
              valueStyle={{ color: '#1890ff' }}
              suffix="天"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="轻松天数"
              value={relaxedDays}
              valueStyle={{ color: '#52c41a' }}
              suffix={`天 (${relaxedPercentage}%)`}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="忙碌天数"
              value={busyDays}
              valueStyle={{ color: '#ff9800' }}
              suffix={`天 (${busyPercentage}%)`}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="加班天数"
              value={overtimeDays}
              valueStyle={{ color: '#ff4d4f' }}
              suffix={`天 (${overtimePercentage}%)`}
            />
          </Col>
        </Row>
      </Card>

      {/* 提交次数趋势图 */}
      <Card title="提交次数趋势" style={{ marginBottom: 24 }}>
        <div style={{ height: 300 }}>
          <Line {...commitsLineConfig} />
        </div>
      </Card>
    </>
  );
};

