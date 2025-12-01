import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { Line } from '@ant-design/charts';
import dayjs from 'dayjs';
import type { CommitsByDate } from '../../../../types/gitStatistics';
import { isRelaxedStatus, isBusyStatus, isOvertimeStatus } from '../../../../utils/workStatus';

interface WorkStatusReportProps {
  data: CommitsByDate[];
}

// 工作状态统计卡片组件（单独导出，用于第一行布局）
export const WorkStatusCards: React.FC<{ data: CommitsByDate[] }> = ({ data }) => {
  // 如果没有数据，返回空
  if (!data || data.length === 0) {
    return null;
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

  return (
    <Card title="工作状态统计">
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
  );
};

export const WorkStatusReport: React.FC<WorkStatusReportProps> = ({ data }) => {
  // 如果没有数据，显示空状态
  if (!data || data.length === 0) {
    return (
      <Card title="提交次数趋势" style={{ marginBottom: 24 }}>
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          暂无数据
        </div>
      </Card>
    );
  }

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
    <Card title="提交次数趋势" style={{ marginBottom: 24 }}>
      <div style={{ height: 300 }}>
        <Line {...commitsLineConfig} />
      </div>
    </Card>
  );
};

