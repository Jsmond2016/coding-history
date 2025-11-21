import React from 'react';
import { Space, DatePicker, Select, Button, message } from 'antd';
import { useAtom } from 'jotai';
import dayjs, { type Dayjs } from 'dayjs';
import { filterAtom, repositoriesAtom, type QuickSelectType } from '../../../../biz/atoms/gitStatistics.atom';
import { gitStatisticsApi } from '../../../../services/gitStatisticsApi';
import type { Repository } from '../../../../types/gitStatistics';

const { RangePicker } = DatePicker;
const { Option } = Select;

export const StatisticsFilter: React.FC = () => {
  const [filter, setFilter] = useAtom(filterAtom);
  const [repositories] = useAtom(repositoriesAtom);
  const [scanning, setScanning] = React.useState(false);

  const handleQuickSelect = (type: QuickSelectType) => {
    const end = dayjs();
    const start = type === 'week' 
      ? end.subtract(7, 'day')
      : end.subtract(1, 'month');
    
    setFilter({
      ...filter,
      dateRange: [start, end],
      quickSelect: type
    });
  };

  const handleCustomRange = (dates: [Dayjs, Dayjs] | null) => {
    if (!dates) return;
    
    const diffYears = dates[1].diff(dates[0], 'year', true);
    if (diffYears > 2) {
      message.error('时间范围不能超过2年');
      return;
    }
    
    setFilter({
      ...filter,
      dateRange: dates,
      quickSelect: 'custom'
    });
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await gitStatisticsApi.triggerScan();
      if (result.success) {
        message.success(`成功扫描 ${result.scannedCount} 个仓库`);
      } else {
        message.error('扫描失败');
      }
    } catch (error) {
      message.error('扫描失败');
    } finally {
      setScanning(false);
    }
  };

  return (
    <Space wrap size="middle">
      <Space>
        <span>快捷选择：</span>
        <Button 
          type={filter.quickSelect === 'week' ? 'primary' : 'default'}
          onClick={() => handleQuickSelect('week')}
        >
          最近一周
        </Button>
        <Button 
          type={filter.quickSelect === 'month' ? 'primary' : 'default'}
          onClick={() => handleQuickSelect('month')}
        >
          最近一个月
        </Button>
      </Space>
      
      <RangePicker
        value={filter.dateRange}
        onChange={handleCustomRange}
        format="YYYY-MM-DD"
        allowClear={false}
      />
      
      <Select
        mode="multiple"
        placeholder="选择仓库"
        value={filter.repositoryIds}
        onChange={(ids) => setFilter({ ...filter, repositoryIds: ids })}
        style={{ minWidth: 200 }}
        allowClear
      >
        {repositories.map((repo: Repository) => (
          <Option key={repo.id} value={repo.id}>
            {repo.name}
          </Option>
        ))}
      </Select>
      
      <Button 
        type="primary" 
        onClick={handleScan}
        loading={scanning}
      >
        手动扫描
      </Button>
    </Space>
  );
};

