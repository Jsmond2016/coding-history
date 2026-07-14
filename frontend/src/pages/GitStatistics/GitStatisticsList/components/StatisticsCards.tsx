import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { useAtomValue } from 'jotai';
import { statisticsAtom } from '../../../../biz/atoms/gitStatistics.atom';

export const StatisticsCards: React.FC = () => {
  const statistics = useAtomValue(statisticsAtom);

  return (
    <Card title="提交活动汇总">
      <Row gutter={[16, 16]}>
        <Col xs={12} xl={6}>
          <Statistic
            title="总提交次数"
            value={statistics.totalCommits}
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col xs={12} xl={6}>
          <Statistic
            title="累计新增代码行数"
            value={statistics.totalInsertions}
            valueStyle={{ color: '#52c41a' }}
            prefix="+"
          />
        </Col>
        <Col xs={12} xl={6}>
          <Statistic
            title="累计删除代码行数"
            value={statistics.totalDeletions}
            valueStyle={{ color: '#ff4d4f' }}
            prefix="-"
          />
        </Col>
        <Col xs={12} xl={6}>
          <Statistic
            title="累计文件变更数"
            value={statistics.totalFilesChanged}
            valueStyle={{ color: '#722ed1' }}
          />
        </Col>
      </Row>
    </Card>
  );
};
