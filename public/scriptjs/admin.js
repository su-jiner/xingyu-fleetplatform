/**
 * 权限校验函数（支持多权限值校验）
 * @param {string} requiredPermissions - 要求的权限值，支持逗号分隔（如 "1,3,5"）
 * @param {number} userPermissionLevel - 用户的权限等级
 * @returns {boolean} 是否具有权限
 */
function checkUserPermission(requiredPermissions, userPermissionLevel) {
    // 1. 参数校验
    if (userPermissionLevel === undefined || userPermissionLevel === null) {
        console.error('权限校验失败：未找到用户权限级别');
        return false;
    }

    const permissionLevel = parseInt(userPermissionLevel, 10);
    if (isNaN(permissionLevel)) {
        console.error('权限校验失败：无效的用户权限级别');
        return false;
    }
    
    // 2. 超级管理员直接通过
    if (permissionLevel === 15) {
        console.debug('超级管理员权限验证通过');
        return true;
    }

    // 3. 处理要求的权限值
    const requiredPerms = String(requiredPermissions)
        .split(',')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p) && p >= 0); // 过滤无效值

    if (requiredPerms.length === 0) {
        console.warn('权限校验警告：未配置有效权限要求');
        return false;
    }

    // 4. 权限验证逻辑
    return requiredPerms.some(p => {
        // 4.1 普通成员特殊处理
        if (p === 0) {
            const result = permissionLevel === 0;
            console.debug(`普通成员验证: ${result}`);
            return result;
        }
        
        // 4.2 位运算验证权限组合
        const result = (permissionLevel & p) === p;
        console.debug(`权限验证 [要求=${p}, 用户=${permissionLevel}, 二进制=${permissionLevel.toString(2).padStart(4, '0')}, 结果=${result}]`);
        return result;
    });
}

// DOM加载完成后执行权限检查
document.addEventListener("DOMContentLoaded", function() {
    console.group('开始权限校验流程');
    
    try {
        const userPermissionLevel = localStorage.getItem('userPermissionLevel');
        console.debug(`获取用户权限级别: ${userPermissionLevel}`);

        if (userPermissionLevel) {
            const permissionLevel = parseInt(userPermissionLevel, 10);
            
            // 1. 处理所有管理菜单项
            const adminItems = document.querySelectorAll('.nav-item-admin');
            console.debug(`找到 ${adminItems.length} 个需要权限的菜单项`);

            adminItems.forEach((item, index) => {
                const requiredPermission = item.getAttribute('data-permission');
                console.debug(`处理菜单项 #${index}: ${item.textContent.trim()}, 要求权限: ${requiredPermission}`);

                const hasPermission = checkUserPermission(requiredPermission, permissionLevel);
                item.style.display = hasPermission ? 'block' : 'none';
                console.debug(`显示状态: ${hasPermission ? '显示' : '隐藏'}`);
            });

            // 2. 处理管理菜单容器
            const adminMenu = document.getElementById('adminMenu');
            const visibleItems = Array.from(adminItems).filter(item => 
                item.style.display !== 'none'
            );
            
            console.debug(`可见菜单项数量: ${visibleItems.length}`);
            adminMenu.style.display = visibleItems.length > 0 ? 'block' : 'none';
        } else {
            console.error('权限校验失败：未在localStorage中找到用户权限级别');
            document.getElementById('adminMenu').style.display = 'none';
        }
    } catch (error) {
        console.error('权限校验过程中发生错误:', error);
        document.getElementById('adminMenu')?.style.display === 'none';
    } finally {
        console.groupEnd();
    }
});