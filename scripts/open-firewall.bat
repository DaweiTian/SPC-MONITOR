@echo off
setlocal
chcp 65001 >nul
echo ==========================================
echo   FT1-MONITOR 防火墙端口放行工具
echo ==========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 需要管理员权限运行此脚本！
    echo 请右键点击此文件，选择"以管理员身份运行"
    echo.
    pause
    exit /b 1
)

echo 添加入站规则：允许 TCP 18080 端口...
netsh advfirewall firewall add rule name="FT1-MONITOR (TCP 18080)" dir=in action=allow protocol=TCP localport=18080 >nul 2>&1
if %errorLevel% equ 0 (
    echo       规则添加成功！
) else (
    echo       规则可能已存在，尝试更新...
    netsh advfirewall firewall set rule name="FT1-MONITOR (TCP 18080)" new dir=in action=allow protocol=TCP localport=18080 >nul 2>&1
    if %errorLevel% equ 0 (
        echo       规则已更新！
    ) else (
        echo       [警告] 规则更新失败，请手动检查防火墙设置
    )
)

echo.
echo ==========================================
echo   完成！局域网设备现在可以访问本机了。
echo   访问地址：http://本机IP:18080
echo ==========================================
echo.
pause
