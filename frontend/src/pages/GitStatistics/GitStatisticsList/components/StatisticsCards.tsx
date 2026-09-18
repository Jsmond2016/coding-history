import React from 'react';
import { Card, Row, Col, Statistic, Tooltip } from 'antd';
import { useAtomValue } from 'jotai';
import { statisticsAtom } from '../../../../biz/atoms/gitStatistics.atom';

type StatisticCardProps = {
  title: string;
  value: number;
  color: string;
  prefix?: '+' | '-';
};

const formatCompactValue = (value: number): string => {
  if (value === 0) {
    return '0';
  }

  if (value < 1_000) {
    return '<1k';
  }

  let divisor = 1_000;
  let suffix = 'k';
  if (value >= 10_000) {
    divisor = 10_000;
    suffix = 'w';
  }

  const scaledValue = Math.floor((value / divisor) * 10) / 10;
  let formattedValue = scaledValue.toFixed(1);
  if (Number.isInteger(scaledValue)) {
    formattedValue = scaledValue.toFixed(0);
  }

  return `${formattedValue}${suffix}+`;
};

const StatisticCard: React.FC<StatisticCardProps> = ({ title, value, color, prefix }) => {
  let exactValue = value.toLocaleString('zh-CN');
  if (prefix) {
    exactValue = `${prefix}${exactValue}`;
  }

  return (
    <Tooltip title={`精确值：${exactValue}`}>
      <div style={{ cursor: 'help' }}>
        <Statistic
          title={title}
          value={value}
          formatter={() => formatCompactValue(value)}
          valueStyle={{ color }}
          prefix={prefix}
        />
      </div>
    </Tooltip>
  );
};

export const StatisticsCards: React.FC = () => {
  const statistics = useAtomValue(statisticsAtom);

  return (
    <Card title="提交活动汇总">
      <Row gutter={[16, 16]}>
        <Col xs={12} xl={6}>
          <StatisticCard
            title="总提交次数"
            value={statistics.totalCommits}
            color="#1890ff"
          />
        </Col>
        <Col xs={12} xl={6}>
          <StatisticCard
            title="累计新增代码行数"
            value={statistics.totalInsertions}
            color="#52c41a"
            prefix="+"
          />
        </Col>
        <Col xs={12} xl={6}>
          <StatisticCard
            title="累计删除代码行数"
            value={statistics.totalDeletions}
            color="#ff4d4f"
            prefix="-"
          />
        </Col>
        <Col xs={12} xl={6}>
          <StatisticCard
            title="累计文件变更数"
            value={statistics.totalFilesChanged}
            color="#722ed1"
          />
        </Col>
      </Row>
    </Card>
  );
};
