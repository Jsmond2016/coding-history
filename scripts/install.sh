#!/bin/bash

# 安装 findport 和 killport 命令到系统
# 使用方法: ./install.sh

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== findport & killport 安装脚本 ===${NC}"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 检查脚本文件是否存在
if [ ! -f "$SCRIPT_DIR/findport" ] || [ ! -f "$SCRIPT_DIR/killport" ]; then
    echo -e "${RED}错误: 找不到 findport 或 killport 脚本${NC}"
    exit 1
fi

echo -e "${YELLOW}请选择安装方式:${NC}"
echo "1) 安装到 /usr/local/bin (推荐，需要 sudo 权限)"
echo "2) 安装到 ~/.local/bin (用户级别，无需 sudo)"
echo "3) 仅添加到 PATH (通过 shell 配置文件)"
echo "4) 取消安装"
echo ""
read -p "请输入选项 (1-4): " -n 1 -r
echo ""
echo ""

case $REPLY in
    1)
        # 安装到 /usr/local/bin
        echo -e "${BLUE}正在安装到 /usr/local/bin ...${NC}"
        
        if sudo cp "$SCRIPT_DIR/findport" /usr/local/bin/findport && \
           sudo cp "$SCRIPT_DIR/killport" /usr/local/bin/killport && \
           sudo chmod +x /usr/local/bin/findport /usr/local/bin/killport; then
            echo -e "${GREEN}✓ 安装成功!${NC}"
            echo ""
            echo -e "${GREEN}现在您可以在任何地方使用以下命令:${NC}"
            echo -e "  ${YELLOW}findport 3000${NC}"
            echo -e "  ${YELLOW}killport 3000${NC}"
        else
            echo -e "${RED}✗ 安装失败${NC}"
            exit 1
        fi
        ;;
    
    2)
        # 安装到 ~/.local/bin
        echo -e "${BLUE}正在安装到 ~/.local/bin ...${NC}"
        
        # 创建目录（如果不存在）
        mkdir -p ~/.local/bin
        
        if cp "$SCRIPT_DIR/findport" ~/.local/bin/findport && \
           cp "$SCRIPT_DIR/killport" ~/.local/bin/killport && \
           chmod +x ~/.local/bin/findport ~/.local/bin/killport; then
            echo -e "${GREEN}✓ 安装成功!${NC}"
            echo ""
            
            # 检查 PATH 是否包含 ~/.local/bin
            if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
                echo -e "${YELLOW}注意: ~/.local/bin 不在您的 PATH 中${NC}"
                echo ""
                echo -e "${YELLOW}请将以下内容添加到您的 shell 配置文件:${NC}"
                
                # 检测 shell 类型
                if [ -n "$ZSH_VERSION" ]; then
                    echo -e "${BLUE}  ~/.zshrc:${NC}"
                    echo -e "  ${GREEN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
                elif [ -n "$BASH_VERSION" ]; then
                    echo -e "${BLUE}  ~/.bashrc 或 ~/.bash_profile:${NC}"
                    echo -e "  ${GREEN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
                fi
                
                echo ""
                echo -e "${YELLOW}然后运行: source ~/.zshrc (或相应的配置文件)${NC}"
            else
                echo -e "${GREEN}现在您可以在任何地方使用以下命令:${NC}"
                echo -e "  ${YELLOW}findport 3000${NC}"
                echo -e "  ${YELLOW}killport 3000${NC}"
            fi
        else
            echo -e "${RED}✗ 安装失败${NC}"
            exit 1
        fi
        ;;
    
    3)
        # 添加到 PATH
        echo -e "${BLUE}正在配置 PATH ...${NC}"
        
        # 检测 shell 类型
        if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
            SHELL_CONFIG="$HOME/.zshrc"
        elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
            SHELL_CONFIG="$HOME/.bashrc"
        else
            echo -e "${YELLOW}无法检测 shell 类型，请手动配置${NC}"
            exit 1
        fi
        
        PATH_LINE="export PATH=\"$SCRIPT_DIR:\$PATH\""
        
        # 检查是否已经添加
        if grep -q "$SCRIPT_DIR" "$SHELL_CONFIG" 2>/dev/null; then
            echo -e "${YELLOW}PATH 已经包含脚本目录${NC}"
        else
            echo "" >> "$SHELL_CONFIG"
            echo "# findport & killport 命令" >> "$SHELL_CONFIG"
            echo "$PATH_LINE" >> "$SHELL_CONFIG"
            echo -e "${GREEN}✓ 已添加到 $SHELL_CONFIG${NC}"
        fi
        
        echo ""
        echo -e "${YELLOW}请运行以下命令使配置生效:${NC}"
        echo -e "  ${GREEN}source $SHELL_CONFIG${NC}"
        echo ""
        echo -e "${GREEN}然后您就可以使用以下命令:${NC}"
        echo -e "  ${YELLOW}findport 3000${NC}"
        echo -e "  ${YELLOW}killport 3000${NC}"
        ;;
    
    4)
        echo -e "${YELLOW}安装已取消${NC}"
        exit 0
        ;;
    
    *)
        echo -e "${RED}无效的选项${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}=== 安装完成 ===${NC}"

