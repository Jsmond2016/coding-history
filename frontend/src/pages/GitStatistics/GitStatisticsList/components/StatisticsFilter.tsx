import React from "react"
import { Space, DatePicker, Select, Button, Input, Tag, message } from "antd"
import { SearchOutlined, UndoOutlined } from "@ant-design/icons"
import { useAtom } from "jotai"
import dayjs, { type Dayjs } from "dayjs"
import {
  filterAtom,
  repositoriesAtom,
  authorsAtom,
  type FilterState,
} from "../../../../biz/atoms/gitStatistics.atom"
import type { Repository, Author } from "../../../../types/gitStatistics"
import { COMMIT_TYPE_OPTIONS } from "../../../../utils/commitFilters"

const { RangePicker } = DatePicker;
const { Option } = Select;

interface StatisticsFilterProps {
  allTimeRange: [Dayjs, Dayjs] | null;
  onSearch: (customFilter?: FilterState) => void;
  isDirty: boolean;
}

export const StatisticsFilter: React.FC<StatisticsFilterProps> = ({ allTimeRange, onSearch, isDirty }) => {
  const [filter, setFilter] = useAtom(filterAtom);
  const [repositories] = useAtom(repositoriesAtom);
  const [authors] = useAtom(authorsAtom);

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates || !dates[0] || !dates[1]) return;

    setFilter({
      ...filter,
      dateRange: [dates[0], dates[1]]
    });
  };

  // 重置筛选条件
  const handleReset = () => {
    const resetFilter: FilterState = {
      dateRange: [dayjs().subtract(1, "month"), dayjs()] as [Dayjs, Dayjs],
      repositoryIds: [] as string[],
      authorEmails: [] as string[],
      overtimeMode: 'all',
      keyword: '',
      commitTypes: []
    };
    setFilter(resetFilter);
    message.success("已重置筛选条件");
    // 重置后立即使用新的 filter 值触发搜索
    onSearch(resetFilter);
  };

  // DatePicker 预设范围
  const rangePresets = [
    { label: "最近一周", value: [dayjs().subtract(7, "day"), dayjs()] as [Dayjs, Dayjs] },
    { label: "最近一个月", value: [dayjs().subtract(1, "month"), dayjs()] as [Dayjs, Dayjs] },
    { label: "最近三个月", value: [dayjs().subtract(3, "month"), dayjs()] as [Dayjs, Dayjs] },
    { label: "最近半年", value: [dayjs().subtract(6, "month"), dayjs()] as [Dayjs, Dayjs] },
    { label: "最近一年", value: [dayjs().subtract(1, "year"), dayjs()] as [Dayjs, Dayjs] },
    ...(allTimeRange ? [{ label: "全部时间", value: allTimeRange }] : []),
  ];

  return (
    <Space wrap size="small" aria-label="提交记录筛选">
      <RangePicker
        value={filter.dateRange}
        onChange={handleDateChange}
        format="YYYY-MM-DD"
        allowClear={false}
        presets={rangePresets}
        style={{ width: 260 }}
        aria-label="日期范围"
      />

      <Select
        mode="multiple"
        placeholder="仓库"
        value={filter.repositoryIds}
        onChange={(ids) => setFilter({ ...filter, repositoryIds: ids })}
        style={{ width: 180 }}
        allowClear
        maxTagCount={1}
        aria-label="仓库"
      >
        {(repositories ?? []).map((repo: Repository) => (
          <Option key={repo.id} value={repo.id}>
            {repo.name}
          </Option>
        ))}
      </Select>

      <Select
        mode="multiple"
        placeholder="作者"
        value={filter.authorEmails}
        onChange={(emails) => setFilter({ ...filter, authorEmails: emails })}
        style={{ width: 160 }}
        allowClear
        maxTagCount={1}
        aria-label="作者"
      >
        {(authors ?? []).map((author: Author) => (
          <Option key={author.email} value={author.email}>
            {author.name}
          </Option>
        ))}
      </Select>

      <Select
        value={filter.overtimeMode}
        onChange={(overtimeMode) => {
          setFilter({
            ...filter,
            overtimeMode,
          })
        }}
        style={{ width: 130 }}
        aria-label="加班模式"
      >
        <Option value="all">全部提交</Option>
        <Option value="overtime_days">加班日期</Option>
        <Option value="overtime_commits">加班提交</Option>
        <Option value="non_overtime_days">非加班日期</Option>
      </Select>

      <Input
        value={filter.keyword}
        onChange={(event) => setFilter({ ...filter, keyword: event.target.value })}
        onPressEnter={() => onSearch()}
        placeholder="搜索 Hash、提交信息或作者…"
        prefix={<SearchOutlined />}
        allowClear
        aria-label="提交关键字"
        style={{ width: 230 }}
      />

      <Select
        mode="multiple"
        value={filter.commitTypes}
        onChange={(commitTypes) => setFilter({ ...filter, commitTypes })}
        options={COMMIT_TYPE_OPTIONS}
        placeholder="提交类型"
        maxTagCount={1}
        allowClear
        aria-label="提交类型"
        style={{ width: 170 }}
      />
      
      <Button 
        type="primary" 
        icon={<SearchOutlined />}
        onClick={() => onSearch()}
      >
        应用筛选
      </Button>

      {isDirty ? <Tag color="warning">筛选条件尚未应用</Tag> : null}

      <Button 
        icon={<UndoOutlined />}
        onClick={handleReset}
      >
        重置
      </Button>
    </Space>
  );
};
