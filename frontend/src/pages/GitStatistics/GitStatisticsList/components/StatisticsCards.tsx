import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { useAtomValue } from 'jotai';
import { statisticsAtom } from '../../../../biz/atoms/gitStatistics.atom';

export const StatisticsCards: React.FC = () => {
  const statistics = useAtomValue(statisticsAtom);

  return (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      <Col span={6}>
        <Card>
          <Statistic
            title="总提交次数"
            value={statistics.totalCommits}
            valueStyle={{ color: '#1890ff' }}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="新增代码行数"
            value={statistics.totalInsertions}
            valueStyle={{ color: '#52c41a' }}
            prefix="+"
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="删除代码行数"
            value={statistics.totalDeletions}
            valueStyle={{ color: '#ff4d4f' }}
            prefix="-"
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="涉及文件数"
            value={statistics.totalFilesChanged}
            valueStyle={{ color: '#722ed1' }}
          />
        </Card>
      </Col>
    </Row>
  );
};

