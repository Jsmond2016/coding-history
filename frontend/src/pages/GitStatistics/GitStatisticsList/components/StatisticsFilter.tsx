import React from "react"
import { Space, DatePicker, Select, Button, message } from "antd"
import { SearchOutlined, UndoOutlined } from "@ant-design/icons"
import { useAtom } from "jotai"
import dayjs, { type Dayjs } from "dayjs"
import {
  filterAtom,
  repositoriesAtom,
  authorsAtom,
} from "../../../../biz/atoms/gitStatistics.atom"
import type { Repository, Author } from "../../../../types/gitStatistics"

const { RangePicker } = DatePicker;
const { Option } = Select;

interface StatisticsFilterProps {
  onSearch: (customFilter?: { dateRange: [Dayjs, Dayjs]; repositoryIds: string[]; authorEmails: string[]; isOvertime?: boolean }) => void;
}

export const StatisticsFilter: React.FC<StatisticsFilterProps> = ({ onSearch }) => {
  const [filter, setFilter] = useAtom(filterAtom);
  const [repositories] = useAtom(repositoriesAtom);
  const [authors] = useAtom(authorsAtom);

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates || !dates[0] || !dates[1]) return;
    
    const diffYears = dates[1].diff(dates[0], "year", true);
    if (diffYears > 2) {
      message.error("时间范围不能超过2年");
      return;
    }
    
    setFilter({
      ...filter,
      dateRange: [dates[0], dates[1]]
    });
  };

  // 重置筛选条件
  const handleReset = () => {
    const resetFilter = {
      dateRange: [dayjs().subtract(1, "month"), dayjs()] as [Dayjs, Dayjs],
      repositoryIds: [] as string[],
      authorEmails: [] as string[],
      isOvertime: undefined as boolean | undefined
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
  ];

  return (
    <Space wrap size="middle">
      <RangePicker
        value={filter.dateRange}
        onChange={handleDateChange}
        format="YYYY-MM-DD"
        allowClear={false}
        presets={rangePresets}
        className="w-70"
      />
      
      <Select
        mode="multiple"
        placeholder="选择仓库（默认全部）"
        value={filter.repositoryIds}
        onChange={(ids) => setFilter({ ...filter, repositoryIds: ids })}
        style={{ minWidth: 200 }}
        allowClear
        maxTagCount="responsive"
      >
        {(repositories ?? []).map((repo: Repository) => (
          <Option key={repo.id} value={repo.id}>
            {repo.name}
          </Option>
        ))}
      </Select>

      <Select
        mode="multiple"
        placeholder="选择作者（默认全部）"
        value={filter.authorEmails}
        onChange={(emails) => setFilter({ ...filter, authorEmails: emails })}
        style={{ minWidth: 160 }}
        allowClear
        maxTagCount="responsive"
      >
        {(authors ?? []).map((author: Author) => (
          <Option key={author.email} value={author.email}>
            {author.name}
          </Option>
        ))}
      </Select>

      <Select
        placeholder="是否加班（默认全部）"
        value={filter.isOvertime === undefined ? null : filter.isOvertime}
        onChange={(value) => {
          setFilter({
            ...filter,
            isOvertime: value === null || value === undefined ? undefined : value,
          })
        }}
        style={{ minWidth: 140 }}
        allowClear
      >
        <Option value={true}>仅加班</Option>
        <Option value={false}>非加班</Option>
      </Select>
      
      <Button 
        type="primary" 
        icon={<SearchOutlined />}
        onClick={() => onSearch()}
      >
        搜索
      </Button>

      <Button 
        icon={<UndoOutlined />}
        onClick={handleReset}
      >
        重置
      </Button>
    </Space>
  );
};

