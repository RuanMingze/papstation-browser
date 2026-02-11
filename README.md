# PaperStation Browser

<h1 align="center">PaperStation Browser</h1>

<p align="center">
  <strong>🎯 全面发展的现代化浏览器，基于 Electron+Chromium 打造</strong>
</p>

<p align="center">
  <a href="#核心功能">核心功能</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#安装使用">安装使用</a> •
  <a href="#贡献说明">贡献说明</a> •
  <a href="#许可协议">许可协议</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-40.2.1-47848F?style=flat-square&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Version-1.1.5-orange?style=flat-square" alt="Version">
</p>

---

## 🚀 核心优势

PaperStation Browser 最初基于 Flowmora Browser 二次开发，现已独立发展成为一个全面发展的现代化浏览器项目，提供丰富的功能和流畅的用户体验。

**注**：Flowmora Browser 项目似乎已停止更新，PaperStation Browser 在此基础上进行了全面的功能增强和技术改进，成为一个独立维护的完整项目。

| 特性 | Chrome/Edge | PaperStation |
|------|:-----------:|:----------:|
| 🧠 知识捕获模式 | ❌ | ✅ |
| 📝 智能总结功能 | ❌ | ✅ |
| 📖 结构化知识导出 | ❌ | ✅ |
| 🌙 内置深色模式 | ✅ | ✅ |
| 🔒 隐私优先设计 | ⚠️ | ✅ |
| 🚀 轻量高效 | ⚠️ | ✅ |
| 🎨 现代界面 | ✅ | ✅ |
| 🐔 ChickRubGo 本土化搜索 | ❌ | ✅ |
| 🌍 中文全本地化 | ❌ | ✅ |

---

## 📋 核心功能

### 🧠 知识捕获
- **自动捕获**：浏览网页时自动提取关键信息
- **智能分类**：根据内容类型自动归类知识点
- **关联整理**：建立知识点之间的逻辑联系
- **本地存储**：所有数据保存在本地，确保隐私安全

### 🔍 智能总结
- **一键总结**：点击按钮即可生成页面核心内容摘要
- **要点提取**：自动识别并提取5个核心要点
- **术语解释**：智能识别并解释3个关键术语
- **实例分析**：提供2个实际应用案例

### 📊 结构化导出
- **多格式支持**：支持导出为 PDF、HTML 等格式
- **美观排版**：自动生成结构清晰、排版精美的知识文档
- **目录导航**：导出文档包含自动生成的目录
- **可定制模板**：支持根据需要选择不同的导出模板

### 🎨 基础体验
- **快速启动**：优化的启动速度，秒开浏览器
- **流畅操作**：平滑的动画效果和响应式界面
- **标签管理**：高效的标签页组织和管理
- **书签系统**：便捷的书签管理和快速访问
- **快捷键**：丰富的快捷键支持，提升操作效率
- **ChickRubGo 搜索**：集成本土化搜索引擎，提供更符合中文用户需求的搜索体验

---

## 🗜️ 技术栈

- **Electron 40.1.0**：跨平台桌面应用框架
- **Chromium**：高性能网页渲染引擎
- **原生前端技术**：HTML、CSS、JavaScript
- **Node.js**：后端运行环境
- **IndexedDB**：本地知识存储
- **electron-builder**：应用打包与分发

---

## 📦 安装使用

### 开发环境启动

1. **克隆仓库**
   ```bash
   git clone https://github.com/ruanmingze/PaperStation-browser.git
   cd PaperStation-browser
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **启动开发模式**
   ```bash
   pnpm run dev
   ```

### 打包命令

- **创建 Windows 安装包**
  ```bash
  pnpm run build
  # 输出: dist/PaperStation Browser Setup.exe
  ```

- **创建免安装版本**
  ```bash
  pnpm run build:dir
  # 输出: dist/win-unpacked/
  ```

- **构建但不发布**
  ```bash
  pnpm run dist
  ```

---

## 🤝 贡献说明

### 核心维护者
- **RuanMingze** - 主要开发者和维护者

### 致谢
- **Flowmora Browser** - 基础框架提供
- **Electron 社区** - 技术支持
- **所有贡献者** - 感谢你们的参与和反馈

### 如何贡献
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

---

## 📄 许可协议

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

### 基于 Flowmora Browser
PaperStation Browser 基于 Flowmora Browser 二次开发，后者同样采用 MIT 许可证。

## 📧 反馈方式

如有问题或建议，欢迎通过以下方式反馈：
- **GitHub Issues**：在仓库中提交 Issue
- **邮件**：联系核心维护者
- **社区讨论**：参与项目相关讨论

---

<p align="center">
  Made with ❤️ 全面发展的现代化浏览器

</p>
