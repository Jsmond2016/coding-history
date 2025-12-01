import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { useAtomValue } from 'jotai';
import { statisticsAtom } from '../../../../biz/atoms/gitStatistics.atom';

export const StatisticsCards: React.FC = () => {
  const statistics = useAtomValue(statisticsAtom);

  return (
    <Card title="代码提交数据" style={{ marginBottom: 24 }}>
      <Row gutter={16}>
        <Col span={6}>
          <Statistic
            title="总提交次数"
            value={statistics.totalCommits}
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="新增代码行数"
            value={statistics.totalInsertions}
            valueStyle={{ color: '#52c41a' }}
            prefix="+"
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="删除代码行数"
            value={statistics.totalDeletions}
            valueStyle={{ color: '#ff4d4f' }}
            prefix="-"
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="涉及文件数"
            value={statistics.totalFilesChanged}
            valueStyle={{ color: '#722ed1' }}
          />
        </Col>
      </Row>
    </Card>
  );
};

