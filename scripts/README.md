# findport & killport 工具

快速查找和关闭占用指定端口的进程的命令行工具。

## 功能特性

- 🔍 **findport**: 查找占用指定端口的进程
- ⚡ **killport**: 关闭占用指定端口的进程
- 🎨 彩色输出，易于阅读
- ✅ 参数验证和错误处理
- 🛡️ 安全确认机制
- 💪 支持强制关闭选项

## 安装

### 方式一：使用安装脚本（推荐）

```bash
cd scripts
./install.sh
```

安装脚本提供三种安装方式：
1. 安装到 `/usr/local/bin`（推荐，需要 sudo 权限）
2. 安装到 `~/.local/bin`（用户级别，无需 sudo）
3. 仅添加到 PATH（通过 shell 配置文件）

### 方式二：手动安装

#### 安装到系统路径

```bash
sudo cp findport /usr/local/bin/
sudo cp killport /usr/local/bin/
sudo chmod +x /usr/local/bin/findport /usr/local/bin/killport
```

#### 安装到用户路径

```bash
mkdir -p ~/.local/bin
cp findport ~/.local/bin/
cp killport ~/.local/bin/
chmod +x ~/.local/bin/findport ~/.local/bin/killport

# 添加到 PATH（如果还没有）
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## 使用方法

### findport - 查找端口占用

查找占用指定端口的进程：

```bash
findport 5188
```

**示例输出：**

```
正在查找占用端口 5188 的进程...

找到以下进程:

COMMAND    PID      USER     FD       NAME                 NODE
--------------------------------------------------------------------------------
node       12345    user     23u      TCP *:5188          (LISTEN)

共找到 1 个进程占用端口 5188

提示: 使用 'killport 5188' 可以关闭这些进程
```

### killport - 关闭端口进程

关闭占用指定端口的进程：

```bash
killport 5188
```

**强制关闭（使用 kill -9）：**

```bash
killport 5188 -f
# 或
killport 5188 --force
```

**示例输出：**

```
正在关闭占用端口 5188 的进程...

找到以下进程:
COMMAND    PID      USER     FD       NAME                 NODE
node       12345    user     23u      TCP *:5188          (LISTEN)

即将关闭 1 个进程
确认关闭? (y/N): y

✓ 成功关闭进程 PID: 12345 (node)

成功关闭所有进程 (1/1)
端口 5188 已成功释放
```

## 命令参数

### findport

```
findport <端口号>
```

- `<端口号>`: 要查找的端口号（1-65535）

### killport

```
killport <端口号> [选项]
```

- `<端口号>`: 要关闭的端口号（1-65535）
- `-f, --force`: 强制关闭进程（使用 kill -9）

## 常见使用场景

### 场景 1：开发服务器端口被占用

```bash
# 查看是什么占用了 5188 端口
findport 5188

# 关闭占用 5188 端口的进程
killport 5188
```

### 场景 2：多个端口需要清理

```bash
# 查找并关闭多个端口
findport 5188
killport 5188

findport 8080
killport 8080
```

### 场景 3：进程无法正常关闭

```bash
# 尝试正常关闭
killport 5188

# 如果失败，强制关闭
killport 5188 -f
```

## 特性说明

### 安全特性

- ✅ 端口号验证（必须是 1-65535 之间的数字）
- ✅ 关闭前需要用户确认
- ✅ 显示将要关闭的进程详细信息
- ✅ 关闭后验证端口是否已释放

### 用户体验

- 🎨 彩色输出，重要信息高亮显示
- 📊 清晰的进程信息表格
- 💬 友好的错误提示和使用说明
- ✅ 操作结果统计

### 兼容性

- ✅ macOS（使用 lsof）
- ⚠️ Linux（需要确保安装了 lsof）
- ❌ Windows（需要使用 WSL 或 Git Bash）

## 技术细节

### 使用的系统命令

- `lsof`: 列出打开的文件和网络连接
- `kill`: 发送信号给进程
- `ps`: 显示进程信息

### 信号说明

- `kill -15` (SIGTERM): 优雅关闭，允许进程清理资源
- `kill -9` (SIGKILL): 强制关闭，立即终止进程

## 故障排除

### 问题：命令未找到

**解决方案：**

```bash
# 检查脚本是否在 PATH 中
echo $PATH

# 重新运行安装脚本
cd scripts
./install.sh

# 或手动添加到 PATH
export PATH="/path/to/scripts:$PATH"
```

### 问题：权限被拒绝

**解决方案：**

```bash
# 确保脚本有执行权限
chmod +x findport killport

# 如果需要关闭系统进程，使用 sudo
sudo killport 80
```

### 问题：找不到进程但端口确实被占用

**解决方案：**

```bash
# 使用 netstat 或 ss 命令确认
netstat -an | grep 5188
# 或
lsof -i :5188

# 可能需要 sudo 权限查看所有进程
sudo findport 5188
```

## 卸载

### 从 /usr/local/bin 卸载

```bash
sudo rm /usr/local/bin/findport
sudo rm /usr/local/bin/killport
```

### 从 ~/.local/bin 卸载

```bash
rm ~/.local/bin/findport
rm ~/.local/bin/killport
```

### 从 PATH 中移除

编辑您的 shell 配置文件（`~/.zshrc` 或 `~/.bashrc`），删除相关的 PATH 配置行。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0 (2025-11-21)

- ✨ 初始版本
- ✅ 实现 findport 命令
- ✅ 实现 killport 命令
- ✅ 添加彩色输出
- ✅ 添加安全确认机制
- ✅ 添加强制关闭选项
- ✅ 添加自动安装脚本

