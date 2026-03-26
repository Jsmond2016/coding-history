# Git 提交

按 Conventional Commits 规范撰写中文提交说明并执行 git commit。

## 执行步骤

1. 运行 `git status` 查看未暂存文件
2. 运行 `git diff` 查看未暂存改动
3. 运行 `git log --oneline -5` 了解提交风格
4. 分析改动，撰写提交信息
5. 暂存相关文件并提交

## 提交格式

```
<类型>[可选作用域]: <中文简短描述>

[可选正文，用中文说明主要改动点]
```

### 常用类型
- `feat` 新功能
- `fix` 修复
- `style` 样式调整（不影响逻辑）
- `refactor` 重构
- `docs` 文档
- `chore` 杂项/工具
- `perf` 性能优化
- `test` 测试

### 示例
```
feat(仓库配置): 新增提交范围列展示已入库 commit 时间范围

- 后端 CommitService 新增 getCommitDateRangeForRepo 方法
- 前端仓库配置列表新增"提交范围"列
```
