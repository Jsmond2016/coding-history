import React from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Space, Steps, Switch, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  createAuthor,
  createRepository,
  discoverAuthorsByPath,
  updateRepository,
  type AuthorCandidate,
  type RepositoryConfig
} from '../../../services/configApi';
import { scanRunsApi } from '../../../services/scanRunsApi';

interface RepositoryFormProps {
  open: boolean;
  repository?: RepositoryConfig;
  onClose: () => void;
  onSuccess: () => void;
}

interface RepositoryFormValues {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  addToDefaultPlan: boolean;
  runInitialScan: boolean;
  manualAuthorName?: string;
  manualAuthorEmail?: string;
}

const getLastPathSegment = (path: string): string => {
  const segments = path.trim().replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? '';
};

const toRepositoryId = (name: string): string => name
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^a-zA-Z0-9_-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const RepositoryForm: React.FC<RepositoryFormProps> = ({ open, repository, onClose, onSuccess }) => {
  const [form] = Form.useForm<RepositoryFormValues>();
  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [discovering, setDiscovering] = React.useState(false);
  const [candidates, setCandidates] = React.useState<AuthorCandidate[]>([]);
  const [selectedEmails, setSelectedEmails] = React.useState<React.Key[]>([]);
  const [inspectedCommits, setInspectedCommits] = React.useState(0);
  const lastAutoFilledRef = React.useRef({ name: '', id: '' });

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setCandidates([]);
    setSelectedEmails([]);
    if (repository) {
      form.setFieldsValue({
        id: repository.id,
        name: repository.name,
        path: repository.path,
        enabled: repository.enabled
      });
      lastAutoFilledRef.current = { name: repository.name, id: repository.id };
    } else {
      form.resetFields();
      form.setFieldsValue({
        enabled: true,
        addToDefaultPlan: true,
        runInitialScan: true
      });
      lastAutoFilledRef.current = { name: '', id: '' };
    }
  }, [open, repository, form]);

  const handleDiscover = async () => {
    try {
      await form.validateFields(['path', 'id', 'name']);
      setDiscovering(true);
      const result = await discoverAuthorsByPath(form.getFieldValue('path'), 2000);
      setCandidates(result.candidates);
      setInspectedCommits(result.inspectedCommits);
      setSelectedEmails(result.candidates.slice(0, 1).map((candidate) => candidate.email));
      setStep(1);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.error || '无法读取该仓库的 Git 历史');
    } finally {
      setDiscovering(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      if (repository) {
        await updateRepository(repository.id, {
          name: values.name,
          path: values.path,
          enabled: values.enabled
        });
        message.success('数据源已更新');
        onSuccess();
        return;
      }

      const selectedCandidates = candidates.filter((candidate) => selectedEmails.includes(candidate.email));
      const manualAuthor = values.manualAuthorEmail?.trim()
        ? { name: values.manualAuthorName?.trim() || values.manualAuthorEmail.split('@')[0], email: values.manualAuthorEmail.trim() }
        : undefined;
      if (selectedCandidates.length === 0 && !manualAuthor) {
        message.error('至少选择或填写一个需要扫描的作者');
        return;
      }

      await createRepository({
        id: values.id,
        name: values.name,
        path: values.path,
        enabled: values.enabled,
        addToDefaultPlan: values.addToDefaultPlan
      });
      const authors = [
        ...selectedCandidates.map(({ name, email }) => ({ name, email })),
        ...(manualAuthor ? [manualAuthor] : [])
      ];
      for (let index = 0; index < authors.length; index += 1) {
        await createAuthor(values.id, { ...authors[index], isDefault: index === 0 });
      }

      if (values.runInitialScan) {
        const run = await scanRunsApi.create({
          repositoryIds: [values.id],
          startDate: dayjs().subtract(1, 'month').startOf('day').valueOf(),
          endDate: dayjs().endOf('day').valueOf()
        });
        message.success(`数据源已就绪，首次扫描执行 #${run.id} 已开始`);
      } else {
        message.success('数据源和作者已保存');
      }
      onSuccess();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.error || (repository ? '更新数据源失败' : '添加数据源失败'));
    } finally {
      setLoading(false);
    }
  };

  const candidateColumns: ColumnsType<AuthorCandidate> = [
    { title: '作者', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '最近提交', dataIndex: 'commitCount', width: 110, render: (count: number) => `${count} 次` }
  ];

  return (
    <Modal
      title={repository ? '编辑数据源' : '添加数据源'}
      open={open}
      onCancel={onClose}
      width={720}
      footer={repository ? [
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" loading={loading} onClick={handleSubmit}>保存</Button>
      ] : [
        <Button key="cancel" onClick={onClose}>取消</Button>,
        ...(step === 1 ? [<Button key="back" onClick={() => setStep(0)}>上一步</Button>] : []),
        step === 0
          ? <Button key="next" type="primary" loading={discovering} onClick={handleDiscover}>下一步：选择作者</Button>
          : <Button key="save" type="primary" loading={loading} onClick={handleSubmit}>保存并完成接入</Button>
      ]}
    >
      {!repository ? <Steps current={step} size="small" className="mb-6" items={[{ title: '仓库信息' }, { title: '作者与首次扫描' }]} /> : null}
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(changedValues) => {
          if (repository || !Object.prototype.hasOwnProperty.call(changedValues, 'path')) return;
          const derivedName = getLastPathSegment(changedValues.path || '');
          const derivedId = toRepositoryId(derivedName);
          const currentName = form.getFieldValue('name');
          const currentId = form.getFieldValue('id');
          const previous = lastAutoFilledRef.current;
          const nextValues: Partial<RepositoryFormValues> = {};
          if (!currentName || currentName === previous.name) nextValues.name = derivedName;
          if (!currentId || currentId === previous.id) nextValues.id = derivedId;
          form.setFieldsValue(nextValues);
          lastAutoFilledRef.current = {
            name: nextValues.name ?? previous.name,
            id: nextValues.id ?? previous.id
          };
        }}
      >
        <div hidden={step !== 0 && !repository}>
          <Form.Item name="path" label="Git 仓库路径" rules={[{ required: true, message: '请输入仓库路径' }]}>
            <Input placeholder="例如：/Users/username/projects/my-repo" />
          </Form.Item>
          <Form.Item name="id" label="数据源 ID" rules={[
            { required: true, message: '请输入数据源 ID' },
            { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线和连字符' }
          ]} hidden={Boolean(repository)}>
            <Input disabled={Boolean(repository)} />
          </Form.Item>
          <Form.Item name="name" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>

        {!repository && step === 1 ? (
          <div>
            <Alert
              type={candidates.length > 0 ? 'info' : 'warning'}
              showIcon
              className="mb-3"
              message={candidates.length > 0
                ? `已检查最近 ${inspectedCommits} 条提交，请选择需要统计的作者`
                : '未发现作者候选，请在下方手动填写作者'}
            />
            {candidates.length > 0 ? (
              <Table
                size="small"
                rowKey="email"
                pagination={{ pageSize: 5, hideOnSinglePage: true }}
                columns={candidateColumns}
                dataSource={candidates}
                rowSelection={{ selectedRowKeys: selectedEmails, onChange: setSelectedEmails }}
              />
            ) : null}
            <Typography.Text type="secondary" className="block mb-2 mt-4">候选中没有需要的作者时，可手动补充：</Typography.Text>
            <Space.Compact className="w-full">
              <Form.Item name="manualAuthorName" noStyle><Input placeholder="作者姓名" /></Form.Item>
              <Form.Item name="manualAuthorEmail" noStyle rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
                <Input placeholder="作者邮箱" />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="addToDefaultPlan" valuePropName="checked" className="mt-5 mb-2">
              <Checkbox>加入默认定时扫描计划</Checkbox>
            </Form.Item>
            <Form.Item name="runInitialScan" valuePropName="checked" className="mb-0">
              <Checkbox>保存后立即回溯近 1 个月提交</Checkbox>
            </Form.Item>
          </div>
        ) : null}
      </Form>
    </Modal>
  );
};

export default RepositoryForm;
