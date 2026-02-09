# Volta 配置说明

## 📋 Volta 配置文件

本项目使用 Volta 进行工具版本管理，配置文件位于：

- `.volta.json` - Volta 主配置文件
- `package.json` 中的 `volta` 字段 - 备用配置

## 🔧 当前配置

```json
{
  "node": "20.19.6",
  "pnpm": "10.15.0",
  "pm2": "5.4.2"
}
```

## 🚀 使用方法

### 安装 Volta
```bash
curl https://get.volta.sh | bash
```

### 安装项目工具链
```bash
# 在项目根目录下运行
volta install

# 或者手动安装指定版本
volta install node@20.19.6
volta install pnpm@10.15.0
volta install pm2@5.4.2
```

### 验证配置
```bash
# 检查当前版本
node --version    # 20.19.6
pnpm --version    # 10.15.0
pm2 --version     # 5.4.2

# 查看 volta 管理的工具
volta list
```

## 📝 Volta 优势

相比其他版本管理工具（如 nvm、n），Volta 的优势：

- ✅ **项目级配置** - 每个项目可以有独立的工具版本
- ✅ **自动切换** - 进入项目目录时自动切换版本
- ✅ **快速启动** - 版本切换速度极快
- ✅ **跨平台** - 支持 macOS、Linux、Windows
- ✅ **团队一致性** - 确保所有团队成员使用相同版本

## 🔄 版本更新

当需要更新工具版本时：

1. 修改 `.volta.json` 或 `package.json` 中的版本号
2. 运行 `volta install` 安装新版本
3. 提交配置文件到代码仓库

## 🐛 常见问题

### Volta 未生效
```bash
# 重新加载 shell 配置
source ~/.bashrc  # 或 ~/.zshrc

# 检查 volta 是否在 PATH 中
which volta
```

### 版本不匹配
```bash
# 强制重新安装
volta install node@20.19.6
volta install pnpm@10.15.0
volta install pm2@5.4.2
```

### 项目配置未生效
```bash
# 检查配置文件
cat .volta.json
cat package.json | grep volta

# 重新安装
volta pin node@20.19.6
volta pin pnpm@10.15.0
volta pin pm2@5.4.2
```