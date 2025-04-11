const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const axios = require('axios').default; // 使用 axios HTTP 客户端库
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');
const Registry = require('winreg'); // 使用 winreg 库来操作 Windows 注册表
const { exec } = require('child_process'); // 导入 exec 函数

let updateWindow = null; // 用于存储更新提示窗口
let loggerWindow = null; // 用于存储日志窗口
let mainWindow;
let store;

// 动态导入 electron-store
async function initStore() {
    store = await import('electron-store');
    store = new store.default(); // 创建一个新的 store 实例
}

function createLoggerWindow() {
  // 创建日志窗口
  loggerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,     // 移除默认边框
    transparent: true,// 启用透明背景
    resizable: false, // 禁止调整大小（可选）
    autoHideMenuBar: true,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
    },
  });

  const filePath = path.join(__dirname, 'public', 'logger.html');
  loggerWindow.loadFile(filePath);

  loggerWindow.on('closed', () => {
      loggerWindow = null;
  });
}

ipcMain.on('open-logger-window', () => {
  if (!loggerWindow) {
      createLoggerWindow();
  }
});

// 读取 settings.json 文件
function loadSettings() {
    const settingsPath = path.join(__dirname, 'settings.json');
    try {
        const data = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取 settings.json 文件时出错:', error);
        return {}; // 返回空对象以防错误
    }
}

const settings = loadSettings();
const SERVER_IP = settings.SERVER_IP || "127.0.0.1"; // 默认值为 127.0.0.1

// 检查更新的函数
async function checkForUpdates() {
    try {
        const response = await axios.get(`http://${SERVER_IP}:3111/api/version/m6sys44wrk424`); // 替换为你的API URL
        const data = response.data;

        const currentVersion = app.getVersion(); // 获取当前应用版本号
        if (data.version !== currentVersion) {
            showUpdateNotification(data);
        }
    } catch (error) {
        console.error('检查更新时发生错误:', error);
    }
}

function showUpdateNotification(data) {
    if (updateWindow) {
        return;
    }

    updateWindow = new BrowserWindow({
        width: 500,
        height: 400,
        frame: false, // 移除边框
        transparent: true, // 使背景透明
        resizable: false,
        modal: true, // 确保窗口是模态的
        parent: mainWindow, // 将其设置为主窗口的子窗口
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // 添加预加载脚本
            nodeIntegration: false,
            contextIsolation: true, // 确保启用上下文隔离
        },
    });

    const queryParams = encodeURIComponent(JSON.stringify(data));
    const url = `file://${path.join(__dirname, 'public', 'update-notification.html')}?${queryParams}`;
    updateWindow.loadURL(url).catch((error) => {
        console.error('加载更新通知页面时发生错误:', error);
    });

    updateWindow.on('closed', () => {
        updateWindow = null;
    });
}

async function startDownload(downloadUrl) {
    // 不再使用 electron-dl 下载，改为使用外部浏览器下载
    console.log(`即将从以下链接下载更新文件: ${downloadUrl}`);
    shell.openExternal(downloadUrl); // 使用默认浏览器打开下载链接

    // 提示用户下载已经开始，并要求关闭应用
    if (updateWindow) {
        updateWindow.webContents.send('download-progress', 100); // 假设外部下载总是100%
        updateWindow.webContents.send('install-prompt', '请关闭应用程序以完成更新安装。');
    }

    // 禁用主窗口的交互功能
    if (mainWindow) {
        mainWindow.webContents.send('disable-interaction', 'true');
    }
}

async function createWindow() {
    await initStore(); // 确保 store 已初始化

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 700,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden', // 隐藏标题栏
        devTools: false, // 禁用开发者工具
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // 确保路径正确
            nodeIntegration: false, // 确保禁用Node.js集成以提高安全性
            contextIsolation: true  // 启用上下文隔离
        }
    });

    // 构建绝对路径
    const filePath = path.join(__dirname, 'public', 'setting', 'login.html');
    console.log('正在加载文件:', filePath); // 输出文件路径

    // 加载文件
    mainWindow.loadFile(filePath).then(() => {
        console.log('文件加载成功。');
        checkForUpdates(); // 在窗口加载完成后进行更新检查
    }).catch((error) => {
        console.error('加载文件时发生错误:', error);
    });
}

app.on('ready', async () => {
    await createWindow();
});

// 监听来自渲染进程的消息并禁用主窗口交互
ipcMain.on('disable-interaction', (_event, disable) => {
    if (mainWindow) {
        if (disable === 'true') {
            mainWindow.webContents.send('disable-ui', 'true');
        } else {
            mainWindow.webContents.send('disable-ui', 'false');
        }
    }
});

// 监听来自渲染进程的消息并关闭应用
ipcMain.on('close-app', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

ipcMain.on('close-logger-window', () => {
  if (loggerWindow) {
      loggerWindow.close();
  }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 处理来自更新通知窗口的消息并开始下载
ipcMain.on('start-download', async (_event, downloadUrl) => {
    await startDownload(downloadUrl);
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 获取 Documents 目录的路径
function getDocumentsPath(callback) {
    const regKey = new Registry({
        hive: Registry.HKCU, // 当前用户
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'
    });

    regKey.get('Personal', function (err, item) {
        if (err) {
            console.error('无法读取注册表项:', err);
            callback(path.join(os.homedir(), 'Documents')); // 使用默认路径作为备选
        } else {
            const documentsPath = item.value.replace(/%USERPROFILE%/g, os.homedir());
            callback(documentsPath);
        }
    });
}

// 设置 JWT Token 到 store
ipcMain.on('set-jwt-token', (event, jwtToken) => {
    store.set('jwtToken', jwtToken);
    console.log('JWT Token 已设置:', jwtToken);
});

// 下载和解压逻辑
ipcMain.on('download-and-unzip', async (event, args) => {
    const { serverIp, workingPort, operatorId } = args;

    getDocumentsPath((documentsPath) => {
        const savePath = path.join(documentsPath, 'Euro Truck Simulator 2', 'profiles');
        const zipFilePath = path.join(savePath, 'file.zip');

        try {
            // 确保目录存在
            if (!fs.existsSync(savePath)) {
                fs.mkdirSync(savePath, { recursive: true });
            }
            console.log('文件将保存到:', savePath);

            // 下载文件
            const jwtToken = store.get('jwtToken'); // 从 store 中获取 JWT Token
            if (!jwtToken) {
                throw new Error('JWT Token not found in store.');
            }

            console.log('Using JWT Token:', jwtToken); // 添加日志

            axios({
                method: 'get',
                url: `http://${serverIp}:${workingPort}/file/download?operator=${encodeURIComponent(operatorId)}`,
                responseType: 'arraybuffer',
                headers: {
                    'Authorization': `Bearer ${jwtToken}`
                }
            }).then(response => {
                // 保存文件
                fs.writeFileSync(zipFilePath, response.data);
                console.log('文件已保存到:', zipFilePath);

                // 解压文件
                const zip = new AdmZip(zipFilePath);
                zip.extractAllTo(savePath, true);
                console.log('文件已解压到:', savePath);

                event.reply('download-and-unzip-reply', { success: true, message: '文件已成功下载并解压' });
            }).catch(error => {
                if (error.response && error.response.status === 401) {
                    console.error('JWT Token is invalid or expired.');
                    event.reply('download-and-unzip-reply', { success: false, message: 'JWT Token 已失效，请重新登录。' });
                    // 提示用户重新登录或其他处理逻辑
                } else {
                    console.error('文件下载或解压时发生错误:', error.response ? error.response.data : error.message); // 添加详细错误信息
                    event.reply('download-and-unzip-reply', { success: false, message: `文件下载或解压失败: ${error.message}` });
                }
            });
        } catch (error) {
            console.error('创建目录时发生错误:', error.message);
            event.reply('download-and-unzip-reply', { success: false, message: `创建目录失败: ${error.message}` });
        }
    });
});

// 关闭更新窗口的处理
ipcMain.on('close-update-window', () => {
    if (updateWindow) {
        updateWindow.close();
    }
});

// get-settings IPC 处理器
ipcMain.handle('get-settings', async () => {
    return loadSettings();
});

// 强制删除文件或目录（使用命令行工具）
function forceDeleteWithCmd(pathToDelete) {
    return new Promise((resolve, reject) => {
      const isDirectory = fs.existsSync(pathToDelete) && fs.lstatSync(pathToDelete).isDirectory();
      const command = isDirectory
        ? `rmdir /s /q "${pathToDelete}"` // 删除目录
        : `del /f /q "${pathToDelete}"`; // 删除文件
  
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`强制删除失败: ${pathToDelete}`, error);
          reject(error);
        } else {
          console.log(`强制删除成功: ${pathToDelete}`);
          resolve();
        }
      });
    });
  }
  
  // 重试机制
  async function deleteWithRetry(pathToDelete, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        if (fs.existsSync(pathToDelete)) {
          await forceDeleteWithCmd(pathToDelete);
          return true;
        } else {
          console.log(`路径不存在: ${pathToDelete}`);
          return false;
        }
      } catch (error) {
        if (i === retries - 1) {
          console.error(`删除失败，重试次数用尽: ${pathToDelete}`, error);
          throw error;
        } else {
          console.warn(`删除失败，剩余重试次数: ${retries - i - 1}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }
  
  // 删除文件和解压目录的 IPC 处理
  ipcMain.on('delete-files', async (event, fileName) => {
    getDocumentsPath(async (documentsPath) => {
      try {
        const savePath = path.join(documentsPath, 'Euro Truck Simulator 2', 'profiles');
        const zipFilePath = path.join(savePath, fileName); // file.zip 文件的完整路径
  
        // 删除 ZIP 文件
        if (fs.existsSync(zipFilePath)) {
          await deleteWithRetry(zipFilePath);
          console.log(`Deleted ZIP: ${zipFilePath}`);
        }
  
        event.reply('delete-files-reply', {
          success: true,
          message: `文件 ${fileName} 已删除`,
        });
      } catch (error) {
        console.error('删除失败:', error);
        event.reply('delete-files-reply', {
          success: false,
          message: `删除失败: ${error.message}`,
        });
      }
    });
  });

// 动态获取游戏路径（通过Steam安装路径）
function getSteamGamePath(callback) {
    const regKey = new Registry({
      hive: Registry.HKLM,
      key: '\\SOFTWARE\\Wow6432Node\\Valve\\Steam'
    });
  
    regKey.get('InstallPath', (err, item) => {
      if (err || !item) {
        console.error('无法获取Steam路径，使用默认路径');
        callback('D:\\Steam\\steamapps\\common\\Euro Truck Simulator 2');
        return;
      }
  
      const steamPath = item.value;
      const gamePath = path.join(steamPath, 'steamapps', 'common', 'Euro Truck Simulator 2');
      callback(gamePath);
    });
  }
  
  // DLC操作配置
  let DLC_CONFIG = {
    dlcPattern: /^dlc_.*\.scs$/i // 匹配DLC文件的正则
  };
  
  // 确保目标目录存在
  function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
  
  // 卸载DLC
  ipcMain.handle('uninstall-dlc', async () => {
    try {
      // 动态获取游戏路径
      await new Promise((resolve) => {
        getSteamGamePath((gamePath) => {
          DLC_CONFIG.gamePath = gamePath;
          resolve();
        });
      });
  
      // 目标目录：common 下的 dlc 文件夹
      const dlcDir = path.join(path.dirname(DLC_CONFIG.gamePath), 'dlc');
      ensureDir(dlcDir); // 确保 dlc 文件夹存在
  
      const files = fs.readdirSync(DLC_CONFIG.gamePath);
      const dlcFiles = files.filter(file => DLC_CONFIG.dlcPattern.test(file));
      
      if (dlcFiles.length === 0) {
        return { success: false, message: '未找到可卸载的DLC文件' };
      }
  
      const backupRecord = [];
      for (const file of dlcFiles) {
        const srcPath = path.join(DLC_CONFIG.gamePath, file);
        const destPath = path.join(dlcDir, file);
        
        // 移动文件到 dlc 文件夹
        fs.renameSync(srcPath, destPath);
        backupRecord.push({ fileName: file, originalPath: srcPath });
      }
  
      fs.writeFileSync(
        path.join(dlcDir, 'backup.json'),
        JSON.stringify(backupRecord)
      );
  
      return { success: true, message: `已卸载 ${dlcFiles.length} 个DLC文件` };
    } catch (error) {
      return { success: false, message: `卸载失败: ${error.message}` };
    }
  });
  
  // 恢复DLC
  ipcMain.handle('restore-dlc', async () => {
    try {
      // 动态获取游戏路径
      await new Promise((resolve) => {
        getSteamGamePath((gamePath) => {
          DLC_CONFIG.gamePath = gamePath;
          resolve();
        });
      });
  
      // 目标目录：common 下的 dlc 文件夹
      const dlcDir = path.join(path.dirname(DLC_CONFIG.gamePath), 'dlc');
      const recordPath = path.join(dlcDir, 'backup.json');
  
      if (!fs.existsSync(recordPath)) {
        return { success: false, message: '没有可恢复的备份' };
      }
  
      const backupRecord = JSON.parse(fs.readFileSync(recordPath));
      let restoredCount = 0;
  
      for (const record of backupRecord) {
        const srcPath = path.join(dlcDir, record.fileName);
        const destPath = record.originalPath;
  
        if (fs.existsSync(srcPath)) {
          // 移动文件回原路径
          fs.renameSync(srcPath, destPath);
          restoredCount++;
        }
      }
  
      // 清理 dlc 文件夹
      fs.rmSync(dlcDir, { recursive: true, force: true });
      return { success: true, message: `已恢复 ${restoredCount} 个DLC文件` };
    } catch (error) {
      return { success: false, message: `恢复失败: ${error.message}` };
    }
  });